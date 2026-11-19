// Refuses what a deployed CloudKit schema does: unknown types and fields, and values of another type.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "targets",
  "web", "mirror-types.json"), "utf8"));

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const fits = {
  STRING: (value) => typeof value === "string",
  INT64: (value) => Number.isInteger(value),
  DOUBLE: (value) => typeof value === "number",
  TIMESTAMP: (value) => Number.isFinite(value),
  BYTES: (value) => typeof value === "string" && BASE64.test(value),
  REFERENCE: (value) => typeof value?.recordName === "string"
};

/** Why the schema refuses this record to be saved, or null. */
export function schemaRefusal(record) {
  const entity = String(record.recordType ?? "").replace(/^CD_/, "");
  const fields = TYPES[entity];
  if (!fields) return `Unknown record type ${record.recordType}`;
  for (const [name, field] of Object.entries(record.fields ?? {})) {
    const own = name.replace(/^CD_/, "").replace(/_ckAsset$/, "");
    const type = fields[own];
    if (!type) return `Unknown field ${name} on ${record.recordType}`;
    if (field.value === null) continue;
    if (name.endsWith("_ckAsset")) continue;
    if (field.type !== type) return `Field ${name} is ${type}, not ${field.type}`;
    if (!fits[type](field.value)) return `Field ${name}'s value is not a ${type}`;
  }
  return null;
}
