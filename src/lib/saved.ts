import type { SavedFolder, SavedListing, SavedRow } from "./types";

export type SavedKindFilter = "all" | "point" | "line" | "area";

/** The folder choice is every saved place, those in no folder, or one folder's id. */
export const ALL_SAVED = "all";
export const UNFILED = "unfiled";

export interface SavedFilter {
  text: string;
  kind: SavedKindFilter;
  folder: string;
}

export const NO_FILTER: SavedFilter = { text: "", kind: "all", folder: ALL_SAVED };

const inFolder = (row: SavedRow, folder: string) =>
  folder === ALL_SAVED || (folder === UNFILED ? !row.folderID : row.folderID === folder);

/** 135 The rows the filters leave, newest first, as the phone's own Saved sheet narrows them. */
export function shownSaved(rows: SavedRow[], filter: SavedFilter): SavedRow[] {
  const needle = filter.text.trim().toLowerCase();
  const matches = (row: SavedRow) => {
    if (filter.kind !== "all" && row.kind !== filter.kind) return false;
    if (!inFolder(row, filter.folder)) return false;
    return !needle || [row.name, row.note, row.category].some((text) => text?.toLowerCase().includes(needle));
  };
  return rows.filter(matches).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** 135 True where the phone sent fewer rows than it holds. */
export const isCut = (listing: SavedListing) => listing.total > listing.features.length;

/** 135 "Category, folder" under a row's name; either may be missing. */
export function savedLine(row: SavedRow, folders: SavedFolder[]): string {
  const folder = folders.find((each) => each.id === row.folderID)?.name;
  return [row.category, folder].filter(Boolean).join(", ");
}

/** The date a feature was saved, in the browser's language; empty for one that does not read. */
export function savedDate(savedAt: string): string {
  const when = new Date(savedAt);
  return Number.isNaN(when.getTime()) ? "" : when.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** West, south, east and north of a row's box, for a line or an area. */
export function savedBox(row: SavedRow): [number, number, number, number] | undefined {
  const { bounds } = row;
  return bounds ? [bounds.west, bounds.south, bounds.east, bounds.north] : undefined;
}

/** The mark a row wears when the phone named none. */
export const KIND_SYMBOL: Record<SavedRow["kind"], string> = {
  point: "mappin", line: "point.topleft.down.curvedpath.point.bottomright.up", area: "hexagon"
};
