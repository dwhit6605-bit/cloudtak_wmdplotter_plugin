# cloudtak-plugin-wmd

A [CloudTAK](https://cloudtak.io/) **client plugin** that computes WMD PLOTTER
CBRN plumes **entirely in the browser** and posts the hazard zones into the
active DataSync mission — so a plume a responder runs shows up for the whole team
on every connected ATAK / WinTAK / CloudTAK client.

No server, no AWS, no network calls for the modeling: the nine dispersion models
(cross-validated against the WMD PLOTTER Python server, bit-for-bit) are bundled
and run client-side.

## Architecture

```
Menu → Hazard Model  (index.ts: PluginInstance)
  └─ lib/WMDPanel.vue
       pick source (map click) · chemical · rate · wind · stability
       → WMDModels.dispersion.compute_all_contours()   (in-browser, ./models)
       → lib/cot.js: contours → u-d-f CoT features
       → mapStore.worker.conn.sendCOT(withMissionDest(f))   → active mission → team
```

Built against `@tak-ps/cloudtak@13.70.0`. It follows the dfpc-coe sample plugin
([cloudtak-plugin-search-containment](https://github.com/clptak/cloudtak-plugin-search-containment)):
a `PluginInstance` that registers a route + menu item, a Vue panel that reaches
the active mission and TAK connection through CloudTAK's Pinia stores
(`useMapStore`), and CoT features shaped like CloudTAK's own drawn shapes.

## Deploy

CloudTAK plugins are **build-time** extensions — there is no runtime/admin
loader. CloudTAK clones this repo into `api/web/plugins/<name>/` and Vite bundles
it. Add it via the `WEB_PLUGINS` build arg and rebuild the CloudTAK image:

```bash
# Docker Compose
docker compose build \
  --build-arg WEB_PLUGINS="https://github.com/dwhit6605-bit/cloudtak-plugin-wmd.git" api

# or the build script
node bin/build.js api --plugin https://github.com/dwhit6605-bit/cloudtak-plugin-wmd.git
```

Then bring the stack back up. A menu item **Hazard Model** appears; open it,
ensure a Data Sync mission is active, set a source on the map, and Compute & Post.

Updating the plugin means rebuilding the image (no hot reload).

## The bundled models

`models/*.js` are generated from WMD PLOTTER `frontend/js/models/`, the files
WMD PLOTTER cross-validates against its Python server:

```bash
node tools/sync-models.mjs ["../WMD PLOTTER"]     # regenerate
node tools/sync-models.mjs --check                 # are they current?
```

Each is the WMD PLOTTER file unchanged, between a few generated lines that make
it an ES module with a default export (and a `.d.ts` beside it).
`lib/models.ts` imports them by name. Never edit them here: change WMD PLOTTER,
run its tests, then sync. `models/data.js` carries the chemical, AEGL and ERG
tables.

The first version imported WMD PLOTTER's UMD files for their side effect and
read a global, `self.WMDModels`. In a CloudTAK build the global was never set,
and the panel threw "WMD models failed to load". A build that treats modules as
free of side effects drops such imports; one that applies the CommonJS
transform sends the files down their `module.exports` branch. Either is enough,
and `lib/vite-bundle.test.mjs` reproduces both.

## Status & what's tested

- **The models load as ES modules and through Vite** (`npm test`):
  `lib/models.test.mjs` imports them with no globals, checks them against WMD
  PLOTTER when it is alongside, and checks an elevated release reaches the
  ground. `lib/vite-bundle.test.mjs` bundles `lib/models.ts` with Vite under
  its defaults, with side-effect-free tree-shaking, and with the CommonJS
  transform, then loads the bundle. It needs Vite: `VITE=/path/to/node_modules/vite`,
  or it skips. Not yet verified inside a CloudTAK build.
- **`lib/cot.js` — the compute→CoT core — is verified off-cloud: 19/19**
  (`npm test`). The test runs the real dispersion model on the bundled chemical
  data (exactly what the panel does) and checks the CoT features: u-d-f polygons,
  correct geometry/order, stable IDs (re-post updates instead of duplicating),
  styling, ATAK remarks, and the source marker.
- **`lib/WMDPanel.vue` + the store wiring are scaffold** — they import CloudTAK's
  own `src/` (stores, components) which only exist inside a CloudTAK build, so
  they can only be verified once bundled into your instance. Written faithful to
  the 13.70.0 API; treat as a starting point, expect to iterate against the build.

## Caveats

- v1 files features at **mission root**, avoiding the folder-create/attach race
  the sample plugin has to retry around. A named "WMD Hazard" folder can be added
  later via `mission.layer.create` / `attachFeatures`.
- v1 panel does the **Gaussian plume** (chemical). Blast / radiation / BLEVE /
  dense-gas / fire-smoke models are bundled and ready; wiring more model types
  into the panel is incremental.
- Pin and re-verify against your CloudTAK version before relying on it — the API
  moves fast.
