import { RegionFailed, type RegionPackages } from "@/backend/types";
import type { RegionNeed, RegionRow } from "@/lib/types";
import { fetchCatalog, type CatalogRegion } from "./catalog";
import { downloadPiece } from "./download";
import { askToKeep, type PackageStore, type StoredPackage } from "./store";

export interface Parts {
  store: PackageStore;
  fetcher: typeof fetch;
  base: string;
  /** The catalog, read again when it has not been or a read failed; kept for the page's life. */
  catalog?: () => Promise<Map<string, CatalogRegion>>;
}

/** What a stored package tells the core: where it is from, its files and its `contents.json` text. */
export interface StoredForCore {
  region: string;
  piece: string;
  version: number;
  files: string[];
  contents: string | null;
}

const MANIFESTS = ["contents.json", "obsah.json"];

/** The region packages: the catalog says what exists, the store what is held, and the core what a style needs. */
export function createRegionPackages(parts: Parts) {
  let catalogRead: Promise<Map<string, CatalogRegion>> | null = null;
  const catalog = () => {
    catalogRead ??= (parts.catalog ?? (() => fetchCatalog(parts.fetcher, parts.base)))();
    catalogRead.catch(() => { catalogRead = null; });
    return catalogRead;
  };

  const rows = async (needs: RegionNeed[]): Promise<RegionRow[]> => {
    const [known, held] = await Promise.all([catalog().catch(() => new Map<string, CatalogRegion>()), parts.store.list()]);
    const regions = [...new Set([...needs.map((each) => each.region), ...held.map((each) => each.region)])];
    return regions.flatMap((region) => {
      const listed = known.get(region);
      const have = held.filter((each) => each.region === region);
      const wanted = needs.filter((each) => each.region === region).map((each) => each.piece);
      const fetch = [...new Set([...wanted, ...have.map((each) => each.piece)])].flatMap((piece) => {
        const offered = listed?.pieces[piece];
        const stored = have.find((each) => each.piece === piece);
        if (!offered || (stored && stored.version >= offered.version)) return [];
        return [{ piece, bytes: offered.bytes, update: stored !== undefined }];
      });
      if (!listed && have.length === 0) return [];
      return [{ region, name: listed?.name ?? region, fetch, held: have.map((each) => ({ piece: each.piece, bytes: each.bytes })) }];
    });
  };

  const packages: RegionPackages = {
    rows,

    async download(region, needs, progress, signal) {
      const known = await catalog().catch((error: unknown) => { throw new RegionFailed("host", String(error)); });
      const row = (await rows(needs)).find((each) => each.region === region);
      const listed = known.get(region);
      if (!row || !listed) throw new RegionFailed("host", `${region} is not in the catalog`);
      await askToKeep();
      const total = row.fetch.reduce((sum, each) => sum + each.bytes, 0);
      let before = 0;
      for (const each of row.fetch) {
        const piece = listed.pieces[each.piece]!;
        await downloadPiece({ region, piece, store: parts.store, fetcher: parts.fetcher, base: parts.base, signal,
          onProgress: (done) => progress(before + done, total) });
        before += each.bytes;
      }
      progress(total, total);
    },

    async remove(region) {
      for (const each of (await parts.store.list()).filter((stored) => stored.region === region)) {
        await parts.store.remove(region, each.piece);
      }
    }
  };

  /** Every held package, with the text of its manifest, as the style's catalog hands them to the core. */
  const stored = async (): Promise<StoredForCore[]> => {
    const list: StoredPackage[] = await parts.store.list();
    return Promise.all(list.map(async (each) => {
      const name = MANIFESTS.find((manifest) => each.files.includes(manifest));
      const blob = name ? await parts.store.blob(each.region, each.piece, name) : null;
      return { region: each.region, piece: each.piece, version: each.version, files: each.files, contents: blob ? await blob.text() : null };
    }));
  };

  return { packages, stored };
}
