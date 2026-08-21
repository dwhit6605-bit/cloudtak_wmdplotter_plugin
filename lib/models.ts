/*
 * Adapter for the bundled WMD PLOTTER models.
 *
 * The model files use a UMD wrapper: in a browser/worker they attach to
 * `self.WMDModels.<name>` (there is no `module.exports` in ESM, so they take the
 * global branch). We import them for their side effect, then read the global.
 * Vite preserves side-effect-only imports, so this survives bundling.
 *
 * The models are copied from WMD PLOTTER `frontend/js/models/` and are the exact
 * files cross-validated against the Python server. Re-sync if those change.
 */
import '../models/dispersion.js';
import '../models/radiation.js';
import '../models/blast.js';
import '../models/bleve.js';
import '../models/dense_gas.js';
import '../models/fire_smoke.js';
import '../models/probit.js';
import '../models/line_source.js';
import '../models/impact.js';
import '../models/data.js';

// Minimal typings for the surface the panel uses. The models are plain JS.
interface ContourInfo {
  latlon: Array<[number, number]>;
  label: string;
  color: string;
  max_downwind_m: number;
  max_width_m: number;
  threshold_ppm?: number;
}
interface Dispersion {
  compute_all_contours(
    Q_gs: number, u_ms: number, stability: string, mw: number,
    thresholds: Record<string, { value: number; label: string; color: string }>,
    source_lat: number, source_lon: number, wind_from_deg: number, H_m?: number,
  ): Record<string, ContourInfo>;
  ppm_to_gm3(ppm: number, mw: number): number;
}
interface Chemical { id: string; name: string; mw: number; [k: string]: unknown }
interface WMDData {
  CHEMICALS: Chemical[];
  AEGL: Record<string, Record<string, Record<string, number>>>;
  ERG_TABLE1: Record<string, unknown>;
}
interface WMDModelsGlobal {
  dispersion: Dispersion;
  radiation: unknown;
  data: WMDData;
  [k: string]: unknown;
}

const g = globalThis as unknown as { WMDModels?: WMDModelsGlobal };
if (!g.WMDModels || !g.WMDModels.dispersion || !g.WMDModels.data) {
  throw new Error('WMD models failed to load — check the ./models bundle');
}

export const WMDModels = g.WMDModels;
export type { ContourInfo, Chemical };
