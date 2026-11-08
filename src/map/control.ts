/** What the store asks of the map, which loads after it. */
export interface MapControl {
  draw(): void;
  resize(): void;
  stopLive(): void;
  watchPhone(isShared: boolean): void;
  showPhone(): void;
  readRegions(): void;
  camera(): { lat: number; lng: number; zoom: number };
  /** The map as drawn now, for its preview picture. */
  snapshot(): Promise<Blob | null>;
  remove(): void;
}

let control: MapControl | null = null;

export const mapControl = () => control;

export function setMapControl(made: MapControl | null) {
  control = made;
}
