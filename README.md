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

`models/*.js` are copied verbatim from WMD PLOTTER `frontend/js/models/` — the
exact files cross-validated against the Python server (59 checks). If those
change, re-copy them here. `models/data.js` carries the chemical / AEGL / ERG
tables (generated from the Python source).

## Status & what's tested

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
