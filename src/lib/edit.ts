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
  // 51: a style's own icon, its ground and its note, as the phone's style page sets them.
  | { kind: "styleSymbol"; style: string; symbol: string }
  | { kind: "styleTint"; style: string; tint: string }
  | { kind: "styleNote"; style: string; note: string }
  | { kind: "styleNameIn"; style: string; language: string; name: string }
  | { kind: "resetStyle"; style: string }
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
  // 50: every style, in the order the list shows them.
  | { kind: "styleOrder"; styles: string[] }
  | { kind: "arrange"; action: ArrangeAction }
  | { kind: "groupByOrigin"; groups: boolean }
  | { kind: "availability"; switch: AvailabilitySwitch; shown: boolean }
  // 118: the phone asks its person for Face ID before it locks or unlocks.
  | { kind: "lock"; locked: boolean }
  // The Options panel's and the Details layout's rows are described by the phone, keys and all.
  | { kind: "layerOptions"; fields: Record<string, string> }
  | { kind: "layerDetails"; fields: Record<string, string> };

/** 50 Edit map's Styles card's rows, as `PeerWebEdit.Arranging` names them. */
export type ArrangeAction = "unite" | "reset" | "stylePerLayer" | "restoreStyles";

/** 50 Availability's switches, as `PeerWebEdit.Availability` names them. */
export type AvailabilitySwitch = "picker" | "carPlay" | "legend" | "world";

/** 52 One arrangement of the Maps list, a case per `PeerWebShelf.Shelving`. */
export type Shelving =
  | { kind: "order"; maps: string[] }
  | { kind: "sort"; sort: "nameAscending" | "nameDescending" }
  | { kind: "makeFolder"; name: string; maps: string[] }
  | { kind: "join"; folder: string; map: string }
  | { kind: "leave"; map: string }
  | { kind: "renameFolder"; folder: string; name: string }
  | { kind: "folderSymbol"; folder: string; symbol: string }
  /** 56 `#RRGGBB`, or blank for the named map's ground. */
  | { kind: "folderTint"; folder: string; tint: string };
