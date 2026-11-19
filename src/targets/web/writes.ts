import type { CKBatchResult, CKDatabase, CKError, CKSave, ZoneID } from "./cloud";
import { bytesOfText, CHANGE_SCHEMA_VERSION, isTextBytes, typeOfField } from "./mirror";
import type { CoreRow, CoreWrite } from "./records";

/** A row was changed on the server since it was read: its change tag no longer fits. */
export class Conflict extends Error {
  constructor() {
    super("A row changed since it was read");
  }
}

/** One write to a zone: rows to save, each with the row it was read as, and rows to delete. */
export interface Plan {
  save: { write: CoreWrite; row?: CoreRow }[];
  remove: CoreRow[];
}

/** A row that changed, or appeared, since it was read; `ATOMIC_ERROR` only says another record of the batch failed. */
const CONFLICTS = ["CONFLICT", "EXISTS"];

/** A history row as the app writes one: its own id, time and schema version beside the core's fields. */
export function stamped(history: CoreWrite, now: Date = new Date()): CoreWrite {
  return { ...history, fields: { id: crypto.randomUUID().toUpperCase(), updatedAt: now.getTime(),
    schemaVersion: CHANGE_SCHEMA_VERSION, ...history.fields } };
}

/** The value as CloudKit holds a field of this type: text in BYTES is base64, a Bool is 0 or 1. */
function valueOf(name: string, type: string, value: unknown) {
  if (type === "BYTES") return typeof value === "string" && isTextBytes(name) ? bytesOfText(value) : value;
  if (type === "REFERENCE") return { recordName: String(value), action: "DELETE_SELF" };
  return typeof value === "boolean" ? Number(value) : value;
}

/** The fields a write changes; the rest of a row is left as the server has it. */
export function changedFields(write: CoreWrite, row?: CoreRow): string[] {
  return Object.keys(write.fields).filter((name) =>
    !row || JSON.stringify(write.fields[name] ?? null) !== JSON.stringify(row.fields[name] ?? null));
}

/** A write as a CloudKit record: `CD_` names, each field in its type, assets cleared. */
export function recordOf(write: CoreWrite, row: CoreRow | undefined, names: string[]): CKSave {
  const fields: CKSave["fields"] = {};
  for (const name of names) {
    const type = typeOfField(write.entity, name);
    if (!type) throw new Error(`The mirror has no field ${name} on ${write.entity}`);
    const value = write.fields[name] ?? null;
    fields[`CD_${name}`] = value === null ? { value: null } : { value: valueOf(name, type, value), type };
    if (row?.assets?.includes(name)) fields[`CD_${name}_ckAsset`] = { value: null };
  }
  if (!row) fields.CD_entityName = { value: write.entity, type: "STRING" };
  return { recordName: write.id, recordType: `CD_${write.entity}`, ...(row ? { recordChangeTag: row.tag } : {}), fields };
}

const codeOf = (error: CKError) => error.ckErrorCode ?? error.serverErrorCode ?? "";

/** A batch that failed is a conflict when a record changed meanwhile, else its first real cause. */
function check(saved: CKBatchResult) {
  if (!saved.hasErrors && !(saved.errors?.length)) return;
  const errors = saved.errors ?? [];
  if (errors.some((each) => CONFLICTS.includes(codeOf(each)))) throw new Conflict();
  const cause = errors.find((each) => codeOf(each) !== "ATOMIC_ERROR") ?? errors[0];
  throw new Error(cause?.reason ?? (cause ? codeOf(cause) : "CloudKit refused the change"));
}

/**
 * Saves and deletes the plan in one atomic batch to one zone, with the tags the rows were read at, which the server
 * checks for deletes as for updates; the new tags by record name.
 */
export async function write(db: CKDatabase, zone: ZoneID, plan: Plan): Promise<Map<string, string>> {
  const tags = new Map<string, string>();
  const batch = db.newRecordsBatch({ zoneID: zone, atomic: true });
  let operations = 0;
  for (const { write: each, row } of plan.save) {
    const names = changedFields(each, row);
    if (names.length === 0 && row) continue;
    const record = recordOf(each, row, names);
    if (row) batch.update(record);
    else batch.create(record);
    operations += 1;
  }
  for (const row of plan.remove) {
    batch.delete({ recordName: row.id, recordChangeTag: row.tag });
    operations += 1;
  }
  if (operations === 0) return tags;
  let saved: CKBatchResult;
  try {
    saved = await batch.commit();
  } catch (error) {
    // A request refused as a whole is a CKError that is thrown.
    if (CONFLICTS.includes(codeOf(error as CKError))) throw new Conflict();
    throw error;
  }
  check(saved);
  for (const each of saved.records ?? []) if (each.recordName && each.recordChangeTag) tags.set(each.recordName, each.recordChangeTag);
  return tags;
}
