import { pointOn } from "./search";
import type { DetailsLive } from "./types";

/** 130 Whether the pill still says LIVE: the age the phone gave, counted on from when the page asked, is in the window. */
export function stillLive(live: DetailsLive, askedAt: number | undefined, now: number): boolean {
  if (!live.isLive || live.ageSeconds == null) return false;
  const since = askedAt == null ? 0 : Math.max(0, now - askedAt) / 1000;
  return live.ageSeconds + since <= live.windowSeconds;
}

/** A feature of a layer's live answer, as GeoJSON hands it over. */
export interface LiveFeature {
  properties?: Record<string, unknown> | null;
  geometry?: { type: string; coordinates?: unknown } | null;
}

const same = (one: unknown, other: unknown) => one != null && String(one).trim() !== "" && String(one) === String(other);

/** 130 The feature of a live answer that is the one on show: most values in common, the nearest on a tie, none if no value is shared. */
export function sameFeature(shown: Record<string, unknown>, answer: unknown, at: [number, number]): LiveFeature | null {
  const features = (answer as { features?: LiveFeature[] } | null)?.features;
  if (!Array.isArray(features)) return null;
  let best: { feature: LiveFeature; shared: number; apart: number } | null = null;
  for (const feature of features) {
    const own = feature.properties ?? {};
    const shared = Object.keys(shown).filter((key) => same(shown[key], own[key])).length;
    if (!shared) continue;
    const point = pointOn(feature.geometry);
    const apart = point ? (point[0] - at[0]) ** 2 + (point[1] - at[1]) ** 2 : Infinity;
    if (!best || shared > best.shared || (shared === best.shared && apart < best.apart)) best = { feature, shared, apart };
  }
  return best?.feature ?? null;
}
