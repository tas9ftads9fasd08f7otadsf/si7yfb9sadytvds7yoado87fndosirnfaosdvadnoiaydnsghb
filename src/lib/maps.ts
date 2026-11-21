import { sizeText } from "./size";
import type { MapOffline, MapRole, SharedMap } from "./types";
import { filledIn, type Words } from "./words";

const OFFLINE_KEYS: Record<MapOffline, "offlineReady" | "offlinePartly" | "offlineOnline" | "offlineUpdate"> = {
  ready: "offlineReady", partly: "offlinePartly", online: "offlineOnline", update: "offlineUpdate" };

const ROLE_KEYS: Record<MapRole, string> = { own: "role.owner", edit: "role.editor", view: "role.reader" };

/** 128 What the map has on the phone in words; none from an older phone or a state this page does not know. */
export function offlineWord(map: SharedMap, words: Words): string | null {
  const key = map.offline ? OFFLINE_KEYS[map.offline] : undefined;
  return key ? words[key] : null;
}

/** 128 The size of what the phone holds; an online-only map holds none, so it has no pill. */
export function heldWord(map: SharedMap): string | null {
  return map.bytes != null && map.bytes > 0 ? sizeText(map.bytes) : null;
}

/** 128 W1's line under the counts: who else has the map, then this phone's role in it. */
export function sharingLine(map: SharedMap, words: Words): string | null {
  const shared = map.people != null && map.people > 0 ? filledIn(words.sharedWith, "count", String(map.people)) : null;
  const key = map.role ? ROLE_KEYS[map.role] : undefined;
  const parts = [shared, key ? words[key] : null].filter((part): part is string => part != null);
  return parts.length ? parts.join(" · ") : null;
}

export interface StyleLink {
  name: string;
  /** Set only when the phone sent ids that line up with the names. */
  id?: string;
}

/** 128 A map's styles as chips; an id opens the style, without one the chip opens the map. */
export function styleLinks(map: SharedMap): StyleLink[] {
  const ids = map.styleIDs?.length === map.styles?.length ? map.styleIDs : undefined;
  return (map.styles ?? []).map((name, place) => ({ name, id: ids?.[place] }));
}

export type MapsFilter = "all" | "mine" | "shared";
export type MapsSort = "name" | "changed" | "size";

/** 148 What the Maps screen's toolbar asks of the list; `category` is a Category filter's pick. */
export interface MapsAsk {
  text: string;
  filter: MapsFilter;
  sort: MapsSort;
  category?: string | null;
}

export const NO_ASK: MapsAsk = { text: "", filter: "all", sort: "name", category: null };

/** Mine are the maps this phone owns; Shared with me the ones another person owns. Without a role, neither. */
export function inFilter(map: SharedMap, filter: MapsFilter): boolean {
  if (filter === "all") return true;
  return filter === "mine" ? map.role === "own" : map.role === "edit" || map.role === "view";
}

/** 148 A missing field sorts last, whichever way the sort runs. */
function byNumber(one: number | undefined, other: number | undefined): number {
  if (one == null || other == null) return one == null ? (other == null ? 0 : 1) : -1;
  return other - one;
}

/** 148 W17's maps: narrowed by the field (name or category), the filter and the category, then sorted. */
export function shownMaps(maps: SharedMap[], ask: MapsAsk): SharedMap[] {
  const needle = ask.text.trim().toLowerCase();
  const category = ask.category?.trim().toLowerCase();
  const kept = maps.filter((map) => inFilter(map, ask.filter)
    && (!category || map.category?.trim().toLowerCase() === category)
    && (!needle || map.name.toLowerCase().includes(needle) || (map.category ?? "").toLowerCase().includes(needle)));
  const order = (one: SharedMap, other: SharedMap) => {
    if (ask.sort === "changed") return byNumber(one.changedAt, other.changedAt);
    if (ask.sort === "size") return byNumber(one.bytes, other.bytes);
    return one.name.localeCompare(other.name);
  };
  return kept.map((map, place) => ({ map, place })).sort((one, other) =>
    order(one.map, other.map) || one.map.name.localeCompare(other.map.name) || one.place - other.place)
    .map(({ map }) => map);
}

/** 148 How many maps each filter holds; Mine and Shared with me need the phone to send roles. */
export function filterCounts(maps: SharedMap[]): { all: number; mine: number; shared: number; knowsRoles: boolean } {
  return { all: maps.length, mine: maps.filter((map) => inFilter(map, "mine")).length,
    shared: maps.filter((map) => inFilter(map, "shared")).length, knowsRoles: maps.some((map) => map.role != null) };
}

const dayOf = (date: Date) => Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000);

/** 148 When the phone last wrote the map: Today, Yesterday, else the day (with the year when it is not this one). */
export function changedWord(changedAt: number | undefined, now = new Date(), locale?: string): string | null {
  if (changedAt == null) return null;
  const then = new Date(changedAt * 1000);
  const ago = dayOf(now) - dayOf(then);
  if (ago === 0 || ago === 1) {
    const said = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-ago, "day");
    return said.charAt(0).toLocaleUpperCase(locale) + said.slice(1);
  }
  return then.toLocaleDateString(locale, { day: "numeric", month: "short",
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}
