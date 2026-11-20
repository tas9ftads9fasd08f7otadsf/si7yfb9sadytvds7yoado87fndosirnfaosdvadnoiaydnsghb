import type { Named } from "@/lib/search";

/** What the store asks of the map, which loads after it. */
/** 135 A saved point as the map draws it: its spot and the ink its mark wears. */
export interface SavedMark {
  id: string;
  lng: number;
  lat: number;
  ink?: string;
}

export interface MapControl {
  draw(): void;
  resize(): void;
  stopLive(): void;
  watchPhone(isShared: boolean): void;
  showPhone(): void;
  readRegions(): void;
  camera(): { lat: number; lng: number; zoom: number };
  /** 57 West, south, east and north of what the map shows now. */
  box(): number[];
  /** The map as drawn now, for its preview picture. */
  snapshot(): Promise<Blob | null>;
  remove(): void;
  /** 100 The named features in what the map has loaded, for the search. */
  namedFeatures(): Named[];
  /** 100 To a point, or to a box when one is known. */
  flyTo(lng: number, lat: number, box?: [number, number, number, number]): void;
  /** 135 The saved points, and the open line's or area's shape, in layers of their own; null takes them off. */
  showSaved(marks: SavedMark[] | null, shape: { type: string; coordinates: unknown } | null): void;
}

let control: MapControl | null = null;

export const mapControl = () => control;

export function setMapControl(made: MapControl | null) {
  control = made;
}
