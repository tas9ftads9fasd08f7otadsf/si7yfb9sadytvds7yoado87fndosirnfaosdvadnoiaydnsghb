import types from "./mirror-types.json";

/** The CloudKit type of a field of the app's Core Data mirror. */
export type FieldType = "STRING" | "INT64" | "DOUBLE" | "TIMESTAMP" | "BYTES" | "REFERENCE" | "ASSET";

/**
 * Each entity's fields as CloudKit holds them, taken from the app's `RikiSchema`. 86 `MapDataIndex` and `MapDataChunk` are
 * the data zone's plain records, from `SharedDataZone.types`.
 */
export const MIRROR: Readonly<Record<string, Readonly<Record<string, FieldType>>>> = types as never;

/** What `SharedMapChange.schemaVersion` is in the app. */
export const CHANGE_SCHEMA_VERSION = 1;

/** BYTES fields that hold JSON, which the core reads and writes as text. */
const TEXT_BYTES: ReadonlySet<string> = new Set(["payload", "settings"]);

export const typeOfField = (entity: string, name: string): FieldType | undefined => MIRROR[entity]?.[name];

export const isTextBytes = (name: string) => TEXT_BYTES.has(name);

const CHUNK = 0x8000;

/** UTF-8 text as the base64 CloudKit JS takes for BYTES. */
export function bytesOfText(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let at = 0; at < bytes.length; at += CHUNK) binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  return btoa(binary);
}

/** The text of a BYTES value, which CloudKit JS answers as base64. */
export function textOfBytes(base64: string): string {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(base64), (each) => each.charCodeAt(0)));
  } catch {
    return base64;
  }
}
