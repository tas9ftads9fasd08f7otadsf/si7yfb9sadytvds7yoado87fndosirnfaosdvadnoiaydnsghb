import type { CoreRow } from "./records";

/** The payload key rikimaps 3656 seals a map's header keys under. */
export const SEALED_FIELD = "rikiSealedKeys";
const VERSION = "1:";
const INFO = new TextEncoder().encode("riki-map-keys-1");

type Headers = Record<string, Record<string, string>>;

/** The keys sealed with the owner's record name and the map's id, as the app's MapKeysSeal does. */
export async function openSealed(text: string, owner: string, mapID: string): Promise<Headers | null> {
  if (!text.startsWith(VERSION) || !owner) return null;
  try {
    const combined = Uint8Array.from(atob(text.slice(VERSION.length)), (char) => char.charCodeAt(0));
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(owner), "HKDF", false,
      ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode(mapID.toLowerCase()), info: INFO },
      material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, key,
      combined.slice(12));
    return JSON.parse(new TextDecoder().decode(plain)) as Headers;
  } catch {
    return null;
  }
}

/** Every map row's opened keys, by host; a private zone's map is sealed with `me`, a share's with its owner. */
export async function keysOf(rows: CoreRow[], me: string | null): Promise<Headers> {
  const opened = await Promise.all(rows.filter((row) => row.entity === "SharedMap").map(async (row) => {
    const owner = row.database === "private" ? me : row.owner;
    const payload = row.fields.payload;
    if (!owner || typeof payload !== "string" || typeof row.fields.id !== "string") return null;
    try {
      const sealed = (JSON.parse(payload) as Record<string, unknown>)[SEALED_FIELD];
      return typeof sealed === "string" ? openSealed(sealed, owner, row.fields.id) : null;
    } catch {
      return null;
    }
  }));
  const found: Headers = {};
  for (const headers of opened) {
    for (const [host, values] of Object.entries(headers ?? {})) found[host] = { ...values, ...found[host] };
  }
  return found;
}
