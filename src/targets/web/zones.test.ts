import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import account from "../../../e2e/fixtures/cloud-account.json";
import type { CKContainer, CKDatabase, CKRecord, CKRecordList } from "./cloud";
import { indexedKeeping, MIRROR_ZONE, Zones, type Keeping } from "./zones";

// 76 zone changes by token, private mirror and shared zones, kept for offline
const assets = account.assets as Record<string, string>;
const fetcher = async (url: string | URL | Request) => new Response(assets[String(url)] ?? "", { status: 200 });

function memory(): Keeping {
  const kept = new Map<string, unknown>();
  return { load: async <T,>(key: string) => kept.get(key) as T | undefined, save: async (key, value) => { kept.set(key, structuredClone(value)); } };
}

function cloud(options: { privateRecords?: CKRecord[][]; down?: boolean } = {}) {
  const asked: { syncToken?: string }[] = [];
  const pages = [...(options.privateRecords ?? [account.zones.private[0]!.records as unknown as CKRecord[]])];
  const privateDB: CKDatabase = {
    fetchAllRecordZones: async () => ({}),
    fetchRecordZoneChanges: async ({ zones }) => {
      if (options.down) throw new Error("offline");
      asked.push({ syncToken: zones[0]!.syncToken });
      const records = pages.shift() ?? [];
      const more = pages.length > 0;
      return { zones: [{ zoneID: zones[0]!.zoneID, records, syncToken: `private-${asked.length}`, moreComing: more }] } as CKRecordList;
    }
  };
  const sharedDB: CKDatabase = {
    fetchAllRecordZones: async () => {
      if (options.down) throw new Error("offline");
      return { zones: account.zones.shared.map((each) => ({ zoneID: each.zoneID })) };
    },
    fetchRecordZoneChanges: async ({ zones }) => ({ zones: [{ zoneID: zones[0]!.zoneID,
      records: account.zones.shared[0]!.records as unknown as CKRecord[], syncToken: "shared-1" }] })
  };
  const container = { privateCloudDatabase: privateDB, sharedCloudDatabase: sharedDB } as unknown as CKContainer;
  return { container: async () => container, asked };
}

describe("Zones", () => {
  let keeping: Keeping;
  beforeEach(() => { keeping = memory(); });

  it("reads the mirror zone and the shared zones, leaving the encrypted secrets out", async () => {
    const { container } = cloud();
    const rows = await new Zones(container, keeping, fetcher).rows();
    expect(rows.map((row) => `${row.database}:${row.entity}:${row.id}`).sort()).toEqual([
      "private:SharedMap:own-tatras", "private:SharedMapLayer:own-tatras-layer", "shared:SharedMap:shared-doprava"]);
    expect(rows.find((row) => row.id === "shared-doprava")).toMatchObject({ owner: "_friki", zone: "share-doprava", tag: "s1" });
  });

  it("asks again from the token it kept, and takes a deletion out", async () => {
    const first = cloud();
    await new Zones(first.container, keeping, fetcher).rows();
    expect(first.asked[0]?.syncToken).toBeUndefined();
    const second = cloud({ privateRecords: [[{ recordName: "own-tatras-layer", deleted: true }]] });
    const rows = await new Zones(second.container, keeping, fetcher).rows();
    expect(second.asked[0]?.syncToken).toBe("private-1");
    expect(rows.map((row) => row.id)).not.toContain("own-tatras-layer");
    expect(rows.map((row) => row.id)).toContain("own-tatras");
  });

  it("follows moreComing until the zone is read", async () => {
    const [tatras, layer] = account.zones.private[0]!.records as unknown as CKRecord[];
    const { container, asked } = cloud({ privateRecords: [[tatras!], [layer!]] });
    const rows = await new Zones(container, keeping, fetcher).rows();
    expect(asked).toHaveLength(2);
    expect(rows.filter((row) => row.database === "private")).toHaveLength(2);
  });

  it("opens a map seen once from what it kept when CloudKit cannot be reached", async () => {
    await new Zones(cloud().container, keeping, fetcher).rows();
    const rows = await new Zones(cloud({ down: true }).container, keeping, fetcher).rows();
    expect(rows.map((row) => row.id).sort()).toEqual(["own-tatras", "own-tatras-layer", "shared-doprava"]);
  });

  it("fails when CloudKit cannot be reached and nothing was kept", async () => {
    await expect(new Zones(cloud({ down: true }).container, keeping, fetcher).rows()).rejects.toThrow("offline");
  });

  it("names the mirror zone as Core Data does", () => {
    expect(MIRROR_ZONE).toBe("com.apple.coredata.cloudkit.zone");
  });
});

describe("indexedKeeping", () => {
  it("keeps a value between two openings", async () => {
    await indexedKeeping("one").save("k", { a: 1 });
    expect(await indexedKeeping("one").load("k")).toEqual({ a: 1 });
    expect(await indexedKeeping("one").load("nothing")).toBeUndefined();
  });

  it("answers nothing when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", { open: () => { throw new Error("blocked"); } });
    await expect(indexedKeeping("two").load("k")).resolves.toBeUndefined();
    await expect(indexedKeeping("two").save("k", 1)).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
