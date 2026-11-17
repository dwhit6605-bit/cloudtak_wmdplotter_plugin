/*
 * The bundled models load as plain ES modules, with no globals:
 *   node lib/models.test.mjs
 * This is the path a bundler takes. The first version relied on a global
 * (self.WMDModels) that CloudTAK's build never set. lib/vite-bundle.test.mjs
 * takes the same files through Vite itself.
 */
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, detail) => {
  results.push([name, !!cond]);
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail && !cond ? `   [${detail}]` : ''));
};

delete globalThis.self;
const names = readdirSync(join(HERE, '..', 'models')).filter((f) => /^[a-z_]+\.js$/.test(f)).sort();
check('ten model files', names.length === 10, names.join(','));
const models = {};
for (const f of names) {
  const mod = (await import('../models/' + f)).default;
  models[f.replace(/\.js$/, '')] = mod;
  check(`models/${f} exports its model`, mod && Object.keys(mod).length > 0);
}
check('no global was needed or set', globalThis.WMDModels === undefined);
check('dense gas got dispersion by import', typeof models.dense_gas.compute_dense_gas_zones === 'function');

// The elevated-release fix (WMD PLOTTER, 2026-11-17): a release above ground
// in stable air used to read "never reaches" at every threshold.
const thr = models.dispersion.ppm_to_gm3(2.0, 70.9);
for (const s of ['A', 'D', 'F']) {
  const ground = models.dispersion.find_max_downwind(thr, 1000, 2.0, s, 0.0);
  const up = models.dispersion.find_max_downwind(thr, 1000, 2.0, s, 20.0);
  check(`${s}: a 20 m release reaches the ground, within the ground release's reach`,
    up > 0 && up <= ground, `${up} vs ${ground}`);
}

// In step with WMD PLOTTER, when it is alongside (it is not in a CloudTAK build).
const wmd = join(HERE, '..', '..', 'WMD PLOTTER');
try {
  readdirSync(join(wmd, 'frontend', 'js', 'models'));
  let ok = true;
  try {
    execFileSync(process.execPath, [join(HERE, '..', 'tools', 'sync-models.mjs'), '--check', wmd],
      { stdio: 'pipe' });
  } catch { ok = false; }
  check('models match WMD PLOTTER (node tools/sync-models.mjs)', ok);
} catch {
  console.log('SKIP  WMD PLOTTER not alongside; sync not checked');
}

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
