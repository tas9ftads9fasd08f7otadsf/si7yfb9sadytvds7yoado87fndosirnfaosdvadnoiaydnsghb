import type { Answer, Backend } from "@/backend/types";
import type { SessionAnswer } from "@/lib/types";
import { BASE } from "./base";
import { Cloud } from "./cloud";
import { readConfig, type SiteConfig } from "./config";
import { loadCore, type Core } from "./core";
import { indexedKeeping, Zones, type Keeping } from "./zones";
import type { CoreRow } from "./records";

const notYet = (step: number) => () =>
  Promise.reject(new Error(`The site's backend comes with step ${step} of web-icloud.md`));
const editing = notYet(4);
const adding = notYet(5);

/** What the site's backend stands on; a test hands it fakes. */
export interface Parts {
  cloud: Cloud;
  config: () => Promise<SiteConfig>;
  core: () => Promise<Core>;
  keeping: Keeping;
  fetcher: typeof fetch;
  base: string;
  language: () => string;
}

/** iCloud through CloudKit JS and the core: it reads; every write refuses until step 4 builds it. */
export function createBackend(parts: Parts): Backend {
  const zones = new Zones(async () => (await parts.cloud.databases()).container, parts.keeping, parts.fetcher);
  const listeners = new Set<() => void>();
  let reading: Promise<CoreRow[]> | null = null;

  parts.cloud.onChanged(() => {
    reading = null;
    for (const listener of listeners) listener();
  });

  /** The rows as last read; a change elsewhere, or `fresh`, reads them again. */
  const rows = (fresh = false): Promise<CoreRow[]> => {
    if (fresh) reading = null;
    reading ??= zones.rows();
    reading.catch(() => { reading = null; });
    return reading;
  };

  const session = async (): Promise<Answer<SessionAnswer>> => {
    const person = await parts.cloud.start();
    if (!person) return { ok: true, value: { standing: "signedOut" } };
    return { ok: true, value: { standing: "admitted", edits: false, device: person.name, viewers: null } };
  };

  return {
    target: "web",

    async words() {
      const answer = await parts.fetcher(`${parts.base}/words/${parts.language()}.json`);
      if (!answer.ok) throw new Error(`No words for ${parts.language()}`);
      return answer.json();
    },
    session,
    askToJoin: session,
    unlock: async () => ({ ok: false, status: 404, said: "The site signs in with an Apple Account" }),
    useToken: () => {},
    onChanged(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    mountAccount: (button, into) => parts.cloud.mount(button, into),

    async maps() {
      const [core, read, person] = await Promise.all([parts.core(), rows(true), parts.cloud.start()]);
      const device = core.maps(read);
      return { ...device, name: device.name || person?.name || "iCloud" };
    },
    async map(id) {
      const [core, read] = await Promise.all([parts.core(), rows()]);
      return core.map(read, id);
    },
    async style(ask) {
      const [core, read, config] = await Promise.all([parts.core(), rows(), parts.config()]);
      const style = core.style(read, ask.mapID, ask.styleID,
        { tilesBase: config.tilesBase, theme: ask.theme, hidden: ask.hidden, tiles: ask.tiles });
      return { ok: true, value: style };
    },

    change: editing, newMap: editing, importMap: editing, exportMap: editing, duplicateMap: editing,
    deleteMap: editing, shelve: editing, switches: editing, people: editing, askPeople: editing, setPicture: editing,
    layerOptions: editing, testLayer: editing, roadSigns: editing, packages: editing, servers: editing,
    addServer: adding, importServers: adding, exportServers: adding, addServerLayers: adding, readAPI: adding,
    addAPI: adding, addFile: adding, readDXF: adding, readAddress: adding, esriServices: adding,
    changeEsriService: adding, addTiles: adding, addServiceLayers: adding, coverage: adding, coveragePlaces: adding,
    startPlaces: adding, downloadRegion: adding, offlinePlan: adding, offlineDownload: adding, discardStored: adding,
    live: adding, identify: adding, details: adding, phoneLocation: adding,
    iconURL: () => "",
    regions: async () => ({}),
    icon: async () => null,
    symbolURL: () => "none"
  };
}

const language = () => navigator.language.split("-")[0] || "en";

export const backend: Backend = createBackend({
  cloud: new Cloud(), config: readConfig, core: () => loadCore(), keeping: indexedKeeping(),
  fetcher: (...asked) => fetch(...asked), base: BASE, language
});
