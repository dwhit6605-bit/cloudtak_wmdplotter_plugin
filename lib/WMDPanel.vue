<!--
  WMD PLOTTER Hazard Model panel.

  Compute a CBRN plume in-browser (bundled, cross-validated models) and post the
  hazard zones into the active DataSync mission so the whole team sees them.

  Store usage (useMapStore, mission Subscription, worker.conn.sendCOT) follows
  the dfpc-coe sample plugin (cloudtak-plugin-search-containment). It can only be
  verified in a live CloudTAK build (it imports CloudTAK's own src/). The
  compute→CoT core it calls (lib/cot.js) is unit-tested off-cloud in cot.test.mjs.
-->
<template>
  <div class="wmd-panel">
    <div class="wmd-header">
      <IconRadioactive :size="20" />
      <span>Hazard Model</span>
      <button class="wmd-x" title="Close" @click="close">×</button>
    </div>

    <!-- No active mission → prompt (matches the sample's guard) -->
    <div v-if="!mission" class="wmd-note wmd-warn">
      No active Data Sync mission. Open <b>Menu → Data Sync</b>, subscribe, and make
      one active — hazard zones post into it for the whole team.
    </div>

    <template v-else>
      <div class="wmd-note">Posting to mission: <b>{{ missionName }}</b></div>

      <label>Chemical</label>
      <select v-model="chemId">
        <option v-for="c in chemicals" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>

      <div class="wmd-row">
        <div>
          <label>Release (kg/min)</label>
          <input v-model.number="rate" type="number" min="0" step="1" />
        </div>
        <div>
          <label>Release height (m)</label>
          <input v-model.number="height" type="number" min="0" step="1" />
        </div>
      </div>

      <div class="wmd-row">
        <div>
          <label>Wind (m/s)</label>
          <input v-model.number="windMs" type="number" min="0.1" step="0.1" />
        </div>
        <div>
          <label>Wind from (°)</label>
          <input v-model.number="windDir" type="number" min="0" max="360" step="1" />
        </div>
        <div>
          <label>Stability</label>
          <select v-model="stability">
            <option v-for="s in ['A','B','C','D','E','F']" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
      </div>

      <label>Source location</label>
      <div class="wmd-source">
        <span v-if="source">{{ source.lat.toFixed(5) }}, {{ source.lon.toFixed(5) }}</span>
        <span v-else class="wmd-muted">not set — tap the map</span>
        <button class="wmd-btn-ghost" @click="pickSource">{{ picking ? 'Tap map…' : '📍 Set on map' }}</button>
      </div>

      <button class="wmd-btn" :disabled="!source || busy" @click="run">
        {{ busy ? 'Working…' : '☣ Compute & Post to Mission' }}
      </button>

      <div v-if="status" class="wmd-note" :class="statusKind">{{ status }}</div>

      <table v-if="zones.length" class="wmd-zones">
        <tr v-for="z in zones" :key="z.level">
          <td><span class="wmd-dot" :style="{ background: z.color }"></span>{{ z.label }}</td>
          <td>{{ z.km }}</td>
        </tr>
      </table>

      <div class="wmd-prov">
        Computed on-device · {{ chemicals.length }} chemicals on board · zero network calls.
        Zones re-post with stable IDs (updates, not duplicates).
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';
import { IconRadioactive } from '@tabler/icons-vue';
// CloudTAK source — present at build time (plugin lives in api/web/plugins/…).
import { useMapStore } from '../../../src/stores/map.ts';
import { useRouter } from 'vue-router';
import { WMDModels } from './models.ts';
import { buildHazardFeatures, buildSourceMarker } from './cot.js';
import { withMissionDest } from './mission.ts';

const mapStore = useMapStore();
const router = useRouter();

const mission = computed(() => mapStore.mission);
const missionName = computed(() => (mapStore.mission ? mapStore.mission.meta.name : ''));

// Only chemicals that carry the data a plume needs (mw + AEGL thresholds).
const chemicals = computed(() =>
  WMDModels.data.CHEMICALS
    .filter((c) => c.mw && WMDModels.data.AEGL[c.id])
    .sort((a, b) => a.name.localeCompare(b.name)),
);

const chemId = ref(chemicals.value.some((c) => c.id === 'chlorine') ? 'chlorine' : (chemicals.value[0]?.id ?? ''));
const rate = ref(50);
const height = ref(0);
const windMs = ref(3);
const windDir = ref(270);
const stability = ref('D');
const source = ref<{ lat: number; lon: number } | null>(null);

const picking = ref(false);
const busy = ref(false);
const status = ref('');
const statusKind = ref('');
const zones = ref<Array<{ level: string; label: string; color: string; km: string }>>([]);

function close() {
  router.push('/menu');
}

function pickSource() {
  if (!mapStore.map) return;
  picking.value = true;
  mapStore.map.getCanvas().style.cursor = 'crosshair';
  mapStore.map.once('click', (e: { lngLat: { lat: number; lng: number } }) => {
    source.value = { lat: e.lngLat.lat, lon: e.lngLat.lng };
    picking.value = false;
    if (mapStore.map) mapStore.map.getCanvas().style.cursor = '';
  });
}

onBeforeUnmount(() => {
  if (mapStore.map) mapStore.map.getCanvas().style.cursor = '';
});

function thresholdsFor(id: string) {
  const a = WMDModels.data.AEGL[id];
  const pick = (tier: string) => (a[tier] ? a[tier]['60min'] : 0);
  return {
    high: { value: pick('3'), label: 'AEGL-3 (60min)', color: '#FF0000' },
    medium: { value: pick('2'), label: 'AEGL-2 (60min)', color: '#FF8C00' },
    low: { value: pick('1'), label: 'AEGL-1 (60min)', color: '#FFFF00' },
  };
}

async function run() {
  if (!source.value || !mapStore.mission) return;
  busy.value = true;
  status.value = '';
  zones.value = [];
  try {
    const chem = WMDModels.data.CHEMICALS.find((c) => c.id === chemId.value);
    if (!chem) throw new Error('Chemical not found');

    const Q_gs = rate.value * 1000 / 60; // kg/min → g/s
    const contours = WMDModels.dispersion.compute_all_contours(
      Q_gs, windMs.value, stability.value, chem.mw, thresholdsFor(chem.id),
      source.value.lat, source.value.lon, windDir.value, height.value,
    );

    const meta = {
      name: `${chem.name} release`,
      kind: 'chem incident',
      agent: chem.name,
      rate_kg_min: rate.value,
      wind_label: `${windDir.value}° ${windMs.value} m/s`,
      stability: stability.value,
      time: new Date().toISOString(),
      stale_minutes: 60,
      source_uid: `wmd-${Date.now()}`,
      source_lat: source.value.lat,
      source_lon: source.value.lon,
    };

    const features = buildHazardFeatures(contours, meta, ['low', 'medium', 'high']);
    const marker = buildSourceMarker(meta);
    if (marker) features.push(marker);

    if (!features.length) {
      status.value = 'Threshold never reached — nothing to post. Increase release rate or check inputs.';
      statusKind.value = 'wmd-warn';
      return;
    }

    if (!(await mapStore.worker.conn.isOpen)) {
      throw new Error('TAK connection is not open');
    }

    const guid = mapStore.mission.guid;
    for (const f of features) {
      mapStore.worker.conn.sendCOT(withMissionDest(f, guid));
    }

    zones.value = ['high', 'medium', 'low']
      .filter((lv) => contours[lv] && contours[lv].max_downwind_m > 0)
      .map((lv) => ({
        level: lv, label: contours[lv].label, color: contours[lv].color,
        km: `${(contours[lv].max_downwind_m / 1000).toFixed(2)} km`,
      }));

    status.value = `✓ Posted ${features.length} feature(s) to ${missionName.value}.`;
    statusKind.value = 'wmd-ok';
  } catch (e) {
    status.value = `Error: ${e instanceof Error ? e.message : String(e)}`;
    statusKind.value = 'wmd-err';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.wmd-panel { padding: 12px; font-size: 13px; color: #e6edf3; }
.wmd-header { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; margin-bottom: 12px; }
.wmd-x { margin-left: auto; background: none; border: none; color: #8b949e; font-size: 20px; cursor: pointer; line-height: 1; }
label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #8b949e; margin: 10px 0 4px; }
select, input { width: 100%; padding: 8px 9px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #e6edf3; font: inherit; }
.wmd-row { display: flex; gap: 8px; } .wmd-row > div { flex: 1; }
.wmd-source { display: flex; align-items: center; gap: 8px; }
.wmd-source > span { flex: 1; font-family: monospace; }
.wmd-muted { color: #8b949e; }
.wmd-btn { width: 100%; margin-top: 14px; padding: 11px; background: #238636; color: #fff; border: none; border-radius: 6px; font-weight: 700; cursor: pointer; }
.wmd-btn:disabled { opacity: .5; cursor: not-allowed; }
.wmd-btn-ghost { padding: 7px 10px; background: transparent; border: 1px solid #30363d; border-radius: 6px; color: #e6edf3; cursor: pointer; white-space: nowrap; }
.wmd-note { font-size: 11px; margin-top: 10px; padding: 8px; border-radius: 6px; background: rgba(255,255,255,.04); line-height: 1.5; }
.wmd-warn { background: rgba(240,136,62,.12); border: 1px solid rgba(240,136,62,.3); color: #f0883e; }
.wmd-ok { background: rgba(35,134,54,.15); border: 1px solid rgba(35,134,54,.4); color: #3fb950; }
.wmd-err { background: rgba(248,81,73,.12); border: 1px solid rgba(248,81,73,.35); color: #f85149; }
.wmd-zones { width: 100%; border-collapse: collapse; margin-top: 8px; }
.wmd-zones td { padding: 5px 4px; border-bottom: 1px solid #21262d; font-size: 12px; }
.wmd-zones td:last-child { text-align: right; font-family: monospace; color: #8b949e; }
.wmd-dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
.wmd-prov { font-size: 10px; color: #8b949e; margin-top: 10px; line-height: 1.5; }
</style>
