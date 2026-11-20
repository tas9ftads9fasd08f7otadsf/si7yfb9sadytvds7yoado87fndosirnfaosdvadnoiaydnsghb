import { featureTitle } from "./feature";

/** 100 A name found in the map's own data, where it lies and the layer that drew it. */
export interface NameHit {
  name: string;
  layer: string;
  lng: number;
  lat: number;
  properties: Record<string, unknown>;
}

/** A feature as the map hands it over: its tags, a point on it and the layer it came from. */
export interface Named {
  properties: Record<string, unknown>;
  layer: string;
  at: [number, number] | null;
}

const MOST = 30;

/** Lower case without accents, so "kosice" finds Košice. */
export function folded(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/** The named features that hold the words typed, a name starting with them first; one name in one spot is
 * listed once, however many of the style's layers draw it. */
export function findNames(features: Named[], typed: string): NameHit[] {
  const wanted = folded(typed);
  if (wanted.length < 2) return [];
  const seen = new Set<string>();
  const hits: { hit: NameHit; starts: boolean }[] = [];
  for (const feature of features) {
    const name = featureTitle(feature.properties);
    if (!name || !feature.at) continue;
    const plain = folded(name);
    if (!plain.includes(wanted)) continue;
    const key = `${plain}\u0000${feature.at[0].toFixed(3)}\u0000${feature.at[1].toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ hit: { name, layer: feature.layer.charAt(0).toUpperCase() + feature.layer.slice(1), lng: feature.at[0], lat: feature.at[1],
      properties: feature.properties }, starts: plain.startsWith(wanted) });
  }
  hits.sort((one, other) => Number(other.starts) - Number(one.starts) || one.hit.name.localeCompare(other.hit.name)
    || one.hit.layer.localeCompare(other.hit.layer));
  return hits.slice(0, MOST).map((each) => each.hit);
}

/** A point on a geometry: a point itself, else the middle of its first ring or line. */
export function pointOn(geometry: { type: string; coordinates?: unknown } | null | undefined): [number, number] | null {
  let coordinates = geometry?.coordinates;
  while (Array.isArray(coordinates) && Array.isArray(coordinates[0])) {
    const inner: unknown[] = coordinates;
    coordinates = Array.isArray(inner[0]) && Array.isArray((inner[0] as unknown[])[0]) ? inner[0] : inner[Math.floor(inner.length / 2)];
  }
  if (!Array.isArray(coordinates) || typeof coordinates[0] !== "number" || typeof coordinates[1] !== "number") return null;
  return [coordinates[0], coordinates[1]];
}

/** How far a hit is from where the map looks, as people read it. */
export function distanceText(from: { lng: number; lat: number }, to: { lng: number; lat: number }): string {
  const rad = Math.PI / 180;
  const dLat = (to.lat - from.lat) * rad;
  const dLng = (to.lng - from.lng) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(dLng / 2) ** 2;
  const metres = 2 * 6371000 * Math.asin(Math.sqrt(a));
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
}
