import { Unzip, UnzipInflate } from "fflate";
import { RegionFailed } from "@/backend/types";
import type { PackagePiece } from "./catalog";
import { StorageFull, type FileSink, type PackageStore, type StoredPackage } from "./store";

export interface Download {
  region: string;
  piece: PackagePiece;
  store: PackageStore;
  fetcher: typeof fetch;
  /** The site's address, with its path. */
  base: string;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** What the site's server said when it refused: its JSON `error`, or the status. */
async function refusal(answer: Response): Promise<string> {
  try {
    const said = await answer.json() as { reason?: string; error?: string };
    if (said.reason || said.error) return said.reason ?? said.error!;
  } catch { /* no words */ }
  return `HTTP ${answer.status}`;
}

/**
 * Fetches a piece's zip through the site's server and unpacks it as it arrives into the store, so no file is held whole
 * in memory; the bytes must be the catalog's count, which is how a page of the host's is told from a package.
 */
export async function downloadPiece({ region, piece, store, fetcher, base, onProgress, signal }: Download): Promise<StoredPackage> {
  let answer: Response;
  try {
    answer = await fetcher(`${base}/regions/file/${encodeURIComponent(piece.fileID)}`, { signal, credentials: "same-origin" });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RegionFailed("network", String(error));
  }
  if (!answer.ok || !answer.body) throw new RegionFailed("host", await refusal(answer));

  const writer = await store.begin(region, piece.piece, piece.version);
  try {
    let queue: Promise<void> = Promise.resolve();
    let sink: FileSink | null = null;
    let failure: unknown = null;
    let wrote = 0;
    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.onfile = (file) => {
      if (file.name.endsWith("/")) return;
      queue = queue.then(async () => { sink = await writer.open(file.name); wrote += 1; });
      file.ondata = (error, data, final) => {
        if (error) {
          failure ??= error;
          return;
        }
        const chunk = data.slice();
        queue = queue.then(async () => {
          await sink!.write(chunk);
          if (final) await sink!.close();
        });
      };
      file.start();
    };

    const reader = answer.body.getReader();
    let read = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.length;
      try {
        unzip.push(value, false);
      } catch (error) {
        failure ??= error;
      }
      // One chunk at a time: the writes are waited for before the next is read.
      await queue;
      if (failure) throw failure;
      onProgress?.(read, piece.bytes);
    }
    try {
      unzip.push(new Uint8Array(0), true);
    } catch (error) {
      failure ??= error;
    }
    await queue;
    if (failure) throw failure;
    if (read !== piece.bytes) throw new RegionFailed("size", `${read} bytes where the catalog says ${piece.bytes}`);
    if (wrote === 0) throw new RegionFailed("unreadable", "the package holds no files");
    return await writer.commit();
  } catch (error) {
    await writer.abort().catch(() => {});
    if (error instanceof RegionFailed || signal?.aborted) throw error;
    if (error instanceof StorageFull) throw new RegionFailed("full", String(error));
    throw new RegionFailed(error instanceof TypeError ? "network" : "unreadable", String(error));
  }
}
