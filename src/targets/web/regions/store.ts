/** A package this browser holds whole: a region's piece as of a catalog version, with the files its zip held. */
export interface StoredPackage {
  region: string;
  piece: string;
  version: number;
  bytes: number;
  files: string[];
}

/** One file being written into a package; closing it makes it readable once the package is committed. */
export interface FileSink {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/** A package on its way in; nothing of it counts until `commit`. */
export interface PackageWriter {
  open(path: string): Promise<FileSink>;
  commit(): Promise<StoredPackage>;
  abort(): Promise<void>;
}

/** The browser said it is full; a download that meets it stops and says so. */
export class StorageFull extends Error {}

export interface PackageStore {
  list(): Promise<StoredPackage[]>;
  begin(region: string, piece: string, version: number): Promise<PackageWriter>;
  blob(region: string, piece: string, path: string): Promise<Blob | null>;
  remove(region: string, piece: string): Promise<void>;
}

const MARK = ".complete";
const ROOT = "riki-regions";

/** A path inside a package: no empty, `.` or `..` part, no backslash, and not the mark. */
export function safePath(path: string): string[] | null {
  if (path === "" || path.includes("\\") || path.includes("\0")) return null;
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..") || path === MARK) return null;
  return parts;
}

const isFull = (error: unknown) => error instanceof DOMException && error.name === "QuotaExceededError";

// MARK: - OPFS

/** The minimal directory handle the store uses; OPFS's own, or a test's. */
export interface Directory {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<Directory>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterable<[string, Directory | FileHandle]>;
}

export interface FileHandle {
  kind: "file";
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
}

const isDirectory = (entry: Directory | FileHandle): entry is Directory => !("getFile" in entry);

async function child(directory: Directory, names: string[], create: boolean): Promise<Directory | null> {
  let at = directory;
  for (const name of names) {
    try {
      at = await at.getDirectoryHandle(name, { create });
    } catch (error) {
      if (!create && error instanceof DOMException && error.name === "NotFoundError") return null;
      throw error;
    }
  }
  return at;
}

async function readMark(directory: Directory): Promise<StoredPackage | null> {
  try {
    const text = await (await (await directory.getFileHandle(MARK)).getFile()).text();
    const read = JSON.parse(text) as Partial<StoredPackage>;
    return typeof read.version === "number" && Array.isArray(read.files) ? read as StoredPackage : null;
  } catch {
    return null;
  }
}

/** Packages in the origin's private file system: `riki-regions/<region>/<piece>/<version>/<files>` and a mark last. */
export function opfsStore(open: () => Promise<Directory>): PackageStore {
  const root = async (create: boolean) => child(await open(), [ROOT], create);

  /** The newest complete version of a piece, and the folders of every other that can go. */
  async function settled(piece: Directory): Promise<{ newest: StoredPackage | null; stray: string[] }> {
    let newest: StoredPackage | null = null;
    const found: [string, StoredPackage | null][] = [];
    for await (const [name, entry] of piece.entries()) {
      if (isDirectory(entry)) found.push([name, await readMark(entry)]);
    }
    for (const [, mark] of found) if (mark && (!newest || mark.version > newest.version)) newest = mark;
    return { newest, stray: found.filter(([name]) => name !== String(newest?.version)).map(([name]) => name) };
  }

  async function sweep(region: string, piece: string) {
    const folder = await child(await open(), [ROOT, region, piece], false);
    if (!folder) return;
    for (const name of (await settled(folder)).stray) await folder.removeEntry(name, { recursive: true });
  }

  return {
    async list() {
      const base = await root(false);
      if (!base) return [];
      const out: StoredPackage[] = [];
      for await (const [region, regionEntry] of base.entries()) {
        if (!isDirectory(regionEntry)) continue;
        for await (const [piece, pieceEntry] of regionEntry.entries()) {
          if (!isDirectory(pieceEntry)) continue;
          const { newest } = await settled(pieceEntry);
          if (newest) out.push({ ...newest, region, piece });
        }
      }
      return out.sort((a, b) => `${a.region}/${a.piece}`.localeCompare(`${b.region}/${b.piece}`));
    },

    async begin(region, piece, version) {
      const pieceFolder = (await child(await open(), [ROOT, region, piece], true))!;
      // A half-written copy of this version, from a download that never finished, starts again.
      try {
        await pieceFolder.removeEntry(String(version), { recursive: true });
      } catch { /* none */ }
      const folder = await pieceFolder.getDirectoryHandle(String(version), { create: true });
      const files: string[] = [];
      let bytes = 0;
      const dropIt = async () => {
        try {
          await pieceFolder.removeEntry(String(version), { recursive: true });
        } catch { /* gone */ }
      };
      return {
        async open(path) {
          const parts = safePath(path);
          if (!parts) throw new Error(`A package file named ${path} is not kept`);
          const at = (await child(folder, parts.slice(0, -1), true))!;
          const writable = await (await at.getFileHandle(parts[parts.length - 1]!, { create: true })).createWritable();
          files.push(parts.join("/"));
          return {
            async write(chunk) {
              try {
                await writable.write(chunk);
              } catch (error) {
                throw isFull(error) ? new StorageFull(String(error)) : error;
              }
              bytes += chunk.length;
            },
            close: () => writable.close()
          };
        },
        async commit() {
          const kept: StoredPackage = { region, piece, version, bytes, files: [...files].sort() };
          try {
            const mark = await (await folder.getFileHandle(MARK, { create: true })).createWritable();
            await mark.write(new TextEncoder().encode(JSON.stringify(kept)));
            await mark.close();
          } catch (error) {
            await dropIt();
            throw isFull(error) ? new StorageFull(String(error)) : error;
          }
          await sweep(region, piece);
          return kept;
        },
        abort: dropIt
      };
    },

    async blob(region, piece, path) {
      const parts = safePath(path);
      const pieceFolder = await child(await open(), [ROOT, region, piece], false);
      if (!parts || !pieceFolder) return null;
      const { newest } = await settled(pieceFolder);
      const folder = newest && await child(pieceFolder, [String(newest.version), ...parts.slice(0, -1)], false);
      if (!folder) return null;
      try {
        return await (await folder.getFileHandle(parts[parts.length - 1]!)).getFile();
      } catch {
        return null;
      }
    },

    async remove(region, piece) {
      const folder = await child(await open(), [ROOT, region], false);
      if (!folder) return;
      try {
        await folder.removeEntry(piece, { recursive: true });
      } catch { /* none */ }
    }
  };
}

// MARK: - IndexedDB

/** Where OPFS is missing: each file a Blob in IndexedDB, which the browser keeps on disk. */
export function idbStore(name = "riki-regions"): PackageStore {
  const opened = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const asked = indexedDB.open(name, 1);
    asked.onupgradeneeded = () => {
      asked.result.createObjectStore("files");
      asked.result.createObjectStore("marks");
    };
    asked.onsuccess = () => resolve(asked.result);
    asked.onerror = () => reject(asked.error);
  });
  const run = async <T>(store: "files" | "marks", mode: IDBTransactionMode, ask: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await opened();
    try {
      return await new Promise<T>((resolve, reject) => {
        const asked = ask(db.transaction(store, mode).objectStore(store));
        asked.onsuccess = () => resolve(asked.result);
        asked.onerror = () => reject(asked.error);
      });
    } catch (error) {
      throw isFull(error) || (error as { name?: string } | null)?.name === "QuotaExceededError" ? new StorageFull(String(error)) : error;
    } finally {
      db.close();
    }
  };
  const prefix = (region: string, piece: string) => `${region}/${piece}/`;
  const keyOf = (region: string, piece: string, version: number, path: string) => `${prefix(region, piece)}${version}/${path}`;
  const marks = async () => {
    const keys = await run("marks", "readonly", (store) => store.getAllKeys());
    const all = await run("marks", "readonly", (store) => store.getAll());
    return keys.map((key, at) => [String(key), all[at] as StoredPackage] as const);
  };

  return {
    async list() {
      return (await marks()).map(([, mark]) => mark).sort((a, b) => `${a.region}/${a.piece}`.localeCompare(`${b.region}/${b.piece}`));
    },

    async begin(region, piece, version) {
      const names: string[] = [];
      let bytes = 0;
      const dropFiles = async (keep: number | null) => {
        const keys = await run("files", "readonly", (store) => store.getAllKeys());
        for (const key of keys.map(String)) {
          if (!key.startsWith(prefix(region, piece))) continue;
          if (keep !== null && key.startsWith(`${prefix(region, piece)}${keep}/`)) continue;
          await run("files", "readwrite", (store) => store.delete(key));
        }
      };
      await dropFiles(null).catch(() => {});
      return {
        async open(path) {
          const parts = safePath(path);
          if (!parts) throw new Error(`A package file named ${path} is not kept`);
          const chunks: Uint8Array[] = [];
          return {
            async write(chunk) {
              chunks.push(chunk);
              bytes += chunk.length;
            },
            async close() {
              await run("files", "readwrite", (store) => store.put(new Blob(chunks as BlobPart[]), keyOf(region, piece, version, parts.join("/"))));
              names.push(parts.join("/"));
            }
          };
        },
        async commit() {
          const kept: StoredPackage = { region, piece, version, bytes, files: [...names].sort() };
          await run("marks", "readwrite", (store) => store.put(kept, prefix(region, piece)));
          await dropFiles(version);
          return kept;
        },
        abort: () => dropFiles(null)
      };
    },

    async blob(region, piece, path) {
      const mark = (await marks()).find(([key]) => key === prefix(region, piece))?.[1];
      if (!mark || !safePath(path)) return null;
      const found = await run("files", "readonly", (store) => store.get(keyOf(region, piece, mark.version, path)));
      return found instanceof Blob ? found : null;
    },

    async remove(region, piece) {
      await run("marks", "readwrite", (store) => store.delete(prefix(region, piece)));
      const keys = await run("files", "readonly", (store) => store.getAllKeys());
      for (const key of keys.map(String)) if (key.startsWith(prefix(region, piece))) await run("files", "readwrite", (store) => store.delete(key));
    }
  };
}

/** OPFS where the browser has it, else IndexedDB. */
export function browserStore(): PackageStore {
  const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (storage && typeof storage.getDirectory === "function") {
    return opfsStore(() => storage.getDirectory() as unknown as Promise<Directory>);
  }
  return idbStore();
}

let asked = false;

/** Asks the browser, once per page, not to clear what the site keeps; it may say no, which changes nothing. */
export async function askToKeep(): Promise<void> {
  if (asked) return;
  asked = true;
  try {
    await navigator.storage?.persist?.();
  } catch { /* kept as the browser sees fit */ }
}
