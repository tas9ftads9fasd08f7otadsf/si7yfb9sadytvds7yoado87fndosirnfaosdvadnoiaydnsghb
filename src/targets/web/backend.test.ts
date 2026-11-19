import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import account from "../../../e2e/fixtures/cloud-account.json";
import type { Device, Portable } from "@/lib/types";
import { Cloud, type CKContainer, type CKRecord, type CloudKitJS } from "./cloud";
import { CoreMissing, type Core } from "./core";
import { createBackend } from "./backend";
import type { Keeping } from "./zones";

// 76 WebBackend reads against recorded CloudKit answers and a fake core
const assets = account.assets as Record<string, string>;

function stack(options: { signedIn?: boolean; core?: () => Promise<Core> } = {}) {
  let notify: (n: unknown) => void = () => {};
  let signIn: (identity: unknown) => void = () => {};
  const changes = vi.fn(async ({ zones }: { zones: { zoneID: { zoneName: string } }[] }) => {
    const mine = account.zones.private[0]!;
    return { zones: [{ zoneID: zones[0]!.zoneID, syncToken: "t",
      records: (zones[0]!.zoneID.zoneName === mine.zoneID.zoneName ? mine.records : account.zones.shared[0]!.records) as unknown as CKRecord[] }] };
  });
  const container = {
    setUpAuth: async () => (options.signedIn === false ? false : account.person),
    whenUserSignsIn: () => new Promise((resolve) => { signIn = resolve; }),
    whenUserSignsOut: () => new Promise(() => {}),
    registerForNotifications: async () => {},
    addNotificationListener: (listener: (n: unknown) => void) => { notify = listener; },
    privateCloudDatabase: { fetchRecordZoneChanges: changes, fetchAllRecordZones: async () => ({}) },
    sharedCloudDatabase: { fetchRecordZoneChanges: changes,
      fetchAllRecordZones: async () => ({ zones: account.zones.shared.map((each) => ({ zoneID: each.zoneID })) }) }
  } as unknown as CKContainer;
  const cloudkit: CloudKitJS = { configure: () => {}, getDefaultContainer: () => container };
  const config = { container: "iCloud.x", apiToken: "T", environment: "development" as const, tilesBase: "https://tiles.example" };
  const cloud = new Cloud(async () => cloudkit, async () => config);
  const seen: unknown[][] = [];
  const core: Core = {
    maps: (rows) => { seen.push(rows); return account.core.riki_maps as unknown as Device; },
    map: (rows, id) => { seen.push([id, rows.length]); return account.core.riki_map as unknown as Portable; },
    style: (rows, mapID, styleID, catalog) => { seen.push([mapID, styleID, catalog]); return account.core.riki_style; }
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
  return { backend, seen, notify: () => notify({}), signIn: (identity: unknown) => signIn(identity), changes };
}

describe("WebBackend's reads", () => {
  it("says signed out, with the sign-in's standing, until an Apple Account is in", async () => {
    const { backend, signIn } = stack({ signedIn: false });
    expect(await backend.session()).toEqual({ ok: true, value: { standing: "signedOut" } });
    signIn({ nameComponents: { givenName: "Rita" } });
    await new Promise((resolve) => setTimeout(resolve));
    expect(await backend.session()).toEqual({ ok: true, value: { standing: "admitted", edits: false, device: "Rita", viewers: null } });
  });

  it("lets the person in by name, read-only", async () => {
    const answer = await stack().backend.session();
    expect(answer).toEqual({ ok: true, value: { standing: "admitted", edits: false, device: "Riki Tester", viewers: null } });
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
    expect(told).toHaveBeenCalled();
    await backend.map("M");
    expect(changes.mock.calls.length).toBeGreaterThan(before);
  });

  it("rejects, naming the file, while riki-core.wasm is not in the site", async () => {
    const { backend } = stack({ core: () => Promise.reject(new CoreMissing("/editor/riki-core.wasm")) });
    await expect(backend.maps()).rejects.toThrow("riki-core.wasm is not at /editor/riki-core.wasm");
  });

  it("keeps rejecting every write until step 4", async () => {
    const { backend } = stack();
    await expect(backend.change("M", null, { kind: "name", name: "x" })).rejects.toThrow("step 4");
    await expect(backend.newMap("x")).rejects.toThrow("step 4");
  });
});
