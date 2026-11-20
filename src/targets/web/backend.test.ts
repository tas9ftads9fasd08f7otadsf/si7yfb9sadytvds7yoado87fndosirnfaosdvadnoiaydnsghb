import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import account from "../../../e2e/fixtures/cloud-account.json";
import type { Device, Portable } from "@/lib/types";
import { Cloud, type CKBatchResult, type CKContainer, type CKRecord, type CKSave, type CKZoneChanges, type CloudKitJS } from "./cloud";
import { CoreNotReady, NotOnSite, type Feature } from "@/backend/types";
import { CoreMissing, type AddAsk, type AddressRead, type Applied, type Core, type HistoryEntry, type PeopleRead, type ReadAsk } from "./core";
import { createBackend } from "./backend";
import type { Reach } from "./reach";
import type { Keeping } from "./zones";
import { fakeOpfs } from "./regions/fake-opfs";
import { opfsStore, type PackageStore } from "./regions/store";

// 76 WebBackend reads against recorded CloudKit answers and a fake core
const assets = account.assets as Record<string, string>;
const SHARE_ZONE = account.zones.private[1]!.zoneID.zoneName;

interface Options {
  signedIn?: boolean;
  core?: () => Promise<Core>;
  apply?: (ask: Parameters<Core["apply"]>[0]) => Applied;
  changes?: () => HistoryEntry[];
  /** 112 The region catalog the site's config names, and where packages are kept. */
  catalog?: string;
  regions?: PackageStore;
  /** 108 What the core reads of a share. */
  people?: () => PeopleRead | { refused: string; status?: number };
  /** 85 Which hosts answer a browser; every one does by default. */
  reach?: Reach;
  /** 86 What the core reads an address as, by round; the recorded answer by default. */
  reads?: (ask: ReadAsk) => AddressRead;
  adds?: (ask: AddAsk) => Applied;
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
  const held = structuredClone(account.zones) as unknown as { private: { zoneID: { zoneName: string }; records: CKRecord[] }[];
    shared: { zoneID: { zoneName: string }; records: CKRecord[] }[] };
  // 87 a zone's options, as the library takes them: it builds the `zones` of the request itself
  const changes = vi.fn(async (options: CKZoneChanges | CKZoneChanges[]) => {
    const [zone] = [options].flat();
    const found = [...held.private, ...held.shared].find((each) => each.zoneID.zoneName === zone!.zoneID.zoneName);
    return { zones: [{ zoneID: zone!.zoneID, syncToken: "t", records: found?.records ?? [] }] };
  });
  const all = () => [...held.private, ...held.shared].flatMap((zone) => zone.records);
  let version = 0;
  /** The batch's commit: what it creates and updates, where, and what it deletes with the tags read. */
  const saves = vi.fn<(records: CKSave[], where: unknown, removals: { recordName: string; recordChangeTag?: string }[]) => Promise<CKBatchResult>>(async (records) => {
    const refused = options.saving?.(records);
    if (refused) return refused;
    const stale = records.find((record) => record.recordChangeTag
      && record.recordChangeTag !== all().find((found) => found.recordName === record.recordName)?.recordChangeTag);
    if (stale) return { records: [], hasErrors: true, errors: [{ recordName: stale.recordName, ckErrorCode: "CONFLICT", serverErrorCode: "CONFLICT" }] };
    return { records: records.map((record) => {
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
    }) };
  });
  const batchOf = (commit: (...asked: Parameters<typeof saves>) => Promise<CKBatchResult>) => (where: unknown) => {
    const records: CKSave[] = [];
    const removals: { recordName: string; recordChangeTag?: string }[] = [];
    const batch = {
      create: (record: CKSave) => { records.push(record); return batch; },
      update: (record: CKSave) => { records.push(record); return batch; },
      delete: (record: { recordName: string; recordChangeTag?: string }) => { removals.push(record); return batch; },
      commit: () => commit(records, where, removals)
    };
    return batch;
  };
  const identities = { ...account.identities, rita: { userRecordName: "rita", nameComponents: { givenName: "Rita" } } } as Record<string, unknown>;
  const database = { fetchRecordZoneChanges: changes, newRecordsBatch: batchOf(saves),
    saveSubscriptions: vi.fn(async () => ({})), fetchDatabaseChanges: vi.fn(async () => ({ zones: [] })) };
  const shared = vi.fn<(...asked: Parameters<typeof saves>) => Promise<CKBatchResult>>(async () => ({ records: [{ recordName: "shared-doprava", recordChangeTag: "s2" }] }));
  const container = {
    setUpAuth: async () => (options.signedIn === false ? false : account.person),
    discoverUserIdentityWithUserRecordName: async (name: string) => ({ users: options.nameless ? [] : [identities[name]] }),
    whenUserSignsIn: () => new Promise((resolve) => { signIn = resolve; }),
    whenUserSignsOut: () => new Promise(() => {}),
    registerForNotifications: async () => {},
    addNotificationListener: (listener: (n: unknown) => void) => { notify = listener; },
    privateCloudDatabase: { ...database, fetchAllRecordZones: async () => ({ zones: held.private.map((each) => ({ zoneID: each.zoneID })) }) },
    sharedCloudDatabase: { ...database, newRecordsBatch: batchOf(shared),
      fetchAllRecordZones: async () => ({ zones: account.zones.shared.map((each) => ({ zoneID: each.zoneID })) }) }
  } as unknown as CKContainer;
  const cloudkit: CloudKitJS = { configure: () => {}, getDefaultContainer: () => container };
  const config = { container: "iCloud.x", apiToken: "T", environment: "development" as const, tilesBase: "https://tiles.example", regionsCatalog: options.catalog ?? "" };
  const cloud = new Cloud(async () => cloudkit, async () => config);
  const seen: unknown[][] = [];
  const core: Core = {
    maps: (rows) => { seen.push(rows); return account.core.riki_maps as unknown as Device; },
    map: (rows, id) => { seen.push([id, rows.length]); return account.core.riki_map as unknown as Portable; },
    style: (rows, mapID, styleID, catalog) => { seen.push([mapID, styleID, catalog]); return options.built ?? account.core.riki_style; },
    apply: vi.fn((ask) => options.apply?.(ask) ?? (account.core.riki_apply as unknown as Applied)),
    readAddress: (ask) => options.reads?.(ask) ?? (account.core.riki_read_address as unknown as AddressRead),
    addLayer: vi.fn((ask) => options.adds?.(ask) ?? (account.core.riki_add_layer as unknown as Applied)),
    changes: () => options.changes?.() ?? [],
    people: vi.fn(() => options.people?.() ?? (account.core.riki_people as unknown as PeopleRead))
  };
  const kept = new Map<string, unknown>();
  const keeping: Keeping = { load: async <T,>(key: string) => kept.get(key) as T | undefined, save: async (k, v) => { kept.set(k, v); } };
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    const address = String(url);
    if (address in assets) return new Response(assets[address]);
    if (options.fetching && address.startsWith("https://")) return options.fetching(address);
    if (address === "/editor/words/languages.json") return Response.json(["cs", "en", "sk"]);
    if (address === "/editor/words/sk.json") return Response.json({ language: "sk", words: { maps: "Mapy", layers: "Vrstvy", noSuchMap: "Taká mapa nie je",
      nothingToUndo: "Nie je čo vrátiť", signsInApple: "Stránka sa prihlasuje cez Apple ID", changeRefused: "Mapa sa zmenila inde." } });
    if (address === "/editor/words/en.json") return Response.json({ language: "en", words: { maps: "Maps" } });
    return new Response("", { status: 404 });
  });
  const backend = createBackend({ cloud, config: async () => config, core: options.core ?? (async () => core), keeping, reach: options.reach ?? { answers: async () => true },
    author: { read: () => options.typed ?? "", keep: () => {} }, fetcher: fetcher as typeof fetch, base: "/editor", languages: () => options.languages ?? ["sk"],
    ...(options.regions ? { regions: options.regions } : {}) });
  /** Another device wrote this record: a new tag and the fields it set. */
  const elsewhere = (recordName: string, fields: Record<string, { value: unknown; type: string }>) => {
    const each = all().find((found) => found.recordName === recordName)!;
    Object.assign(each.fields!, fields);
    each.recordChangeTag = `${each.recordChangeTag}x`;
  };
  return { backend, seen, notify: () => notify({}), signIn: (identity: unknown) => signIn(identity), changes, core, saves,
    shared, elsewhere, held };
}

describe("WebBackend's reads", () => {
  it("says signed out, with the sign-in's standing, until an Apple Account is in", async () => {
    const { backend, signIn } = stack({ signedIn: false });
    expect(await backend.session()).toEqual({ ok: true, value: { standing: "signedOut" } });
    signIn({ userRecordName: "rita" });
    await new Promise((resolve) => setTimeout(resolve));
    expect(await backend.session()).toEqual({ ok: true, value: { standing: "admitted", edits: true, token: "icloud", device: "Rita", viewers: null } });
  });

  // 78 signing in is the permission to edit; the core refuses what a role forbids
  it("lets the person in by name, as an editor", async () => {
    const answer = await stack().backend.session();
    expect(answer).toEqual({ ok: true, value: { standing: "admitted", edits: true, token: "icloud", device: "Riki Tester", viewers: null } });
  });

  it("has no edit password to trade", async () => {
    expect(await stack().backend.unlock("x")).toMatchObject({ ok: false, status: 404 });
  });

  it("reads its words from the site's own words files, in the language the browser asks for", async () => {
    const said = await stack().backend.words() as { language: string; words: Record<string, string> };
    expect(said.language).toBe("sk");
    expect(said.words.maps).toBe("Mapy");
    const other = await stack({ languages: ["fr-CA", "en-GB", "en"] }).backend.words() as { language: string };
    expect(other.language).toBe("en");
  });

  // 91 what only the phone made up, the language names and counts, is made in the browser
  it("makes the language list, their names and the layer counts, as the phone does for itself", async () => {
    const { words } = await stack().backend.words() as { words: Record<string, string> };
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
    expect(await backend.change("no-such", null, { kind: "name", name: "x" })).toMatchObject({ status: 404, said: "No such map" });
    await backend.words();
    expect(await backend.change("no-such", null, { kind: "name", name: "x" })).toMatchObject({ status: 404, said: "Taká mapa nie je" });
  });

  it("answers the maps list from the core, named after the person when the core names none", async () => {
    const { backend, seen } = stack();
    const device = await backend.maps();
    expect(device.name).toBe("Riki Tester");
    expect(device.maps.map((each) => each.name)).toEqual(["High Tatras", "Doprava"]);
    const rows = seen[0] as { entity: string; fields: Record<string, unknown> }[];
    // 108 a shared map's share and member rows are among them, for the core to read who holds it
    expect(rows.map((row) => row.entity).sort()).toEqual(["Share", "Share", "SharedMap", "SharedMap", "SharedMap",
      "SharedMapChange", "SharedMapLayer", "SharedMapLayer", "SharedMapMember", "SharedMapMember", "SharedMapMember",
      "SharedMapMember"]);
    expect(rows.find((row) => row.fields.name === "High Tatras")?.fields.payload).toBe("{\"symbol\":\"mountain.2\"}");
  });

  // 76 the first sign-in check must not read as a change, or every map is fetched twice
  it("answers a map and its style from the rows already read, with the pipeline's host", async () => {
    const { backend, seen, changes } = stack();
    await backend.maps();
    const reads = changes.mock.calls.length;
    expect((await backend.map("6F1E2A10-0000-4000-8000-000000000001")).name).toBe("High Tatras");
    const style = await backend.style({ mapID: "M", styleID: "B1", hidden: ["L2"], theme: "dark", tiles: "3x2" });
    expect(style).toEqual({ ok: true, value: account.core.riki_style });
    // 110 the glyphs and the sprite are the site's own, under its path; 112 nothing is held
    expect(seen.at(-1)).toEqual(["M", "B1", { tilesBase: "https://tiles.example", glyphsBase: `${location.origin}/editor/glyphs`,
      spriteBase: `${location.origin}/editor/sprites/temaki-sprite`, stored: [], theme: "dark", hidden: ["L2"], tiles: "3x2" }]);
    expect(changes.mock.calls.length).toBe(reads);
  });

  // 85 a layer on a host that refuses browsers is not drawn on the site, and its layer is named
  it("leaves a layer on a host that refuses browsers out of its style and names it", async () => {
    const built = { version: 8, sources: { "riki-custom-l1": { type: "raster", tiles: ["https://closed.example/{z}/{x}/{y}.png"] },
      "riki-base": { type: "vector", url: "pmtiles://https://tiles.example/a.pmtiles" } },
      layers: [{ id: "l1", type: "raster", source: "riki-custom-l1" }] };
    const asked = vi.fn(async (address: string) => !address.startsWith("https://closed.example"));
    const { backend } = stack({ built, reach: { answers: asked } });
    const style = await backend.style({ mapID: "M", styleID: null, hidden: [], theme: "light", tiles: "1" });
    expect(style).toMatchObject({ ok: true, value: { sources: { "riki-base": {} }, layers: [],
      metadata: { "riki:undrawn": ["l1"] } } });
    expect(asked).not.toHaveBeenCalledWith("pmtiles://https://tiles.example/a.pmtiles");
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
    await expect(backend.newMap("x")).rejects.toThrow("step 4");
    await expect(backend.addFile("M", new File([], "a.gpx"))).rejects.toThrow("step 5");
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
    expect(ask).toMatchObject({ mapID: TATRAS, styleID: "B1", edit: rename, author: "Riki Tester", origin: "web" });
    expect(ask.rows.map((row) => row.entity).sort()).toEqual(["Share", "Share", "SharedMap", "SharedMap", "SharedMap",
      "SharedMapChange", "SharedMapLayer", "SharedMapLayer", "SharedMapMember", "SharedMapMember", "SharedMapMember",
      "SharedMapMember"]);
    expect(saves).toHaveBeenCalledTimes(1);
    const [records, where] = saves.mock.calls[0]!;
    expect(where).toEqual({ zoneID: { zoneName: "com.apple.coredata.cloudkit.zone" }, atomic: true });
    expect(records).toEqual([
      { recordName: "own-tatras-layer", recordType: "CD_SharedMapLayer", recordChangeTag: "a2",
        fields: { CD_layerJSON: { value: "{\"id\":\"L1\",\"name\":\"Ridges\"}", type: "STRING" } } },
      { recordName: "change-web-1", recordType: "CD_SharedMapChange",
        fields: { CD_map: { value: { recordName: "own-tatras", action: "DELETE_SELF" }, type: "REFERENCE" },
          CD_payload: { value: expect.any(String), type: "BYTES" }, CD_id: { value: expect.any(String), type: "STRING" },
          CD_updatedAt: { value: expect.any(Number), type: "TIMESTAMP" }, CD_schemaVersion: { value: 1, type: "INT64" },
          CD_entityName: { value: "SharedMapChange", type: "STRING" } } }
    ]);
  });

  // 84 bug: the history row's payload went as a STRING and had no id, time or schema version
  it("writes the history row as the app's mirror does, its JSON as base64 bytes with an id, a time and a version", async () => {
    const { backend, saves } = stack();
    const before = Date.now();
    await backend.change(TATRAS, "B1", rename);
    const fields = saves.mock.calls[0]![0]![1]!.fields;
    expect(atob(fields.CD_payload!.value as string)).toContain("\"origin\":\"web\"");
    expect(fields.CD_id!.value).toMatch(/^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/);
    expect(fields.CD_updatedAt!.value as number).toBeGreaterThanOrEqual(before);
    expect(fields.CD_updatedAt!.value as number).toBeLessThanOrEqual(Date.now());
  });

  // 83 the name typed in the account part goes ahead of the one CloudKit gives, else none
  it("makes a change under the typed name, else CloudKit's, else none", async () => {
    for (const [options, author] of [[{ typed: "Friki" }, "Friki"], [{}, "Riki Tester"], [{ nameless: true }, null]] as const) {
      const { backend, core } = stack(options);
      await backend.change(TATRAS, null, rename);
      expect(vi.mocked(core.apply).mock.calls[0]![0].author).toBe(author);
    }
  });

  it("sends a shared map's edit to the shared database, in the share's zone", async () => {
    const { backend, shared } = stack({ apply: () => ({ map: account.core.riki_map as never,
      write: [{ entity: "SharedMap", id: "shared-doprava", fields: { name: "Roads" } }] }) });
    expect((await backend.change(DOPRAVA, null, { kind: "name", name: "Roads" })).ok).toBe(true);
    expect(shared).toHaveBeenCalledWith(
      [{ recordName: "shared-doprava", recordType: "CD_SharedMap", recordChangeTag: "s1",
        fields: { CD_name: { value: "Roads", type: "STRING" } } }],
      { zoneID: { zoneName: "share-doprava", ownerRecordName: "_friki" }, atomic: true }, []);
  });

  // 116 bug: the site never read a map the person shares, so none of its rows could be written to its zone
  it("sends an owner-shared map's edit to the private database, in the zone made for the share", async () => {
    const BESKYDY = "6F1E2A10-0000-4000-8000-000000000003";
    const { backend, saves, shared } = stack({ apply: () => ({ map: account.core.riki_map as never,
      write: [{ entity: "SharedMap", id: "own-beskydy", fields: { name: "Beskydy 2" } }] }) });
    expect((await backend.change(BESKYDY, null, { kind: "name", name: "Beskydy 2" })).ok).toBe(true);
    expect(shared).not.toHaveBeenCalled();
    expect(saves.mock.calls[0]![1]).toEqual({ zoneID: { zoneName: SHARE_ZONE }, atomic: true });
    expect(saves.mock.calls[0]![0]).toMatchObject([{ recordName: "own-beskydy", recordChangeTag: "o1" }]);
  });

  it("returns the core's refusal words and writes nothing", async () => {
    const { backend, saves } = stack({ apply: () => ({ refused: "Only the owner may do this", status: 403 }) });
    expect(await backend.change(TATRAS, null, rename)).toEqual({ ok: false, status: 403, said: "Only the owner may do this" });
    expect(saves).not.toHaveBeenCalled();
  });

  it("says no such map when the rows hold none", async () => {
    expect(await stack().backend.change("nope", null, rename)).toMatchObject({ ok: false, status: 404 });
  });

  it("writes a field that was an asset in the field itself and clears the asset", async () => {
    const { backend, saves } = stack({ apply: () => ({ map: account.core.riki_map as never,
      write: [{ entity: "SharedMap", id: "own-tatras", fields: { payload: "{}" } }] }) });
    await backend.change(TATRAS, null, rename);
    // 84 the JSON of a BYTES field goes as base64
    expect(saves.mock.calls[0]![0]![0]!.fields).toEqual({ CD_payload: { value: "e30=", type: "BYTES" },
      CD_payload_ckAsset: { value: null } });
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
    saves.mockImplementationOnce(async () => { first = false; throw Object.assign(new Error("x"), { ckErrorCode: "CONFLICT" }); });
    expect((await backend.change(TATRAS, null, rename)).ok).toBe(true);
    expect(first).toBe(false);
    expect(saves).toHaveBeenCalledTimes(2);
  });

  it("refuses after three conflicts, in words that say the map changed elsewhere", async () => {
    const { backend, core, saves } = stack({ saving: (records) =>
      ({ records: [], hasErrors: true, errors: [{ recordName: records[0]!.recordName, ckErrorCode: "CONFLICT", serverErrorCode: "CONFLICT" },
        { recordName: records[1]!.recordName, ckErrorCode: "ATOMIC_ERROR", serverErrorCode: "ATOMIC_ERROR" }] }) });
    const answer = await backend.change(TATRAS, null, rename);
    expect(answer).toEqual({ ok: false, status: 412, said: "The map changed elsewhere. Open it again and repeat the change." });
    expect(core.apply).toHaveBeenCalledTimes(3);
    expect(saves).toHaveBeenCalledTimes(3);
  });

  it("does not hide any other error of the server", async () => {
    const { backend } = stack({ saving: () => ({ records: [], hasErrors: true,
      errors: [{ recordName: "r", ckErrorCode: "QUOTA_EXCEEDED", serverErrorCode: "QUOTA_EXCEEDED", reason: "iCloud is full" }] }) });
    await expect(backend.change(TATRAS, null, rename)).rejects.toThrow("iCloud is full");
  });

  // 78 undo is a write of the rows as they were, through the same path
  it("undoes a change by writing the rows as they were before, with the tags the change left", async () => {
    const { backend, saves } = stack();
    await backend.change(TATRAS, null, rename);
    const undone = await backend.undo!(TATRAS);
    expect(undone.ok).toBe(true);
    expect(saves).toHaveBeenCalledTimes(2);
    expect(saves.mock.calls[1]![0]).toEqual([{ recordName: "own-tatras-layer", recordType: "CD_SharedMapLayer",
      recordChangeTag: "w1", fields: { CD_layerJSON: { value: "{\"id\":\"L1\",\"name\":\"Trails\"}", type: "STRING" } } }]);
  });

  it("deletes what the change created and restores what it removed, when it is undone", async () => {
    const { backend, saves, held } = stack({ apply: () => ({ map: account.core.riki_map as never,
      write: [{ entity: "SharedMapStyle", id: "new-style", fields: { styleJSON: "{}" } }], remove: ["own-tatras-layer"] }) });
    expect((await backend.change(TATRAS, null, { kind: "addStyle", name: "Winter" })).ok).toBe(true);
    held.private[0]!.records = held.private[0]!.records.filter((row) => row.recordName !== "own-tatras-layer");
    expect((await backend.undo!(TATRAS)).ok).toBe(true);
    const restored = saves.mock.calls.at(-1)![0]!;
    expect(restored.map((record) => record.recordName)).toEqual(["own-tatras-layer"]);
    expect(restored[0]!.recordChangeTag).toBeUndefined();
    expect(restored[0]!.fields.CD_layerJSON).toEqual({ value: "{\"id\":\"L1\",\"name\":\"Trails\"}", type: "STRING" });
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
    const made = stack({ changes: () => [{ id: "c9", map: "own-tatras", author: "Friki", origin: "web", lines: ["Roads renamed"] }] });
    const listener = await told(made);
    made.elsewhere("own-tatras", { CD_name: { value: "High Tatras 2", type: "STRING" } });
    made.notify();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith([{ mapID: TATRAS_ID, name: "High Tatras", author: "Friki" }]));
  });

  it("names no author when no history row says who", async () => {
    const made = stack();
    const listener = await told(made);
    made.elsewhere("own-tatras-layer", { CD_layerJSON: { value: "{}", type: "STRING" } });
    made.notify();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith([{ mapID: TATRAS_ID, name: "High Tatras", author: null }]));
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
    for (const [name, text] of [["contents.json", "{\"package\":\"base\"}"], ["base.pmtiles", "P"]] as const) {
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

  it("tells the core what is held, with each package's manifest text, when it builds a style", async () => {
    const { backend, seen } = stack({ regions: await held() });
    await backend.maps();
    await backend.style({ mapID: "M", styleID: "B1", hidden: [], theme: "light", tiles: "1x1" });
    const catalog = (seen.at(-1) as unknown[])[2] as { stored: unknown[] };
    expect(catalog.stored).toEqual([{ region: "tatry", piece: "base", version: 4, files: ["base.pmtiles", "contents.json"],
      contents: "{\"package\":\"base\"}" }]);
  });

  it("reads a held archive for the map by the key its style names it with, and a sprite sheet", async () => {
    const { backend } = stack({ regions: await held() });
    const added: string[] = [];
    await backend.stored!.prepare({ sources: { base: { url: "pmtiles://riki-store/tatry/base/base.pmtiles" } } },
      { tiles: new Map(), add: (p: { source: { getKey(): string } }) => added.push(p.source.getKey()) } as never);
    expect(added).toEqual(["riki-store/tatry/base/base.pmtiles"]);
    await expect(backend.stored!.load({ url: "riki-store://tatry/base/contents.json", type: "json" })).resolves.toEqual({ data: { package: "base" } });
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
    expect(rows.filter((row) => row.zone === "share-doprava").map((row) => row.entity).sort())
      .toEqual(["Share", "SharedMap", "SharedMapMember", "SharedMapMember"]);
    expect(answer).toMatchObject({ ok: true, value: { isShared: true, role: "editor", linkRole: null, readOnly: true,
      mayInvite: false, mayChangeLink: false, link: null } });
    if (!answer.ok) return;
    expect(answer.value.people.map((each) => [each.name, each.line, each.hasAccepted, each.mayChangeRole, each.mayRemove])).toEqual([
      ["Friki", "Owner", true, false, false],
      ["Riki Tester (you)", "Can edit · Joined", true, false, false],
      ["marek@example.com", "View only · Invited", false, false, false]]);
  });

  it("answers a map nobody shares, an unknown map and a folder as it can", async () => {
    const alone = stack({ people: () => ({ shared: false, role: "owner", people: [], linkRole: null }) });
    expect(await alone.backend.people({ kind: "map", id: DOPRAVA })).toMatchObject({ ok: true, value: { isShared: false, people: [] } });
    expect(await alone.backend.people({ kind: "map", id: "nope" })).toMatchObject({ ok: false, status: 404 });
    await expect(alone.backend.people({ kind: "folder", id: "F" })).rejects.toBeInstanceOf(NotOnSite);
  });

  // 108 until the module has riki_people the site says its rules are not ready, as for any call not in yet
  it("says the core's rules are not ready while the module lacks the call", async () => {
    const lacking = stack({ people: () => { throw new CoreNotReady("no riki_people"); } });
    await expect(lacking.backend.people({ kind: "map", id: DOPRAVA })).rejects.toBeInstanceOf(CoreNotReady);
  });

  it("passes on what the core refuses", async () => {
    const { backend } = stack({ people: () => ({ refused: "No share here", status: 409 }) });
    expect(await backend.people({ kind: "map", id: DOPRAVA })).toEqual({ ok: false, status: 409, said: "No share here" });
  });

  it("changes nothing of the share: every ask is refused as not on the site", async () => {
    const { backend } = stack();
    await expect(backend.askPeople({ kind: "map", id: DOPRAVA }, { kind: "role", person: "_marek", role: "editor" }))
      .rejects.toBeInstanceOf(NotOnSite);
    await expect(backend.askPeople({ kind: "map", id: DOPRAVA }, { kind: "link", role: null })).rejects.toBeInstanceOf(NotOnSite);
  });
});

describe("WebBackend's parts not built yet", () => {
  // 82 the site said "Not connected" for a write it refuses as not done yet
  it("offers none of the parts it does not answer, and refuses their calls as not on the site", async () => {
    const { backend } = stack();
    const parts: Feature[] = ["newMap", "shelf", "exportMap", "duplicateMap", "pictures", "addPackages", "addFile", "addAPI", "servers", "coverage"];
    expect(parts.filter((part) => backend.offers(part))).toEqual([]);
    // 86 only the tile address and a service's layers are added from the site so far
    expect(backend.offers("addLayer")).toBe(true);
    await expect(backend.newMap("Alps")).rejects.toBeInstanceOf(NotOnSite);
    await expect(backend.servers()).rejects.toBeInstanceOf(NotOnSite);
    await expect(backend.addAPI("M", "https://t/x", { kind: "x" } as never, "n")).rejects.toBeInstanceOf(NotOnSite);
  });
});

describe("WebBackend's added layers", () => {
  const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";
  const template = "https://cors.example/{z}/{x}/{y}.png";
  const hosts = (refusing: string[] = []): Reach => ({ answers: vi.fn(async (address: string) => !refusing.some((host) => address.startsWith(host))) });

  // 86 the core reads the address and builds the rows; the site only fetches and writes them
  it("reads a tile template as the core says and writes the rows the core adds, with their history row", async () => {
    const { backend, core, saves } = stack({ reach: hosts() });
    expect(await backend.readAddress(template)).toEqual({ ok: true, value: { kind: "tiles", probe: "https://cors.example/0/0/0.png" } });
    expect(await backend.addTiles(TATRAS, template)).toEqual({ ok: true, value: account.core.riki_map });
    const ask = vi.mocked(core.addLayer).mock.calls[0]![0];
    expect(ask).toMatchObject({ mapID: TATRAS, add: { kind: "tiles", address: template, replies: [] }, author: "Riki Tester", origin: "web" });
    const [records, where] = saves.mock.calls[0]!;
    expect(where).toEqual({ zoneID: { zoneName: "com.apple.coredata.cloudkit.zone" }, atomic: true });
    expect((records as { recordName: string; recordChangeTag?: string }[]).map((record) => record.recordName))
      .toEqual(["own-tatras-layer-2", "change-web-2"]);
    expect((records as { recordChangeTag?: string }[])[0]!.recordChangeTag).toBeUndefined();
  });

  it("fetches the addresses the core asks for, in rounds, and gives the core every reply", async () => {
    const rounds: ReadAsk[] = [];
    const { backend, core } = stack({ reach: hosts(), fetching: () => new Response("{\"tiles\":[]}", { headers: { "content-type": "application/json" } }),
      reads: (ask) => {
        rounds.push(structuredClone(ask));
        return ask.replies.length === 0 ? { fetch: ["https://cors.example/tiles.json"] } : { read: { kind: "tilejson" } };
      } });
    expect(await backend.readAddress("https://cors.example/tiles.json")).toEqual({ ok: true, value: { kind: "tilejson" } });
    expect(rounds[1]!.replies).toEqual([{ url: "https://cors.example/tiles.json", status: 200, contentType: "application/json", text: "{\"tiles\":[]}" }]);
    await backend.addTiles(TATRAS, "https://cors.example/tiles.json");
    // adding it asks the host no more than reading did
    expect(rounds).toHaveLength(2);
    expect(vi.mocked(core.addLayer).mock.calls[0]![0].add).toMatchObject({ kind: "tiles", replies: [{ url: "https://cors.example/tiles.json" }] });
  });

  it("adds a service's ticked layers from what its capabilities answered", async () => {
    const { backend, core } = stack({ reach: hosts(), fetching: () => new Response("<WMS_Capabilities/>"),
      reads: (ask) => ask.replies.length ? { read: { kind: "layers", rows: [] } } : { fetch: ["https://cors.example/wms?REQUEST=GetCapabilities"] } });
    await backend.addServiceLayers(TATRAS, "https://cors.example/wms", ["roads", "rails"]);
    expect(vi.mocked(core.addLayer).mock.calls[0]![0].add).toMatchObject({ kind: "service", address: "https://cors.example/wms", picks: ["roads", "rails"] });
  });

  it("refuses an address on a host that does not answer browsers, in the words of the notice, and writes nothing", async () => {
    const { backend, core, saves } = stack({ reach: hosts(["https://closed.example"]),
      reads: (ask) => ask.replies.length ? { read: { kind: "layers" } } : { fetch: ["https://closed.example/wms"] } });
    const answer = { ok: false, status: 400, said: "This service doesn't answer browsers. Add it in the app." };
    expect(await backend.readAddress("https://closed.example/wms")).toEqual(answer);
    expect(await backend.addServiceLayers(TATRAS, "https://closed.example/wms", ["a"])).toEqual(answer);
    expect(core.addLayer).not.toHaveBeenCalled();
    expect(saves).not.toHaveBeenCalled();
  });

  it("refuses a tile template whose probe host refuses browsers, though the core read it", async () => {
    const { backend } = stack({ reach: hosts(["https://cors.example"]) });
    expect(await backend.readAddress(template)).toMatchObject({ ok: false, said: expect.stringContaining("doesn't answer browsers") });
  });

  it("says what the core refused, and stops asking after four rounds", async () => {
    const refusing = stack({ reads: () => ({ refused: "Not a tile address", status: 422 }) });
    expect(await refusing.backend.readAddress("x")).toEqual({ ok: false, status: 422, said: "Not a tile address" });
    let asked = 0;
    const endless = stack({ reach: hosts(), fetching: () => new Response("x"), reads: () => ({ fetch: [`https://cors.example/${asked++}`] }) });
    expect(await endless.backend.readAddress("x")).toMatchObject({ ok: false, said: "The site could not read that address." });
    expect(asked).toBe(4);
  });

  it("passes a failed fetch to the core as status 0", async () => {
    const seen: ReadAsk[] = [];
    const { backend } = stack({ reach: hosts(), fetching: () => { throw new TypeError("Failed to fetch"); },
      reads: (ask) => { seen.push(structuredClone(ask)); return ask.replies.length ? { read: { kind: "tiles" } } : { fetch: ["https://cors.example/a"] }; } });
    await backend.readAddress("x");
    expect(seen[1]!.replies).toEqual([{ url: "https://cors.example/a", status: 0, contentType: "", text: "" }]);
  });
});
