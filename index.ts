/**
 * CloudTAK Plugin: WMD PLOTTER Hazard Model
 *
 * Runs WHITWERX Model Display (WMD PLOTTER) CBRN dispersion models entirely
 * in-browser and posts the resulting hazard zones into the active DataSync
 * mission — so a plume a responder computes appears for the whole team.
 *
 * The models (frontend/js/models/*.js from WMD PLOTTER, cross-validated against
 * the Python server) are bundled under ./models; nothing here calls a server.
 *
 * Structure mirrors the dfpc-coe sample plugin (cloudtak-plugin-search-
 * containment): a PluginInstance that registers a route + menu item; the panel
 * (lib/WMDPanel.vue) does the compute + mission post.
 *
 * Built against @tak-ps/cloudtak@13.70.0 (map.whitwerx.cloud reports 13.70.0).
 */
import type { App } from 'vue';
import { defineAsyncComponent, markRaw } from 'vue';
import type { PluginAPI, PluginInstance, PluginStatic } from '@tak-ps/cloudtak';
import { IconRadioactive } from '@tabler/icons-vue';

const HazardPanel = defineAsyncComponent(() => import('./lib/WMDPanel.vue'));

const MENU_KEY = 'wmd-hazard';
const ROUTE_NAME = 'home-menu-plugin-wmd-hazard';
const ROUTE_PATH = 'plugin-wmd-hazard';

export default class WMDHazardPlugin implements PluginInstance {
  api: PluginAPI;

  constructor(api: PluginAPI) {
    this.api = api;
  }

  static async install(_app: App, api: PluginAPI): Promise<PluginInstance> {
    // Route must exist before the menu item references it. Do NOT expose UI
    // here — that happens in enable().
    api.routes.add({
      path: ROUTE_PATH,
      name: ROUTE_NAME,
      component: HazardPanel,
    }, 'home-menu');

    return new WMDHazardPlugin(api);
  }

  async enable(): Promise<void> {
    this.api.menu.add({
      key: MENU_KEY,
      label: 'Hazard Model',
      route: ROUTE_NAME,
      tooltip: 'WMD PLOTTER Hazard Model',
      description: 'Compute a CBRN plume in-browser and post hazard zones to the mission',
      icon: markRaw(IconRadioactive) as unknown as MenuItemIconType,
    } as MenuItemConfig);
  }

  async disable(): Promise<void> {
    // Remove only the menu item — never the route (removing routes breaks
    // navigation for other plugins; per the sample plugin's dispatcher notes).
    this.api.menu.remove(MENU_KEY);
  }
}

type MenuItemIconType = NonNullable<Parameters<PluginAPI['menu']['add']>[0]['icon']>;
type MenuItemConfig = Parameters<PluginAPI['menu']['add']>[0];

// Compile-time assertion that the class satisfies the static plugin contract.
export const _typecheck = WMDHazardPlugin as unknown as PluginStatic;
