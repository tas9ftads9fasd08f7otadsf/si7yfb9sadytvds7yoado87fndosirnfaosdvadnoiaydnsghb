import type { CKDatabase, CKSave, CKSaved, ZoneID } from "./cloud";
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

const CONFLICTS = ["CONFLICT", "BATCH_ERROR"];

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

const refusal = (saved: CKSaved) => saved.records?.find((each) => each.serverErrorCode);

function check(saved: CKSaved) {
  const refused = refusal(saved);
  if (!refused) return;
  if (saved.records?.some((each) => CONFLICTS.includes(each.serverErrorCode ?? ""))) throw new Conflict();
  throw new Error(refused.reason ?? refused.serverErrorCode);
}

const asked = async (call: () => Promise<CKSaved>): Promise<CKSaved> => {
  try {
    return await call();
  } catch (error) {
    const code = (error as { ckErrorCode?: string; serverErrorCode?: string }).ckErrorCode
      ?? (error as { serverErrorCode?: string }).serverErrorCode;
    if (CONFLICTS.includes(code ?? "")) throw new Conflict();
    throw error;
  }
};

/**
 * Saves the plan to one zone, atomically, with the tags the rows were read at; the new tags by record name.
 * CloudKit JS has no call that saves and deletes together, so the deletes follow the saves.
 */
export async function write(db: CKDatabase, zone: ZoneID, plan: Plan): Promise<Map<string, string>> {
  const tags = new Map<string, string>();
  const records = plan.save.flatMap(({ write: each, row }) => {
    const names = changedFields(each, row);
    return names.length === 0 && row ? [] : [recordOf(each, row, names)];
  });
  if (records.length > 0) {
    const saved = await asked(() => db.saveRecords(records, { zoneID: zone, atomic: true }));
    check(saved);
    for (const each of saved.records ?? []) if (each.recordName && each.recordChangeTag) tags.set(each.recordName, each.recordChangeTag);
  }
  if (plan.remove.length > 0) {
    check(await asked(() => db.deleteRecords(plan.remove.map((row) => ({ recordName: row.id, recordChangeTag: row.tag })),
      { zoneID: zone, atomic: true })));
  }
  return tags;
}
