import { startQuery } from "./places";
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
  // 142: the map's own label; blank takes it away.
  | { kind: "category"; category: string }
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

/** 52 An arrangement of the Maps list as `PeerWebShelf.shelving` reads it. */
export function shelfQueryOf(shelving: Shelving): Record<string, string> {
  switch (shelving.kind) {
    case "order": return { order: shelving.maps.join(",") };
    case "sort": return { sort: shelving.sort };
    case "makeFolder": return { folder: shelving.name, maps: shelving.maps.join(",") };
    case "join": return { stack: shelving.folder, map: shelving.map };
    case "leave": return { leave: shelving.map };
    case "renameFolder": return { stack: shelving.folder, name: shelving.name };
    case "folderSymbol": return { stack: shelving.folder, symbol: shelving.symbol };
    case "folderTint": return { stack: shelving.folder, iconTint: shelving.tint };
  }
}

/** An edit as `/edit` reads it, the query `PeerWebEdit(query:)` takes apart. */
export function queryOf(edit: Edit): Record<string, string> {
  switch (edit.kind) {
    case "name": return { name: edit.name };
    case "note": return { note: edit.note };
    case "nameIn": return { language: edit.language, name: edit.name };
    case "noteIn": return { language: edit.language, note: edit.note };
    case "layerShown": return { layer: edit.layer, shown: edit.shown ? "1" : "0" };
    case "layersShown": return { shownAll: edit.shown ? "1" : "0" };
    case "layerName": return { layer: edit.layer, name: edit.name };
    case "layerOpacity": return { layer: edit.layer, opacity: edit.opacity };
    case "order": return { order: edit.layers.join(",") };
    case "styleName": return { style: edit.style, name: edit.name };
    case "addStyle": return { addStyle: edit.name };
    case "removeStyle": return { removeStyle: edit.style };
    case "styleSymbol": return { style: edit.style, symbol: edit.symbol };
    case "styleTint": return { style: edit.style, iconTint: edit.tint };
    case "styleNote": return { style: edit.style, note: edit.note };
    case "styleNameIn": return { style: edit.style, language: edit.language, name: edit.name };
    case "resetStyle": return { resetStyle: edit.style };
    case "minimumVersion": return { minimumApp: edit.app, minimumBrowser: edit.browser };
    case "start": return startQuery(edit.start);
    case "startAt": return { start: "coordinates", lat: edit.lat, lon: edit.lon, zoom: edit.zoom };
    case "coverage": return { coverage: JSON.stringify(edit.coverage) };
    case "appearance": return { appearance: edit.appearance };
    case "symbol": return { symbol: edit.symbol };
    case "iconTint": return { iconTint: edit.tint };
    case "addPackages": return { addPackages: edit.overlays.join(",") };
    case "removeLayer": return { removeLayer: edit.layer };
    case "styleOrder": return { styleOrder: edit.styles.join(",") };
    case "arrange": return { arrange: edit.action };
    case "groupByOrigin": return { groupByOrigin: edit.groups ? "1" : "0" };
    case "availability": return { [edit.switch]: edit.shown ? "1" : "0" };
    case "category": return { category: edit.category };
    case "lock": return { lock: edit.locked ? "1" : "0" };
    case "layerOptions":
    case "layerDetails": return edit.fields;
  }
}
