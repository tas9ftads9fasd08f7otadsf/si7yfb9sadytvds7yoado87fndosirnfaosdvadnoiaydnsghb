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
