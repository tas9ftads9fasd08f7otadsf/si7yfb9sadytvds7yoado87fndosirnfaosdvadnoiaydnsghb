import type { Directory, FileHandle } from "./store";

/** The origin-private file system in memory, for tests: directories, files and a quota a write can run past. */
export function fakeOpfs(options: { quota?: number } = {}): { root: Directory; used: () => number } {
  let used = 0;
  const missing = () => new DOMException("not there", "NotFoundError");

  function directory(): Directory {
    const entries = new Map<string, Directory | FileHandle>();
    return {
      async getDirectoryHandle(name, { create = false } = {}) {
        const held = entries.get(name);
        if (held && "getFile" in held) throw new DOMException("a file", "TypeMismatchError");
        if (held) return held;
        if (!create) throw missing();
        const made = directory();
        entries.set(name, made);
        return made;
      },
      async getFileHandle(name, { create = false } = {}) {
        const held = entries.get(name);
        if (held && !("getFile" in held)) throw new DOMException("a directory", "TypeMismatchError");
        if (held) return held;
        if (!create) throw missing();
        const made = file();
        entries.set(name, made);
        return made;
      },
      async removeEntry(name) {
        if (!entries.delete(name)) throw missing();
      },
      entries() {
        return (async function* () {
          for (const each of [...entries]) yield each;
        })();
      }
    };
  }

  function file(): FileHandle {
    let kept = new Blob([]);
    return {
      kind: "file",
      async getFile() {
        return new File([kept], "f");
      },
      async createWritable() {
        const chunks: BlobPart[] = [];
        let size = 0;
        return {
          async write(data) {
            if (options.quota !== undefined && used + size + data.length > options.quota) {
              throw new DOMException("full", "QuotaExceededError");
            }
            size += data.length;
            chunks.push(data.slice());
          },
          async close() {
            used += size;
            kept = new Blob(chunks);
          }
        };
      }
    };
  }
  return { root: directory(), used: () => used };
}
