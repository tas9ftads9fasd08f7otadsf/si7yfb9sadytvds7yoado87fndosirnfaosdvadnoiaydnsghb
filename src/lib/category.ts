import type { SharedMap } from "./types";

/** The longest label the phone keeps. */
export const CATEGORY_MOST = 40;

/** 142 One line, single spaces, as the app's `MapCategoryName` cleans it. */
export const cleanCategory = (text: string) => text.replace(/\s+/g, " ").trim();

/** 142 The categories the phone's maps already have, each once whatever its case, the first spelling kept. */
export function categoriesOf(maps: Pick<SharedMap, "category">[]): string[] {
  const seen = new Map<string, string>();
  for (const map of maps) {
    const text = cleanCategory(map.category ?? "");
    if (text && !seen.has(text.toLowerCase())) seen.set(text.toLowerCase(), text);
  }
  return [...seen.values()].sort((one, other) => one.localeCompare(other));
}
