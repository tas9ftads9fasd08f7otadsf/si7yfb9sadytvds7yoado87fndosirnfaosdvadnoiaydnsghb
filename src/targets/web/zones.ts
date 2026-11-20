import type { CKContainer, CKError, CKReading, CKRecord, ZoneID } from "./cloud";
import { READ_TYPES, SHARE_TYPE, rowOf, shareRowOf, type CoreRow } from "./records";

/** The mirror's zone in the person's private database. */
export const MIRROR_ZONE = "com.apple.coredata.cloudkit.zone";

/** Where rows and tokens are kept between visits. */
export interface Keeping {
  load<T>(key: string): Promise<T | undefined>;
  save(key: string, value: unknown): Promise<void>;
}

/** IndexedDB; with none, nothing is kept and the maps are read afresh. */
export function indexedKeeping(name = "riki-site"): Keeping {
  const opened = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const asked = indexedDB.open(name, 1);
    asked.onupgradeneeded = () => asked.result.createObjectStore("kept");
    asked.onsuccess = () => resolve(asked.result);
    asked.onerror = () => reject(asked.error);
  });
  const run = async <T>(mode: IDBTransactionMode, ask: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await opened();
    try {
      return await new Promise<T>((resolve, reject) => {
        const asked = ask(db.transaction("kept", mode).objectStore("kept"));
        asked.onsuccess = () => resolve(asked.result);
        asked.onerror = () => reject(asked.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    load: async <T>(key: string) => {
      try {
        return await run<T | undefined>("readonly", (store) => store.get(key));
      } catch {
        return undefined;
      }
    },
    save: async (key, value) => {
      try {
        await run("readwrite", (store) => store.put(value, key));
      } catch { /* read afresh next time */ }
    }
  };
}

/** A sync token the server no longer takes comes back as a bad request that names the token. */
const isExpired = (error: CKError) =>
  error.ckErrorCode === "BAD_REQUEST" && /token/i.test(error.reason ?? "");

interface Kept {
  token?: string;
  rows: Record<string, CoreRow>;
}

const zoneKey = (database: string, zone: ZoneID) => `${database}/${zone.ownerRecordName ?? ""}/${zone.zoneName}`;

/** Reads the person's zones by change token and keeps them, so a map seen once opens offline. */
export class Zones {
  constructor(private readonly container: () => Promise<CKContainer>, private readonly keeping: Keeping,
    private readonly fetcher: typeof fetch = fetch) {}

  /** Every row the site reads, brought up to date; the kept ones when CloudKit cannot be reached. */
  async rows(): Promise<CoreRow[]> {
    const rows: CoreRow[] = [];
    try {
      const { privateCloudDatabase, sharedCloudDatabase } = await this.container();
      rows.push(...await this.sync("private", privateCloudDatabase, [{ zoneName: MIRROR_ZONE }]));
      const shared = (await sharedCloudDatabase.fetchAllRecordZones()).zones ?? [];
      await this.keeping.save("shared/zones", shared.map((each) => each.zoneID));
      rows.push(...await this.sync("shared", sharedCloudDatabase, shared.map((each) => each.zoneID)));
    } catch (error) {
      const offline = await this.kept();
      if (offline.length === 0) throw error;
      return offline;
    }
    return rows;
  }

  private async kept(): Promise<CoreRow[]> {
    const zones = [{ database: "private", zone: { zoneName: MIRROR_ZONE } },
      ...((await this.keeping.load<ZoneID[]>("shared/zones")) ?? []).map((zone) => ({ database: "shared", zone }))];
    const all = await Promise.all(zones.map(({ database, zone }) =>
      this.keeping.load<Kept>(zoneKey(database, zone))));
    return all.flatMap((each) => Object.values(each?.rows ?? {}));
  }

  private async sync(database: "private" | "shared", db: CKReading, zones: ZoneID[]): Promise<CoreRow[]> {
    const out: CoreRow[] = [];
    for (const zone of zones) {
      const key = zoneKey(database, zone);
      let kept: Kept = (await this.keeping.load<Kept>(key)) ?? { rows: {} };
      let more = true;
      let restarted = false;
      while (more) {
        const answer = await db.fetchRecordZoneChanges({ zoneID: zone, ...(kept.token ? { syncToken: kept.token } : {}) });
        const failed = (answer.errors ?? []).find((each) => each.zoneID?.zoneName === zone.zoneName || !each.zoneID);
        if (failed) {
          // No mirror zone yet is no rows; a token the server has forgotten is read again from the start.
          if (failed.ckErrorCode === "ZONE_NOT_FOUND") {
            kept = { rows: {} };
            await this.keeping.save(key, kept);
            break;
          }
          if (kept.token && !restarted && isExpired(failed)) {
            restarted = true;
            kept = { rows: {} };
            continue;
          }
          throw new Error(failed.reason ?? failed.ckErrorCode ?? "CloudKit refused the zone");
        }
        const got = answer.zones?.find((each) => each.zoneID.zoneName === zone.zoneName) ?? answer.zones?.[0];
        for (const record of got?.records ?? []) await this.take(kept, record, { database, zone: zone.zoneName,
          owner: zone.ownerRecordName });
        kept.token = got?.syncToken ?? kept.token;
        more = got?.moreComing === true;
        await this.keeping.save(key, kept);
      }
      out.push(...Object.values(kept.rows));
    }
    return out;
  }

  private async take(kept: Kept, record: CKRecord, where: Pick<CoreRow, "database" | "zone" | "owner">) {
    if (record.deleted) {
      delete kept.rows[record.recordName];
    } else if (record.recordType === SHARE_TYPE) {
      kept.rows[record.recordName] = shareRowOf(record, where);
    } else if (READ_TYPES.includes(record.recordType ?? "")) {
      kept.rows[record.recordName] = await rowOf(record, where, this.fetcher);
    }
  }
}
