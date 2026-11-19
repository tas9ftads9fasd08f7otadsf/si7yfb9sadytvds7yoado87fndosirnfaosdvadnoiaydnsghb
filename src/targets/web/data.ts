import type { CKSave } from "./cloud";

/** A map's data zone holds plain records, not the mirror's `CD_` ones, as the app's `SharedDataZone` writes them. */
export const INDEX_TYPE = "MapDataIndex";
export const CHUNK_TYPE = "MapDataChunk";

/** Under CloudKit's documented 50 MB an asset, as the app's `chunkBytes`. */
export const CHUNK_BYTES = 45 * 1024 * 1024;

/** How many chunks travel at once: a lost connection loses one, never the store. */
export const IN_FLIGHT = 3;

/** The field types of the two records, as `SharedDataZone.types` declares them. */
export const DATA_TYPES = {
  [INDEX_TYPE]: { bytes: "INT64", manifest: "BYTES", storageKey: "STRING" },
  [CHUNK_TYPE]: { asset: "ASSET", count: "INT64", index: "INT64", sha: "STRING", storageKey: "STRING" }
} as const;

/** One file of a store, as the app's `Piece` encodes it. */
export interface Piece {
  kind: "file" | "part";
  /** The path under the importer's container for a file. */
  name: string;
  /** SHA-256 of the whole piece, in hex. */
  sha: string;
  bytes: number;
}

/** What an index record's manifest says of a store, as the app's `Entry` encodes it. */
export interface Entry {
  storageKey: string;
  cacheKey: string;
  name: string;
  format: string;
  pieces: Piece[];
  /** Seconds since 2001-01-01, as Swift's default date coding. */
  updatedAt: number;
  contributor: string;
}

/** What a piece is cut from: its size and a slice of it. */
export type Sliceable = Pick<Blob, "size" | "slice">;

const REFERENCE_DATE = 978_307_200;

export const referenceSeconds = (when: Date) => when.getTime() / 1000 - REFERENCE_DATE;

/** How many chunks a piece of this size is cut into; an empty one is still one. */
export const chunkCount = (bytes: number, size = CHUNK_BYTES) => Math.max(1, Math.ceil(bytes / size));

export const chunkName = (sha: string, index: number) => `${sha}-${index}`;

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export async function sha256(bytes: BufferSource): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

/** The index record's name: the first 16 hex digits of the key's digest, as `MapDataArchive.fileStem`. */
export async function indexName(storageKey: string): Promise<string> {
  return `index-${(await sha256(new TextEncoder().encode(storageKey))).slice(0, 16)}`;
}

/** The `index`th chunk of a piece: at most `size` bytes of it. */
export function sliceOf(piece: Sliceable, index: number, size = CHUNK_BYTES): Blob {
  return piece.slice(index * size, Math.min(piece.size, (index + 1) * size));
}

const base64 = (text: string) => {
  let bytes = "";
  for (const byte of new TextEncoder().encode(text)) bytes += String.fromCharCode(byte);
  return btoa(bytes);
};

/** The chunk record of a piece, without its asset: the store uploads that with the bytes. */
export function chunkRecord(entry: Pick<Entry, "storageKey">, piece: Piece, index: number, size = CHUNK_BYTES): CKSave {
  return { recordName: chunkName(piece.sha, index), recordType: CHUNK_TYPE, fields: {
    storageKey: { value: entry.storageKey, type: "STRING" }, sha: { value: piece.sha, type: "STRING" },
    index: { value: index, type: "INT64" }, count: { value: chunkCount(piece.bytes, size), type: "INT64" } } };
}

export async function indexRecord(entry: Entry): Promise<CKSave> {
  return { recordName: await indexName(entry.storageKey), recordType: INDEX_TYPE, fields: {
    storageKey: { value: entry.storageKey, type: "STRING" },
    manifest: { value: base64(JSON.stringify(entry)), type: "BYTES" },
    bytes: { value: entry.pieces.reduce((all, piece) => all + piece.bytes, 0), type: "INT64" } } };
}

/** What the data zone is written through; the site's own is built on CloudKit JS's asset upload. */
export interface DataStore {
  /** Which of these record names the zone already holds. */
  existing(names: string[]): Promise<Set<string>>;
  /** Uploads each chunk's bytes as its record's asset and saves the records. */
  saveChunks(chunks: { record: CKSave; bytes: Blob }[]): Promise<void>;
  saveIndex(record: CKSave): Promise<void>;
}

/**
 * Sends a store as the app does: a chunk already there is not sent again, a few chunks go at once, and the
 * index goes last, so no index names a chunk that is not there.
 */
export async function sendStore(store: DataStore, entry: Entry, sources: Map<string, Sliceable>,
  { size = CHUNK_BYTES, progress = () => {} }: { size?: number; progress?: (sent: number) => void } = {}): Promise<void> {
  const wanted = entry.pieces.flatMap((piece) =>
    Array.from({ length: chunkCount(piece.bytes, size) }, (_, index) => ({ piece, index, name: chunkName(piece.sha, index) })));
  const there = await store.existing(wanted.map((each) => each.name));
  const missing = wanted.filter((each) => !there.has(each.name));
  let sent = 0;
  for (let start = 0; start < missing.length; start += IN_FLIGHT) {
    const batch = missing.slice(start, start + IN_FLIGHT).map(({ piece, index }) => {
      const source = sources.get(piece.sha);
      if (!source) throw new Error(`No bytes for ${piece.name}`);
      return { record: chunkRecord(entry, piece, index, size), bytes: sliceOf(source, index, size) };
    });
    await store.saveChunks(batch);
    sent += batch.reduce((all, each) => all + each.bytes.size, 0);
    progress(sent);
  }
  await store.saveIndex(await indexRecord(entry));
}
