import { describe, expect, it } from "vitest";
import { DEPLOYED, schemaRefusal } from "../../../e2e/deployed-schema.mjs";
import { MIRROR, textOfBytes } from "./mirror";
import type { CoreRow, CoreWrite } from "./records";
import type { CKBatch, CKBatchResult, CKDatabase, CKSave } from "./cloud";
import { Conflict, recordOf, stamped, write } from "./writes";

// 84 bug: the site sent every string as STRING, and its history row lacked id, time and version
const everything = (write: CoreWrite) => recordOf(write, undefined, Object.keys(write.fields));

describe("a write as the app's mirror holds it", () => {
  it("sends each field in its CloudKit type", () => {
    const saved = everything({ entity: "SharedMap", id: "m", fields: { id: "6F1E2A10-0000-4000-8000-000000000001",
      name: "Tatras", requiresUnlock: true, schemaVersion: 1, updatedAt: 1789000000000, rank: "a" } });
    expect(saved.fields).toEqual({
      CD_id: { value: "6F1E2A10-0000-4000-8000-000000000001", type: "STRING" }, CD_name: { value: "Tatras", type: "STRING" },
      CD_requiresUnlock: { value: 1, type: "INT64" }, CD_schemaVersion: { value: 1, type: "INT64" },
      CD_updatedAt: { value: 1789000000000, type: "TIMESTAMP" }, CD_rank: { value: "a", type: "STRING" },
      CD_entityName: { value: "SharedMap", type: "STRING" } });
  });

  it("sends the JSON of a payload as base64 bytes, whatever the text holds", () => {
    const json = "{\"name\":\"Ľadové plesá — 山\"}";
    const field = everything({ entity: "SharedMapLayer", id: "l", fields: { payload: json } }).fields.CD_payload!;
    expect(field.type).toBe("BYTES");
    expect(textOfBytes(field.value as string)).toBe(json);
    expect(field.value).not.toBe(json);
  });

  // 163 bug: the link to a row's map went as a REFERENCE, where CloudKit holds the map's record name as a STRING
  it("sends a row's link to its map as the string CloudKit holds, and a cleared field as no value", () => {
    const saved = everything({ entity: "SharedMapChange", id: "c", fields: { map: "own-tatras", payload: null } });
    expect(saved.fields.CD_map).toEqual({ value: "own-tatras", type: "STRING" });
    expect(saved.fields.CD_payload).toEqual({ value: null });
  });

  it("names the entity only on a row it creates", () => {
    const row = { entity: "SharedMap", id: "m", tag: "t", database: "private", zone: "z", fields: {} } as CoreRow;
    const write = { entity: "SharedMap", id: "m", fields: { name: "x" } };
    expect(recordOf(write, row, ["name"]).fields.CD_entityName).toBeUndefined();
    expect(recordOf(write, undefined, ["name"]).fields.CD_entityName).toEqual({ value: "SharedMap", type: "STRING" });
  });

  it("refuses a field the mirror does not have, as a deployed schema does", () => {
    expect(() => everything({ entity: "SharedMapLayer", id: "l", fields: { name: "Trails" } }))
      .toThrow("The mirror has no field name on SharedMapLayer");
    expect(() => everything({ entity: "Nope", id: "x", fields: { name: "x" } })).toThrow("no field name on Nope");
  });

  // 163 the field types are the container's own, so a write the mock takes CloudKit takes too
  it("types every field as the deployed schema does", () => {
    for (const [entity, fields] of Object.entries(MIRROR)) {
      const deployed = DEPLOYED[entity.startsWith("MapData") ? entity : `CD_${entity}`];
      expect(deployed, entity).toBeDefined();
      for (const [name, type] of Object.entries(fields)) {
        expect(`${entity}.${name} ${deployed?.[entity.startsWith("MapData") ? name : `CD_${name}`]}`)
          .toBe(`${entity}.${name} ${type}`);
      }
    }
  });

  it("is accepted, for every field of every entity, by the schema the mock checks", () => {
    // 86 the data zone's plain records are not mirror rows: they carry no CD_ prefix
    for (const [entity, fields] of Object.entries(MIRROR).filter(([each]) => !each.startsWith("MapData"))) {
      const sample = { STRING: "x", INT64: 1, DOUBLE: 1.5, TIMESTAMP: 1789000000000, BYTES: "e30=", REFERENCE: "r", ASSET: {} } as const;
      const write = { entity, id: "r", fields: Object.fromEntries(Object.entries(fields).map(([name, type]) => [name, sample[type]])) };
      expect(schemaRefusal(everything(write))).toBeNull();
    }
  });
});

describe("a history row", () => {
  const history: CoreWrite = { entity: "SharedMapChange", id: "c", refs: ["map"], fields: { map: "own-tatras", payload: "{}" } };

  it("is stamped with an id, the time in milliseconds and the schema version the app writes", () => {
    const row = stamped(history, new Date(1789000000123));
    expect(row.fields).toEqual({ id: expect.stringMatching(/^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/),
      updatedAt: 1789000000123, schemaVersion: 1, map: "own-tatras", payload: "{}" });
  });

  it("keeps what the core already set", () => {
    const row = stamped({ ...history, fields: { ...history.fields, id: "MINE", schemaVersion: 2 } });
    expect(row.fields).toMatchObject({ id: "MINE", schemaVersion: 2 });
  });
});

describe("the schema the mock checks", () => {
  const record = (fields: Record<string, { value: unknown; type?: string }>) => ({ recordType: "CD_SharedMapChange", fields });

  it("refuses what a deployed schema refuses", () => {
    expect(schemaRefusal(record({ CD_payload: { value: "{}", type: "STRING" } }))).toBe("Field CD_payload is BYTES, not STRING");
    expect(schemaRefusal(record({ CD_payload: { value: "{\"a\":1}", type: "BYTES" } }))).toContain("not a BYTES");
    expect(schemaRefusal(record({ CD_updatedAt: { value: "now", type: "TIMESTAMP" } }))).toContain("not a TIMESTAMP");
    expect(schemaRefusal(record({ CD_author: { value: "x", type: "STRING" } }))).toBe("Unknown field CD_author on CD_SharedMapChange");
    expect(schemaRefusal({ recordType: "CD_Nope", fields: {} })).toBe("Unknown record type CD_Nope");
  });

  it("takes a cleared field and a cleared asset", () => {
    expect(schemaRefusal(record({ CD_payload: { value: null }, CD_payload_ckAsset: { value: null } }))).toBeNull();
  });
});

// 87 bug: the site read a refused batch as saved, deleted without its tag, and called codes the library has not got
interface Op { kind: "create" | "update" | "delete"; record: unknown }

function database(answer: CKBatchResult | Error = { records: [{ recordName: "l", recordChangeTag: "t2" }] }) {
  const made: { options?: unknown; ops: Op[]; commits: number } = { ops: [], commits: 0 };
  const db = { newRecordsBatch(options: unknown): CKBatch {
    made.options = options;
    const batch: CKBatch = {
      create: (record: CKSave) => { made.ops.push({ kind: "create", record }); return batch; },
      update: (record: CKSave) => { made.ops.push({ kind: "update", record }); return batch; },
      delete: (record) => { made.ops.push({ kind: "delete", record }); return batch; },
      commit: async () => { made.commits += 1; if (answer instanceof Error) throw answer; return answer; }
    };
    return batch;
  } } as unknown as CKDatabase;
  return { db, made };
}

const row = (id: string, tag: string) => ({ entity: "SharedMapLayer", id, tag, database: "private", zone: "z", fields: { layerJSON: "{}" } }) as CoreRow;
const zone = { zoneName: "z" };

describe("a write through a records batch", () => {
  it("saves and deletes in one atomic batch, a delete carrying the tag it was read at", async () => {
    const { db, made } = database();
    const tags = await write(db, zone, { save: [
      { write: { entity: "SharedMapLayer", id: "l", fields: { layerJSON: "{\"a\":1}" } }, row: row("l", "t1") },
      { write: { entity: "SharedMapChange", id: "c", fields: { payload: "{}" } } }],
    remove: [row("gone", "g7")] });
    expect(made.options).toEqual({ zoneID: zone, atomic: true });
    expect(made.commits).toBe(1);
    expect(made.ops.map((op) => op.kind)).toEqual(["update", "create", "delete"]);
    expect(made.ops[2]!.record).toEqual({ recordName: "gone", recordChangeTag: "g7" });
    expect(tags.get("l")).toBe("t2");
  });

  it("sends nothing when no field changed and nothing is removed", async () => {
    const { db, made } = database();
    await write(db, zone, { save: [{ write: { entity: "SharedMapLayer", id: "l", fields: { layerJSON: "{}" } }, row: row("l", "t1") }], remove: [] });
    expect(made.commits).toBe(0);
  });

  it("reads a refused batch as a conflict when a record changed, though the other records only say ATOMIC_ERROR", async () => {
    const { db } = database({ records: [], hasErrors: true, errors: [
      { recordName: "c", ckErrorCode: "ATOMIC_ERROR", serverErrorCode: "ATOMIC_ERROR" },
      { recordName: "l", ckErrorCode: "CONFLICT", serverErrorCode: "CONFLICT" }] });
    await expect(write(db, zone, { save: [{ write: { entity: "SharedMapLayer", id: "l", fields: { layerJSON: "x" } }, row: row("l", "t1") }], remove: [] }))
      .rejects.toBeInstanceOf(Conflict);
  });

  it("reads a record that exists already, or a delete whose tag is stale, as a conflict", async () => {
    for (const code of ["EXISTS", "CONFLICT"]) {
      const { db } = database({ records: [], hasErrors: true, errors: [{ ckErrorCode: code, serverErrorCode: code }] });
      await expect(write(db, zone, { save: [], remove: [row("gone", "g7")] })).rejects.toBeInstanceOf(Conflict);
    }
  });

  it("throws the cause of any other failure, not the collateral one", async () => {
    const { db } = database({ records: [], hasErrors: true, errors: [
      { ckErrorCode: "ATOMIC_ERROR", serverErrorCode: "ATOMIC_ERROR", reason: "ATOMIC_ERROR" },
      { ckErrorCode: "UNKNOWN_ERROR", serverErrorCode: "SOME_NEW_CODE", reason: "The server has a new code" }] });
    await expect(write(db, zone, { save: [], remove: [row("gone", "g7")] })).rejects.toThrow("The server has a new code");
  });

  it("does not call the saved records saved when errors came back with none of them", async () => {
    const { db } = database({ hasErrors: true, errors: [{ ckErrorCode: "QUOTA_EXCEEDED", serverErrorCode: "QUOTA_EXCEEDED", reason: "iCloud is full" }] });
    await expect(write(db, zone, { save: [], remove: [row("gone", "g7")] })).rejects.toThrow("iCloud is full");
  });

  it("reads a request refused as a whole for a conflict as one", async () => {
    const { db } = database(Object.assign(new Error("x"), { ckErrorCode: "CONFLICT" }));
    await expect(write(db, zone, { save: [], remove: [row("gone", "g7")] })).rejects.toBeInstanceOf(Conflict);
  });
});
