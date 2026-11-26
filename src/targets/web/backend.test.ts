import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import account from "../../../e2e/fixtures/cloud-account.json";
import type { Device, MapSwitches, Packages, Portable } from "@/lib/types";
import {
  Cloud,
  type CKBatchResult,
  type CKError,
  type CKContainer,
  type CKRecord,
  type CKSave,
  type CKZoneChanges,
  type ZoneID,
  type CloudKitJS,
} from "./cloud";
import { CoreNotReady, NotOnSite, type Feature } from "@/backend/types";
import {
  CoreMissing,
  type AddAsk,
  type Added,
  type AddressRead,
  type Applied,
  type Core,
  type HistoryEntry,
  type Imported,
  type Made,
  type Shelved,
  type Deleted,
  type MapsonFile,
  type PeopleRead,
  type ReadAsk,
} from "./core";
import { queryOf } from "@/lib/edit";
import { createBackend } from "./backend";
import { requestHeaders, setRequestHeaders } from "@/lib/request-headers";
import type { Reach } from "./reach";
import type { Keeping } from "./zones";
import { fakeOpfs } from "./regions/fake-opfs";
import { opfsStore, type PackageStore } from "./regions/store";

// 76 WebBackend reads against recorded CloudKit answers and a fake core
const assets = account.assets as Record<string, string>;
const SHARE_ZONE = account.zones.private[1]!.zoneID.zoneName;

interface Options {
  signedIn?: boolean;
  /** 134 Apple refuses the site's API token. */
  refused?: boolean;
  core?: () => Promise<Core>;
  apply?: (ask: Parameters<Core["apply"]>[0]) => Applied;
  changes?: () => HistoryEntry[];
  /** 112 The region catalog the site's config names, and where packages are kept. */
  catalog?: string;
  regions?: PackageStore;
  /** 108 What the core reads of a share. */
  people?: () => PeopleRead | { refused: string; status?: number };
  switches?: () => MapSwitches | { refused: string; status?: number };
  /** 176 What the core writes as the map's file. */
  exported?: () => MapsonFile | { refused: string; status?: number };
  /** 198 What the core makes as a map's copy. */
  duplicated?: () => Made | { refused: string; status?: number; said?: string };
  /** 204 What the core lists as Add layer's Riki packages. */
  listed?: () => Packages | { refused: string; status?: number; said?: string };
  /** 201 What the core makes of an arrangement of the Maps list. */
  shelved?: () => Shelved | { refused: string; status?: number; said?: string };
  /** 200 What the core says a deleted map takes. */
  deleted?: () => Deleted | { refused: string; status?: number; said?: string };
  /** 199 What the core makes as a new map, and of a file. */
  made?: () => Made | { refused: string; status?: number; said?: string };
  imported?: () => Imported | { refused: string; status?: number; said?: string };
  /** 85 Which hosts answer a browser; every one does by default. */
  reach?: Reach;
  /** 86 What the core reads an address as, by round; the recorded answer by default. */
  reads?: (ask: ReadAsk) => AddressRead;
  adds?: (ask: AddAsk) => Added;
  /** 86 What the browser's fetch answers for an address the core asked for. */
  fetching?: (address: string) => Response;
  /** The style the core builds. */
  built?: unknown;
  /** 91 The browser's languages, most wanted first. */
  languages?: string[];
  /** The name typed in the account part, if any. */
  typed?: string;
  /** CloudKit gives no name. */
  nameless?: boolean;
  /** Answers the saves; the default applies them to the account, as the server would. */
  saving?: (records: CKSave[]) => CKBatchResult | undefined;
}

function stack(options: Options = {}) {
  let notify: (n: unknown) => void = () => {};
  let signIn: (identity: unknown) => void = () => {};
  const held = structuredClone(account.zones) as unknown as {
    private: { zoneID: { zoneName: string }; records: CKRecord[]; deleted?: string[] }[];
    shared: { zoneID: { zoneName: string }; records: CKRecord[]; deleted?: string[] }[];
  };
  // 87 a zone's options, as the library takes them: it builds the `zones` of the request itself
  const changes = vi.fn(async (options: CKZoneChanges | CKZoneChanges[]) => {
    const [zone] = [options].flat();
    const found = [...held.private, ...held.shared].find((each) => each.zoneID.zoneName === zone!.zoneID.zoneName);
    const deleted = (found?.deleted ?? []).map((recordName) => ({ recordName, deleted: true }));
    return { zones: [{ zoneID: zone!.zoneID, syncToken: "t", records: [...(found?.records ?? []), ...deleted] }] };
  });
  const all = () => [...held.private, ...held.shared].flatMap((zone) => zone.records);
  let version = 0;
  /** The batch's commit: what it creates and updates, where, and what it deletes with the tags read. */
  const saves = vi.fn<
    (
      records: CKSave[],
      where: unknown,
      removals: { recordName: string; recordChangeTag?: string }[],
    ) => Promise<CKBatchResult>
  >(async (records, _where, removals = []) => {
    const refused = options.saving?.(records);
    if (refused) return refused;
    const stale = records.find(
      (record) =>
        record.recordChangeTag &&
        record.recordChangeTag !== all().find((found) => found.recordName === record.recordName)?.recordChangeTag,
    );
    if (stale)
      return {
        records: [],
        hasErrors: true,
        errors: [{ recordName: stale.recordName, ckErrorCode: "CONFLICT", serverErrorCode: "CONFLICT" }],
      };
    // 200 a deleted record is gone from its zone, as the server drops it
    for (const zone of [...held.private, ...held.shared]) {
      const gone = zone.records.filter((found) => removals.some((each) => each.recordName === found.recordName));
      zone.records = zone.records.filter((found) => !gone.includes(found));
      zone.deleted = [...(zone.deleted ?? []), ...gone.map((found) => found.recordName)];
    }
    return {
      records: records.map((record) => {
        let each = all().find((found) => found.recordName === record.recordName);
        if (!each) {
          each = { recordName: record.recordName, recordType: record.recordType, fields: {} };
          held.private[0]!.records.push(each);
        }
        for (const [name, field] of Object.entries(record.fields)) {
          if (field.value === null) delete each.fields![name];
          else each.fields![name] = field;
        }
        version += 1;
        each.recordChangeTag = `w${version}`;
        return { recordName: each.recordName, recordChangeTag: each.recordChangeTag };
      }),
    };
  });
  const batchOf = (commit: (...asked: Parameters<typeof saves>) => Promise<CKBatchResult>) => (where: unknown) => {
    const records: CKSave[] = [];
    const removals: { recordName: string; recordChangeTag?: string }[] = [];
    const batch = {
      create: (record: CKSave) => {
        records.push(record);
        return batch;
      },
      update: (record: CKSave) => {
        records.push(record);
        return batch;
      },
      delete: (record: { recordName: string; recordChangeTag?: string }) => {
        removals.push(record);
        return batch;
      },
      commit: () => commit(records, where, removals),
    };
    return batch;
  };
  const identities = {
    ...account.identities,
    rita: { userRecordName: "rita", nameComponents: { givenName: "Rita" } },
  } as Record<string, unknown>;
  const database = {
    fetchRecordZoneChanges: changes,
    newRecordsBatch: batchOf(saves),
    saveSubscriptions: vi.fn(async () => ({})),
    fetchDatabaseChanges: vi.fn(async () => ({ zones: [] })),
  };
  const shared = vi.fn<(...asked: Parameters<typeof saves>) => Promise<CKBatchResult>>(async () => ({
    records: [{ recordName: "shared-doprava", recordChangeTag: "s2" }],
  }));
  /** 200 Zones deleted whole: each is gone from the listing, and its records with it. */
  const zonesDeleted = vi.fn(
    async (
      ids: ZoneID | ZoneID[],
    ): Promise<{ zones?: { zoneID: ZoneID }[]; errors?: CKError[]; hasErrors?: boolean }> => {
      const asked = [ids].flat();
      held.private = held.private.filter((zone) => !asked.some((each) => each.zoneName === zone.zoneID.zoneName));
      return { zones: asked.map((zoneID) => ({ zoneID })) };
    },
  );
  const container = {
    setUpAuth: async () => {
      if (options.refused) throw { ckErrorCode: "AUTHENTICATION_FAILED", reason: "check the API Token" };
      return options.signedIn === false ? false : account.person;
    },
    discoverUserIdentityWithUserRecordName: async (name: string) => ({
      users: options.nameless ? [] : [identities[name]],
    }),
    whenUserSignsIn: () =>
      new Promise((resolve) => {
        signIn = resolve;
      }),
    whenUserSignsOut: () => new Promise(() => {}),
    registerForNotifications: async () => {},
    addNotificationListener: (listener: (n: unknown) => void) => {
      notify = listener;
    },
    privateCloudDatabase: {
      ...database,
      deleteRecordZones: zonesDeleted,
      fetchAllRecordZones: async () => ({ zones: held.private.map((each) => ({ zoneID: each.zoneID })) }),
    },
    sharedCloudDatabase: {
      ...database,
      newRecordsBatch: batchOf(shared),
      fetchAllRecordZones: async () => ({ zones: account.zones.shared.map((each) => ({ zoneID: each.zoneID })) }),
    },
  } as unknown as CKContainer;
  const cloudkit: CloudKitJS = { configure: () => {}, getDefaultContainer: () => container };
  const config = {
    container: "iCloud.x",
    apiToken: "T",
    environment: "development" as const,
    regionsCatalog: options.catalog ?? "",
  };
  const cloud = new Cloud(
    async () => cloudkit,
    async () => config,
  );
  const seen: unknown[][] = [];
  const core: Core = {
    maps: (rows) => {
      seen.push(rows);
      return account.core.riki_maps as unknown as Device;
    },
    map: (rows, id) => {
      seen.push([id, rows.length]);
      return account.core.riki_map as unknown as Portable;
    },
    style: (rows, mapID, styleID, catalog) => {
      seen.push([mapID, styleID, catalog]);
      return options.built ?? account.core.riki_style;
    },
    apply: vi.fn((ask) => options.apply?.(ask) ?? (account.core.riki_apply as unknown as Applied)),
    readAddress: (ask) => options.reads?.(ask) ?? (account.core.riki_read_address as unknown as AddressRead),
    addLayer: vi.fn((ask) => options.adds?.(ask) ?? (account.core.riki_add_layer as unknown as Added)),
    addTiles: vi.fn(() => account.core.riki_add_layer as unknown as Applied),
    changes: () => options.changes?.() ?? [],
    people: vi.fn(() => options.people?.() ?? (account.core.riki_people as unknown as PeopleRead)),
    switches: vi.fn(() => options.switches?.() ?? (account.core.riki_switches as unknown as MapSwitches)),
    exportMap: vi.fn(() => options.exported?.() ?? (account.core.riki_export as unknown as MapsonFile)),
    duplicate: vi.fn(() => options.duplicated?.() ?? (account.core.riki_duplicate as unknown as Made)),
    packages: vi.fn(() => options.listed?.() ?? (account.core.riki_packages as unknown as Packages)),
    shelve: vi.fn(() => options.shelved?.() ?? (account.core.riki_shelve as unknown as Shelved)),
    deleteMap: vi.fn(() => options.deleted?.() ?? (account.core.riki_delete as unknown as Deleted)),
    newMap: vi.fn(() => options.made?.() ?? (account.core.riki_new_map as unknown as Made)),
    importMap: vi.fn(() => options.imported?.() ?? (account.core.riki_import as unknown as Imported)),
  };
  const kept = new Map<string, unknown>();
  const keeping: Keeping = {
    load: async <T>(key: string) => kept.get(key) as T | undefined,
    save: async (k, v) => {
      kept.set(k, v);
    },
  };
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    const address = String(url);
    if (address in assets) return new Response(assets[address]);
    if (options.fetching && address.startsWith("https://")) return options.fetching(address);
    if (address === "/editor/words/languages.json") return Response.json(["cs", "en", "sk"]);
    if (address === "/editor/words/sk.json")
      return Response.json({
        language: "sk",
        words: {
          maps: "Mapy",
          layers: "Vrstvy",
          noSuchMap: "Taká mapa nie je",
          nothingToUndo: "Nie je čo vrátiť",
          signsInApple: "Stránka sa prihlasuje cez Apple ID",
          changeRefused: "Mapa sa zmenila inde.",
        },
      });
    if (address === "/editor/words/en.json") return Response.json({ language: "en", words: { maps: "Maps" } });
    return new Response("", { status: 404 });
  });
  const backend = createBackend({
    cloud,
    config: async () => config,
    core: options.core ?? (async () => core),
    keeping,
    reach: options.reach ?? { answers: async () => true },
    author: { read: () => options.typed ?? "", keep: () => {} },
    fetcher: fetcher as typeof fetch,
    base: "/editor",
    languages: () => options.languages ?? ["sk"],
    ...(options.regions ? { regions: options.regions } : {}),
    painter: {
      open: async (picture: Blob) =>
        (await picture.text()) === "no picture" ? null : { width: 400, height: 300, source: picture },
      paint: async (_source: unknown, cut: { width: number }, type: string) =>
        new Blob([`${type} ${cut.width}`], { type }),
    },
  });
  /** Another device wrote this record: a new tag and the fields it set. */
  const elsewhere = (recordName: string, fields: Record<string, { value: unknown; type: string }>) => {
    const each = all().find((found) => found.recordName === recordName)!;
    Object.assign(each.fields!, fields);
    each.recordChangeTag = `${each.recordChangeTag}x`;
  };
  return {
    backend,
    cloud,
    seen,
    notify: () => notify({}),
    signIn: (identity: unknown) => signIn(identity),
    changes,
    core,
    saves,
    shared,
    elsewhere,
    held,
    zonesDeleted,
  };
}

describe("WebBackend's reads", () => {
  it("says signed out, with the sign-in's standing, until an Apple Account is in", async () => {
    const { backend, signIn } = stack({ signedIn: false });
    expect(await backend.session()).toEqual({ ok: true, value: { standing: "signedOut" } });
    signIn({ userRecordName: "rita" });
    await new Promise((resolve) => setTimeout(resolve));
    expect(await backend.session()).toEqual({
      ok: true,
      value: { standing: "admitted", edits: true, token: "icloud", device: "Rita", viewers: null },
    });
  });

  // 185 bug #167: a sign-in window that never answered left the card waiting, saying nothing
  it("says a sign-in window went unanswered while no one is signed in", async () => {
    const { backend, cloud } = stack({ signedIn: false });
    await backend.session();
    vi.spyOn(cloud, "signInUnanswered").mockReturnValue(true);
    expect(await backend.session()).toEqual({ ok: true, value: { standing: "signedOut", signInUnanswered: true } });
  });

  // 134 bug: a refused token was a lost connection, so no one was told why they could not sign in
  it("says Apple refused the site when it refuses its token, and is not offline", async () => {
    const { backend } = stack({ refused: true });
    expect(await backend.session()).toEqual({ ok: true, value: { standing: "refused" } });
  });

  // 78 signing in is the permission to edit; the core refuses what a role forbids
  it("lets the person in by name, as an editor", async () => {
    const answer = await stack().backend.session();
    expect(answer).toEqual({
      ok: true,
      value: { standing: "admitted", edits: true, token: "icloud", device: "Riki Tester", viewers: null },
    });
  });

  it("has no edit password to trade", async () => {
    expect(await stack().backend.unlock("x")).toMatchObject({ ok: false, status: 404 });
  });

  it("reads its words from the site's own words files, in the language the browser asks for", async () => {
    const said = (await stack().backend.words()) as { language: string; words: Record<string, string> };
    expect(said.language).toBe("sk");
    expect(said.words.maps).toBe("Mapy");
    const other = (await stack({ languages: ["fr-CA", "en-GB", "en"] }).backend.words()) as { language: string };
    expect(other.language).toBe("en");
  });

  // 91 what only the phone made up, the language names and counts, is made in the browser
  it("makes the language list, their names and the layer counts, as the phone does for itself", async () => {
    const { words } = (await stack().backend.words()) as { words: Record<string, string> };
    expect((words.languages ?? "").split(",").sort()).toEqual(["cs", "en", "sk"]);
    expect(words["language.cs"]).toMatch(/^[ČC]e[šs]tina|^Česk/);
    expect(words["layers.1"]).toBe("1 vrstvy");
    expect(words["layers.99"]).toBe("99 vrstvy");
  });

  it("says what the site itself refuses with in the language it speaks", async () => {
    const { backend } = stack();
    await backend.words();
    expect(await backend.map("nope").catch((e) => e)).toBeDefined();
    expect(await backend.undo!("M")).toMatchObject({ ok: false, status: 404, said: "Nie je čo vrátiť" });
    expect(await backend.unlock("x")).toMatchObject({ said: "Stránka sa prihlasuje cez Apple ID" });
  });

  it("says them in English before its words are read, and for a map it has not got", async () => {
    const { backend } = stack();
    expect(await backend.undo!("M")).toMatchObject({ said: "Nothing to undo" });
    expect(await backend.change("no-such", null, { kind: "name", name: "x" })).toMatchObject({
      status: 404,
      said: "No such map",
    });
    await backend.words();
    expect(await backend.change("no-such", null, { kind: "name", name: "x" })).toMatchObject({
      status: 404,
      said: "Taká mapa nie je",
    });
  });

  it("answers the maps list from the core, named after the person when the core names none", async () => {
    const { backend, seen } = stack();
    const device = await backend.maps();
    expect(device.name).toBe("Riki Tester");
    expect(device.maps.map((each) => each.name)).toEqual(["High Tatras", "Doprava"]);
    const rows = seen[0] as { entity: string; fields: Record<string, unknown> }[];
    // 108 a shared map's share and member rows are among them, for the core to read who holds it
    expect(rows.map((row) => row.entity).sort()).toEqual([
      "Share",
      "Share",
      "SharedMap",
      "SharedMap",
      "SharedMap",
      "SharedMapChange",
      "SharedMapLayer",
      "SharedMapLayer",
      "SharedMapMember",
      "SharedMapMember",
      "SharedMapMember",
      "SharedMapMember",
    ]);
    expect(rows.find((row) => row.fields.name === "High Tatras")?.fields.payload).toBe('{"symbol":"mountain.2"}');
  });

  // 76 the first sign-in check must not read as a change, or every map is fetched twice
  it("answers a map and its style from the rows already read, with the pipeline's host", async () => {
    const { backend, seen, changes } = stack();
    await backend.maps();
    const reads = changes.mock.calls.length;
    expect((await backend.map("6F1E2A10-0000-4000-8000-000000000001")).name).toBe("High Tatras");
    const style = await backend.style({ mapID: "M", styleID: "B1", hidden: ["L2"], theme: "dark", tiles: "3x2" });
    expect(style).toEqual({ ok: true, value: account.core.riki_style });
    // 110 the glyphs and the sprite are the site's own, under its path; 112 nothing is held; 147 no tiles host
    expect(seen.at(-1)).toEqual([
      "M",
      "B1",
      {
        glyphsBase: `${location.origin}/editor/glyphs`,
        spriteBase: `${location.origin}/editor/sprites/temaki-sprite`,
        stored: [],
        theme: "dark",
        hidden: ["L2"],
        tiles: "3x2",
      },
    ]);
    expect(changes.mock.calls.length).toBe(reads);
  });

  // 85 a layer on a host that refuses browsers is not drawn on the site, and its layer is named
  it("leaves a layer on a host that refuses browsers out of its style and names it", async () => {
    const built = {
      version: 8,
      sources: {
        "riki-custom-l1": { type: "raster", tiles: ["https://closed.example/{z}/{x}/{y}.png"] },
        // 147 Riki's data is a stored region package, never a tiles host, and is never asked
        "riki-base": { type: "vector", url: "pmtiles://riki-store/tatry/base/a.pmtiles" },
      },
      layers: [{ id: "l1", type: "raster", source: "riki-custom-l1" }],
    };
    const asked = vi.fn(async (address: string) => !address.startsWith("https://closed.example"));
    const { backend } = stack({ built, reach: { answers: asked } });
    const style = await backend.style({ mapID: "M", styleID: null, hidden: [], theme: "light", tiles: "1" });
    expect(style).toMatchObject({
      ok: true,
      value: { sources: { "riki-base": {} }, layers: [], metadata: { "riki:undrawn": ["l1"] } },
    });
    expect(asked).toHaveBeenCalledTimes(1);
    expect(asked).toHaveBeenCalledWith("https://closed.example/{z}/{x}/{y}.png");
  });

  it("reads again after CloudKit says a map changed, and tells the page", async () => {
    const { backend, notify, changes } = stack();
    const told = vi.fn();
    backend.onChanged(told);
    await backend.session();
    await backend.map("M");
    const before = changes.mock.calls.length;
    notify();
    // 78 the page is told once the rows are read again, with what changed elsewhere
    await vi.waitFor(() => expect(told).toHaveBeenCalledWith([]));
    await backend.map("M");
    expect(changes.mock.calls.length).toBeGreaterThan(before);
  });

  it("rejects, naming the file, while riki-core.wasm is not in the site", async () => {
    const { backend } = stack({ core: () => Promise.reject(new CoreMissing("/editor/riki-core.wasm")) });
    await expect(backend.maps()).rejects.toThrow("riki-core.wasm is not at /editor/riki-core.wasm");
  });

  // 78 only editing a map is built; the later steps' writes still reject
  it("keeps rejecting the writes of later steps", async () => {
    const { backend } = stack();
    // 199 New map is the site's since riki_new_map, 200 Delete since riki_delete; Test layer still waits
    await expect(backend.testLayer("M", "L")).rejects.toThrow("step 4");
    await expect(backend.addFile("M", new File([], "a.gpx"))).rejects.toThrow("step 5");
  });

  // 129 the site has no phone to search, so the page keeps the names it has loaded
  it("answers no places search, as a phone from before 3492 does", async () => {
    const { backend } = stack();
    expect(await backend.search("M", "pop", null)).toBeNull();
  });
});

describe("WebBackend's edits", () => {
  const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";
  const DOPRAVA = "6F1E2A10-0000-4000-8000-000000000002";
  const rename = { kind: "layerName", layer: "L1", name: "Ridges" } as const;

  // 78 the core decides, the site writes the changed rows with their tags and one history row
  it("asks the core, then saves its rows and the history row in one atomic call to the map's zone", async () => {
    const { backend, core, saves } = stack();
    const answer = await backend.change(TATRAS, "B1", rename);
    expect(answer).toEqual({ ok: true, value: account.core.riki_map });
    const ask = vi.mocked(core.apply).mock.calls[0]![0];
    // 165 the edit goes to the core as the query the phone's /edit reads
    expect(ask).toEqual({
      rows: expect.any(Array),
      id: TATRAS,
      styleID: "B1",
      edit: queryOf(rename),
      author: "Riki Tester",
    });
    expect(ask.rows.map((row) => row.entity).sort()).toEqual([
      "Share",
      "Share",
      "SharedMap",
      "SharedMap",
      "SharedMap",
      "SharedMapChange",
      "SharedMapLayer",
      "SharedMapLayer",
      "SharedMapMember",
      "SharedMapMember",
      "SharedMapMember",
      "SharedMapMember",
    ]);
    expect(saves).toHaveBeenCalledTimes(1);
    const [records, where] = saves.mock.calls[0]!;
    expect(where).toEqual({ zoneID: { zoneName: "com.apple.coredata.cloudkit.zone" }, atomic: true });
    expect(records).toEqual([
      {
        recordName: "own-tatras-layer",
        recordType: "CD_SharedMapLayer",
        recordChangeTag: "a2",
        fields: { CD_layerJSON: { value: '{"id":"L1","name":"Ridges"}', type: "STRING" } },
      },
      {
        recordName: "change-web-1",
        recordType: "CD_SharedMapChange",
        fields: {
          CD_map: { value: "own-tatras", type: "STRING" },
          CD_payload: { value: expect.any(String), type: "BYTES" },
          CD_id: { value: expect.any(String), type: "STRING" },
          CD_updatedAt: { value: expect.any(Number), type: "TIMESTAMP" },
          CD_schemaVersion: { value: 1, type: "INT64" },
          CD_entityName: { value: "SharedMapChange", type: "STRING" },
        },
      },
    ]);
  });

  // 84 bug: the history row's payload went as a STRING and had no id, time or schema version
  it("writes the history row as the app's mirror does, its JSON as base64 bytes with an id, a time and a version", async () => {
    const { backend, saves } = stack();
    const before = Date.now();
    await backend.change(TATRAS, "B1", rename);
    const fields = saves.mock.calls[0]![0]![1]!.fields;
    expect(atob(fields.CD_payload!.value as string)).toContain('"origin":"web"');
    expect(fields.CD_id!.value).toMatch(/^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/);
    expect(fields.CD_updatedAt!.value as number).toBeGreaterThanOrEqual(before);
    expect(fields.CD_updatedAt!.value as number).toBeLessThanOrEqual(Date.now());
  });

  // 83 the name typed in the account part goes ahead of the one CloudKit gives, else none
  it("makes a change under the typed name, else CloudKit's, else none", async () => {
    for (const [options, author] of [
      [{ typed: "Friki" }, "Friki"],
      [{}, "Riki Tester"],
      [{ nameless: true }, null],
    ] as const) {
      const { backend, core } = stack(options);
      await backend.change(TATRAS, null, rename);
      expect(vi.mocked(core.apply).mock.calls[0]![0].author).toBe(author);
    }
  });

  it("sends a shared map's edit to the shared database, in the share's zone", async () => {
    const { backend, shared } = stack({
      apply: () => ({
        map: account.core.riki_map as never,
        write: [{ entity: "SharedMap", id: "shared-doprava", fields: { name: "Roads" } }],
      }),
    });
    expect((await backend.change(DOPRAVA, null, { kind: "name", name: "Roads" })).ok).toBe(true);
    expect(shared).toHaveBeenCalledWith(
      [
        {
          recordName: "shared-doprava",
          recordType: "CD_SharedMap",
          recordChangeTag: "s1",
          fields: { CD_name: { value: "Roads", type: "STRING" } },
        },
      ],
      { zoneID: { zoneName: "share-doprava", ownerRecordName: "_friki" }, atomic: true },
      [],
    );
  });

  // 116 bug: the site never read a map the person shares, so none of its rows could be written to its zone
  it("sends an owner-shared map's edit to the private database, in the zone made for the share", async () => {
    const BESKYDY = "6F1E2A10-0000-4000-8000-000000000003";
    const { backend, saves, shared } = stack({
      apply: () => ({
        map: account.core.riki_map as never,
        write: [{ entity: "SharedMap", id: "own-beskydy", fields: { name: "Beskydy 2" } }],
      }),
    });
    expect((await backend.change(BESKYDY, null, { kind: "name", name: "Beskydy 2" })).ok).toBe(true);
    expect(shared).not.toHaveBeenCalled();
    expect(saves.mock.calls[0]![1]).toEqual({ zoneID: { zoneName: SHARE_ZONE }, atomic: true });
    expect(saves.mock.calls[0]![0]).toMatchObject([{ recordName: "own-beskydy", recordChangeTag: "o1" }]);
  });

  it("returns the core's refusal words and writes nothing", async () => {
    const { backend, saves } = stack({ apply: () => ({ refused: "Only the owner may do this", status: 403 }) });
    expect(await backend.change(TATRAS, null, rename)).toEqual({
      ok: false,
      status: 403,
      said: "Only the owner may do this",
    });
    expect(saves).not.toHaveBeenCalled();
  });

  it("says no such map when the rows hold none", async () => {
    expect(await stack().backend.change("nope", null, rename)).toMatchObject({ ok: false, status: 404 });
  });

  it("writes a field that was an asset in the field itself and clears the asset", async () => {
    const { backend, saves } = stack({
      apply: () => ({
        map: account.core.riki_map as never,
        write: [{ entity: "SharedMap", id: "own-tatras", fields: { payload: "{}" } }],
      }),
    });
    await backend.change(TATRAS, null, rename);
    // 84 the JSON of a BYTES field goes as base64
    expect(saves.mock.calls[0]![0]![0]!.fields).toEqual({
      CD_payload: { value: "e30=", type: "BYTES" },
      CD_payload_ckAsset: { value: null },
    });
  });

  // 78 a row changed meanwhile: read again, apply again with the new tag
  it("reads the rows again and applies the edit again after a conflict", async () => {
    const { backend, core, saves, elsewhere, changes } = stack();
    await backend.maps();
    const reads = changes.mock.calls.length;
    elsewhere("own-tatras-layer", { CD_note: { value: "n", type: "STRING" } });
    expect((await backend.change(TATRAS, null, rename)).ok).toBe(true);
    expect(core.apply).toHaveBeenCalledTimes(2);
    expect(changes.mock.calls.length).toBeGreaterThan(reads);
    expect(saves.mock.calls.map((call) => call[0][0]!.recordChangeTag)).toEqual(["a2", "a2x"]);
  });

  it("treats a thrown conflict as one too", async () => {
    let first = true;
    const { backend, saves } = stack();
    saves.mockImplementationOnce(async () => {
      first = false;
      throw Object.assign(new Error("x"), { ckErrorCode: "CONFLICT" });
    });
    expect((await backend.change(TATRAS, null, rename)).ok).toBe(true);
    expect(first).toBe(false);
    expect(saves).toHaveBeenCalledTimes(2);
  });

  it("refuses after three conflicts, in words that say the map changed elsewhere", async () => {
    const { backend, core, saves } = stack({
      saving: (records) => ({
        records: [],
        hasErrors: true,
        errors: [
          { recordName: records[0]!.recordName, ckErrorCode: "CONFLICT", serverErrorCode: "CONFLICT" },
          { recordName: records[1]!.recordName, ckErrorCode: "ATOMIC_ERROR", serverErrorCode: "ATOMIC_ERROR" },
        ],
      }),
    });
    const answer = await backend.change(TATRAS, null, rename);
    expect(answer).toEqual({
      ok: false,
      status: 412,
      said: "The map changed elsewhere. Open it again and repeat the change.",
    });
    expect(core.apply).toHaveBeenCalledTimes(3);
    expect(saves).toHaveBeenCalledTimes(3);
  });

  it("does not hide any other error of the server", async () => {
    const { backend } = stack({
      saving: () => ({
        records: [],
        hasErrors: true,
        errors: [
          {
            recordName: "r",
            ckErrorCode: "QUOTA_EXCEEDED",
            serverErrorCode: "QUOTA_EXCEEDED",
            reason: "iCloud is full",
          },
        ],
      }),
    });
    await expect(backend.change(TATRAS, null, rename)).rejects.toThrow("iCloud is full");
  });

  // 78 undo is a write of the rows as they were, through the same path
  it("undoes a change by writing the rows as they were before, with the tags the change left", async () => {
    const { backend, saves } = stack();
    await backend.change(TATRAS, null, rename);
    const undone = await backend.undo!(TATRAS);
    expect(undone.ok).toBe(true);
    expect(saves).toHaveBeenCalledTimes(2);
    expect(saves.mock.calls[1]![0]).toEqual([
      {
        recordName: "own-tatras-layer",
        recordType: "CD_SharedMapLayer",
        recordChangeTag: "w1",
        fields: { CD_layerJSON: { value: '{"id":"L1","name":"Trails"}', type: "STRING" } },
      },
    ]);
  });

  it("deletes what the change created and restores what it removed, when it is undone", async () => {
    const { backend, saves, held } = stack({
      apply: () => ({
        map: account.core.riki_map as never,
        write: [{ entity: "SharedMapStyle", id: "new-style", fields: { styleJSON: "{}" } }],
        remove: ["own-tatras-layer"],
      }),
    });
    expect((await backend.change(TATRAS, null, { kind: "addStyle", name: "Winter" })).ok).toBe(true);
    held.private[0]!.records = held.private[0]!.records.filter((row) => row.recordName !== "own-tatras-layer");
    expect((await backend.undo!(TATRAS)).ok).toBe(true);
    const restored = saves.mock.calls.at(-1)![0]!;
    expect(restored.map((record) => record.recordName)).toEqual(["own-tatras-layer"]);
    expect(restored[0]!.recordChangeTag).toBeUndefined();
    expect(restored[0]!.fields.CD_layerJSON).toEqual({ value: '{"id":"L1","name":"Trails"}', type: "STRING" });
  });

  it("refuses to undo what someone else changed since, and has nothing to undo before a change", async () => {
    const { backend, saves, elsewhere } = stack();
    expect(await backend.undo!(TATRAS)).toMatchObject({ ok: false, status: 404 });
    await backend.change(TATRAS, null, rename);
    elsewhere("own-tatras-layer", { CD_layerJSON: { value: "{}", type: "STRING" } });
    expect(await backend.undo!(TATRAS)).toMatchObject({ ok: false, status: 412 });
    // the try on the cached rows was refused, and the rows read again hold Peaks
    expect(saves).toHaveBeenCalledTimes(2);
    await expect(saves.mock.results[1]!.value).resolves.toMatchObject({ errors: [{ ckErrorCode: "CONFLICT" }] });
  });
});

const TATRAS_ID = "6F1E2A10-0000-4000-8000-000000000001";

describe("WebBackend's notice of a change elsewhere", () => {
  const told = async (made: ReturnType<typeof stack>) => {
    const listener = vi.fn();
    made.backend.onChanged(listener);
    await made.backend.maps();
    return listener;
  };

  // 78 CloudKit says a map changed: the page is told which, and by whom the history says
  it("names the map and the author of the newest history row it had not seen", async () => {
    const made = stack({
      changes: () => [{ id: "c9", map: "own-tatras", author: "Friki", origin: "web", lines: ["Roads renamed"] }],
    });
    const listener = await told(made);
    made.elsewhere("own-tatras", { CD_name: { value: "High Tatras 2", type: "STRING" } });
    made.notify();
    await vi.waitFor(() =>
      expect(listener).toHaveBeenCalledWith([{ mapID: TATRAS_ID, name: "High Tatras", author: "Friki" }]),
    );
  });

  it("names no author when no history row says who", async () => {
    const made = stack();
    const listener = await told(made);
    made.elsewhere("own-tatras-layer", { CD_layerJSON: { value: "{}", type: "STRING" } });
    made.notify();
    await vi.waitFor(() =>
      expect(listener).toHaveBeenCalledWith([{ mapID: TATRAS_ID, name: "High Tatras", author: null }]),
    );
  });

  it("tells nothing for a push that changed no map row", async () => {
    const made = stack();
    const listener = await told(made);
    made.notify();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith([]));
  });

  it("does not take the rows this site wrote for a change made elsewhere", async () => {
    const made = stack();
    const listener = await told(made);
    await made.backend.change(TATRAS_ID, null, { kind: "layerName", layer: "L1", name: "Ridges" });
    made.notify();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith([]));
  });
});

describe("WebBackend's region packages", () => {
  const held = async () => {
    const { root } = fakeOpfs();
    const store = opfsStore(async () => root);
    const writer = await store.begin("tatry", "base", 4);
    for (const [name, text] of [
      ["contents.json", '{"package":"base"}'],
      ["base.pmtiles", "P"],
    ] as const) {
      const sink = await writer.open(name);
      await sink.write(new TextEncoder().encode(text));
      await sink.close();
    }
    await writer.commit();
    return store;
  };

  // 112 region packages are offered once the server says it fetches them, and not before
  it("offers region packages only where the config names a catalog", async () => {
    const off = stack();
    await off.backend.session();
    expect(off.backend.offers("regionPackages")).toBe(false);
    const on = stack({ catalog: "https://raw.example/maps.json" });
    expect(on.backend.offers("regionPackages")).toBe(false);
    await on.backend.session();
    expect(on.backend.offers("regionPackages")).toBe(true);
    expect(on.backend.regionPackages).toBeDefined();
  });

  // 165 with each JSON file's text and the region's facts, where the catalog lists the region
  it("tells the core what is held, with each package's manifest text, when it builds a style", async () => {
    const { backend, seen } = stack({ regions: await held() });
    await backend.maps();
    await backend.style({ mapID: "M", styleID: "B1", hidden: [], theme: "light", tiles: "1x1" });
    const catalog = (seen.at(-1) as unknown[])[2] as { stored: unknown[] };
    expect(catalog.stored).toEqual([
      {
        region: "tatry",
        piece: "base",
        version: 4,
        files: ["base.pmtiles", "contents.json"],
        texts: { "contents.json": '{"package":"base"}' },
        country: null,
        range: false,
        bbox: null,
      },
    ]);
  });

  it("reads a held archive for the map by the key its style names it with, and a sprite sheet", async () => {
    const { backend } = stack({ regions: await held() });
    const added: string[] = [];
    await backend.stored!.prepare({ sources: { base: { url: "pmtiles://riki-store/tatry/base/base.pmtiles" } } }, {
      tiles: new Map(),
      add: (p: { source: { getKey(): string } }) => added.push(p.source.getKey()),
    } as never);
    expect(added).toEqual(["riki-store/tatry/base/base.pmtiles"]);
    await expect(backend.stored!.load({ url: "riki-store://tatry/base/contents.json", type: "json" })).resolves.toEqual(
      { data: { package: "base" } },
    );
  });
});

describe("WebBackend's switches", () => {
  const DOPRAVA = "6F1E2A10-0000-4000-8000-000000000002";

  // 175 Edit map and Styles had no switches on the site: the call answered "comes with step 4"
  it("asks the core for the map's switches with every row and answers them as read", async () => {
    const { backend, core } = stack();
    const answer = await backend.switches(DOPRAVA);
    const [rows, id] = vi.mocked(core.switches).mock.calls[0]!;
    expect(id).toBe(DOPRAVA);
    expect(rows.some((row) => row.zone === "share-doprava" && row.entity === "Share")).toBe(true);
    expect(answer).toEqual({ ok: true, value: account.core.riki_switches });
  });

  it("answers a map the rows lack as the phone's 404, and says not ready while the module lacks the call", async () => {
    const none = stack({ switches: () => ({ refused: "noSuchMap", status: 404 }) });
    expect(await none.backend.switches("nope")).toMatchObject({ ok: false, status: 404 });
    const lacking = stack({
      switches: () => {
        throw new CoreNotReady("no riki_switches");
      },
    });
    await expect(lacking.backend.switches(DOPRAVA)).rejects.toBeInstanceOf(CoreNotReady);
  });
});

describe("WebBackend's people", () => {
  const DOPRAVA = "6F1E2A10-0000-4000-8000-000000000002";

  // 108 the share and member rows go to the core as read, and the card is built from its answer, read only
  it("asks the core who holds the map with the rows of its zone, and answers a card that changes nothing", async () => {
    const { backend, core } = stack();
    expect(backend.offers("people")).toBe(true);
    const answer = await backend.people({ kind: "map", id: DOPRAVA });
    const [rows, id] = vi.mocked(core.people).mock.calls[0]!;
    expect(id).toBe(DOPRAVA);
    expect(
      rows
        .filter((row) => row.zone === "share-doprava")
        .map((row) => row.entity)
        .sort(),
    ).toEqual(["Share", "SharedMap", "SharedMapMember", "SharedMapMember"]);
    expect(answer).toMatchObject({
      ok: true,
      value: {
        isShared: true,
        role: "editor",
        linkRole: null,
        readOnly: true,
        mayInvite: false,
        mayChangeLink: false,
        link: null,
      },
    });
    if (!answer.ok) return;
    // 160 the owner first, then by name in the words' language, as the app orders them
    expect(
      answer.value.people.map((each) => [each.name, each.line, each.hasAccepted, each.mayChangeRole, each.mayRemove]),
    ).toEqual([
      ["Friki", "Owner", true, false, false],
      ["marek@example.com", "View only · Invited", false, false, false],
      ["Riki Tester (you)", "Can edit · Joined", true, false, false],
    ]);
  });

  it("answers a map nobody shares, an unknown map and a folder as it can", async () => {
    const alone = stack({ people: () => ({ shared: false, role: "owner", people: [], linkRole: null }) });
    expect(await alone.backend.people({ kind: "map", id: DOPRAVA })).toMatchObject({
      ok: true,
      value: { isShared: false, people: [] },
    });
    expect(await alone.backend.people({ kind: "map", id: "nope" })).toMatchObject({ ok: false, status: 404 });
    await expect(alone.backend.people({ kind: "folder", id: "F" })).rejects.toBeInstanceOf(NotOnSite);
  });

  // 108 until the module has riki_people the site says its rules are not ready, as for any call not in yet
  it("says the core's rules are not ready while the module lacks the call", async () => {
    const lacking = stack({
      people: () => {
        throw new CoreNotReady("no riki_people");
      },
    });
    await expect(lacking.backend.people({ kind: "map", id: DOPRAVA })).rejects.toBeInstanceOf(CoreNotReady);
  });

  it("passes on what the core refuses", async () => {
    const { backend } = stack({ people: () => ({ refused: "No share here", status: 409 }) });
    expect(await backend.people({ kind: "map", id: DOPRAVA })).toEqual({
      ok: false,
      status: 409,
      said: "No share here",
    });
  });

  it("changes nothing of the share: every ask is refused as not on the site", async () => {
    const { backend } = stack();
    await expect(
      backend.askPeople({ kind: "map", id: DOPRAVA }, { kind: "role", person: "_marek", role: "editor" }),
    ).rejects.toBeInstanceOf(NotOnSite);
    await expect(backend.askPeople({ kind: "map", id: DOPRAVA }, { kind: "link", role: null })).rejects.toBeInstanceOf(
      NotOnSite,
    );
  });
});

describe("WebBackend's export", () => {
  const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";

  // 176 Export map answered "not on the site yet"; the core writes the file the phone's Share does
  it("offers Export map and hands the core the rows, saving its text under its name as JSON", async () => {
    const { backend, core } = stack();
    expect(backend.offers("exportMap")).toBe(true);
    const answer = await backend.exportMap(TATRAS);
    const [rows, id] = vi.mocked(core.exportMap).mock.calls[0]!;
    expect(id).toBe(TATRAS);
    expect(rows.some((row) => row.entity === "SharedMap")).toBe(true);
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.value.name).toBe("High Tatras.mapson");
    expect(answer.value.blob.type).toBe("application/json");
    expect(JSON.parse(await answer.value.blob.text())).toMatchObject({ name: "High Tatras", _schemaVersion: 1 });
  });

  it("says no such map in the site's words for a map the rows lack, and passes on any other refusal", async () => {
    const none = stack({ exported: () => ({ refused: "noSuchMap", status: 404 }) });
    await none.backend.words();
    expect(await none.backend.exportMap("nope")).toEqual({ ok: false, status: 404, said: "Taká mapa nie je" });
    const other = stack({ exported: () => ({ refused: "encodeFailed", status: 500 }) });
    expect(await other.backend.exportMap(TATRAS)).toEqual({ ok: false, status: 500, said: "encodeFailed" });
  });

  // 176 a module from before rikimaps 3651 has no riki_export, which the page tells as rules not ready
  it("says the core's rules are not ready while the module lacks the call", async () => {
    const lacking = stack({
      exported: () => {
        throw new CoreNotReady("no riki_export");
      },
    });
    await expect(lacking.backend.exportMap(TATRAS)).rejects.toBeInstanceOf(CoreNotReady);
  });
});

describe("WebBackend's duplicate", () => {
  const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";
  const COPY = account.core.riki_duplicate.map.id;

  // 198 Duplicate map answered "not on the site yet"; the core makes the copy Edit map's Duplicate does
  it("offers Duplicate and creates the core's rows in the zone it names, answering the copy's id", async () => {
    const { backend, core, saves } = stack();
    expect(backend.offers("duplicateMap")).toBe(true);
    expect(await backend.duplicateMap(TATRAS)).toEqual({ ok: true, value: { id: COPY } });
    const [rows, id] = vi.mocked(core.duplicate).mock.calls[0]!;
    expect(id).toBe(TATRAS);
    expect(rows.some((row) => row.entity === "SharedMap")).toBe(true);
    const [records, where] = saves.mock.calls[0]!;
    expect(where).toEqual({ zoneID: { zoneName: "com.apple.coredata.cloudkit.zone" }, atomic: true });
    expect(records.map((record) => [record.recordType, record.recordChangeTag])).toEqual([
      ["CD_SharedMap", undefined],
      ["CD_SharedMapLayer", undefined],
    ]);
    expect(records[0]!.fields.CD_name).toEqual({ value: "High Tatras copy", type: "STRING" });
    expect(records[0]!.fields.CD_entityName).toEqual({ value: "SharedMap", type: "STRING" });
  });

  // 198 the copy's own rows came back from CloudKit as a change made elsewhere
  it("reads the rows again after the copy, and tells no one of the rows it wrote itself", async () => {
    const { backend, changes, notify } = stack();
    const listener = vi.fn();
    backend.onChanged(listener);
    await backend.maps();
    const before = changes.mock.calls.length;
    await backend.duplicateMap(TATRAS);
    await backend.map(COPY);
    expect(changes.mock.calls.length).toBeGreaterThan(before);
    notify();
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(listener.mock.calls[0]![0]).toEqual([]);
  });

  it("says no such map in the site's words for a map the rows lack, and passes on any other refusal", async () => {
    const none = stack({ duplicated: () => ({ refused: "noSuchMap", status: 404 }) });
    await none.backend.words();
    expect(await none.backend.duplicateMap("nope")).toEqual({ ok: false, status: 404, said: "Taká mapa nie je" });
    expect(none.saves).not.toHaveBeenCalled();
    const other = stack({ duplicated: () => ({ refused: "badRows", status: 400 }) });
    expect(await other.backend.duplicateMap(TATRAS)).toEqual({ ok: false, status: 400, said: "badRows" });
  });

  it("says the map changed elsewhere when CloudKit refuses the new rows as already there", async () => {
    const { backend } = stack({
      saving: (records) => ({
        records: [],
        hasErrors: true,
        errors: [{ recordName: records[0]!.recordName, ckErrorCode: "EXISTS", serverErrorCode: "EXISTS" }],
      }),
    });
    await backend.words();
    expect(await backend.duplicateMap(TATRAS)).toEqual({ ok: false, status: 412, said: "Mapa sa zmenila inde." });
  });

  // 198 a module from before rikimaps 3671 has no riki_duplicate, which the page tells as rules not ready
  it("says the core's rules are not ready while the module lacks the call", async () => {
    const lacking = stack({
      duplicated: () => {
        throw new CoreNotReady("no riki_duplicate");
      },
    });
    await expect(lacking.backend.duplicateMap(TATRAS)).rejects.toBeInstanceOf(CoreNotReady);
  });
});

describe("WebBackend's Riki packages", () => {
  const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";
  const held = (pieces: string[]): PackageStore =>
    ({
      list: async () => pieces.map((piece, at) => ({ region: `r${at}`, piece, version: 1, bytes: 1, files: [] })),
    }) as unknown as PackageStore;

  // 204 Add layer's Riki packages answered "not on the site yet"; the core lists them as the phone does
  it("offers the packages and lists them with the pieces this browser holds, each once", async () => {
    const { backend, core } = stack({ regions: held(["roads", "base", "roads"]) });
    expect(backend.offers("addPackages")).toBe(true);
    const listing = await backend.packages(TATRAS);
    expect(listing.ok && listing.value.rows.map((row) => row.overlay)).toEqual(["roads", "water"]);
    expect(vi.mocked(core.packages).mock.calls[0]!.slice(1)).toEqual([TATRAS, ["roads", "base"]]);
  });

  it("says no such map in the site's words for a map the rows lack", async () => {
    const { backend } = stack({ regions: held([]), listed: () => ({ refused: "noSuchMap", status: 404 }) });
    await backend.words();
    expect(await backend.packages("nope")).toEqual({ ok: false, status: 404, said: "Taká mapa nie je" });
  });

  // 204 a module from before rikimaps 3684 has no riki_packages, which the page tells as rules not ready
  it("says the core's rules are not ready while the module lacks the call", async () => {
    const lacking = stack({
      regions: held([]),
      listed: () => {
        throw new CoreNotReady("no riki_packages");
      },
    });
    await expect(lacking.backend.packages(TATRAS)).rejects.toBeInstanceOf(CoreNotReady);
  });
});

describe("WebBackend's pictures", () => {
  const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";
  const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

  // 202 the icon, preview and style pictures answered "not on the site yet"; the core writes what the browser sized
  it("offers pictures and hands the core the icon squared as the phone squares it, as base64", async () => {
    const { backend, core, saves } = stack();
    expect(backend.offers("pictures")).toBe(true);
    expect((await backend.setPicture(TATRAS, "icon", bytes("photo"))).ok).toBe(true);
    const ask = vi.mocked(core.apply).mock.calls[0]![0];
    expect(ask).toMatchObject({ id: TATRAS, styleID: null, picture: { kind: "icon" } });
    expect(atob(ask.picture!.data!)).toBe("image/png 132");
    expect(saves).toHaveBeenCalled();
  });

  it("sends a preview as a JPEG and a style's picture with its style", async () => {
    const { backend, core } = stack();
    await backend.setPicture(TATRAS, "preview", bytes("shot"));
    await backend.setPicture(TATRAS, "styleIcon", bytes("photo"), "B1");
    const [preview, style] = vi.mocked(core.apply).mock.calls.map((call) => call[0].picture!);
    expect(atob(preview!.data!)).toBe("image/jpeg 400");
    expect(style).toMatchObject({ kind: "styleIcon", style: "B1" });
  });

  it("takes a picture away when none is given", async () => {
    const { backend, core } = stack();
    await backend.setPicture(TATRAS, "icon", new ArrayBuffer(0));
    expect(vi.mocked(core.apply).mock.calls[0]![0].picture).toEqual({ kind: "icon" });
  });

  it("refuses a file the browser cannot draw, asking the core nothing", async () => {
    const { backend, core } = stack();
    expect(await backend.setPicture(TATRAS, "icon", bytes("no picture"))).toEqual({
      ok: false,
      status: 409,
      said: "badPicture",
    });
    expect(core.apply).not.toHaveBeenCalled();
  });
});

describe("WebBackend's shelf", () => {
  const SHARE_ZONE = account.zones.private[1]!.zoneID.zoneName;

  // 201 the Maps screen's order, sorting and folders answered "not on the site yet"
  it("offers the shelf and saves what the core arranges, one batch in each map's own zone", async () => {
    const { backend, core, saves } = stack();
    expect(backend.offers("shelf")).toBe(true);
    const answer = await backend.shelve({ kind: "sort", sort: "nameDescending" });
    expect(vi.mocked(core.shelve).mock.calls[0]![1]).toEqual({ sort: "nameDescending" });
    expect(saves.mock.calls.map(([records, where]) => [where, records.map((record) => record.recordName)])).toEqual([
      [{ zoneID: { zoneName: "com.apple.coredata.cloudkit.zone" }, atomic: true }, ["own-tatras"]],
      [{ zoneID: { zoneName: SHARE_ZONE }, atomic: true }, ["own-beskydy"]],
    ]);
    expect(saves.mock.calls.every(([records]) => records.every((record) => record.recordChangeTag))).toBe(true);
    expect(answer.ok && answer.value.maps.map((each) => each.name)).toEqual(
      account.core.riki_shelve.catalog.maps.map((each) => each.name),
    );
  });

  // 201 the list is named for the person when the core names no device, as the Maps screen's read does
  it("names the list for the signed-in person", async () => {
    const { backend } = stack({ shelved: () => ({ write: [], catalog: { name: "", maps: [] } as unknown as Device }) });
    expect(await backend.shelve({ kind: "order", maps: [] })).toMatchObject({
      ok: true,
      value: { name: "Riki Tester" },
    });
  });

  it("asks the core again on freshly read rows when a row changed elsewhere meanwhile", async () => {
    const { backend, core, saves } = stack();
    saves.mockResolvedValueOnce({ hasErrors: true, errors: [{ recordName: "own-tatras", ckErrorCode: "CONFLICT" }] });
    expect((await backend.shelve({ kind: "leave", map: "M" })).ok).toBe(true);
    expect(vi.mocked(core.shelve)).toHaveBeenCalledTimes(2);
  });

  it("passes on the core's refusal and saves nothing", async () => {
    const { backend, saves } = stack({ shelved: () => ({ refused: "sharedFolder", status: 409 }) });
    expect(await backend.shelve({ kind: "folderTint", folder: "F", tint: "#B5D8F2" })).toEqual({
      ok: false,
      status: 409,
      said: "sharedFolder",
    });
    expect(saves).not.toHaveBeenCalled();
  });

  // 201 a module from before rikimaps 3675 has no riki_shelve, which the page tells as rules not ready
  it("says the core's rules are not ready while the module lacks the call", async () => {
    const lacking = stack({
      shelved: () => {
        throw new CoreNotReady("no riki_shelve");
      },
    });
    await expect(lacking.backend.shelve({ kind: "sort", sort: "nameAscending" })).rejects.toBeInstanceOf(CoreNotReady);
  });
});

describe("WebBackend's delete", () => {
  const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";
  const BESKYDY = "6F1E2A10-0000-4000-8000-000000000003";
  const SHARE_ZONE = account.zones.private[1]!.zoneID.zoneName;

  // 200 Delete answered "not on the site yet" though the page offered it where riki_switches said who loses the map
  it("deletes the records the core names, with the tags they were read at, in the map's zone", async () => {
    const { backend, core, saves, zonesDeleted } = stack();
    expect(await backend.deleteMap(TATRAS, "High Tatras")).toEqual({ ok: true, value: null });
    const [, id, typed] = vi.mocked(core.deleteMap).mock.calls[0]!;
    expect([id, typed]).toEqual([TATRAS, "High Tatras"]);
    const [records, where, removals] = saves.mock.calls[0]!;
    expect(records).toEqual([]);
    expect(where).toEqual({ zoneID: { zoneName: "com.apple.coredata.cloudkit.zone" }, atomic: true });
    expect(removals.map((each) => each.recordName)).toEqual(["own-tatras", "own-tatras-layer"]);
    expect(removals.every((each) => each.recordChangeTag)).toBe(true);
    expect(zonesDeleted).not.toHaveBeenCalled();
  });

  // 200 a map shared alone takes its share and its data zone with it, as the app's dropTheShare does
  it("deletes a shared map's private zones whole, a zone already gone being no failure", async () => {
    const dataZone = "riki.data.6F1E2A10-0000-4000-8000-000000000003";
    const { backend, saves, zonesDeleted } = stack({
      deleted: () => ({
        reach: "everyone",
        database: "private",
        zone: SHARE_ZONE,
        remove: [],
        removeZones: [SHARE_ZONE, dataZone],
      }),
    });
    zonesDeleted.mockImplementationOnce(async (ids) => ({
      zones: [{ zoneID: [ids].flat()[0]! }],
      errors: [{ ckErrorCode: "ZONE_NOT_FOUND", zoneID: { zoneName: dataZone } }],
      hasErrors: true,
    }));
    expect(await backend.deleteMap(BESKYDY, "Beskydy")).toEqual({ ok: true, value: null });
    expect(zonesDeleted.mock.calls[0]![0]).toEqual([{ zoneName: SHARE_ZONE }, { zoneName: dataZone }]);
    expect(saves).not.toHaveBeenCalled();
  });

  it("throws what CloudKit says when it refuses to delete a zone for another cause", async () => {
    const { backend, zonesDeleted } = stack({
      deleted: () => ({
        reach: "everyone",
        database: "private",
        zone: SHARE_ZONE,
        remove: [],
        removeZones: [SHARE_ZONE],
      }),
    });
    zonesDeleted.mockResolvedValueOnce({
      errors: [{ ckErrorCode: "NOT_AUTHENTICATED", reason: "sign in" }],
      hasErrors: true,
    });
    await expect(backend.deleteMap(BESKYDY, "Beskydy")).rejects.toThrow("sign in");
  });

  // 200 a deleted map's rows stayed in the kept rows, so the Maps screen listed it again
  it("reads the rows again without the deleted map, and tells no one of it", async () => {
    const { backend, notify, seen } = stack();
    const listener = vi.fn();
    backend.onChanged(listener);
    await backend.maps();
    await backend.deleteMap(TATRAS, "High Tatras");
    await backend.maps();
    const listed = seen.at(-1) as { id: string }[];
    expect(listed.map((row) => row.id)).not.toContain("own-tatras");
    expect(listed.map((row) => row.id)).toContain("own-beskydy");
    notify();
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(listener.mock.calls[0]![0]).toEqual([]);
  });

  it("passes on the core's words for a name typed wrong, and deletes nothing", async () => {
    const { backend, saves } = stack({
      deleted: () => ({ refused: "nameDiffers", status: 409, said: "Type the map's name to delete it" }),
    });
    expect(await backend.deleteMap(TATRAS, "Tatras")).toEqual({
      ok: false,
      status: 409,
      said: "Type the map's name to delete it",
    });
    expect(saves).not.toHaveBeenCalled();
  });

  it("says the map changed elsewhere when a record was changed since it was read", async () => {
    const { backend, saves } = stack();
    saves.mockResolvedValueOnce({ hasErrors: true, errors: [{ recordName: "own-tatras", ckErrorCode: "CONFLICT" }] });
    await backend.words();
    expect(await backend.deleteMap(TATRAS, "High Tatras")).toEqual({
      ok: false,
      status: 412,
      said: "Mapa sa zmenila inde.",
    });
  });

  // 200 a module from before rikimaps 3678 has no riki_delete, which the page tells as rules not ready
  it("says the core's rules are not ready while the module lacks the call", async () => {
    const lacking = stack({
      deleted: () => {
        throw new CoreNotReady("no riki_delete");
      },
    });
    await expect(lacking.backend.deleteMap(TATRAS, "High Tatras")).rejects.toBeInstanceOf(CoreNotReady);
  });
});

describe("WebBackend's new maps", () => {
  // 199 New map answered "not on the site yet"; the core makes the blank map New map does on the phone
  it("offers New map and creates the core's rows for the typed name, opening the map it made", async () => {
    const { backend, core, saves } = stack();
    expect(backend.offers("newMap")).toBe(true);
    expect(await backend.newMap("Lakes")).toEqual({ ok: true, value: { id: account.core.riki_new_map.map.id } });
    expect(vi.mocked(core.newMap).mock.calls[0]![1]).toBe("Lakes");
    const [records, where] = saves.mock.calls[0]!;
    expect(where).toEqual({ zoneID: { zoneName: "com.apple.coredata.cloudkit.zone" }, atomic: true });
    expect(records.map((record) => [record.recordType, record.fields.CD_name?.value])).toEqual([
      ["CD_SharedMap", "Lakes"],
    ]);
  });

  it("passes on the core's refusal of a blank name and writes nothing", async () => {
    const { backend, saves } = stack({ made: () => ({ refused: "blankName", status: 400 }) });
    expect(await backend.newMap(" ")).toEqual({ ok: false, status: 400, said: "blankName" });
    expect(saves).not.toHaveBeenCalled();
  });

  // 199 Import answered "not on the site yet"; the core reads the file as the phone's import does
  it("imports every map of a file in one batch, unsigned ones allowed as on the phone, and opens the first", async () => {
    const { backend, core, saves } = stack();
    const file = new Blob(['{"name":"Pieniny"}'], { type: "application/json" });
    expect(await backend.importMap(file)).toEqual({ ok: true, value: { id: account.core.riki_import.maps[0]!.id } });
    const [, text, unsigned] = vi.mocked(core.importMap).mock.calls[0]!;
    expect([text, unsigned]).toEqual(['{"name":"Pieniny"}', true]);
    expect(saves).toHaveBeenCalledTimes(1);
    expect(saves.mock.calls[0]![0].filter((record) => record.recordType === "CD_SharedMap")).toHaveLength(2);
  });

  // 199 each imported map's rows are the site's own, so CloudKit's push of them is no news
  it("tells no one of the rows an import wrote, whichever map they belong to", async () => {
    const { backend, notify } = stack();
    const listener = vi.fn();
    backend.onChanged(listener);
    await backend.maps();
    await backend.importMap(new Blob(["{}"]));
    notify();
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(listener.mock.calls[0]![0]).toEqual([]);
  });

  it("passes on what the core says of a file that is no map", async () => {
    const { backend, saves } = stack({ imported: () => ({ refused: "notAMap", status: 409 }) });
    expect(await backend.importMap(new Blob(["{}"]))).toEqual({ ok: false, status: 409, said: "notAMap" });
    expect(saves).not.toHaveBeenCalled();
  });

  // 199 a module from before rikimaps 3679 and 3680 lacks the calls, which the page tells as rules not ready
  it("says the core's rules are not ready while the module lacks the calls", async () => {
    const notReady = () => {
      throw new CoreNotReady("no riki_new_map");
    };
    const lacking = stack({ made: notReady, imported: notReady });
    await expect(lacking.backend.newMap("Lakes")).rejects.toBeInstanceOf(CoreNotReady);
    await expect(lacking.backend.importMap(new Blob(["{}"]))).rejects.toBeInstanceOf(CoreNotReady);
  });
});

describe("WebBackend's parts not built yet", () => {
  // 82 the site said "Not connected" for a write it refuses as not done yet
  it("offers none of the parts it does not answer, and refuses their calls as not on the site", async () => {
    const { backend } = stack();
    // 198 Duplicate map is the site's since riki_duplicate, 199 New map since riki_new_map, 201 the shelf since riki_shelve, 202 pictures since riki_apply takes them, 204 the Riki packages since riki_packages
    const parts: Feature[] = ["addFile", "addAPI", "servers", "coverage"];
    expect(parts.filter((part) => backend.offers(part))).toEqual([]);
    // 86 only the tile address and a service's layers are added from the site so far
    expect(backend.offers("addLayer")).toBe(true);
    // 201 the shelf is the site's since riki_shelve; layer options still wait
    await expect(backend.layerOptions("M")).rejects.toBeInstanceOf(NotOnSite);
    await expect(backend.servers()).rejects.toBeInstanceOf(NotOnSite);
    await expect(backend.addAPI("M", "https://t/x", { kind: "x" } as never, "n")).rejects.toBeInstanceOf(NotOnSite);
  });
});

describe("WebBackend's added layers", () => {
  const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";
  const template = "https://cors.example/{z}/{x}/{y}.png";
  const hosts = (refusing: string[] = []): Reach => ({
    answers: vi.fn(async (address: string) => !refusing.some((host) => address.startsWith(host))),
  });

  // 86 the core reads the address and builds the rows; the site only fetches and writes them
  it("reads a tile template as the core says and writes the rows the core adds, with their history row", async () => {
    const { backend, core, saves } = stack({ reach: hosts() });
    expect(await backend.readAddress(template)).toEqual({
      ok: true,
      value: { kind: "direct", probe: "https://cors.example/0/0/0.png" },
    });
    expect(await backend.addTiles(TATRAS, template)).toEqual({ ok: true, value: account.core.riki_map });
    const ask = vi.mocked(core.addTiles).mock.calls[0]![0];
    expect(ask).toMatchObject({
      mapID: TATRAS,
      add: { kind: "tiles", address: template, replies: [] },
      author: "Riki Tester",
      origin: "web",
    });
    const [records, where] = saves.mock.calls[0]!;
    expect(where).toEqual({ zoneID: { zoneName: "com.apple.coredata.cloudkit.zone" }, atomic: true });
    expect((records as { recordName: string; recordChangeTag?: string }[]).map((record) => record.recordName)).toEqual([
      "own-tatras-layer-2",
      "change-web-2",
    ]);
    expect((records as { recordChangeTag?: string }[])[0]!.recordChangeTag).toBeUndefined();
  });

  // 165 riki_read_address names the capabilities; the browser fetches them once and hands the core their text
  it("fetches the capabilities the core names and reads them with the core", async () => {
    const asked: ReadAsk[] = [];
    const wms = "https://cors.example/wms?SERVICE=WMS&REQUEST=GetCapabilities";
    let fetched = 0;
    const { backend } = stack({
      reach: hosts(),
      fetching: () => {
        fetched += 1;
        return new Response("<WMS_Capabilities/>");
      },
      reads: (ask) => {
        asked.push(structuredClone(ask));
        return ask.document === undefined ? { kind: "fetch", url: wms } : { kind: "layers", title: "WMS", rows: [] };
      },
    });
    expect(await backend.readAddress("https://cors.example/wms")).toEqual({
      ok: true,
      value: { kind: "layers", title: "WMS", rows: [] },
    });
    expect(asked).toEqual([
      { address: "https://cors.example/wms" },
      { address: "https://cors.example/wms", document: "<WMS_Capabilities/>" },
    ]);
    expect(fetched).toBe(1);
  });

  // 165 riki_add_layer makes the ticked layers from the text read before; riki_apply writes them as rows
  it("adds a service's ticked layers from the capabilities read, and writes them through riki_apply", async () => {
    const asked: ReadAsk[] = [];
    const { backend, core, saves } = stack({
      reach: hosts(),
      fetching: () => new Response("<WMS_Capabilities/>"),
      reads: (ask) => {
        asked.push(ask);
        return ask.document === undefined
          ? { kind: "fetch", url: "https://cors.example/wms?REQUEST=GetCapabilities" }
          : { kind: "layers", rows: [] };
      },
    });
    await backend.readAddress("https://cors.example/wms");
    await backend.addServiceLayers(TATRAS, "https://cors.example/wms", ["roads", "rails"]);
    expect(asked).toHaveLength(2);
    expect(vi.mocked(core.addLayer).mock.calls[0]![0]).toEqual({
      rows: expect.any(Array),
      id: TATRAS,
      address: "https://cors.example/wms",
      picks: ["roads", "rails"],
      document: "<WMS_Capabilities/>",
    });
    expect(vi.mocked(core.apply).mock.calls[0]![0]).toEqual({
      rows: expect.any(Array),
      id: TATRAS,
      styleID: null,
      layers: [{ id: "L2", name: "Tiles" }],
      author: "Riki Tester",
    });
    expect(saves).toHaveBeenCalled();
  });

  it("refuses an address on a host that does not answer browsers, in the words of the notice, and writes nothing", async () => {
    const { backend, core, saves } = stack({
      reach: hosts(["https://closed.example"]),
      reads: (ask) =>
        ask.document === undefined
          ? { kind: "fetch", url: "https://closed.example/wms" }
          : { kind: "layers", rows: [] },
    });
    const answer = { ok: false, status: 400, said: "This service doesn't answer browsers. Add it in the app." };
    expect(await backend.readAddress("https://closed.example/wms")).toEqual(answer);
    expect(await backend.addServiceLayers(TATRAS, "https://closed.example/wms", ["a"])).toEqual(answer);
    expect(core.addLayer).not.toHaveBeenCalled();
    expect(saves).not.toHaveBeenCalled();
  });

  it("refuses a tile template whose probe host refuses browsers, though the core read it", async () => {
    const { backend } = stack({ reach: hosts(["https://cors.example"]) });
    expect(await backend.readAddress(template)).toMatchObject({
      ok: false,
      said: expect.stringContaining("doesn't answer browsers"),
    });
  });

  it("says what the core refused, in its words when it gives them, and what a failed fetch leaves unread", async () => {
    const refusing = stack({
      reads: () => ({ refused: "unanswered", status: 409, said: "The service said nothing readable" }),
    });
    expect(await refusing.backend.readAddress("x")).toEqual({
      ok: false,
      status: 409,
      said: "The service said nothing readable",
    });
    const failing = stack({
      reach: hosts(),
      fetching: () => {
        throw new TypeError("Failed to fetch");
      },
      reads: () => ({ kind: "fetch", url: "https://cors.example/a" }),
    });
    expect(await failing.backend.readAddress("x")).toMatchObject({
      ok: false,
      said: "The site could not read that address.",
    });
  });
});

describe("WebBackend's sealed keys", () => {
  const PAYLOAD = "https://cvws.icloud-content.com/own-tatras/payload";
  const SEALED =
    "1:78kYTTm1l4n3uC2TsvnXvbu90g927SqeD8NcC+ETUfwyqTFF7ms3rX/E3mgOj2dRnML+MHNut62UAZ3af2/P8rAwWk2JHgK1Cv8=";

  // 177 a map of yours carries its header keys sealed with your record name, as rikimaps 3656 writes them
  it("opens a map's keys with the signed-in record name, and the map's requests carry them", async () => {
    const before = assets[PAYLOAD]!;
    assets[PAYLOAD] = JSON.stringify({ symbol: "mountain.2", rikiSealedKeys: SEALED });
    try {
      await stack().backend.maps();
      expect(requestHeaders("https://tiles.example.com/1/2/3.png")).toEqual({ "X-Api-Key": "secret-1" });
    } finally {
      assets[PAYLOAD] = before;
      setRequestHeaders({});
    }
  });
});
