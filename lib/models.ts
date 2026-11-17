/*
 * The bundled WMD PLOTTER models.
 *
 * models/*.js are ES modules generated from WMD PLOTTER frontend/js/models/
 * by tools/sync-models.mjs: the model code unchanged, with a default export.
 * They are imported by name and never through a global, so no bundler setting
 * can drop them or send them down a CommonJS branch. (The first version
 * imported the UMD files for their side effect and read self.WMDModels; in
 * CloudTAK the global was never set and the panel threw "WMD models failed to
 * load".)
 *
 * The models are the exact files WMD PLOTTER cross-validates against its
 * Python server. Run `node tools/sync-models.mjs` when they change there.
 */
import dispersion from '../models/dispersion.js';
import radiation from '../models/radiation.js';
import blast from '../models/blast.js';
import bleve from '../models/bleve.js';
import dense_gas from '../models/dense_gas.js';
import fire_smoke from '../models/fire_smoke.js';
import probit from '../models/probit.js';
import line_source from '../models/line_source.js';
import impact from '../models/impact.js';
import data from '../models/data.js';

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
interface WMDModelSet {
  dispersion: Dispersion;
  radiation: unknown;
  data: WMDData;
  [k: string]: unknown;
}

const loaded: Record<string, unknown> = {
  dispersion, radiation, blast, bleve, dense_gas, fire_smoke, probit, line_source, impact, data,
};

/** What is wrong with the loaded models, one entry per problem; empty when all is well. */
export function problems(models: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [name, mod] of Object.entries(models)) {
    if (!mod || typeof mod !== 'object' || Object.keys(mod as object).length === 0) {
      out.push(`models/${name}.js exported nothing`);
    }
  }
  const d = models.dispersion as Partial<Dispersion> | undefined;
  if (d && typeof d.compute_all_contours !== 'function') {
    out.push('models/dispersion.js has no compute_all_contours()');
  }
  const w = models.data as Partial<WMDData> | undefined;
  if (w && (!Array.isArray(w.CHEMICALS) || !w.AEGL)) {
    out.push('models/data.js has no CHEMICALS list or AEGL table');
  }
  return out;
}

const wrong = problems(loaded);
if (wrong.length) {
  throw new Error('WMD models failed to load: ' + wrong.join('; '));
}

export const WMDModels = loaded as unknown as WMDModelSet;
export type { ContourInfo, Chemical };
