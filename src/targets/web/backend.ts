import type { Answer, Backend, ChangedElsewhere } from "@/backend/types";
import type { Edit } from "@/lib/edit";
import type { Portable, SessionAnswer } from "@/lib/types";
import { ENGLISH } from "@/lib/words";
import { storedAuthor, type Author } from "./author";
import { BASE } from "./base";
import { Cloud } from "./cloud";
import { readConfig, type SiteConfig } from "./config";
import { loadCore, type Core } from "./core";
import { indexedKeeping, Zones, type Keeping } from "./zones";
import type { CoreRow, CoreWrite } from "./records";
import { changedFields, Conflict, write, type Plan } from "./writes";

const notYet = (step: number) => () =>
  Promise.reject(new Error(`The site's backend comes with step ${step} of web-icloud.md`));
const editing = notYet(4);
const adding = notYet(5);

/** How often a change is tried, on freshly read rows after a conflict. */
const TRIES = 3;

/** The signed-in person's own record of this site's session: the editor needs no password. */
const SITE_TOKEN = "icloud";

const MAP_ENTITIES = ["SharedMap", "SharedMapLayer", "SharedMapStyle"];

/** The rows as last known, to tell a change another device made from one this site wrote. */
interface Known {
  rows: Map<string, { tag: string; owner: string }>;
  changes: Set<string>;
}

/** What an undo puts back: the rows' fields as they were, and what the change wrote. */
interface Undoing {
  mapID: string;
  before: CoreWrite[];
  after: CoreWrite[];
  created: string[];
  removed: CoreRow[];
}

/** What the site's backend stands on; a test hands it fakes. */
export interface Parts {
  cloud: Cloud;
  config: () => Promise<SiteConfig>;
  core: () => Promise<Core>;
  keeping: Keeping;
  author: Author;
  fetcher: typeof fetch;
  base: string;
  language: () => string;
}

const ownerOf = (row: CoreRow) => (row.entity === "SharedMap" ? row.id : String(row.fields.map ?? ""));

const knownOf = (read: CoreRow[]): Known => ({
  rows: new Map(read.filter((row) => MAP_ENTITIES.includes(row.entity)).map((row) => [row.id, { tag: row.tag, owner: ownerOf(row) }])),
  changes: new Set(read.filter((row) => row.entity === "SharedMapChange").map((row) => row.id))
});

const refused = (said: string, status = 400): Answer<never> => ({ ok: false, status, said });

/** iCloud through CloudKit JS and the core: it reads and edits; other writes wait. */
export function createBackend(parts: Parts): Backend {
  const zones = new Zones(async () => (await parts.cloud.databases()).container, parts.keeping, parts.fetcher);
  const listeners = new Set<(changed?: ChangedElsewhere[]) => void>();
  let reading: Promise<CoreRow[]> | null = null;
  let known: Known | null = null;
  let undoing: Undoing | null = null;
  let telling: Promise<void> = Promise.resolve();

  /** The rows as last read; a change elsewhere, or `fresh`, reads them again. */
  const rows = (fresh = false): Promise<CoreRow[]> => {
    if (fresh) reading = null;
    reading ??= zones.rows().then((read) => { known ??= knownOf(read); return read; });
    reading.catch(() => { reading = null; });
    return reading;
  };

  /** The maps whose rows differ from the last known, with who the new history rows name. */
  const elsewhere = async (): Promise<ChangedElsewhere[]> => {
    if (!(await parts.cloud.start())) return [];
    const before = known;
    const [core, read] = [await parts.core(), await rows(true)];
    known = knownOf(read);
    if (!before) return [];
    const owners = new Set<string>();
    for (const [id, now] of known.rows) if (before.rows.get(id)?.tag !== now.tag) owners.add(now.owner);
    for (const [id, was] of before.rows) if (!known.rows.has(id)) owners.add(was.owner);
    const news = core.changes(read).filter((each) => !before.changes.has(each.id));
    const names = new Map(core.maps(read).maps.map((each) => [each.id, each.name]));
    return [...owners].flatMap((owner) => {
      const row = read.find((each) => each.entity === "SharedMap" && each.id === owner);
      if (!row) return [];
      const mapID = String(row.fields.id ?? owner);
      return [{ mapID, name: names.get(mapID) ?? String(row.fields.name ?? ""),
        author: news.find((each) => each.map === owner)?.author || null }];
    });
  };

  parts.cloud.onChanged(() => {
    reading = null;
    telling = telling.then(async () => {
      const changed = await elsewhere().catch(() => []);
      for (const listener of listeners) listener(changed);
    });
  });

  const mapRow = (read: CoreRow[], mapID: string) =>
    read.find((row) => row.entity === "SharedMap" && (row.fields.id === mapID || row.id === mapID));

  /** Plans and saves a change to the map's zone, reading the rows again on a conflict. */
  const commit = async (mapID: string, plan: (core: Core, read: CoreRow[]) => { plan: Plan } | { said: string; status: number },
    done: (plan: Plan, tags: Map<string, string>) => void): Promise<Answer<Portable>> => {
    const core = await parts.core();
    const { container } = await parts.cloud.databases();
    for (let attempt = 0; attempt < TRIES; attempt += 1) {
      const read = await rows(attempt > 0);
      const home = mapRow(read, mapID);
      if (!home) return refused("No such map", 404);
      const planned = plan(core, read);
      if (!("plan" in planned)) return refused(planned.said, planned.status);
      const db = home.database === "shared" ? container.sharedCloudDatabase : container.privateCloudDatabase;
      try {
        const tags = await write(db, { zoneName: home.zone, ...(home.owner ? { ownerRecordName: home.owner } : {}) }, planned.plan);
        done(planned.plan, tags);
        return { ok: true, value: core.map(await rows(true), mapID) };
      } catch (error) {
        if (!(error instanceof Conflict)) throw error;
      }
    }
    return refused(ENGLISH.changeRefused, 412);
  };

  /** The rows this site wrote are not news when CloudKit says they changed. */
  const written = (plan: Plan, tags: Map<string, string>, owner: string) => {
    for (const { write: each } of plan.save) {
      const tag = tags.get(each.id);
      if (!tag || !known) continue;
      if (each.entity === "SharedMapChange") known.changes.add(each.id);
      else known.rows.set(each.id, { tag, owner });
    }
    for (const row of plan.remove) known?.rows.delete(row.id);
  };

  const change = async (mapID: string, styleID: string | null, edit: Edit): Promise<Answer<Portable>> => {
    const author = parts.author.read() || (await parts.cloud.start())?.name || null;
    const tried: { owner: string; undo: Undoing | null } = { owner: "", undo: null };
    return commit(mapID, (core, read) => {
      const applied = core.apply({ rows: read, mapID, styleID, edit, author, origin: "web" });
      if ("refused" in applied) return { said: applied.refused, status: applied.status ?? 400 };
      const rowOf = (id: string) => read.find((row) => row.id === id);
      const gone = (applied.remove ?? []).flatMap((id) => rowOf(id) ?? []);
      const before: CoreWrite[] = [];
      const after: CoreWrite[] = [];
      for (const each of applied.write) {
        const row = rowOf(each.id);
        if (!row) continue;
        const names = changedFields(each, row);
        const keep = { entity: row.entity, id: row.id, ...(row.refs ? { refs: row.refs } : {}) };
        before.push({ ...keep, fields: Object.fromEntries(names.map((name) => [name, row.fields[name] ?? null])) });
        after.push({ ...keep, fields: Object.fromEntries(names.map((name) => [name, each.fields[name] ?? null])) });
      }
      const created = applied.write.filter((each) => !rowOf(each.id)).map((each) => each.id);
      tried.owner = mapRow(read, mapID)?.id ?? "";
      tried.undo = { mapID, before, after, created, removed: gone };
      const saves = [...applied.write, ...(applied.history ? [applied.history] : [])];
      return { plan: { save: saves.map((each) => ({ write: each, row: rowOf(each.id) })), remove: gone } };
    }, (plan, tags) => {
      written(plan, tags, tried.owner);
      undoing = tried.undo;
    });
  };

  /** The rows put back as they were, if nothing else has touched them since. */
  const undo = async (mapID: string): Promise<Answer<Portable>> => {
    const last = undoing;
    if (!last || last.mapID !== mapID) return refused("Nothing to undo", 404);
    let owner = "";
    return commit(mapID, (_core, read) => {
      owner = mapRow(read, mapID)?.id ?? "";
      const current = (id: string) => read.find((row) => row.id === id);
      const same = last.after.every((each) => Object.entries(each.fields)
        .every(([name, value]) => JSON.stringify(current(each.id)?.fields[name] ?? null) === JSON.stringify(value ?? null)));
      if (!same) return { said: ENGLISH.changeRefused, status: 412 };
      return { plan: {
        save: [...last.before.map((each) => ({ write: each, row: current(each.id) })),
          ...last.removed.map((row) => ({ write: { entity: row.entity, id: row.id, fields: row.fields,
            ...(row.refs ? { refs: row.refs } : {}) } }))],
        remove: last.created.flatMap((id) => current(id) ?? [])
      } };
    }, (plan, tags) => {
      written(plan, tags, owner);
      undoing = null;
    });
  };

  const session = async (): Promise<Answer<SessionAnswer>> => {
    const person = await parts.cloud.start();
    if (!person) return { ok: true, value: { standing: "signedOut" } };
    return { ok: true, value: { standing: "admitted", edits: true, token: SITE_TOKEN, device: person.name, viewers: null } };
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
    author: parts.author,

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

    change,
    undo,

    newMap: editing, importMap: editing, exportMap: editing, duplicateMap: editing,
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
  cloud: new Cloud(), config: readConfig, core: () => loadCore(), keeping: indexedKeeping(), author: storedAuthor(),
  fetcher: (...asked) => fetch(...asked), base: BASE, language
});
