import type { Coverage, CoverageSide, CoverageSideKey } from "./types";

export const SIDE_KEYS = ["world", "continents", "mountains", "countries", "regions"] as const;

export function sideOf(coverage: Coverage, side: CoverageSideKey): CoverageSide {
  if (side === "exclude") return { ...(coverage.exclude ?? {}) };
  return Object.fromEntries(SIDE_KEYS.filter((key) => coverage[key] != null).map((key) => [key, coverage[key]]));
}

export function toggled(value: string, list: string[] | undefined): string[] | undefined {
  const made = (list ?? []).includes(value) ? (list ?? []).filter((each) => each !== value) : [...(list ?? []), value];
  return made.length ? made : undefined;
}

/** One side changed, the other kept; an empty exclusion is none. */
export function edited(coverage: Coverage, side: CoverageSideKey, changeSide: (places: CoverageSide) => void): Coverage {
  const made: Coverage = JSON.parse(JSON.stringify(coverage));
  const places = sideOf(made, side);
  changeSide(places);
  if (side === "include") {
    for (const key of SIDE_KEYS) (made as Record<string, unknown>)[key] = places[key];
  } else {
    made.exclude = SIDE_KEYS.some((key) => places[key] != null) ? places : undefined;
  }
  return made;
}
