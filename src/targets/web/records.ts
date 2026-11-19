import type { CKRecord } from "./cloud";
import { isTextBytes, textOfBytes } from "./mirror";

/** What the core reads: one record of the mirror, its `CD_` prefixes taken off. */
export interface CoreRow {
  entity: string;
  id: string;
  database: "private" | "shared";
  zone: string;
  owner?: string;
  /** The `recordChangeTag` a write must carry back. */
  tag: string;
  fields: Record<string, unknown>;
  /** Fields held as references or as `_ckAsset`, so a write sends them back alike. */
  refs?: string[];
  assets?: string[];
}

/** What the core asks to be written; an existing row's tag comes from what was read. */
export interface CoreWrite {
  entity: string;
  id: string;
  fields: Record<string, unknown>;
  refs?: string[];
}

/** The record types the site reads; `CD_LayerSecrets` is encrypted and stays unread. */
export const READ_TYPES = ["CD_SharedMap", "CD_SharedMapLayer", "CD_SharedMapStyle", "CD_SharedMapChange",
  "CD_ServerRecord"];

const ASSET_SUFFIX = "_ckAsset";

const bare = (name: string) => name.replace(/^CD_/, "");

interface AssetValue {
  downloadURL?: string;
}

/**
 * An asset's `downloadURL` carries a `${f}` slot for a file name, as Apple's web services reference shows it
 * (inferred from the reference, not from cloudkit.js); any name opens the file.
 */
const filled = (url: string, name: string) => url.replace("${f}", encodeURIComponent(name));

/** A `CD_` record as the core's row; a field moved to `_ckAsset` is fetched by its download URL. */
export async function rowOf(record: CKRecord, where: Pick<CoreRow, "database" | "zone" | "owner">,
  fetcher: typeof fetch = fetch): Promise<CoreRow> {
  const fields: Record<string, unknown> = {};
  const refs: string[] = [];
  const assets: string[] = [];
  await Promise.all(Object.entries(record.fields ?? {}).map(async ([name, field]) => {
    if (name.endsWith(ASSET_SUFFIX)) {
      const url = (field.value as AssetValue | null)?.downloadURL;
      if (!url) return;
      const own = bare(name.slice(0, -ASSET_SUFFIX.length));
      const answer = await fetcher(filled(url, own));
      if (!answer.ok) throw new Error(`An asset of ${record.recordName} answered ${answer.status}`);
      fields[own] = await answer.text();
      assets.push(own);
    } else if (field.type === "REFERENCE") {
      fields[bare(name)] = (field.value as { recordName?: string } | null)?.recordName ?? null;
      refs.push(bare(name));
    } else if (field.type === "BYTES" && typeof field.value === "string" && isTextBytes(bare(name))) {
      fields[bare(name)] = textOfBytes(field.value);
    } else {
      fields[bare(name)] = field.value;
    }
  }));
  return { entity: bare(record.recordType ?? ""), id: record.recordName, tag: record.recordChangeTag ?? "", fields,
    ...(refs.length ? { refs: refs.sort() } : {}), ...(assets.length ? { assets: assets.sort() } : {}), ...where };
}
