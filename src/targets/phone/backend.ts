import type { Answer, Backend, PairStarted, Saved } from "@/backend/types";
import { queryOf, type Shelving } from "@/lib/edit";
import { peoplePathOf, peopleQueryOf } from "@/lib/people";
import type { APIAsk, APIRead, EsriChange, OfflineAsk, PhonePlace, Portable, SessionAnswer } from "@/lib/types";
import { EDIT_CHECK, PAIR, ROOT, SESSION, WORDS_PATH, readJSON, readJSONIfAny, savedName } from "./phone";

let token: () => string | null = () => null;

async function answered<T>(answer: Response, read: (answer: Response) => Promise<T>): Promise<Answer<T>> {
  if (!answer.ok) return { ok: false, status: answer.status, said: await answer.text() };
  return { ok: true, value: await read(answer) };
}

const json = <T>(answer: Response) => answer.json() as Promise<T>;

/** A call that may change something carries the token the password was traded for. */
async function editing<T>(path: string, method = "POST", body?: BodyInit,
  read: (answer: Response) => Promise<T> = json<T>, more: Record<string, string> = {}): Promise<Answer<T>> {
  // Without a token the phone can only refuse, and Chrome logs every refusal as an error.
  if (!token()) return { ok: false, status: 401, said: "" };
  const answer = await fetch(path, { method, body, cache: "no-store",
    headers: { ...more, Authorization: `Bearer ${token()}` } });
  return answered(answer, read);
}

const saved = async (answer: Response): Promise<Saved> =>
  ({ blob: await answer.blob(), name: savedName(answer.headers.get("Content-Disposition") ?? "") });

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

/** 3397 What `PeerWebAPIForm` reads off the query; the cookie itself goes in a header, never the address. */
export function apiAskQuery(ask: APIAsk = {}): Record<string, string> {
  const query: Record<string, string> = {};
  if (ask.cookies?.isOn) query.cookies = JSON.stringify(ask.cookies);
  if (ask.tint) query.tint = ask.tint;
  return query;
}

const COOKIE_HEADER = "X-Riki-Cookie";

const cookieHeader = (ask: APIAsk = {}): Record<string, string> =>
  ask.cookie?.trim() ? { [COOKIE_HEADER]: ask.cookie.trim() } : {};

/** 67 A service's change as `PeerWebEsriServices.asked` reads it. */
export function esriQueryOf(serviceID: string, asked: EsriChange): Record<string, string> {
  switch (asked.kind) {
    case "add": return { service: serviceID, add: String(asked.layer) };
    case "remove": return { service: serviceID, remove: String(asked.layer) };
    case "read": return { service: serviceID, read: "1" };
    case "forget": return { service: serviceID, forget: "1" };
  }
}

/** 57 An area, a zoom and the ticked layers as `PeerWebOffline.Asked` reads them. */
export function offlineQueryOf(ask: OfflineAsk): Record<string, string> {
  const query: Record<string, string> = { box: ask.box.join(",") };
  if (ask.chosen) query.chosen = "1";
  if (ask.zoom != null) query.zoom = String(ask.zoom);
  if (ask.layers) query.layers = ask.layers.join(",");
  return query;
}

/** The phone sharing these maps, asked over `/riki/v1` as Nearby sharing answers. */
export const backend: Backend = {
  target: "phone",
  offers: () => true,

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

  pair: async () => answered(await fetch(PAIR, { method: "POST", cache: "no-store" }), json<PairStarted>),

  pairState: async (id) => answered(await fetch(`${PAIR}/${id}`, { cache: "no-store" }),
    json<{ waiting: true } | { token: string }>),

  pairPicture: (id) => `${PAIR}/${id}.png`,

  useToken(get) {
    token = get;
  },

  // 76 The phone is asked again on its heartbeat.
  onChanged: () => () => {},

  maps: () => readJSON(`${ROOT}/device`),
  map: (id) => readJSON(`${ROOT}/maps/${id}`),

  async style(ask) {
    const query = new URLSearchParams({ theme: ask.theme, tiles: ask.tiles, hide: [...ask.hidden].sort().join(","),
      atlas: "1" });
    if (ask.styleID) query.set("styleID", ask.styleID);
    if (ask.revision != null) query.set("rev", String(ask.revision));
    if (ask.direct) query.set("direct", "1");
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
  duplicateMap: (id) => editing(`${ROOT}/maps/${id}/duplicate`),
  deleteMap: (id, name) =>
    editing(`${ROOT}/maps/${id}/delete?${new URLSearchParams({ name })}`, "POST", undefined, async () => null),
  shelve: (shelving) => editing(`${ROOT}/shelf?${new URLSearchParams(shelfQueryOf(shelving))}`),
  switches: (mapID) => editing(`${ROOT}/maps/${mapID}/switches`, "GET"),
  setPicture: (mapID, kind, picture, style) => editing(`${ROOT}/maps/${mapID}/picture?kind=${kind}`
    + (style ? `&style=${encodeURIComponent(style)}` : ""), "POST", picture),
  people: (of) => editing(`${ROOT}/${peoplePathOf(of)}`, "GET"),
  askPeople: (of, ask) => editing(`${ROOT}/${peoplePathOf(of)}?${new URLSearchParams(peopleQueryOf(ask))}`),

  layerOptions: (mapID) => editing(`${ROOT}/maps/${mapID}/layer-options`, "GET"),
  roadSigns(mapID, ask) {
    const query = new URLSearchParams(Object.entries(ask).filter(([, value]) => value) as [string, string][]);
    return editing(`${ROOT}/maps/${mapID}/road-signs?${query}`, "GET");
  },
  iconURL: (name) => `/web/icons/${encodeURIComponent(name)}`,
  testLayer: (mapID, layerID) =>
    editing(`${ROOT}/maps/${mapID}/layer-test?${new URLSearchParams({ layer: layerID })}`, "GET"),
  packages: (mapID) => editing(`${ROOT}/maps/${mapID}/packages`, "GET"),
  otherLayers: (mapID) => editing(`${ROOT}/maps/${mapID}/other-layers`, "GET"),
  addCopies: (mapID, layers) =>
    editing(`${ROOT}/maps/${mapID}/add-copies?${new URLSearchParams({ layers: layers.join(",") })}`),
  servers: () => editing(`${ROOT}/servers`, "GET"),
  addServer: (kind, address, name) => editing(`${ROOT}/add-server?${new URLSearchParams({ kind, address, name })}`),
  editServer: (id, { name, symbol, tintHex }) => {
    const asked = Object.entries({ name, symbol, tint: tintHex }).filter(([, value]) => value !== undefined);
    return editing(`${ROOT}/servers/${id}/edit?${new URLSearchParams(asked as [string, string][])}`);
  },
  duplicateServer: (id) => editing(`${ROOT}/servers/${id}/duplicate`),
  deleteServer: (id) => editing(`${ROOT}/servers/${id}/delete`),
  addServerLayer: (id, { name, address, number }) => {
    const asked = Object.entries({ name, address, number: number?.toString() }).filter(([, value]) => value !== undefined);
    return editing(`${ROOT}/servers/${id}/add-layer?${new URLSearchParams(asked as [string, string][])}`);
  },
  saveServerForm: (id, { kind, address, referrer, headers, login }) => editing(`${ROOT}/servers/${id}/form?${
    new URLSearchParams({ kind, address, referrer, headers: JSON.stringify(headers), login: JSON.stringify(login) })}`),
  removeServerLayer: (id, layer) => editing(`${ROOT}/servers/${id}/remove-layer?${new URLSearchParams({ layer })}`),
  importServers: async (file) => editing(`${ROOT}/import-servers`, "POST", await file.arrayBuffer()),
  exportServers: (id) =>
    editing(id ? `${ROOT}/servson?${new URLSearchParams({ server: id })}` : `${ROOT}/servson`, "GET", undefined, saved),
  addServerLayers: (mapID, picks) =>
    editing(`${ROOT}/maps/${mapID}/add-server-layers?${new URLSearchParams({ picks: JSON.stringify(picks) })}`),

  readAPI(address, reading, ask) {
    const query = new URLSearchParams({ address, ...apiAskQuery(ask) });
    if (reading) query.set("reading", JSON.stringify(reading));
    return editing(`${ROOT}/read-api?${query}`, "GET", undefined, json<APIRead>, cookieHeader(ask));
  },

  addAPI(mapID, address, reading, name, ask) {
    const query = new URLSearchParams({ address, reading: JSON.stringify(reading), name, ...apiAskQuery(ask) });
    return editing(`${ROOT}/maps/${mapID}/add-api?${query}`, "POST", undefined, json<Portable>, cookieHeader(ask));
  },

  addFile: async (mapID, file, system) => editing(
    `${ROOT}/maps/${mapID}/add-file?${new URLSearchParams({ file: file.name, ...system ? { system } : {} })}`, "POST",
    await file.arrayBuffer()),
  readDXF: async (mapID, file) =>
    editing(`${ROOT}/maps/${mapID}/read-dxf?${new URLSearchParams({ file: file.name })}`, "POST", await file.arrayBuffer()),
  esriServices: (mapID) => editing(`${ROOT}/maps/${mapID}/esri-services`, "GET"),
  changeEsriService: (mapID, serviceID, asked) =>
    editing(`${ROOT}/maps/${mapID}/esri-service?${new URLSearchParams(esriQueryOf(serviceID, asked))}`),
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

  publishOffer: (mapID) => editing(`${ROOT}/maps/${mapID}/publish`, "GET"),
  publishSend: (mapID, request) => editing(`${ROOT}/maps/${mapID}/publish`, "POST", JSON.stringify(request), undefined,
    { "Content-Type": "application/json" }),
  publishAnswer: (mapID, ask) => editing(`${ROOT}/maps/${mapID}/publish?ask=${encodeURIComponent(ask)}`, "GET"),
  publishCancel: (mapID, ask) =>
    editing(`${ROOT}/maps/${mapID}/publish?cancel=${encodeURIComponent(ask)}`, "POST", undefined, async () => null),
  saved: () => editing(`${ROOT}/saved`, "GET"),
  savedFeature: (id) => editing(`${ROOT}/saved/${encodeURIComponent(id)}`, "GET"),

  regions: (mapID) => readJSON(`${ROOT}/maps/${mapID}/regions`),
  downloadRegion: (mapID, regionID) =>
    editing(`${ROOT}/maps/${mapID}/download?region=${encodeURIComponent(regionID)}`, "POST", undefined, async () => null),

  offlinePlan: (mapID, ask) =>
    editing(`${ROOT}/maps/${mapID}/tile-download?${new URLSearchParams(offlineQueryOf(ask))}`, "GET"),
  offlineDownload: (mapID, ask, action) => editing(
    `${ROOT}/maps/${mapID}/tile-download?${new URLSearchParams({ ...offlineQueryOf(ask), [action]: "1" })}`),
  discardStored: (mapID, layerID) => editing(
    `${ROOT}/maps/${mapID}/discard-stored?${new URLSearchParams({ layer: layerID })}`, "POST", undefined,
    async () => null),

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

  async search(mapID, text, near) {
    const query = new URLSearchParams({ q: text });
    if (near) {
      query.set("lat", near.lat.toFixed(5));
      query.set("lon", near.lng.toFixed(5));
    }
    const answer = await fetch(`${ROOT}/maps/${mapID}/search?${query}`, { cache: "no-store" });
    if (answer.status === 404) return null;
    if (!answer.ok) throw new Error(await answer.text());
    return ((await answer.json()) as { places?: PhonePlace[] }).places ?? [];
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
