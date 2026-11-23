import type { Box } from "@/lib/types";

/** One piece of a region as the catalog lists it: the zip the site downloads, by its Drive id. */
export interface PackagePiece {
  piece: string;
  /** The Drive file id the site's server streams. */
  fileID: string;
  bytes: number;
  /** `updated_ts` of the zip, which moves when the pipeline republishes the piece. */
  version: number;
}

/** A region, a country's or a mountain range's, keyed as the app keys its `regionId`. */
export interface CatalogRegion {
  id: string;
  name: string;
  box: Box | null;
  pieces: Record<string, PackagePiece>;
  /** 165 The country's catalog slug, as the app reads its code from; null when the catalog names none. */
  country: string | null;
  /** 165 A mountain range, listed under `ranges`. */
  range: boolean;
}

const CHILDREN = ["regions", "subregions", "ranges"];
/** The catalog's ranges sit under this key, not under a country. */
const MOUNTAINS = "mountains";
const DRIVE_ID = /[?&]id=([A-Za-z0-9_-]{20,})(?:&|$)/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function pieceOf(piece: string, entry: unknown): PackagePiece | null {
  if (!isObject(entry)) return null;
  const zip = isObject(entry.formats) && isObject(entry.formats.zip) ? entry.formats.zip : entry;
  const address = typeof zip.download === "string" ? zip.download : "";
  const id = DRIVE_ID.exec(address)?.[1];
  const bytes = Number(zip.size ?? entry.size);
  if (!id || !Number.isFinite(bytes) || bytes <= 0) return null;
  return { piece, fileID: id, bytes, version: Number(zip.updated_ts ?? entry.updated_ts ?? 0) || 0 };
}

const boxOf = (value: unknown): Box | null =>
  Array.isArray(value) && value.length === 4 && value.every((each) => typeof each === "number")
    ? value as unknown as Box : null;

/** The regions of maptiles' `maps.json`, by the key each is listed under; metadata and nodes with no zip are left out. */
export function readCatalog(catalog: unknown): Map<string, CatalogRegion> {
  const regions = new Map<string, CatalogRegion>();
  const walk = (key: string, node: unknown, country: string | null, range: boolean) => {
    if (!isObject(node)) return;
    if (isObject(node.maps)) {
      const pieces = Object.fromEntries(Object.entries(node.maps).flatMap(([piece, entry]) => {
        const found = pieceOf(piece, entry);
        return found ? [[piece, found]] : [];
      }));
      if (Object.keys(pieces).length > 0) {
        regions.set(key, { id: key, name: typeof node.name === "string" && node.name ? node.name : key,
          box: boxOf(node.bbox), pieces, country: typeof node.country === "string" ? node.country : country, range });
      }
    }
    for (const group of CHILDREN) {
      if (isObject(node[group])) {
        for (const [child, inner] of Object.entries(node[group])) walk(child, inner, country, group === "ranges");
      }
    }
  };
  if (isObject(catalog)) {
    for (const [key, node] of Object.entries(catalog)) {
      if (!key.startsWith("_")) walk(key, node, key === MOUNTAINS ? null : key, false);
    }
  }
  return regions;
}

/** The catalog the site's server keeps, read through the site's own address. */
export async function fetchCatalog(fetcher: typeof fetch, base: string): Promise<Map<string, CatalogRegion>> {
  const answer = await fetcher(`${base}/regions/catalog.json`);
  if (!answer.ok) throw new Error(`The region catalog answered ${answer.status}`);
  return readCatalog(await answer.json());
}
