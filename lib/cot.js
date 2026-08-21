/*
 * WMD model output  →  CloudTAK CoT features.
 *
 * The pure, deterministic core of the plugin — no Vue, no CloudTAK runtime — so
 * it is unit-tested with plain node (cot.test.mjs). It takes the dict returned
 * by the ported dispersion/radiation models (compute_all_contours-style:
 * { level: { latlon:[[lat,lon],…], label, color, max_downwind_m, … } }) and
 * builds the u-d-f drawn-shape features CloudTAK's sendCOT() expects.
 *
 * Feature shape verified against the sample plugin (lib/markers.ts) and
 * @tak-ps/cloudtak@13.70.0: { id, type:'Feature', path:'/', properties:{ id,
 * type:'u-d-f', how, color, stroke/fill…, time/start/stale, center, callsign,
 * remarks }, geometry }. The mission `dest` is added by the panel at send time,
 * not here, so this stays independent of any live mission.
 */

// zone id → whether it is an inner/severe zone (renders with stronger fill)
const SEVERE = new Set(['high', 'severe', 'fireball', 'extreme', 'erpg3', 'lethal', 'idlh']);

function slug(s) {
  return String(s || 'wmd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// [[lat,lon],…] ring → GeoJSON Polygon coords [[[lon,lat],…]], explicitly closed.
function ringToPolygon(latlon) {
  const coords = latlon.map(([la, lo]) => [lo, la]);
  const first = coords[0], last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push([first[0], first[1]]);
  return [coords];
}

function centroid(latlon) {
  let la = 0, lo = 0;
  for (const p of latlon) { la += p[0]; lo += p[1]; }
  return [lo / latlon.length, la / latlon.length]; // [lon,lat]
}

/** Build the ATAK remarks line — same house style as backend/tak_dp.py. */
function buildRemarks(meta, info) {
  const bits = ['WMD PLOTTER'];
  if (meta.kind) bits.push(String(meta.kind).toUpperCase());
  if (meta.agent) bits.push(`AGENT: ${meta.agent}`);
  if (meta.rate_kg_min != null) bits.push(`RATE: ${Number(meta.rate_kg_min).toFixed(2)} kg/min`);
  if (meta.wind_label) bits.push(`WIND: ${meta.wind_label}`);
  if (meta.stability) bits.push(`PG-${meta.stability}`);
  if (info.threshold_ppm != null) bits.push(`${info.label}: ${info.threshold_ppm} ppm`);
  if (info.max_downwind_m != null) bits.push(`${(info.max_downwind_m / 1000).toFixed(2)} km downwind`);
  if (meta.time) bits.push(`TIME: ${meta.time}`);
  return bits.join(' | ');
}

/**
 * @param {object} contours  compute_all_contours output (level → {latlon,label,color,…})
 * @param {object} meta       { agent, name, kind, rate_kg_min, wind_label, stability,
 *                              time, stale_minutes, source_uid, source_lat, source_lon }
 * @param {string[]} [order]  render order, outer→inner (default low, medium, high)
 * @returns {object[]}        CloudTAK CoT features (u-d-f polygons)
 */
export function buildHazardFeatures(contours, meta = {}, order) {
  const now = meta.time || new Date().toISOString();
  const staleMin = meta.stale_minutes != null ? meta.stale_minutes : 60;
  const stale = new Date(new Date(now).getTime() + staleMin * 60000).toISOString();
  const base = slug(meta.source_uid || meta.name || 'incident');
  const levels = order || Object.keys(contours);

  const out = [];
  for (const level of levels) {
    const info = contours[level];
    if (!info || !Array.isArray(info.latlon) || info.latlon.length < 3) continue;

    const color = info.color || '#FF3B3B';
    const strong = SEVERE.has(level);
    const id = `wmd-${base}-${level}`;               // stable → re-broadcast UPDATES, not duplicates
    const center = (meta.source_lon != null && meta.source_lat != null)
      ? [meta.source_lon, meta.source_lat]
      : centroid(info.latlon);

    out.push({
      id,
      type: 'Feature',
      path: '/',
      properties: {
        id,
        type: 'u-d-f',
        how: 'h-g-i-g-o',
        color,
        stroke: color,
        'stroke-width': 3,
        'stroke-opacity': 1,
        fill: color,
        'fill-opacity': strong ? 0.45 : 0.25,
        archived: true,
        time: now,
        start: now,
        stale,
        center,
        callsign: `${meta.agent || meta.name || 'HAZARD'} · ${info.label || level}`,
        remarks: buildRemarks(meta, info),
      },
      geometry: { type: 'Polygon', coordinates: ringToPolygon(info.latlon) },
    });
  }
  return out;
}

/** Optional u-d-p spot marker at the release point. */
export function buildSourceMarker(meta = {}) {
  if (meta.source_lat == null || meta.source_lon == null) return null;
  const now = meta.time || new Date().toISOString();
  const staleMin = meta.stale_minutes != null ? meta.stale_minutes : 60;
  const id = `wmd-${slug(meta.source_uid || meta.name || 'incident')}-source`;
  return {
    id, type: 'Feature', path: '/',
    properties: {
      id, type: 'u-d-p', how: 'h-g-i-g-o',
      color: '#FFFFFF', 'marker-color': '#FF3B3B', 'marker-opacity': 1,
      archived: true, time: now, start: now,
      stale: new Date(new Date(now).getTime() + staleMin * 60000).toISOString(),
      center: [meta.source_lon, meta.source_lat],
      callsign: `${meta.agent || meta.name || 'Release'} — source`,
      remarks: buildRemarks(meta, {}),
    },
    geometry: { type: 'Point', coordinates: [meta.source_lon, meta.source_lat] },
  };
}
