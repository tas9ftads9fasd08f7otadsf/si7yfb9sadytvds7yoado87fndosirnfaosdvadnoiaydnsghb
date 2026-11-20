import { NotOnSite, type Answer, type Backend, type ChangedElsewhere, type Feature } from "@/backend/types";
import { createRegionPackages } from "./regions/packages";
import { loadStored, registerArchives } from "./regions/source";
import { browserStore, type PackageStore } from "./regions/store";
import type { Edit } from "@/lib/edit";
import type { Portable, SessionAnswer } from "@/lib/types";
import { ENGLISH, type Words } from "@/lib/words";
import { storedAuthor, type Author } from "./author";
import { BASE } from "./base";
import { Cloud } from "./cloud";
import { readConfig, type SiteConfig } from "./config";
import { chooseLanguage, codesOf, computedWords } from "./language";
import { loadCore, type AddressRead, type Adding, type Applied, type Core, type Reply } from "./core";
import { peopleOf, type Say } from "./people";
import { createReach, hostOf, type Reach } from "./reach";
import { drawnHere } from "./undrawn";
import { indexedKeeping, Zones, type Keeping } from "./zones";
import type { CoreRow, CoreWrite } from "./records";
import { changedFields, Conflict, stamped, write, type Plan } from "./writes";

const notYet = (step: number) => () =>
  Promise.reject(new NotOnSite(`The site's backend comes with step ${step} of web-icloud.md`));
const editing = notYet(4);
const adding = notYet(5);

/** What the site answers so far; the page offers no more. Packages, files, API layers and servers wait. */
const OFFERED: ReadonlySet<Feature> = new Set<Feature>(["addLayer", "people"]);

/** 86 How many rounds of fetching the core may ask of one address. */
const ROUNDS = 4;

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
  /** 85 Which hosts answer a browser; a style leaves out what does not. */
  reach: Reach;
  author: Author;
  fetcher: typeof fetch;
  base: string;
  /** The browser's languages, most wanted first. */
  languages: () => readonly string[];
  /** 112 Where region packages are kept; the browser's own file system, or IndexedDB without one. */
  regions?: PackageStore;
}

const ownerOf = (row: CoreRow) => (row.entity === "SharedMap" ? row.id : String(row.fields.map ?? ""));

const knownOf = (read: CoreRow[]): Known => ({
  rows: new Map(read.filter((row) => MAP_ENTITIES.includes(row.entity)).map((row) => [row.id, { tag: row.tag, owner: ownerOf(row) }])),
  changes: new Set(read.filter((row) => row.entity === "SharedMapChange").map((row) => row.id))
});

const refused = (said: string, status = 400): Answer<never> => ({ ok: false, status, said });

/** iCloud through CloudKit JS and the core: it reads and edits; other writes wait. */
export function createBackend(parts: Parts): Backend {
  const kept = parts.regions ?? browserStore();
  const regions = createRegionPackages({ store: kept, fetcher: parts.fetcher, base: parts.base });
  /** 112 Whether the server was set up to fetch region packages; known once the session has read the config. */
  let regionsOn = false;
  const zones = new Zones(async () => (await parts.cloud.databases()).container, parts.keeping, parts.fetcher);
  const listeners = new Set<(changed?: ChangedElsewhere[]) => void>();
  let reading: Promise<CoreRow[]> | null = null;
  let known: Known | null = null;
  let undoing: Undoing | null = null;
  let telling: Promise<void> = Promise.resolve();
  /** The words the page was last given, for what the site itself refuses with. */
  let spoken: Partial<Words> = {};
  const say = (key: "changeRefused" | "noSuchMap" | "nothingToUndo" | "signsInApple") => spoken[key] ?? ENGLISH[key];

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
      if (!home) return refused(say("noSuchMap"), 404);
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
    return refused(say("changeRefused"), 412);
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

  /** Asks the core for rows to write, and saves them; both a change and an added layer go this way. */
  const through = async (mapID: string, styleID: string | null,
    ask: (core: Core, rows: CoreRow[], author: string | null) => Applied): Promise<Answer<Portable>> => {
    const author = parts.author.read() || (await parts.cloud.start())?.name || null;
    const tried: { owner: string; undo: Undoing | null } = { owner: "", undo: null };
    return commit(mapID, (core, read) => {
      const applied = ask(core, read, author);
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
      const saves = [...applied.write, ...(applied.history ? [stamped(applied.history)] : [])];
      return { plan: { save: saves.map((each) => ({ write: each, row: rowOf(each.id) })), remove: gone } };
    }, (plan, tags) => {
      written(plan, tags, tried.owner);
      undoing = tried.undo;
    });
  };

  const change = (mapID: string, styleID: string | null, edit: Edit) =>
    through(mapID, styleID, (core, read, author) => core.apply({ rows: read, mapID, styleID, edit, author, origin: "web" }));

  const reply = async (url: string): Promise<Reply | null> => {
    if ((await parts.reach.answers(url)) === false) return null;
    try {
      const answer = await parts.fetcher(url, { mode: "cors", credentials: "omit" });
      return { url, status: answer.status, contentType: answer.headers.get("content-type") ?? "", text: await answer.text() };
    } catch {
      return { url, status: 0, contentType: "", text: "" };
    }
  };

  /** What an address is: the core says which addresses it needs, the browser fetches them if their hosts answer it. */
  const readOf = async (address: string): Promise<Answer<{ read: Extract<AddressRead, { read: unknown }>["read"]; replies: Reply[] }>> => {
    const core = await parts.core();
    const replies: Reply[] = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      const said = core.readAddress({ address, replies });
      if ("refused" in said) return refused(said.refused, said.status ?? 400);
      if ("read" in said) {
        if (said.read.probe && (await parts.reach.answers(said.read.probe)) === false) return refused(ENGLISH.addRefusesBrowsers);
        return { ok: true, value: { read: said.read, replies } };
      }
      for (const url of said.fetch.filter((each) => !replies.some((had) => had.url === each))) {
        const got = await reply(url);
        if (!got) return refused(ENGLISH.addRefusesBrowsers);
        replies.push(got);
      }
    }
    return refused(ENGLISH.addUnreadable);
  };

  /** What the last address read fetched, so adding it asks the host no more than reading did. */
  let lastRead: { address: string; replies: Reply[] } | null = null;

  const readAddress = async (address: string) => {
    const got = await readOf(address);
    if (!got.ok) return got;
    lastRead = { address, replies: got.value.replies };
    return { ok: true as const, value: got.value.read };
  };

  const repliesOf = async (address: string): Promise<Answer<Reply[]>> => {
    if (lastRead?.address === address) return { ok: true, value: lastRead.replies };
    const got = await readOf(address);
    return got.ok ? { ok: true, value: got.value.replies } : got;
  };

  const addLayer = async (mapID: string, address: string, add: (replies: Reply[]) => Adding): Promise<Answer<Portable>> => {
    const replies = await repliesOf(address);
    if (!replies.ok) return replies;
    return through(mapID, null, (core, read, author) =>
      core.addLayer({ rows: read, mapID, styleID: null, add: add(replies.value), author, origin: "web" }));
  };

  /** The rows put back as they were, if nothing else has touched them since. */
  const undo = async (mapID: string): Promise<Answer<Portable>> => {
    const last = undoing;
    if (!last || last.mapID !== mapID) return refused(say("nothingToUndo"), 404);
    let owner = "";
    return commit(mapID, (_core, read) => {
      owner = mapRow(read, mapID)?.id ?? "";
      const current = (id: string) => read.find((row) => row.id === id);
      const same = last.after.every((each) => Object.entries(each.fields)
        .every(([name, value]) => JSON.stringify(current(each.id)?.fields[name] ?? null) === JSON.stringify(value ?? null)));
      if (!same) return { said: say("changeRefused"), status: 412 };
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
    regionsOn = Boolean((await parts.config().catch(() => null))?.regionsCatalog);
    return { ok: true, value: { standing: "admitted", edits: true, token: SITE_TOKEN, device: person.name, viewers: null } };
  };

  return {
    target: "web",
    offers: (feature) => OFFERED.has(feature) || (feature === "regionPackages" && regionsOn),
    regionPackages: regions.packages,
    stored: {
      prepare: (style, protocol) => registerArchives(style, kept, protocol),
      load: (params) => loadStored(kept, params)
    },

    async words() {
      let codes = ["en"];
      try {
        const listing = await parts.fetcher(`${parts.base}/words/languages.json`);
        if (listing.ok) codes = codesOf(await listing.json());
      } catch { /* the site was packed with English only */ }
      const language = chooseLanguage(codes, parts.languages());
      const answer = await parts.fetcher(`${parts.base}/words/${language}.json`);
      if (!answer.ok) throw new Error(`No words for ${language}`);
      const read = await answer.json() as { language?: string; words?: Record<string, string> };
      const said = { ...ENGLISH, ...read.words } as Words;
      const made = computedWords(language, codes, said);
      spoken = { ...said, ...made };
      return { language: read.language ?? language, words: { ...read.words, ...made } };
    },
    session,
    askToJoin: session,
    unlock: async () => ({ ok: false, status: 404, said: say("signsInApple") }),
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
        { tilesBase: config.tilesBase, glyphsBase: `${location.origin}${parts.base}/glyphs`,
          spriteBase: `${location.origin}${parts.base}/sprites/temaki-sprite`, stored: await regions.stored(), theme: ask.theme,
          hidden: ask.hidden, tiles: ask.tiles });
      const own = [hostOf(config.tilesBase), location.origin].filter((each) => each !== null);
      return { ok: true, value: await drawnHere(style, parts.reach, own) };
    },

    change,
    undo,

    /** 108 A share's people and link as the core reads them; changes wait for the app. */
    async people(of) {
      if (of.kind !== "map") throw new NotOnSite("A folder's sharing is not read on the site yet");
      const [core, read] = await Promise.all([parts.core(), rows()]);
      const home = mapRow(read, of.id);
      if (!home) return refused(say("noSuchMap"), 404);
      const said = core.people(read, of.id);
      if ("refused" in said) return refused(said.refused, said.status ?? 400);
      const word: Say = (key) => spoken[key] ?? ENGLISH[key];
      return { ok: true, value: peopleOf(said, word) };
    },

    newMap: editing, importMap: editing, exportMap: editing, duplicateMap: editing,
    deleteMap: editing, shelve: editing, switches: editing, askPeople: editing, setPicture: editing,
    layerOptions: editing, testLayer: editing, roadSigns: editing, packages: editing, servers: editing,
    readAddress,
    addTiles: (mapID, template) => addLayer(mapID, template, (replies) => ({ kind: "tiles", address: template, replies })),
    addServiceLayers: (mapID, address, picks) =>
      addLayer(mapID, address, (replies) => ({ kind: "service", address, replies, picks })),
    addServer: adding, importServers: adding, exportServers: adding, addServerLayers: adding, readAPI: adding,
    addAPI: adding, addFile: adding, readDXF: adding, esriServices: adding,
    changeEsriService: adding, coverage: adding, coveragePlaces: adding,
    startPlaces: adding, downloadRegion: adding, offlinePlan: adding, offlineDownload: adding, discardStored: adding,
    live: adding, identify: adding, details: adding, phoneLocation: adding,
    iconURL: () => "",
    regions: async () => ({}),
    icon: async () => null,
    symbolURL: () => "none"
  };
}

const languages = () => (navigator.languages?.length ? navigator.languages : [navigator.language]);

const keeping = indexedKeeping();

export const backend: Backend = createBackend({
  cloud: new Cloud(), config: readConfig, core: () => loadCore(), keeping, reach: createReach(keeping), author: storedAuthor(),
  fetcher: (...asked) => fetch(...asked), base: BASE, languages
});
