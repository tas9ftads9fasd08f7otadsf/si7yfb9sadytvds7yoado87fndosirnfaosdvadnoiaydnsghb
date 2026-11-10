import type { Answer, Backend, Saved } from "@/backend/types";
import type { Edit } from "@/lib/edit";
import { startQuery } from "@/lib/places";
import type { SessionAnswer } from "@/lib/types";
import { EDIT_CHECK, ROOT, SESSION, WORDS_PATH, readJSON, readJSONIfAny, savedName } from "./phone";

let token: () => string | null = () => null;

async function answered<T>(answer: Response, read: (answer: Response) => Promise<T>): Promise<Answer<T>> {
  if (!answer.ok) return { ok: false, status: answer.status, said: await answer.text() };
  return { ok: true, value: await read(answer) };
}

const json = <T>(answer: Response) => answer.json() as Promise<T>;

/** A call that may change something carries the token the password was traded for. */
async function editing<T>(path: string, method = "POST", body?: BodyInit,
  read: (answer: Response) => Promise<T> = json<T>): Promise<Answer<T>> {
  const answer = await fetch(path, { method, body, cache: "no-store", headers: { Authorization: `Bearer ${token()}` } });
  return answered(answer, read);
}

const saved = async (answer: Response): Promise<Saved> =>
  ({ blob: await answer.blob(), name: savedName(answer.headers.get("Content-Disposition") ?? "") });

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
    case "minimumVersion": return { minimumApp: edit.app, minimumBrowser: edit.browser };
    case "start": return startQuery(edit.start);
    case "startAt": return { start: "coordinates", lat: edit.lat, lon: edit.lon, zoom: edit.zoom };
    case "coverage": return { coverage: JSON.stringify(edit.coverage) };
    case "appearance": return { appearance: edit.appearance };
    case "symbol": return { symbol: edit.symbol };
    case "iconTint": return { iconTint: edit.tint };
    case "addPackages": return { addPackages: edit.overlays.join(",") };
    case "removeLayer": return { removeLayer: edit.layer };
    case "layerOptions":
    case "layerDetails": return edit.fields;
  }
}

/** The phone sharing these maps, asked over `/riki/v1` as Nearby sharing answers. */
export const backend: Backend = {
  target: "phone",

  words: () => readJSON(WORDS_PATH),

  async session() {
    const answer = await fetch(SESSION, { cache: "no-store" });
    // A phone from before guests lets every browser in.
    if (answer.status === 404) return { ok: true, value: { standing: "admitted", viewers: null } as SessionAnswer };
    return answered(answer, json<SessionAnswer>);
  },

  askToJoin: async () => answered(await fetch(`${SESSION}/ask`, { method: "POST", cache: "no-store" }), json<SessionAnswer>),

  unlock: async (key) => answered(
    await fetch(EDIT_CHECK, { method: "POST", cache: "no-store", headers: { "X-Riki-Edit": key } }), json<{ token: string }>),

  useToken(get) {
    token = get;
  },

  maps: () => readJSON(`${ROOT}/device`),
  map: (id) => readJSON(`${ROOT}/maps/${id}`),

  async style(ask) {
    const query = new URLSearchParams({ theme: ask.theme, tiles: ask.tiles, hide: [...ask.hidden].sort().join(","),
      atlas: "1" });
    if (ask.styleID) query.set("styleID", ask.styleID);
    if (ask.revision != null) query.set("rev", String(ask.revision));
    return answered(await fetch(`${ROOT}/maps/${ask.mapID}/style?${query.toString()}`, { cache: "no-store" }), json);
  },

  change(mapID, styleID, edit) {
    const asked = new URLSearchParams(queryOf(edit));
    if (styleID) asked.set("styleID", styleID);
    return editing(`${ROOT}/maps/${mapID}/edit?${asked.toString()}`);
  },

  newMap: (name) => editing(`${ROOT}/new-map?${new URLSearchParams({ name })}`),
  importMap: async (file) => editing(`${ROOT}/new-map`, "POST", await file.arrayBuffer()),
  exportMap: (id) => editing(`${ROOT}/maps/${id}/mapson`, "GET", undefined, saved),
  setPicture: (mapID, kind, picture) => editing(`${ROOT}/maps/${mapID}/picture?kind=${kind}`, "POST", picture),

  layerOptions: (mapID) => editing(`${ROOT}/maps/${mapID}/layer-options`, "GET"),
  packages: (mapID) => editing(`${ROOT}/maps/${mapID}/packages`, "GET"),
  servers: () => editing(`${ROOT}/servers`, "GET"),
  addServer: (kind, address, name) => editing(`${ROOT}/add-server?${new URLSearchParams({ kind, address, name })}`),
  importServers: async (file) => editing(`${ROOT}/import-servers`, "POST", await file.arrayBuffer()),
  exportServers: (id) =>
    editing(id ? `${ROOT}/servson?${new URLSearchParams({ server: id })}` : `${ROOT}/servson`, "GET", undefined, saved),
  addServerLayers: (mapID, picks) =>
    editing(`${ROOT}/maps/${mapID}/add-server-layers?${new URLSearchParams({ picks: JSON.stringify(picks) })}`),

  readAPI(address, reading) {
    const query = new URLSearchParams({ address });
    if (reading) query.set("reading", JSON.stringify(reading));
    return editing(`${ROOT}/read-api?${query}`, "GET");
  },

  addAPI(mapID, address, reading, name) {
    const query = new URLSearchParams({ address, reading: JSON.stringify(reading), name });
    return editing(`${ROOT}/maps/${mapID}/add-api?${query}`);
  },

  addFile: async (mapID, file) =>
    editing(`${ROOT}/maps/${mapID}/add-file?${new URLSearchParams({ file: file.name })}`, "POST", await file.arrayBuffer()),
  readAddress: (address) => editing(`${ROOT}/read-address?${new URLSearchParams({ address })}`, "GET"),
  addTiles: (mapID, template) => editing(`${ROOT}/maps/${mapID}/add-tiles?${new URLSearchParams({ template })}`),
  addServiceLayers: (mapID, address, picks) => editing(
    `${ROOT}/maps/${mapID}/add-service-layers?${new URLSearchParams({ address, picks: JSON.stringify(picks) })}`),

  coverage: (mapID) => editing(`${ROOT}/maps/${mapID}/coverage`, "GET"),
  coveragePlaces: () => editing(`${ROOT}/coverage-places`, "GET"),

  startPlaces(kind, query) {
    const asked = new URLSearchParams({ kind });
    if (query) asked.set("q", query);
    return editing(`${ROOT}/start-places?${asked.toString()}`, "GET");
  },

  regions: (mapID) => readJSON(`${ROOT}/maps/${mapID}/regions`),
  downloadRegion: (mapID, regionID) =>
    editing(`${ROOT}/maps/${mapID}/download?region=${encodeURIComponent(regionID)}`, "POST", undefined, async () => null),

  live: (mapID, layerID, box) => readJSON(`${ROOT}/maps/${mapID}/live/${layerID}?bbox=${box}`),

  identify(mapID, ask) {
    const query = new URLSearchParams({ lon: String(ask.lon), lat: String(ask.lat), box: ask.box.join(","),
      size: ask.size.join(",") });
    if (ask.styleID) query.set("style", ask.styleID);
    return readJSON(`${ROOT}/maps/${mapID}/identify?${query}`);
  },

  details(mapID, layerID, values) {
    const query = new URLSearchParams({ layer: layerID, values: JSON.stringify(values) });
    return readJSONIfAny(`${ROOT}/maps/${mapID}/details?${query}`);
  },

  phoneLocation: () => readJSON(`${ROOT}/location`),

  async icon(name) {
    const answer = await fetch(`/web/icons/${encodeURIComponent(name)}`);
    if (!answer.ok) return null;
    return { image: await answer.blob(), sdf: answer.headers.get("X-Riki-SDF") === "1",
      pixelRatio: Number(answer.headers.get("X-Riki-Pixel-Ratio")) || 1 };
  },

  symbolURL: (name) => `url("/web/symbols/${encodeURIComponent(name || "map")}")`
};
