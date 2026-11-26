import { NotOnSite, type Answer, type Backend, type ChangedElsewhere, type Feature } from "@/backend/types";
import { siteSymbolURL } from "./symbols";
import { createRegionPackages } from "./regions/packages";
import { loadStored, registerArchives } from "./regions/source";
import { browserStore, type PackageStore } from "./regions/store";
import { queryOf, type Edit } from "@/lib/edit";
import type { Portable, SessionAnswer } from "@/lib/types";
import { ENGLISH, type Words } from "@/lib/words";
import { storedAuthor, type Author } from "./author";
import { BASE } from "./base";
import { Cloud, refusesToken } from "./cloud";
import { readConfig, type SiteConfig } from "./config";
import { chooseLanguage, codesOf, computedWords } from "./language";
import {
  loadCore,
  type AddressRead,
  type Applied,
  type Core,
  type Deleted,
  type Imported,
  type Made,
  type Reply,
} from "./core";
import { peopleOf, type Say } from "./people";
import { createReach, type Reach } from "./reach";
import { drawnHere } from "./undrawn";
import { Progress } from "./progress";
import { indexedKeeping, Zones, type Keeping } from "./zones";
import type { CoreRow, CoreWrite } from "./records";
import { keysOf } from "./sealed-keys";
import { setRequestHeaders } from "@/lib/request-headers";
import { changedFields, Conflict, stamped, write, type Plan } from "./writes";

const notYet = (step: number) => () =>
  Promise.reject(new NotOnSite(`The site's backend comes with step ${step} of web-icloud.md`));
const editing = notYet(4);
const adding = notYet(5);

/** What the site answers so far; the page offers no more. Packages, files, API layers and servers wait. */
const OFFERED: ReadonlySet<Feature> = new Set<Feature>([
  "addLayer",
  "people",
  "exportMap",
  "duplicateMap",
  "newMap",
  "addPackages",
]);

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
  /** 137 What the first read has done, for the loading screen. */
  progress?: Progress;
}

const ownerOf = (row: Pick<CoreRow, "entity" | "id" | "fields">) =>
  row.entity === "SharedMap" ? row.id : String(row.fields.map ?? "");

const knownOf = (read: CoreRow[]): Known => ({
  rows: new Map(
    read
      .filter((row) => MAP_ENTITIES.includes(row.entity))
      .map((row) => [row.id, { tag: row.tag, owner: ownerOf(row) }]),
  ),
  changes: new Set(read.filter((row) => row.entity === "SharedMapChange").map((row) => row.id)),
});

const refused = (said: string, status = 400): Answer<never> => ({ ok: false, status, said });

/** iCloud through CloudKit JS and the core: it reads and edits; other writes wait. */
export function createBackend(parts: Parts): Backend {
  const kept = parts.regions ?? browserStore();
  const regions = createRegionPackages({ store: kept, fetcher: parts.fetcher, base: parts.base });
  /** 112 Whether the server was set up to fetch region packages; known once the session has read the config. */
  let regionsOn = false;
  const zones = new Zones(
    async () => (await parts.cloud.databases()).container,
    parts.keeping,
    parts.fetcher,
    parts.progress,
  );
  const listeners = new Set<(changed?: ChangedElsewhere[]) => void>();
  let reading: Promise<CoreRow[]> | null = null;
  let known: Known | null = null;
  let undoing: Undoing | null = null;
  let telling: Promise<void> = Promise.resolve();
  /** The words the page was last given, for what the site itself refuses with. */
  let spoken: Partial<Words> = {};
  /** 160 The language the words are in, which names are sorted by. */
  let speaking = "en";
  const say = (key: "changeRefused" | "noSuchMap" | "nothingToUndo" | "signsInApple") => spoken[key] ?? ENGLISH[key];

  /** The rows as last read; a change elsewhere, or `fresh`, reads them again. */
  const rows = (fresh = false): Promise<CoreRow[]> => {
    if (fresh) reading = null;
    reading ??= zones.rows().then(async (read) => {
      known ??= knownOf(read);
      setRequestHeaders(await keysOf(read, (await parts.cloud.start())?.recordName ?? null));
      return read;
    });
    reading.catch(() => {
      reading = null;
    });
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
      return [
        {
          mapID,
          name: names.get(mapID) ?? String(row.fields.name ?? ""),
          author: news.find((each) => each.map === owner)?.author || null,
        },
      ];
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
  const commit = async (
    mapID: string,
    plan: (core: Core, read: CoreRow[]) => { plan: Plan } | { said: string; status: number },
    done: (plan: Plan, tags: Map<string, string>) => void,
  ): Promise<Answer<Portable>> => {
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
        const tags = await write(
          db,
          { zoneName: home.zone, ...(home.owner ? { ownerRecordName: home.owner } : {}) },
          planned.plan,
        );
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
  const through = async (
    mapID: string,
    styleID: string | null,
    ask: (core: Core, rows: CoreRow[], author: string | null) => Applied,
  ): Promise<Answer<Portable>> => {
    const author = parts.author.read() || (await parts.cloud.start())?.name || null;
    const tried: { owner: string; undo: Undoing | null } = { owner: "", undo: null };
    return commit(
      mapID,
      (core, read) => {
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
      },
      (plan, tags) => {
        written(plan, tags, tried.owner);
        undoing = tried.undo;
      },
    );
  };

  /** 198 Maps the core made from the rows, their new rows created in the zone it names; the first opens. */
  const create = async (
    made: (core: Core, read: CoreRow[]) => Made | Imported | { refused: string; status?: number; said?: string },
  ): Promise<Answer<{ id: string }>> => {
    const [core, read] = await Promise.all([parts.core(), rows()]);
    const answer = made(core, read);
    if ("refused" in answer) {
      return refused(answer.status === 404 ? say("noSuchMap") : (answer.said ?? answer.refused), answer.status ?? 400);
    }
    const { container } = await parts.cloud.databases();
    const db = answer.database === "shared" ? container.sharedCloudDatabase : container.privateCloudDatabase;
    const plan: Plan = { save: answer.write.map((each) => ({ write: each })), remove: [] };
    try {
      const tags = await write(db, { zoneName: answer.zone }, plan);
      for (const { write: each } of plan.save) {
        const tag = tags.get(each.id);
        if (tag && known) known.rows.set(each.id, { tag, owner: ownerOf(each) });
      }
    } catch (error) {
      if (!(error instanceof Conflict)) throw error;
      return refused(say("changeRefused"), 412);
    }
    reading = null;
    const first = "map" in answer ? answer.map : answer.maps[0];
    return first ? { ok: true, value: { id: first.id } } : refused(say("noSuchMap"), 404);
  };

  /** 200 The records or zones the core says a deleted map takes; the next read leaves them out. */
  const remove = async (
    asked: (core: Core, read: CoreRow[]) => Deleted | { refused: string; status?: number; said?: string },
  ): Promise<Answer<null>> => {
    const [core, read] = await Promise.all([parts.core(), rows(true)]);
    const answer = asked(core, read);
    if ("refused" in answer) {
      return refused(answer.status === 404 ? say("noSuchMap") : (answer.said ?? answer.refused), answer.status ?? 400);
    }
    const { container } = await parts.cloud.databases();
    const db = answer.database === "shared" ? container.sharedCloudDatabase : container.privateCloudDatabase;
    const zones = new Set(answer.removeZones);
    const gone = read.filter(
      (row) =>
        row.database === answer.database &&
        (zones.has(row.zone) || (row.zone === answer.zone && answer.remove.includes(row.id))),
    );
    try {
      if (zones.size > 0) {
        const done = await container.privateCloudDatabase.deleteRecordZones(
          [...zones].map((zoneName) => ({ zoneName })),
        );
        const failed = (done.errors ?? []).find((each) => each.ckErrorCode !== "ZONE_NOT_FOUND");
        if (failed) throw new Error(failed.reason ?? failed.ckErrorCode ?? "CloudKit refused to delete the zone");
      } else {
        const home = gone.find((row) => row.entity === "SharedMap");
        const zone = { zoneName: answer.zone, ...(home?.owner ? { ownerRecordName: home.owner } : {}) };
        await write(db, zone, { save: [], remove: gone.filter((row) => answer.remove.includes(row.id)) });
      }
    } catch (error) {
      if (!(error instanceof Conflict)) throw error;
      return refused(say("changeRefused"), 412);
    }
    for (const row of gone) known?.rows.delete(row.id);
    if (undoing && gone.some((row) => row.entity === "SharedMap" && row.fields.id === undoing?.mapID)) undoing = null;
    reading = null;
    return { ok: true, value: null };
  };

  const change = (mapID: string, styleID: string | null, edit: Edit) =>
    through(mapID, styleID, (core, read, author) =>
      core.apply({ rows: read, id: mapID, styleID, edit: queryOf(edit), author }),
    );

  const reply = async (url: string): Promise<Reply | null> => {
    if ((await parts.reach.answers(url)) === false) return null;
    try {
      const answer = await parts.fetcher(url, { mode: "cors", credentials: "omit" });
      return {
        url,
        status: answer.status,
        contentType: answer.headers.get("content-type") ?? "",
        text: await answer.text(),
      };
    } catch {
      return { url, status: 0, contentType: "", text: "" };
    }
  };

  /** 165 What an address is: the core names the capabilities to fetch, the browser fetches them if their host answers. */
  const readOf = async (
    address: string,
  ): Promise<
    Answer<{ read: Exclude<AddressRead, { refused: string } | { kind: "fetch" }>; document: string | null }>
  > => {
    const core = await parts.core();
    const first = core.readAddress({ address });
    if ("refused" in first) return refused(first.said ?? first.refused, first.status ?? 400);
    if (first.kind !== "fetch") {
      if (first.kind === "direct" && first.probe && (await parts.reach.answers(first.probe)) === false) {
        return refused(ENGLISH.addRefusesBrowsers);
      }
      return { ok: true, value: { read: first, document: null } };
    }
    const got = await reply(first.url);
    if (!got) return refused(ENGLISH.addRefusesBrowsers);
    if (got.status < 200 || got.status >= 300) return refused(ENGLISH.addUnreadable);
    const read = core.readAddress({ address, document: got.text });
    if ("refused" in read) return refused(read.said ?? read.refused, read.status ?? 400);
    if (read.kind === "fetch") return refused(ENGLISH.addUnreadable);
    return { ok: true, value: { read, document: got.text } };
  };

  /** What the last address read fetched, so adding it asks the host no more than reading did. */
  let lastRead: { address: string; document: string | null } | null = null;

  const readAddress = async (address: string) => {
    const got = await readOf(address);
    if (!got.ok) return got;
    lastRead = { address, document: got.value.document };
    return { ok: true as const, value: got.value.read };
  };

  const documentOf = async (address: string): Promise<Answer<string>> => {
    const document = lastRead?.address === address ? lastRead.document : null;
    if (document !== null) return { ok: true, value: document };
    const got = await readOf(address);
    if (!got.ok) return got;
    return got.value.document === null ? refused(ENGLISH.addUnreadable) : { ok: true, value: got.value.document };
  };

  /** 165 The core makes the ticked layers, then writes them as an edit writes. */
  const addServiceLayers = async (mapID: string, address: string, picks: string[]): Promise<Answer<Portable>> => {
    const document = await documentOf(address);
    if (!document.ok) return document;
    return through(mapID, null, (core, read, author) => {
      const added = core.addLayer({ rows: read, id: mapID, address, picks, document: document.value });
      if ("refused" in added) return added;
      return core.apply({ rows: read, id: mapID, styleID: null, layers: added.layers, author });
    });
  };

  const addTiles = async (mapID: string, template: string): Promise<Answer<Portable>> =>
    through(mapID, null, (core, read, author) =>
      core.addTiles({
        rows: read,
        mapID,
        styleID: null,
        add: { kind: "tiles", address: template, replies: [] },
        author,
        origin: "web",
      }),
    );

  /** The rows put back as they were, if nothing else has touched them since. */
  const undo = async (mapID: string): Promise<Answer<Portable>> => {
    const last = undoing;
    if (!last || last.mapID !== mapID) return refused(say("nothingToUndo"), 404);
    let owner = "";
    return commit(
      mapID,
      (_core, read) => {
        owner = mapRow(read, mapID)?.id ?? "";
        const current = (id: string) => read.find((row) => row.id === id);
        const same = last.after.every((each) =>
          Object.entries(each.fields).every(
            ([name, value]) => JSON.stringify(current(each.id)?.fields[name] ?? null) === JSON.stringify(value ?? null),
          ),
        );
        if (!same) return { said: say("changeRefused"), status: 412 };
        return {
          plan: {
            save: [
              ...last.before.map((each) => ({ write: each, row: current(each.id) })),
              ...last.removed.map((row) => ({
                write: { entity: row.entity, id: row.id, fields: row.fields, ...(row.refs ? { refs: row.refs } : {}) },
              })),
            ],
            remove: last.created.flatMap((id) => current(id) ?? []),
          },
        };
      },
      (plan, tags) => {
        written(plan, tags, owner);
        undoing = null;
      },
    );
  };

  const session = async (): Promise<Answer<SessionAnswer>> => {
    const person = await parts.cloud.start().catch((error: unknown) => {
      if (refusesToken(error)) return "refused" as const;
      throw error;
    });
    if (person === "refused") return { ok: true, value: { standing: "refused" } };
    if (!person) {
      return {
        ok: true,
        value: { standing: "signedOut", ...(parts.cloud.signInUnanswered() ? { signInUnanswered: true } : {}) },
      };
    }
    regionsOn = Boolean((await parts.config().catch(() => null))?.regionsCatalog);
    return {
      ok: true,
      value: { standing: "admitted", edits: true, token: SITE_TOKEN, device: person.name, viewers: null },
    };
  };

  return {
    target: "web",
    offers: (feature) => OFFERED.has(feature) || (feature === "regionPackages" && regionsOn),
    regionPackages: regions.packages,
    stored: {
      prepare: (style, protocol) => registerArchives(style, kept, protocol),
      load: (params) => loadStored(kept, params),
    },

    async words() {
      let codes = ["en"];
      try {
        const listing = await parts.fetcher(`${parts.base}/words/languages.json`);
        if (listing.ok) codes = codesOf(await listing.json());
      } catch {
        /* the site was packed with English only */
      }
      const language = chooseLanguage(codes, parts.languages());
      const answer = await parts.fetcher(`${parts.base}/words/${language}.json`);
      if (!answer.ok) throw new Error(`No words for ${language}`);
      const read = (await answer.json()) as { language?: string; words?: Record<string, string> };
      const said = { ...ENGLISH, ...read.words } as Words;
      const made = computedWords(language, codes, said);
      spoken = { ...said, ...made };
      speaking = read.language ?? language;
      return { language: speaking, words: { ...read.words, ...made } };
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
    loading: (listener) => parts.progress?.listen(listener) ?? (() => undefined),
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
      const [core, read] = await Promise.all([parts.core(), rows()]);
      const style = core.style(read, ask.mapID, ask.styleID, {
        glyphsBase: `${location.origin}${parts.base}/glyphs`,
        spriteBase: `${location.origin}${parts.base}/sprites/temaki-sprite`,
        stored: await regions.stored(),
        theme: ask.theme,
        hidden: ask.hidden,
        tiles: ask.tiles,
      });
      const own = [location.origin];
      return { ok: true, value: await drawnHere(style, parts.reach, own) };
    },

    change,
    undo,

    /** 175 What Edit map and Styles switch, as the core reads the map's rows. */
    async switches(mapID) {
      const [core, read] = await Promise.all([parts.core(), rows()]);
      const said = core.switches(read, mapID);
      if ("refused" in said)
        return refused(said.refused === "noSuchMap" ? say("noSuchMap") : said.refused, said.status ?? 400);
      return { ok: true, value: said };
    },

    /** 108 A share's people and link as the core reads them; changes wait for the app. */
    async people(of) {
      if (of.kind !== "map") throw new NotOnSite("A folder's sharing is not read on the site yet");
      const [core, read] = await Promise.all([parts.core(), rows()]);
      const home = mapRow(read, of.id);
      if (!home) return refused(say("noSuchMap"), 404);
      const said = core.people(read, of.id);
      if ("refused" in said) return refused(said.refused, said.status ?? 400);
      const word: Say = (key) => spoken[key] ?? ENGLISH[key];
      return { ok: true, value: peopleOf(said, word, speaking) };
    },

    /** 176 The file the phone's Share writes, made by the core: keys are left out and named. */
    async exportMap(id) {
      const [core, read] = await Promise.all([parts.core(), rows()]);
      const file = core.exportMap(read, id);
      if ("refused" in file) return refused(file.status === 404 ? say("noSuchMap") : file.refused, file.status ?? 400);
      return { ok: true, value: { blob: new Blob([file.text], { type: "application/json" }), name: file.name } };
    },

    /** 198 Edit map's Duplicate: the copy the core makes goes to the person's own iCloud, after every map. */
    duplicateMap: (id) => create((core, read) => core.duplicate(read, id)),

    /** 199 New map's blank map, in the person's own iCloud after every map. */
    newMap: (name) => create((core, read) => core.newMap(read, name)),
    /** 199 The phone takes a file the app did not sign, and so does the site; the map keeps that mark. */
    importMap: async (file) => {
      const text = await file.text();
      return create((core, read) => core.importMap(read, text, true));
    },
    /** 200 The Maps sheet's Delete once the name is typed; another's map is left under People instead. */
    deleteMap: (id, name) => remove((core, read) => core.deleteMap(read, id, name)),
    shelve: editing,
    askPeople: editing,
    setPicture: editing,
    layerOptions: editing,
    testLayer: editing,
    roadSigns: editing,
    /** 204 Add layer's Riki packages for the map, those held in this browser told apart as the phone's on disk. */
    async packages(mapID) {
      const [core, read, held] = await Promise.all([parts.core(), rows(), kept.list()]);
      const said = core.packages(read, mapID, [...new Set(held.map((each) => each.piece))]);
      if ("refused" in said) {
        return refused(said.status === 404 ? say("noSuchMap") : (said.said ?? said.refused), said.status ?? 400);
      }
      return { ok: true, value: said };
    },
    servers: editing,
    otherLayers: adding,
    addCopies: adding,
    readAddress,
    addTiles,
    addServiceLayers,
    addServer: adding,
    findServers: adding,
    editServer: adding,
    duplicateServer: adding,
    deleteServer: adding,
    addServerLayer: adding,
    removeServerLayer: adding,
    saveServerForm: adding,
    serverLayer: adding,
    serverPreview: adding,
    serverPreviewTile: adding,
    importServers: adding,
    exportServers: adding,
    addServerLayers: adding,
    readAPI: adding,
    addAPI: adding,
    addFile: adding,
    readDXF: adding,
    esriServices: adding,
    changeEsriService: adding,
    coverage: adding,
    coveragePlaces: adding,
    publishOffer: adding,
    publishSend: adding,
    publishAnswer: adding,
    publishCancel: adding,
    saved: adding,
    savedFeature: adding,
    startPlaces: adding,
    downloadRegion: adding,
    offlinePlan: adding,
    offlineDownload: adding,
    discardStored: adding,
    live: adding,
    identify: adding,
    details: adding,
    phoneLocation: adding,
    search: async () => null,
    iconURL: () => "",
    regions: async () => ({}),
    icon: async () => null,
    symbolURL: siteSymbolURL,
  };
}

const languages = () => (navigator.languages?.length ? navigator.languages : [navigator.language]);

const keeping = indexedKeeping();
const progress = new Progress();

export const backend: Backend = createBackend({
  cloud: new Cloud(),
  config: readConfig,
  core: () => loadCore(fetch, BASE, (done, total) => progress.engine(done, total)),
  keeping,
  reach: createReach(keeping),
  author: storedAuthor(),
  fetcher: (...asked) => fetch(...asked),
  base: BASE,
  languages,
  progress,
});
