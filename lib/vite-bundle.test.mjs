/*
 * Bundle lib/models.ts with Vite, as CloudTAK builds a plugin, and load it:
 *   VITE=/path/to/node_modules/vite node lib/vite-bundle.test.mjs
 * (or with vite installed where Node can resolve it).
 *
 * Three settings: Vite's defaults, a build that treats modules as free of side
 * effects, and one that applies the CommonJS transform to every file. The
 * first loader failed under the last two with "WMD models failed to load",
 * which is the error CloudTAK showed. Skips when Vite cannot be found: this
 * plugin declares no dependencies (CloudTAK supplies them at build time).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
let vite;
try {
  vite = process.env.VITE
    ? await import(pathToFileURL(join(process.env.VITE, 'dist', 'node', 'index.js')).href)
    : await import('vite');
} catch {
  console.log('SKIP  Vite not found (set VITE=/path/to/node_modules/vite)');
  process.exit(0);
}

const SETTINGS = {
  defaults: {},
  'no side effects': { rollupOptions: { treeshake: { moduleSideEffects: false } } },
  'CommonJS transform': { commonjsOptions: { include: [/./], transformMixedEsModules: true } },
};

const work = mkdtempSync(join(tmpdir(), 'wmd-vite-'));
const entry = join(work, 'entry.ts');
writeFileSync(entry, `import { WMDModels } from ${JSON.stringify(resolve(HERE, 'models.ts'))};\n`
  + 'export const names = Object.keys(WMDModels).sort().join(",");\n'
  + 'export const reach = WMDModels.dispersion.compute_all_contours(500, 3, "D", 70.9,'
  + ' { high: { value: 20, label: "x", color: "#f00" } }, 34.05, -118.25, 270, 0).high.max_downwind_m;\n');

let failed = 0;
let i = 0;
for (const [label, extra] of Object.entries(SETTINGS)) {
  const file = 'out' + i++;
  let line;
  try {
    await vite.build({
      root: work, logLevel: 'silent', configFile: false,
      build: { lib: { entry, formats: ['es'], fileName: file }, outDir: join(work, 'dist'),
        emptyOutDir: false, minify: false, ...extra },
    });
    globalThis.self = globalThis; // as in a browser
    const out = await import(pathToFileURL(join(work, 'dist', file + '.mjs')).href);
    delete globalThis.self;
    const ok = out.names.split(',').length === 10 && out.reach > 0;
    if (!ok) failed++;
    line = (ok ? 'PASS  ' : 'FAIL  ') + `${label}: ${out.names}`;
  } catch (e) {
    failed++;
    line = `FAIL  ${label}: ${e.message}`;
  }
  console.log(line);
}
rmSync(work, { recursive: true, force: true });
console.log(`\n${3 - failed}/3 passed`);
process.exit(failed ? 1 : 0);
