import type { Coverage, Start } from "./types";

/** One change to a map, a case per `PeerWebEdit.Change`; each target sends it its own way. */
export type Edit =
  | { kind: "name"; name: string }
  | { kind: "note"; note: string }
  | { kind: "nameIn"; language: string; name: string }
  | { kind: "noteIn"; language: string; note: string }
  | { kind: "layerShown"; layer: string; shown: boolean }
  | { kind: "layersShown"; shown: boolean }
  | { kind: "layerName"; layer: string; name: string }
  | { kind: "layerOpacity"; layer: string; opacity: string }
  | { kind: "order"; layers: string[] }
  | { kind: "styleName"; style: string; name: string }
  | { kind: "addStyle"; name: string }
  | { kind: "removeStyle"; style: string }
  | { kind: "minimumVersion"; app: string; browser: string }
  | { kind: "start"; start: Start }
  // Kept as typed, so the place written is the one the person sees.
  | { kind: "startAt"; lat: string; lon: string; zoom: string }
  | { kind: "coverage"; coverage: Coverage }
  | { kind: "appearance"; appearance: string }
  | { kind: "symbol"; symbol: string }
  | { kind: "iconTint"; tint: string }
  | { kind: "addPackages"; overlays: string[] }
  | { kind: "removeLayer"; layer: string }
  // The Options panel's and the Details layout's rows are described by the phone, keys and all.
  | { kind: "layerOptions"; fields: Record<string, string> }
  | { kind: "layerDetails"; fields: Record<string, string> };
