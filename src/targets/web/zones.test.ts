import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import account from "../../../e2e/fixtures/cloud-account.json";
import type { CKContainer, CKError, CKReading, CKRecord, CKRecordList, CKZoneChanges } from "./cloud";
import { Progress } from "./progress";
import { indexedKeeping, MIRROR_ZONE, OWN_SHARE_PREFIX, Zones, type Keeping } from "./zones";

// 76 zone changes by token, private mirror and shared zones, kept for offline
const assets = account.assets as Record<string, string>;
const fetcher = async (url: string | URL | Request) => new Response(assets[String(url)] ?? "", { status: 200 });

function memory(): Keeping {
  const kept = new Map<string, unknown>();
  return { load: async <T,>(key: string) => kept.get(key) as T | undefined, save: async (key, value) => { kept.set(key, structuredClone(value)); } };
}

/** A zone's options as the library takes them; one without a zoneID is the server's bad request, as `{zones}` was. */
const zoneOf = (options: CKZoneChanges | CKZoneChanges[]): CKZoneChanges => {
  const [zone] = [options].flat();
  if (!zone?.zoneID) throw Object.assign(new Error("zoneID is required"), { ckErrorCode: "BAD_REQUEST" });
  return zone;
};

const OWN = account.zones.private[1]!;
const OWN_ZONE = OWN.zoneID.zoneName;

/** `own` names the private share zones the person's database lists, from the fixture's; the mirror's `privateRecords` are pages. */
function cloud(options: { privateRecords?: CKRecord[][]; down?: boolean; errors?: CKError[][]; own?: string[] } = {}) {
  const asked: { syncToken?: string; zone?: string }[] = [];
  const errors = [...(options.errors ?? [])];
  const pages = [...(options.privateRecords ?? [account.zones.private[0]!.records as unknown as CKRecord[]])];
  const privateDB: CKReading = {
    // The person's database lists the zones Core Data made beside the others, which are not the site's to read.
    fetchAllRecordZones: async () => {
      if (options.down) throw new Error("offline");
      return { zones: [{ zoneID: { zoneName: "_defaultZone", ownerRecordName: "_me" } },
        { zoneID: { zoneName: MIRROR_ZONE, ownerRecordName: "_me" } }, { zoneID: { zoneName: "role-editors", ownerRecordName: "_me" } },
        ...(options.own ?? []).map((zoneName) => ({ zoneID: { zoneName, ownerRecordName: "_me" } }))] };
    },
    fetchRecordZoneChanges: async (given) => {
      if (options.down) throw new Error("offline");
      const zone = zoneOf(given);
      asked.push({ syncToken: zone.syncToken, zone: zone.zoneID.zoneName });
      if (zone.zoneID.zoneName.startsWith(OWN_SHARE_PREFIX)) {
        if (!options.own?.includes(zone.zoneID.zoneName)) {
          return { zones: [], errors: [{ ckErrorCode: "ZONE_NOT_FOUND", zoneID: zone.zoneID }], hasErrors: true } as CKRecordList;
        }
        return { zones: [{ zoneID: zone.zoneID, records: OWN.records as unknown as CKRecord[], syncToken: `own-${asked.length}` }] };
      }
      // A zone that failed is in `errors`, not in `zones`, as the library splits the answer.
      const failed = errors.shift();
      if (failed) return { zones: [], errors: failed, hasErrors: true } as CKRecordList;
      const records = pages.shift() ?? [];
      const more = pages.length > 0;
      return { zones: [{ zoneID: zone.zoneID, records, syncToken: `private-${asked.length}`, moreComing: more }] } as CKRecordList;
    }
  };
  const sharedDB: CKReading = {
    fetchAllRecordZones: async () => {
      if (options.down) throw new Error("offline");
      return { zones: account.zones.shared.map((each) => ({ zoneID: each.zoneID })) };
    },
    fetchRecordZoneChanges: async (given) => ({ zones: [{ zoneID: zoneOf(given).zoneID,
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
      "private:SharedMap:own-tatras", "private:SharedMapChange:change-phone-1", "private:SharedMapLayer:own-tatras-layer",
      "shared:Share:Share-doprava", "shared:SharedMap:shared-doprava", "shared:SharedMapMember:member-marek",
      "shared:SharedMapMember:member-me"]);
    expect(rows.find((row) => row.id === "shared-doprava")).toMatchObject({ owner: "_friki", zone: "share-doprava", tag: "s1" });
  });

  // 137 the loading screen says how many zones there are, how many are read, and what they held
  it("tells the zones to read and read, each record and each file it fetched", async () => {
    const { container } = cloud();
    const progress = new Progress();
    const told: string[] = [];
    progress.listen((loading) => told.push(`${loading.zones?.done ?? "-"}/${loading.zones?.total ?? "-"}`));
    await new Zones(container, keeping, fetcher, progress).rows();
    expect([...new Set(told)]).toEqual(["-/-", "0/1", "1/1", "1/2", "2/2"]);
    progress.listen((loading) => expect(loading).toEqual({ records: 8, files: 2, zones: { done: 2, total: 2 } }));
  });

  // 108 a shared zone's share and its member rows are kept with the map, so the core can read who holds it
  it("keeps a zone's share and member rows beside its map, in the zone they came from", async () => {
    const { container } = cloud();
    const rows = await new Zones(container, keeping, fetcher).rows();
    const share = rows.find((row) => row.entity === "Share");
    expect(share).toMatchObject({ database: "shared", zone: "share-doprava", owner: "_friki" });
    expect((share?.fields.participants as unknown[]).length).toBe(3);
    const members = rows.filter((row) => row.entity === "SharedMapMember");
    expect(members.map((row) => [row.fields.participantID, row.fields.roleRaw, row.fields.map])).toEqual([
      ["_me", "editor", "shared-doprava"], ["_marek", "reader", "shared-doprava"]]);
    const again = await new Zones(async () => { throw new Error("offline"); }, keeping, fetcher).rows();
    expect(again.map((row) => row.id)).toEqual(expect.arrayContaining(["Share-doprava", "member-me"]));
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

  // 87 bug: the site passed `{zones: [...]}`, which the library turns into `{zones: [{}]}` and the server refuses
  it("asks for a zone with its own options, as the library takes them", async () => {
    const asked: unknown[] = [];
    const db: CKReading = { fetchAllRecordZones: async () => ({}), fetchRecordZoneChanges: async (given) => {
      asked.push(given);
      return { zones: [{ zoneID: zoneOf(given).zoneID, records: [], syncToken: "t" }] };
    } };
    const container = { privateCloudDatabase: db, sharedCloudDatabase: db } as unknown as CKContainer;
    await new Zones(async () => container, keeping, fetcher).rows();
    expect(asked[0]).toEqual({ zoneID: { zoneName: MIRROR_ZONE } });
    expect(asked[0]).not.toHaveProperty("zones");
  });

  // 87 bug: a zone's failure comes in `errors`, so a missing mirror zone was read as an empty answer by luck
  it("takes a mirror zone that is not there yet as no rows, not as a failure", async () => {
    const { container } = cloud({ errors: [[{ ckErrorCode: "ZONE_NOT_FOUND", serverErrorCode: "ZONE_NOT_FOUND",
      zoneID: { zoneName: MIRROR_ZONE } }]] });
    const rows = await new Zones(container, keeping, fetcher).rows();
    expect(rows.filter((row) => row.database === "private")).toEqual([]);
  });

  it("forgets a token the server no longer takes and reads the zone again from the start", async () => {
    await new Zones(cloud().container, keeping, fetcher).rows();
    const second = cloud({ errors: [[{ ckErrorCode: "BAD_REQUEST", serverErrorCode: "BAD_REQUEST", reason: "Invalid sync token",
      zoneID: { zoneName: MIRROR_ZONE } }]] });
    const rows = await new Zones(second.container, keeping, fetcher).rows();
    expect(second.asked.map((each) => each.syncToken)).toEqual(["private-1", undefined]);
    expect(rows.map((row) => row.id)).toContain("own-tatras");
  });

  it("does not hide any other error of a zone", async () => {
    const { container } = cloud({ errors: [[{ ckErrorCode: "QUOTA_EXCEEDED", reason: "iCloud is full", zoneID: { zoneName: MIRROR_ZONE } }]] });
    await expect(new Zones(container, memory(), fetcher).rows()).rejects.toThrow("iCloud is full");
  });

  it("opens a map seen once from what it kept when CloudKit cannot be reached", async () => {
    await new Zones(cloud().container, keeping, fetcher).rows();
    const rows = await new Zones(cloud({ down: true }).container, keeping, fetcher).rows();
    expect(rows.map((row) => row.id).sort()).toEqual(["Share-doprava", "change-phone-1", "member-marek",
      "member-me", "own-tatras", "own-tatras-layer", "shared-doprava"]);
  });

  it("fails when CloudKit cannot be reached and nothing was kept", async () => {
    await expect(new Zones(cloud({ down: true }).container, keeping, fetcher).rows()).rejects.toThrow("offline");
  });

  // 116 bug: a map the person shares moves to a private zone of its own, which the site never read
  it("reads the private zone made for a map the person shares, with its share and members", async () => {
    const { container, asked } = cloud({ own: [OWN_ZONE] });
    const rows = await new Zones(container, keeping, fetcher).rows();
    const inZone = rows.filter((row) => row.zone === OWN_ZONE);
    expect(inZone.map((row) => row.entity).sort()).toEqual(["Share", "SharedMap", "SharedMapLayer", "SharedMapMember", "SharedMapMember"]);
    expect(inZone.every((row) => row.database === "private" && row.owner === undefined)).toBe(true);
    expect(inZone.find((row) => row.entity === "SharedMap")).toMatchObject({ id: "own-beskydy", tag: "o1" });
    const share = inZone.find((row) => row.entity === "Share");
    expect((share?.fields.participants as unknown[]).length).toBe(3);
    expect(asked.map((each) => each.zone)).toEqual([MIRROR_ZONE, OWN_ZONE]);
  });

  // 116 the other zones of the private database stay unread
  it("reads only the mirror zone and the share zones of the private database", async () => {
    const { container, asked } = cloud({ own: [OWN_ZONE] });
    await new Zones(container, keeping, fetcher).rows();
    expect(asked.map((each) => each.zone)).not.toContain("_defaultZone");
    expect(asked.map((each) => each.zone)).not.toContain("role-editors");
  });

  // 116 a share zone is kept by its own token
  it("asks a share zone again from the token it kept", async () => {
    await new Zones(cloud({ own: [OWN_ZONE] }).container, keeping, fetcher).rows();
    const second = cloud({ own: [OWN_ZONE] });
    await new Zones(second.container, keeping, fetcher).rows();
    expect(second.asked.map((each) => [each.zone, each.syncToken])).toEqual([[MIRROR_ZONE, "private-1"], [OWN_ZONE, "own-2"]]);
  });

  // 116 sharing stopped: the zone is gone and the map's rows are in the mirror zone again, once
  it("drops the rows of a share zone that is gone, as the mirror zone brings them back", async () => {
    await new Zones(cloud({ own: [OWN_ZONE] }).container, keeping, fetcher).rows();
    const back = OWN.records.filter((each) => ["own-beskydy", "own-beskydy-layer"].includes(each.recordName)) as unknown as CKRecord[];
    const rows = await new Zones(cloud({ privateRecords: [back] }).container, keeping, fetcher).rows();
    expect(rows.filter((row) => row.zone === OWN_ZONE)).toEqual([]);
    expect(rows.filter((row) => row.id === "own-beskydy").map((row) => row.zone)).toEqual([MIRROR_ZONE]);
    const offline = await new Zones(cloud({ down: true }).container, keeping, fetcher).rows();
    expect(offline.filter((row) => row.zone === OWN_ZONE)).toEqual([]);
  });

  // 116 a zone name that returns does not take the old token
  it("reads a share zone that comes back from the start, not from the token of its first time", async () => {
    await new Zones(cloud({ own: [OWN_ZONE] }).container, keeping, fetcher).rows();
    await new Zones(cloud().container, keeping, fetcher).rows();
    const again = cloud({ own: [OWN_ZONE] });
    const rows = await new Zones(again.container, keeping, fetcher).rows();
    expect(again.asked.find((each) => each.zone === OWN_ZONE)?.syncToken).toBeUndefined();
    expect(rows.filter((row) => row.zone === OWN_ZONE)).toHaveLength(5);
  });

  // 116 a zone may go between the list and its read
  it("takes a listed share zone that is not there any more as no rows, not as a failure", async () => {
    const stale = cloud({ own: [OWN_ZONE] });
    await new Zones(stale.container, keeping, fetcher).rows();
    const listed = cloud({ own: [OWN_ZONE] });
    const container = await listed.container();
    // The list was taken a moment before the zone went.
    const rows = await new Zones(async () => ({ ...container, privateCloudDatabase: { ...container.privateCloudDatabase,
      fetchRecordZoneChanges: async (given: CKZoneChanges | CKZoneChanges[]) => zoneOf(given).zoneID.zoneName === OWN_ZONE
        ? { zones: [], errors: [{ ckErrorCode: "ZONE_NOT_FOUND", zoneID: zoneOf(given).zoneID }] } as CKRecordList
        : container.privateCloudDatabase.fetchRecordZoneChanges(given) } }) as CKContainer, keeping, fetcher).rows();
    expect(rows.filter((row) => row.zone === OWN_ZONE)).toEqual([]);
  });

  // 116 an owner-shared map opens offline as the others
  it("opens the maps a person shares from what it kept when CloudKit cannot be reached", async () => {
    await new Zones(cloud({ own: [OWN_ZONE] }).container, keeping, fetcher).rows();
    const rows = await new Zones(cloud({ down: true }).container, keeping, fetcher).rows();
    expect(rows.filter((row) => row.zone === OWN_ZONE).map((row) => row.id).sort()).toEqual(["Share-beskydy", "member-jana",
      "member-petr", "own-beskydy", "own-beskydy-layer"]);
  });

  it("names the mirror zone as Core Data does", () => {
    expect(MIRROR_ZONE).toBe("com.apple.coredata.cloudkit.zone");
    expect(OWN_SHARE_PREFIX).toBe("com.apple.coredata.cloudkit.share.");
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
