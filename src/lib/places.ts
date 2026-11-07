import type { Start } from "./types";

export const START_KINDS = ["location", "coordinates", "region", "country", "state", "city"] as const;
export const BY_NAME = ["region", "country", "state", "city"];

export function samePlace(one: Start, other: Start): boolean {
  return (["kind", "region", "country", "name"] as const).every((key) => (one[key] ?? "") === (other[key] ?? ""));
}

/** What `/edit` is asked to set a map's opening place to this one. */
export function startQuery(start: Start): Record<string, string> {
  const query: Record<string, string> = { start: start.kind };
  for (const key of ["region", "country", "name"] as const) {
    const value = start[key];
    if (value) query[key] = value;
  }
  if (start.latitude != null) {
    query.lat = String(start.latitude);
    query.lon = String(start.longitude);
  }
  if (start.zoom != null) query.zoom = String(start.zoom);
  if (start.box) query.box = [start.box.minLon, start.box.minLat, start.box.maxLon, start.box.maxLat].join(",");
  return query;
}
