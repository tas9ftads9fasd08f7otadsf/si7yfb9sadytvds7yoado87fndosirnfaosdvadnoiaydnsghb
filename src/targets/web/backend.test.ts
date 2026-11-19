import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import account from "../../../e2e/fixtures/cloud-account.json";
import type { Device, Portable } from "@/lib/types";
import { Cloud, type CKContainer, type CKRecord, type CKSave, type CKSaved, type CloudKitJS } from "./cloud";
import { CoreMissing, type Applied, type Core, type HistoryEntry } from "./core";
import { createBackend } from "./backend";
import type { Keeping } from "./zones";

// 76 WebBackend reads against recorded CloudKit answers and a fake core
const assets = account.assets as Record<string, string>;

interface Options {
  signedIn?: boolean;
  core?: () => Promise<Core>;
  apply?: (ask: Parameters<Core["apply"]>[0]) => Applied;
  changes?: () => HistoryEntry[];
  /** Answers the saves; the default applies them to the account, as the server would. */
  saving?: (records: CKSave[]) => CKSaved | undefined;
}

function stack(options: Options = {}) {
  let notify: (n: unknown) => void = () => {};
  let signIn: (identity: unknown) => void = () => {};
  const held = structuredClone(account.zones) as unknown as { private: { zoneID: { zoneName: string }; records: CKRecord[] }[];
    shared: { zoneID: { zoneName: string }; records: CKRecord[] }[] };
  const changes = vi.fn(async ({ zones }: { zones: { zoneID: { zoneName: string } }[] }) => {
    const mine = held.private[0]!;
    return { zones: [{ zoneID: zones[0]!.zoneID, syncToken: "t",
      records: zones[0]!.zoneID.zoneName === mine.zoneID.zoneName ? mine.records : held.shared[0]!.records }] };
  });
  const all = () => [...held.private[0]!.records, ...held.shared[0]!.records];
  let version = 0;
  const saves = vi.fn<(records: CKSave[], where: unknown) => Promise<CKSaved>>(async (records) => {
    const refused = options.saving?.(records);
    if (refused) return refused;
    const stale = records.find((record) => record.recordChangeTag
      && record.recordChangeTag !== all().find((found) => found.recordName === record.recordName)?.recordChangeTag);
    if (stale) return { records: [{ recordName: stale.recordName, serverErrorCode: "CONFLICT" }] };
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
  const deletes = vi.fn(async () => ({ records: [] }));
  const container = {
    setUpAuth: async () => (options.signedIn === false ? false : account.person),
    whenUserSignsIn: () => new Promise((resolve) => { signIn = resolve; }),
    whenUserSignsOut: () => new Promise(() => {}),
    registerForNotifications: async () => {},
    addNotificationListener: (listener: (n: unknown) => void) => { notify = listener; },
    privateCloudDatabase: { fetchRecordZoneChanges: changes, fetchAllRecordZones: async () => ({}),
      saveRecords: saves, deleteRecords: deletes },
    sharedCloudDatabase: { fetchRecordZoneChanges: changes, saveRecords: vi.fn(async () => ({ records: [{ recordName: "shared-doprava", recordChangeTag: "s2" }] })),
      deleteRecords: deletes,
      fetchAllRecordZones: async () => ({ zones: account.zones.shared.map((each) => ({ zoneID: each.zoneID })) }) }
  } as unknown as CKContainer;
  const cloudkit: CloudKitJS = { configure: () => {}, getDefaultContainer: () => container };
  const config = { container: "iCloud.x", apiToken: "T", environment: "development" as const, tilesBase: "https://tiles.example" };
  const cloud = new Cloud(async () => cloudkit, async () => config);
  const seen: unknown[][] = [];
  const core: Core = {
    maps: (rows) => { seen.push(rows); return account.core.riki_maps as unknown as Device; },
    map: (rows, id) => { seen.push([id, rows.length]); return account.core.riki_map as unknown as Portable; },
    style: (rows, mapID, styleID, catalog) => { seen.push([mapID, styleID, catalog]); return account.core.riki_style; },
    apply: vi.fn((ask) => options.apply?.(ask) ?? (account.core.riki_apply as unknown as Applied)),
    changes: () => options.changes?.() ?? []
  };
  const kept = new Map<string, unknown>();
  const keeping: Keeping = { load: async <T,>(key: string) => kept.get(key) as T | undefined, save: async (k, v) => { kept.set(k, v); } };
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    const address = String(url);
    if (address in assets) return new Response(assets[address]);
    if (address === "/editor/words/sk.json") return Response.json({ language: "sk", words: { maps: "Mapy" } });
    return new Response("", { status: 404 });
  });
  const backend = createBackend({ cloud, config: async () => config, core: options.core ?? (async () => core), keeping,
    fetcher: fetcher as typeof fetch, base: "/editor", language: () => "sk" });
  /** Another device wrote this record: a new tag and the fields it set. */
  const elsewhere = (recordName: string, fields: Record<string, { value: unknown; type: string }>) => {
    const each = all().find((found) => found.recordName === recordName)!;
    Object.assign(each.fields!, fields);
    each.recordChangeTag = `${each.recordChangeTag}x`;
  };
  return { backend, seen, notify: () => notify({}), signIn: (identity: unknown) => signIn(identity), changes, core, saves,
    shared: container.sharedCloudDatabase.saveRecords as ReturnType<typeof vi.fn>, elsewhere, held };
}

describe("WebBackend's reads", () => {
  it("says signed out, with the sign-in's standing, until an Apple Account is in", async () => {
    const { backend, signIn } = stack({ signedIn: false });
    expect(await backend.session()).toEqual({ ok: true, value: { standing: "signedOut" } });
    signIn({ nameComponents: { givenName: "Rita" } });
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

  it("reads its words from the site's own words files", async () => {
    expect(await stack().backend.words()).toEqual({ language: "sk", words: { maps: "Mapy" } });
  });

  it("answers the maps list from the core, named after the person when the core names none", async () => {
    const { backend, seen } = stack();
    const device = await backend.maps();
    expect(device.name).toBe("Riki Tester");
    expect(device.maps.map((each) => each.name)).toEqual(["High Tatras", "Doprava"]);
    const rows = seen[0] as { entity: string; fields: Record<string, unknown> }[];
    expect(rows.map((row) => row.entity).sort()).toEqual(["SharedMap", "SharedMap", "SharedMapLayer"]);
    expect(rows.find((row) => row.fields.name === "High Tatras")?.fields.layersJSON).toBe("[{\"id\":\"L1\",\"name\":\"Trails\"}]");
  });

  // 76 the first sign-in check must not read as a change, or every map is fetched twice
  it("answers a map and its style from the rows already read, with the pipeline's host", async () => {
    const { backend, seen, changes } = stack();
    await backend.maps();
    const reads = changes.mock.calls.length;
    expect((await backend.map("6F1E2A10-0000-4000-8000-000000000001")).name).toBe("High Tatras");
    const style = await backend.style({ mapID: "M", styleID: "B1", hidden: ["L2"], theme: "dark", tiles: "3x2" });
    expect(style).toEqual({ ok: true, value: account.core.riki_style });
    expect(seen.at(-1)).toEqual(["M", "B1", { tilesBase: "https://tiles.example", theme: "dark", hidden: ["L2"], tiles: "3x2" }]);
    expect(changes.mock.calls.length).toBe(reads);
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
    await expect(backend.addTiles("M", "x")).rejects.toThrow("step 5");
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
    expect(ask.rows.map((row) => row.entity).sort()).toEqual(["SharedMap", "SharedMap", "SharedMapLayer"]);
    expect(saves).toHaveBeenCalledTimes(1);
    const [records, where] = saves.mock.calls[0]!;
    expect(where).toEqual({ zoneID: { zoneName: "com.apple.coredata.cloudkit.zone" }, atomic: true });
    expect(records).toEqual([
      { recordName: "own-tatras-layer", recordType: "CD_SharedMapLayer", recordChangeTag: "a2",
        fields: { CD_name: { value: "Ridges", type: "STRING" } } },
      { recordName: "change-web-1", recordType: "CD_SharedMapChange",
        fields: { CD_map: { value: { recordName: "own-tatras", action: "DELETE_SELF" }, type: "REFERENCE" },
          CD_payload: { value: expect.stringContaining("\"origin\":\"web\""), type: "STRING" } } }
    ]);
  });

  it("sends a shared map's edit to the shared database, in the share's zone", async () => {
    const { backend, shared } = stack({ apply: () => ({ map: account.core.riki_map as never,
      write: [{ entity: "SharedMap", id: "shared-doprava", fields: { name: "Roads" } }] }) });
    expect((await backend.change(DOPRAVA, null, { kind: "name", name: "Roads" })).ok).toBe(true);
    expect(shared).toHaveBeenCalledWith(
      [{ recordName: "shared-doprava", recordType: "CD_SharedMap", recordChangeTag: "s1",
        fields: { CD_name: { value: "Roads", type: "STRING" } } }],
      { zoneID: { zoneName: "share-doprava", ownerRecordName: "_friki" }, atomic: true });
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
      write: [{ entity: "SharedMap", id: "own-tatras", fields: { layersJSON: "[]" } }] }) });
    await backend.change(TATRAS, null, rename);
    expect(saves.mock.calls[0]![0]![0]!.fields).toEqual({ CD_layersJSON: { value: "[]", type: "STRING" },
      CD_layersJSON_ckAsset: { value: null } });
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
      ({ records: [{ recordName: records[0]!.recordName, serverErrorCode: "CONFLICT" }] }) });
    const answer = await backend.change(TATRAS, null, rename);
    expect(answer).toEqual({ ok: false, status: 412, said: "The map changed elsewhere. Open it again and repeat the change." });
    expect(core.apply).toHaveBeenCalledTimes(3);
    expect(saves).toHaveBeenCalledTimes(3);
  });

  it("does not hide any other error of the server", async () => {
    const { backend } = stack({ saving: () => ({ records: [{ recordName: "r", serverErrorCode: "QUOTA_EXCEEDED", reason: "iCloud is full" }] }) });
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
      recordChangeTag: "w1", fields: { CD_name: { value: "Trails", type: "STRING" } } }]);
  });

  it("deletes what the change created and restores what it removed, when it is undone", async () => {
    const { backend, saves, held } = stack({ apply: () => ({ map: account.core.riki_map as never,
      write: [{ entity: "SharedMapStyle", id: "new-style", fields: { name: "Winter" } }], remove: ["own-tatras-layer"] }) });
    expect((await backend.change(TATRAS, null, { kind: "addStyle", name: "Winter" })).ok).toBe(true);
    held.private[0]!.records = held.private[0]!.records.filter((row) => row.recordName !== "own-tatras-layer");
    expect((await backend.undo!(TATRAS)).ok).toBe(true);
    const restored = saves.mock.calls.at(-1)![0]!;
    expect(restored.map((record) => record.recordName)).toEqual(["own-tatras-layer"]);
    expect(restored[0]!.recordChangeTag).toBeUndefined();
    expect(restored[0]!.fields.CD_name).toEqual({ value: "Trails", type: "STRING" });
  });

  it("refuses to undo what someone else changed since, and has nothing to undo before a change", async () => {
    const { backend, saves, elsewhere } = stack();
    expect(await backend.undo!(TATRAS)).toMatchObject({ ok: false, status: 404 });
    await backend.change(TATRAS, null, rename);
    elsewhere("own-tatras-layer", { CD_name: { value: "Peaks", type: "STRING" } });
    expect(await backend.undo!(TATRAS)).toMatchObject({ ok: false, status: 412 });
    // the try on the cached rows was refused, and the rows read again hold Peaks
    expect(saves).toHaveBeenCalledTimes(2);
    await expect(saves.mock.results[1]!.value).resolves.toMatchObject({ records: [{ serverErrorCode: "CONFLICT" }] });
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
    made.elsewhere("own-tatras-layer", { CD_name: { value: "Peaks", type: "STRING" } });
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
