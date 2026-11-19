import { describe, expect, it } from "vitest";
import { schemaRefusal } from "../../../e2e/deployed-schema.mjs";
import { MIRROR, textOfBytes } from "./mirror";
import type { CoreRow, CoreWrite } from "./records";
import { recordOf, stamped } from "./writes";

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

  it("sends a reference as one, and a cleared field as no value", () => {
    const saved = everything({ entity: "SharedMapChange", id: "c", fields: { map: "own-tatras", payload: null } });
    expect(saved.fields.CD_map).toEqual({ value: { recordName: "own-tatras", action: "DELETE_SELF" }, type: "REFERENCE" });
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

  it("is accepted, for every field of every entity, by the schema the mock checks", () => {
    for (const [entity, fields] of Object.entries(MIRROR)) {
      const sample = { STRING: "x", INT64: 1, DOUBLE: 1.5, TIMESTAMP: 1789000000000, BYTES: "e30=", REFERENCE: "r" } as const;
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
