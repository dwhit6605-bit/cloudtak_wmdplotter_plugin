/*
 * End-to-end test of the plugin's compute→CoT core, off-cloud:
 *   node lib/cot.test.mjs
 * Runs the REAL ported dispersion model on the bundled chemical data (exactly
 * what happens in the browser panel) and checks the CoT features it produces.
 * The Vue panel + sendCOT wiring in WMDPanel.vue needs a live CloudTAK build to
 * verify; this proves everything up to that boundary.
 */
import { buildHazardFeatures, buildSourceMarker } from './cot.js';

// The models are ES modules with a default export, imported by name exactly
// as lib/models.ts does in the plugin. No globals.
import dispersion from '../models/dispersion.js';
import data from '../models/data.js';

const results = [];
const check = (name, cond, detail) => {
  results.push([name, !!cond]);
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail && !cond ? `   [${detail}]` : ''));
};

// ── Compute a real chlorine plume from bundled data, as the panel will ──────
const chem = data.CHEMICALS.find((c) => c.id === 'chlorine');
const aegl = data.AEGL['chlorine'];
const thresholds = {
  high:   { value: aegl['3']['60min'], label: 'AEGL-3 (60min)', color: '#FF0000' },
  medium: { value: aegl['2']['60min'], label: 'AEGL-2 (60min)', color: '#FF8C00' },
  low:    { value: aegl['1']['60min'], label: 'AEGL-1 (60min)', color: '#FFFF00' },
};
const Q = 50 * 1000 / 60; // 50 kg/min → g/s
const contours = dispersion.compute_all_contours(
  Q, 3, 'D', chem.mw, thresholds, 34.05, -118.25, 270, 0);

check('model produced 3 contour levels', Object.keys(contours).length === 3);
check('inner zone shorter than outer (physical)',
  contours.high.max_downwind_m < contours.low.max_downwind_m,
  `high=${contours.high.max_downwind_m} low=${contours.low.max_downwind_m}`);

// ── Build CoT features ──────────────────────────────────────────────────────
const meta = {
  name: 'Downtown Chlorine Leak', kind: 'chem incident', agent: 'Chlorine',
  rate_kg_min: 50, wind_label: 'W 6.7 mph', stability: 'D',
  time: '2026-08-21T17:00:00.000Z', stale_minutes: 60, source_uid: 'incident-A',
  source_lat: 34.05, source_lon: -118.25,
};
const feats = buildHazardFeatures(contours, meta, ['low', 'medium', 'high']);

check('one CoT feature per non-empty zone', feats.length === 3, `got ${feats.length}`);
check('all are u-d-f polygons', feats.every((f) =>
  f.properties.type === 'u-d-f' && f.geometry.type === 'Polygon'));

const outer = feats[0], inner = feats[2];
check('render order outer→inner (low first)', outer.properties.callsign.includes('AEGL-1')
  && inner.properties.callsign.includes('AEGL-3'), `${outer.properties.callsign} / ${inner.properties.callsign}`);
check('stable id per incident+zone', inner.properties.id === 'wmd-incident-a-high', inner.properties.id);
check('callsign names agent + zone', inner.properties.callsign === 'Chlorine · AEGL-3 (60min)',
  inner.properties.callsign);
check('remarks carry agent/rate/wind/stability', /AGENT: Chlorine/.test(inner.properties.remarks)
  && /RATE: 50\.00 kg\/min/.test(inner.properties.remarks) && /PG-D/.test(inner.properties.remarks),
  inner.properties.remarks);
check('severe (inner) zone stronger fill', inner.properties['fill-opacity'] === 0.45);
check('mild (outer) zone lighter fill', outer.properties['fill-opacity'] === 0.25);
check('color passed to stroke+fill', inner.properties.stroke === '#FF0000' && inner.properties.fill === '#FF0000');

// Geometry: GeoJSON Polygon, lon/lat order, closed ring.
const ring = inner.geometry.coordinates[0];
check('polygon ring is closed', ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]);
check('coords are [lon,lat] (lon ≈ -118, lat ≈ 34)',
  Math.abs(ring[0][0] + 118.25) < 0.2 && Math.abs(ring[0][1] - 34.05) < 0.2, JSON.stringify(ring[0]));
check('center is the release point [lon,lat]',
  inner.properties.center[0] === -118.25 && inner.properties.center[1] === 34.05);

check('time/start from meta, stale = +60min', inner.properties.start === '2026-08-21T17:00:00.000Z'
  && inner.properties.stale === '2026-08-21T18:00:00.000Z', inner.properties.stale);
check('path defaults to root', inner.properties && inner.properties.id && feats[0].path === '/');

// Idempotent re-broadcast: same ids.
const feats2 = buildHazardFeatures(contours, meta, ['low', 'medium', 'high']);
check('re-broadcast is idempotent (same ids)',
  feats.map((f) => f.id).join() === feats2.map((f) => f.id).join());

// Source marker.
const src = buildSourceMarker(meta);
check('source marker is a u-d-p point at the release', src && src.properties.type === 'u-d-p'
  && src.geometry.coordinates[0] === -118.25);

// Empty contours (threshold never met) produce no features.
const empty = buildHazardFeatures({ low: { latlon: [], label: 'x', color: '#fff' } }, meta);
check('empty/unmet zones produce no features', empty.length === 0);

console.log('');
const failed = results.filter((r) => !r[1]);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
