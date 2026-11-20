import { PMTiles, type RangeResponse, type Source } from "pmtiles";
import type { PackageStore } from "./store";

/** The scheme a style's addresses of stored package files carry: `riki-store://<region>/<piece>/<path in the zip>`. */
export const STORE = "riki-store";
const TILES = `pmtiles://${STORE}/`;

export interface StoredAddress {
  region: string;
  piece: string;
  path: string;
}

/** The parts of `<region>/<piece>/<path>`, with the path decoded; null where there are fewer. */
export function addressOf(rest: string): StoredAddress | null {
  const parts = rest.split("/");
  if (parts.length < 3 || parts.slice(0, 3).some((part) => part === "")) return null;
  try {
    return { region: decodeURIComponent(parts[0]!), piece: decodeURIComponent(parts[1]!),
      path: parts.slice(2).map(decodeURIComponent).join("/") };
  } catch {
    return null;
  }
}

/** A stored archive read by byte range from the file the browser keeps, as pmtiles asks for it. */
export class BlobSource implements Source {
  constructor(private readonly key: string, private readonly blob: Blob) {}

  getKey = () => this.key;

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return { data: await this.blob.slice(offset, offset + length).arrayBuffer() };
  }
}

/** The archives a style reads from stored packages, which the pmtiles protocol is told of before the style is set. */
export async function registerArchives(style: unknown, store: PackageStore, protocol: { tiles: Map<string, PMTiles>; add(p: PMTiles): void }): Promise<void> {
  const sources = (style as { sources?: Record<string, { url?: string; tiles?: string[] }> } | null)?.sources ?? {};
  const wanted = new Set(Object.values(sources).flatMap((source) => [source.url, ...(source.tiles ?? [])])
    .filter((address): address is string => typeof address === "string" && address.startsWith(TILES))
    .map((address) => address.slice("pmtiles://".length).replace(/\/\d+\/\d+\/\d+$/, "")));
  for (const key of wanted) {
    if (protocol.tiles.has(key)) continue;
    const at = addressOf(key.slice(`${STORE}/`.length));
    const blob = at && await store.blob(at.region, at.piece, at.path);
    if (blob) protocol.add(new PMTiles(new BlobSource(key, blob)));
  }
}

/** MapLibre's request for a file of a stored package, a sprite sheet: its JSON, or its image as bytes. */
export async function loadStored(store: PackageStore, params: { url: string; type?: string }): Promise<{ data: unknown }> {
  const at = addressOf(params.url.slice(`${STORE}://`.length));
  let blob = at && await store.blob(at.region, at.piece, at.path);
  // A package with one sheet answers a retina screen with it, as the app links the missing `@2x` to the sheet.
  if (!blob && at && /@2x\.(json|png)$/.test(at.path)) blob = await store.blob(at.region, at.piece, at.path.replace("@2x", ""));
  if (!blob) throw new Error(`${params.url} is not in a stored package`);
  return { data: params.type === "json" ? JSON.parse(await blob.text()) : await blob.arrayBuffer() };
}
