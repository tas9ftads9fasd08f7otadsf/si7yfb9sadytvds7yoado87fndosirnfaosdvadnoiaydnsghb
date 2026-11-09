import type { Centre } from "./region";

export const OPENING = { center: [19.5, 48.5] as [number, number], zoom: 6 };

/** Whether the camera has left where the map opened, so framing it would undo someone's move. */
export function leftOpening(centre: Centre, zoom: number): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  return !(near(centre.lng, OPENING.center[0]) && near(centre.lat, OPENING.center[1]) && near(zoom, OPENING.zoom));
}
