import type { Coverage, CoverageSide, CoverageSideKey, Place } from "./types";

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

/** TestFlight AK2D: the chosen countries, or those with regions; a search finds the rest. */
export function shownCountries(chosen: string[], countries: Place[], withRegions: Set<string>, query: string): string[] {
  const wanted = query.trim().toLowerCase();
  if (wanted) {
    const found = countries.filter((each) => !chosen.includes(each.id)
      && (each.name.toLowerCase().includes(wanted) || each.id.toLowerCase() === wanted)).map((each) => each.id);
    return [...chosen, ...found.filter((code) => withRegions.has(code)), ...found.filter((code) => !withRegions.has(code))];
  }
  return chosen.length ? chosen : countries.map((each) => each.id).filter((code) => withRegions.has(code));
}

/** TestFlight AL-i: continents fold as ranges do; a chosen one stays above the fold. */
export function foldedContinents<T extends Place>(all: T[], chosen: string[]): { inSight: T[]; folded: T[] } {
  return { inSight: all.filter((each) => chosen.includes(each.id)), folded: all.filter((each) => !chosen.includes(each.id)) };
}
