import { create } from "zustand";
import type { Speeds } from "@/lib/traffic";
import { edited } from "@/lib/coverage";
import { backend } from "@backend";
import type { Answer, Saved } from "@/backend/types";
import type { Edit } from "@/lib/edit";
import { HEARTBEAT_EVERY, THEME_KEY, TOKEN_KEY, typedKey } from "@/lib/page";
import { BY_NAME } from "@/lib/places";
import { type Route, type ServerPart, mapOf, pathOf, readRoute } from "@/lib/route";
import type { RegionOffer } from "@/lib/region";
import type { APIRead, APIReading, Coverage, CoveragePlaces, CoverageSide, CoverageSideKey, CoverageSummary, Device, FoundPlace,
  LayerOptions, PackageRow, Packages, Pictures, Portable, Region, ServerList, ServerPick, ServiceRead,
  SessionAnswer, SharedMap, Standing, StackLayer, Start } from "@/lib/types";
import { ENGLISH, type Words, readPhoneWords } from "@/lib/words";
import { mapControl } from "@/map/control";

export type Theme = "auto" | "light" | "dark";
export { SERVER_PARTS, type ServerPart } from "@/lib/route";
export const THEMES: Record<Theme, string> = { auto: "circle.lefthalf.filled", light: "sun.max", dark: "moon" };

export interface ViewerState {
  route: Route;
  words: Words;
  standing: Standing | null;
  edits: boolean;
  viewers: number | null;
  /** Whether the phone answered last time it was asked; null until it has been. */
  connected: boolean | null;
  gateDevice: string;
  editToken: string | null;
  device: Device | null;
  mapID: string | null;
  styleID: string | null;
  portable: Portable | null;
  hidden: Set<string>;
  pictures: Map<string, Pictures>;
  sideShown: boolean;
  editing: boolean;
  editEpoch: number;
  theme: Theme;
  notice: string | null;
  sharesLocation: boolean;
  /** Bytes a second now arriving from the phone and from elsewhere; null until measured. */
  traffic: Speeds | null;
  regionOffer: RegionOffer;
  zoomText: string;
  pointerText: string;
  addedLanguages: Set<string>;
  startKind: string | null;
  startFound: FoundPlace[] | null;
  coverage: CoverageSummary | null;
  coverageShown: boolean;
  coverageSide: CoverageSideKey;
  coverageOpen: Map<string, boolean>;
  coverageQuery: string;
  coveragePlaces: CoveragePlaces | null;
  packages: Packages | null;
  packageTicks: Set<string>;
  addingPackages: boolean;
  servers: ServerList | null;
  serverID: string | null;
  serverPart: ServerPart;
  serverPicks: Map<string, ServerPick>;
  serviceRead: ServiceRead | null;
  layerOptions: LayerOptions | null;
  optionsOpen: Set<string>;
}

const firstState = (): ViewerState => ({
  route: { screen: "home" }, words: ENGLISH, standing: null, edits: false, viewers: null, connected: null, gateDevice: "",
  editToken: null, device: null,
  mapID: null, styleID: null, portable: null, hidden: new Set(), pictures: new Map(), sideShown: true,
  editing: false, editEpoch: 0, theme: "auto", notice: null, sharesLocation: false, traffic: null, regionOffer: null,
  zoomText: "", pointerText: "", addedLanguages: new Set(), startKind: null, startFound: null, coverage: null,
  coverageShown: false, coverageSide: "include", coverageOpen: new Map(), coverageQuery: "", coveragePlaces: null,
  packages: null, packageTicks: new Set(), addingPackages: false, servers: null, serverID: null, serverPart: "layers",
  serverPicks: new Map(),
  serviceRead: null, layerOptions: null, optionsOpen: new Set()
});

export const useViewer = create<ViewerState>(firstState);

const get = useViewer.getState;
const set = useViewer.setState;

// Guards and timers no screen shows.
const busy = { sessionStarted: false, heartbeat: undefined as ReturnType<typeof setTimeout> | undefined,
  notice: undefined as ReturnType<typeof setTimeout> | undefined, layerOptions: null as string | null,
  packages: null as string | null, servers: false, coverage: null as string | null, addressKey: null as string | null,
  coverageEdits: Promise.resolve() };

export function resetViewer() {
  clearTimeout(busy.heartbeat);
  clearTimeout(busy.notice);
  Object.assign(busy, { sessionStarted: false, layerOptions: null, packages: null, servers: false, coverage: null,
    addressKey: null, coverageEdits: Promise.resolve() });
  set(firstState(), true);
}

export const shownMapOf = (state: ViewerState): SharedMap | undefined =>
  state.device?.maps.find((each) => each.id === state.mapID);

export function notice(text: string | null) {
  clearTimeout(busy.notice);
  set({ notice: text });
  if (text) busy.notice = setTimeout(() => notice(null), 4000);
}

function away() {
  set({ connected: false });
  notice(get().words.away);
}

// MARK: - Starting up

/** The phone's words; English from a phone or a file that has none. */
export async function loadWords() {
  try {
    const said = readPhoneWords(await backend.words());
    if (said) {
      set({ words: said.words as Words });
      document.documentElement.lang = said.language;
    }
  } catch { /* English */ }
}

export function restoreKept() {
  const { route } = get();
  busy.addressKey = route.screen === "unlock" ? route.key : null;
  try {
    set({ editToken: sessionStorage.getItem(TOKEN_KEY) });
  } catch { /* asked again */ }
  try {
    const kept = localStorage.getItem(THEME_KEY);
    if (kept === "auto" || kept === "light" || kept === "dark") set({ theme: kept });
  } catch { /* no storage: Automatic */ }
  applyTheme();
}

// MARK: - Light or dark

export function isDark() {
  const { theme } = get();
  return theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
}

function applyTheme() {
  const { theme } = get();
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function nextTheme() {
  const order = Object.keys(THEMES) as Theme[];
  const theme = order[(order.indexOf(get().theme) + 1) % order.length] ?? "auto";
  set({ theme });
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch { /* kept for this visit only */ }
  applyTheme();
  mapControl()?.draw();
}

// MARK: - Let in by the phone

async function heartbeat() {
  clearTimeout(busy.heartbeat);
  try {
    const answer = await backend.session();
    set({ connected: answer.ok });
    if (answer.ok) applySession(answer.value);
  } catch {
    away();
  }
  busy.heartbeat = setTimeout(heartbeat, HEARTBEAT_EVERY);
}

export async function askToJoin() {
  try {
    const answer = await backend.askToJoin();
    if (answer.ok) applySession(answer.value);
  } catch {
    away();
  }
}

export function applySession(answer: SessionAnswer) {
  const was = get().standing;
  const edits = answer.edits === true;
  set({ standing: answer.standing, edits, viewers: typeof answer.viewers === "number" ? answer.viewers : null });
  if (!edits && get().editToken) keepToken(null);
  if (answer.device) set({ gateDevice: answer.device });
  if (answer.standing !== "admitted") {
    mapControl()?.stopLive();
  } else if (was !== "admitted") {
    void readDevice();
    if (busy.addressKey) void checkKey(busy.addressKey);
  }
}

/** A phone's screen is told to use the app; it is never counted as one looking. */
export function startSession(isSmall: boolean) {
  if (busy.sessionStarted || isSmall) return;
  busy.sessionStarted = true;
  void heartbeat();
}

// MARK: - Reading the phone

// MARK: - The address

const LAST_MAP_KEY = "riki-map";

/** Moves to a screen: a new entry in the browser's history, or the one shown replaced. */
export function go(route: Route, { replace = false } = {}) {
  const address = pathOf(route) + location.hash;
  if (address !== location.pathname + location.hash) {
    // Next's router follows these and keeps its own state in the entry.
    if (replace) history.replaceState(null, "", address);
    else history.pushState(null, "", address);
  }
  followRoute(route);
}

/** The address the page opened at or was walked back to. */
export function readAddress() {
  followRoute(readRoute(location.pathname));
}

function followRoute(route: Route) {
  set({ route, editing: route.screen === "edit",
    serverID: route.screen === "servers" ? route.server ?? null : null,
    serverPart: route.screen === "servers" ? route.part ?? "layers" : "layers" });
  const { device, mapID, styleID } = get();
  if (!device) return;
  const wanted = mapOf(route);
  const style = "style" in route ? route.style : undefined;
  if (wanted && wanted !== mapID && device.maps.some((each) => each.id === wanted)) void pickMap(wanted, style ?? null);
  else if (wanted === mapID && style && style !== styleID) pickStyle(style);
  else remember();
}

const defaultStyleOf = (portable: Portable | null) => portable?.selectedStyleID || portable?.styles?.[0]?.id;

/** The address follows the map and style on screen; the style only when it is not the one a map opens on. */
function remember() {
  const { route, mapID, styleID, portable, device } = get();
  if (!mapID) {
    if (route.screen === "home" && device?.maps.length === 0) go({ screen: "maps" }, { replace: true });
    return;
  }
  const style = styleID && styleID !== defaultStyleOf(portable) ? styleID : undefined;
  if (route.screen === "home" && !route.modal) {
    go(style ? { screen: "map", map: mapID, style } : { screen: "map", map: mapID }, { replace: true });
  } else if (route.screen === "map" && (route.map !== mapID || route.style !== style)) {
    const moved = { ...route, map: mapID };
    if (style) moved.style = style;
    else delete moved.style;
    go(moved, { replace: true });
  } else if ("map" in route && route.map !== mapID) {
    go({ ...route, map: mapID }, { replace: true });
  }
}

function lastMap(): string | null {
  try {
    return localStorage.getItem(LAST_MAP_KEY);
  } catch {
    return null;
  }
}

export async function readDevice() {
  let device: Device;
  try {
    device = await backend.maps();
  } catch {
    if (get().standing !== "admitted") return;
    away();
    setTimeout(readDevice, 5000);
    return;
  }
  set({ device });
  const { words, mapID, styleID, route } = get();
  document.title = `${device.name} · ${words.app}`;
  const named = (id: string | null | undefined) => device.maps.find((each) => each.id === id);
  const first = named(mapID || mapOf(route)) ?? named(lastMap()) ?? device.maps[0];
  const style = "style" in route ? route.style : undefined;
  if (first) await pickMap(first.id, styleID || style || null);
  else remember();
  void readPictures();
  mapControl()?.watchPhone(device.sharesLocation === true);
  set({ sharesLocation: device.sharesLocation === true });
}

function picturesOf(portable: Portable | null): Pictures {
  const url = (data?: string | null) => data ? `data:image/jpeg;base64,${data}` : null;
  return { preview: url(portable?.previewPicture), icon: url(portable?.iconPicture),
    symbol: portable?.symbol, tint: portable?.iconTintHex };
}

function keepPictures(id: string, pictures: Pictures) {
  set({ pictures: new Map(get().pictures).set(id, pictures) });
}

/** A map's picture is in its portable copy; read once each, after the list stands. */
async function readPictures() {
  for (const shared of get().device?.maps ?? []) {
    if (get().pictures.has(shared.id)) continue;
    try {
      keepPictures(shared.id, picturesOf(await backend.map(shared.id)));
    } catch {
      keepPictures(shared.id, {});
    }
  }
}

export async function pickMap(id: string, styleID: string | null) {
  busy.layerOptions = null;
  try {
    localStorage.setItem(LAST_MAP_KEY, id);
  } catch { /* the first map next time */ }
  set({ mapID: id, addedLanguages: new Set(), startKind: null, startFound: null, coverage: null, coverageShown: false,
    coverageOpen: new Map(), packages: null, addingPackages: false, serverPicks: new Map(), serviceRead: null,
    layerOptions: null, optionsOpen: new Set() });
  let portable: Portable | null = null;
  try {
    portable = await backend.map(id);
    keepPictures(id, picturesOf(portable));
  } catch { /* drawn with nothing to edit */ }
  set({ portable });
  const styles = portable?.styles ?? [];
  const wanted = styles.find((style) => style.id === styleID);
  pickStyle(wanted ? wanted.id : (portable?.selectedStyleID || styles[0]?.id || null));
}

/** A style is an arrangement of the same layers: what it hides, the rest drawn. */
export function pickStyle(styleID: string | null) {
  const { portable } = get();
  const style = (portable?.styles ?? []).find((each) => each.id === styleID);
  const hidden = style?.arrangement?.hidden
    ?? (portable?.stack ?? []).filter((layer) => !layer.isEnabled).map((layer) => layer.id);
  set({ styleID, hidden: new Set(hidden) });
  drawStyle();
}

export function drawStyle() {
  const state = get();
  if (!shownMapOf(state) || state.standing !== "admitted") return;
  remember();
  mapControl()?.draw();
}

export function setLayerShown(id: string, isShown: boolean) {
  const hidden = new Set(get().hidden);
  if (isShown) hidden.delete(id);
  else hidden.add(id);
  set({ hidden });
  drawStyle();
}

// MARK: - The side bar

export function showSide(sideShown: boolean) {
  set({ sideShown });
  setTimeout(() => mapControl()?.resize(), 220);
}

export const toggleSide = () => showSide(!get().sideShown);

/** Edit map opens on its first tab; Done goes back to the map it edits. */
export function showEdit(editing: boolean) {
  const { mapID, route } = get();
  if (editing) {
    if (mapID) go({ screen: "edit", map: mapID, tab: "layers" });
    showSide(true);
    return;
  }
  if (route.screen === "edit") go({ screen: "map", map: route.map });
  else set({ editing: false });
  const page = document.getElementById("editPage");
  if (page?.contains(document.activeElement)) {
    // A field left focused off screen drags the side bar after it.
    (document.activeElement as HTMLElement).blur();
    document.getElementById("side")?.scrollTo({ left: 0 });
  }
}

// MARK: - The edit password

/** The phone counts wrong guesses; after five it stops listening for ten minutes. */
export async function checkKey(typed: string) {
  const key = typedKey(typed);
  if (!key) return;
  let answer: Answer<{ token: string }>;
  try {
    answer = await backend.unlock(key);
  } catch {
    away();
    return;
  }
  if (answer.ok) {
    keepToken(answer.value.token);
  } else {
    keepToken(null);
    const { words } = get();
    notice(answer.status === 429 ? words.tooManyTries : words.wrongPassword);
  }
  // The key leaves the address, and the history, once the phone has answered it.
  if (get().route.screen === "unlock") {
    busy.addressKey = null;
    go({ screen: "home" }, { replace: true });
  }
}

function keepToken(token: string | null) {
  set({ editToken: token || null });
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* kept for this page only */ }
}

backend.useToken(() => get().editToken);

/**
 * Asks something that needs the edit password: null when the phone can't be reached or the
 * token went stale, which sends the browser back to the password.
 */
async function editing<T>(asking: () => Promise<Answer<T>>, { quiet = false } = {}): Promise<Answer<T> | null> {
  let answer: Answer<T>;
  try {
    answer = await asking();
  } catch {
    if (!quiet) away();
    return null;
  }
  if (!answer.ok && answer.status === 401) {
    keepToken(null);
    if (get().editing) showEdit(false);
    notice(get().words.passwordAgain);
    return null;
  }
  return answer;
}

/** The value, or null once the phone's words for a refusal are shown. */
function told<T>(answer: Answer<T> | null): T | null {
  if (!answer) return null;
  if (answer.ok) return answer.value;
  notice(answer.said);
  return null;
}

// MARK: - Edit map

async function refreshDevice() {
  try {
    set({ device: await backend.maps() });
  } catch { /* names wait */ }
}

/** Sends one change; the phone answers with the map as it now stands. */
export async function change(edit: Edit): Promise<boolean> {
  const { editToken, styleID, mapID } = get();
  if (!editToken || !mapID) return false;
  const answer = await editing(() => backend.change(mapID, styleID, edit));
  if (!answer) return false;
  if (!answer.ok) {
    notice(answer.status === 409 && /layers/i.test(answer.said) ? get().words.layerCap : answer.said);
    set({ editEpoch: get().editEpoch + 1 });
    return false;
  }
  const portable = answer.value;
  set({ portable });
  if (mapID) keepPictures(mapID, picturesOf(portable));
  await refreshDevice();
  const stands = (portable.styles ?? []).some((style) => style.id === get().styleID);
  pickStyle(stands ? get().styleID : (portable.selectedStyleID ?? null));
  return true;
}

// MARK: - A new map

async function madeBy(asking: () => Promise<Answer<{ id: string }>>) {
  const made = told(await editing(asking));
  if (!made) return false;
  await refreshDevice();
  await pickMap(made.id, null);
  go({ screen: "map", map: made.id });
  return true;
}

export const makeMap = (name: string) => madeBy(() => backend.newMap(name));

export const importMap = (file: File) => madeBy(() => backend.importMap(file));

export const exportMap = () => saveFrom(() => backend.exportMap(get().mapID ?? ""));

/** 2997 The phone's servers as Share servers writes them, keys left on the phone. */
export const exportServers = () => saveFrom(() => backend.exportServers());

/** 27 One server alone, as its page's Sharing part exports it on the phone. */
export const exportServer = (id: string) => saveFrom(() => backend.exportServers(id));

/** 27 A server's page opens on Layers, as the phone's does. */
export function openServer(id: string | null) {
  if (id) {
    go({ screen: "servers", server: id, part: "layers" });
    showSide(true);
  } else {
    go({ screen: "servers" });
  }
}

export function showServerPart(part: ServerPart) {
  const { route } = get();
  if (route.screen === "servers" && route.server) go({ ...route, part });
  else set({ serverPart: part });
}

/** The address, camera and all, copied for whoever it is sent to. */
export async function shareAddress() {
  const address = location.href;
  try {
    await navigator.clipboard.writeText(address);
  } catch {
    // A phone's plain address is no secure context, so there is no clipboard API.
    const field = document.createElement("textarea");
    field.value = address;
    document.body.append(field);
    field.select();
    document.execCommand("copy");
    field.remove();
  }
  notice(get().words.linkCopied);
}

/** The map a click in a list opens; the address names it. */
export const openMap = (id: string) => go({ screen: "map", map: id });

/** The phone adds the servers it lacks and answers with them all. */
export async function importServers(file: File) {
  const servers = told(await editing(() => backend.importServers(file)));
  if (servers) set({ servers });
}

async function saveFrom(asking: () => Promise<Answer<Saved>>) {
  const answer = await editing(asking);
  if (!answer?.ok) return;
  const { blob, name } = answer.value;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function removeLayer(layer: StackLayer) {
  if (confirm(get().words.removeAsk.replace("{name}", layer.name))) void change({ kind: "removeLayer", layer: layer.id });
}

// MARK: - A layer's options

export async function loadLayerOptions() {
  const { mapID } = get();
  if (!mapID || busy.layerOptions === mapID) return;
  busy.layerOptions = mapID;
  // Offered once it answers.
  const answer = await editing(() => backend.layerOptions(mapID), { quiet: true });
  if (answer?.ok && get().mapID === mapID) set({ layerOptions: answer.value });
  busy.layerOptions = null;
}

export function toggleOptions(id: string) {
  const optionsOpen = new Set(get().optionsOpen);
  if (!optionsOpen.delete(id)) optionsOpen.add(id);
  set({ optionsOpen });
}

/** Every choice goes into each style, so the phone's list is read again. */
export async function setDrawn(fields: Record<string, string>) {
  if (await change({ kind: "layerOptions", fields })) set({ layerOptions: null });
}

/** A refused layout change reads the layout again: the phone's may have moved on. */
export async function setLayout(fields: Record<string, string>) {
  await change({ kind: "layerDetails", fields });
  set({ layerOptions: null });
}

// MARK: - Add layer

export const toggleAddingPackages = () => set({ addingPackages: !get().addingPackages });

export async function loadPackages() {
  const { mapID } = get();
  if (!mapID || busy.packages === mapID) return;
  busy.packages = mapID;
  const answer = await editing(() => backend.packages(mapID));
  busy.packages = null;
  if (!answer?.ok || get().mapID !== mapID) return;
  set({ packages: answer.value, packageTicks: new Set(answer.value.ticked) });
}

/** The base map draws its parts, so ticking one unticks the other. */
export function tickPackage(row: PackageRow) {
  if (!row.overlay) return;
  const ticks = new Set(get().packageTicks);
  if (!ticks.delete(row.overlay)) {
    for (const other of row.exclusive ?? []) ticks.delete(other);
    ticks.add(row.overlay);
  }
  set({ packageTicks: ticks });
}

export async function addPackages(overlays: string[]) {
  set({ addingPackages: false, packages: null });
  if (!await change({ kind: "addPackages", overlays })) set({ addingPackages: true });
}

export async function loadServers() {
  if (busy.servers) return;
  busy.servers = true;
  const answer = await editing(() => backend.servers());
  busy.servers = false;
  if (answer?.ok) set({ servers: answer.value });
}

/** The kinds a browser may add; an API server needs the phone's own form. */
export const SERVER_KINDS = ["arcgis", "tilejson", "tiles", "wmts", "wms", "mapproxy"] as const;

/** The phone reads the address first and answers with its servers, the new one among them. */
export async function addServer(kind: string, address: string, name: string): Promise<boolean> {
  const servers = told(await editing(() => backend.addServer(kind, address, name)));
  if (!servers) return false;
  set({ servers });
  return true;
}

export function tickServerRow(key: string, pick: ServerPick) {
  const serverPicks = new Map(get().serverPicks);
  if (!serverPicks.delete(key)) serverPicks.set(key, pick);
  set({ serverPicks });
}

/** Sends what adds layers; the phone answers with the map, and the adding is over. */
async function addedBy(asking: (mapID: string) => Promise<Answer<Portable>>): Promise<boolean> {
  const { mapID } = get();
  if (!mapID) return false;
  const portable = told(await editing(() => asking(mapID)));
  if (!portable) return false;
  set({ portable, addingPackages: false, packages: null, serviceRead: null, layerOptions: null });
  await refreshDevice();
  pickStyle(get().styleID);
  return true;
}

/** 3002: the icon's picture or the map's preview, read on the phone; none takes it away. */
export async function setPicture(kind: "icon" | "preview", picture?: Blob | null) {
  const { mapID } = get();
  if (!mapID) return;
  const body = picture ? await picture.arrayBuffer() : new ArrayBuffer(0);
  if (await addedBy((id) => backend.setPicture(id, kind, body))) keepPictures(mapID, picturesOf(get().portable));
}

export async function takePreview() {
  const shot = await mapControl()?.snapshot();
  if (shot) await setPicture("preview", shot);
}

/** 3003: the phone reads the API and guesses its keys, or reads them as the page picked. */
export async function readAPI(address: string, reading?: APIReading | null): Promise<APIRead | null> {
  return told(await editing(() => backend.readAPI(address, reading)));
}

export const addAPI = (address: string, reading: APIReading, name: string) =>
  addedBy((mapID) => backend.addAPI(mapID, address, reading, name));

export async function addServerLayers() {
  const picks = [...get().serverPicks.values()];
  if (await addedBy((mapID) => backend.addServerLayers(mapID, picks))) set({ serverPicks: new Map() });
}

/** The phone copies the file in as Add layer does, and draws it from there. */
/** The most a request to the phone may carry. */
export const FILE_LIMIT = 16 * 1024 * 1024;
export const FILE_KINDS = ".geojson,.json,.kml,.kmz,.gpx,.pmtiles,.mbtiles";

export async function addFile(file: File) {
  if (file.size > FILE_LIMIT) {
    notice(get().words.fileKinds);
    return;
  }
  await addedBy((mapID) => backend.addFile(mapID, file));
}

/** The phone says what an address is; a service's layers are ticked first. */
export async function addTiles(template: string) {
  const reading = told(await editing(() => backend.readAddress(template)));
  if (!reading) return;
  if (reading.kind === "layers") {
    set({ serviceRead: { address: template, reading: reading as ServiceRead["reading"], ticks: new Set() } });
    return;
  }
  await addedBy((mapID) => backend.addTiles(mapID, template));
}

export function tickServiceLayer(id: string) {
  const { serviceRead } = get();
  if (!serviceRead) return;
  const ticks = new Set(serviceRead.ticks);
  if (!ticks.delete(id)) ticks.add(id);
  set({ serviceRead: { ...serviceRead, ticks } });
}

export async function addServiceLayers() {
  const { serviceRead } = get();
  if (!serviceRead) return;
  await addedBy((mapID) => backend.addServiceLayers(mapID, serviceRead.address, [...serviceRead.ticks]));
}

// MARK: - Coverage

export async function loadCoverage() {
  const { mapID, coveragePlaces } = get();
  if (!mapID || busy.coverage === mapID) return;
  busy.coverage = mapID;
  const [summary, places] = await Promise.all([
    editing(() => backend.coverage(mapID)),
    coveragePlaces ? null : editing(() => backend.coveragePlaces())]);
  busy.coverage = null;
  if (!summary?.ok || (!coveragePlaces && !places?.ok) || mapID !== get().mapID) return;
  if (places?.ok) set({ coveragePlaces: places.value });
  set({ coverage: summary.value });
}

export const toggleCoverageShown = () => set({ coverageShown: !get().coverageShown });
export const pickCoverageSide = (coverageSide: CoverageSideKey) => set({ coverageSide });
export const setCoverageQuery = (coverageQuery: string) => set({ coverageQuery });
export const setCoverageOpen = (id: string, isOpen: boolean) =>
  set({ coverageOpen: new Map(get().coverageOpen).set(id, isOpen) });

/** Queued, so a quick second pick is built on the first one's answer. */
export function editCoverage(changeSide: (places: CoverageSide) => void): Promise<void> {
  const side = get().coverageSide;
  const edit = busy.coverageEdits.then(async () => {
    const made: Coverage = edited(get().coverage?.coverage ?? {}, side, changeSide);
    if (await change({ kind: "coverage", coverage: made })) await loadCoverage();
  });
  busy.coverageEdits = edit.catch(() => {});
  return edit;
}

// MARK: - Opens at

export function pickStartKind(picked: string) {
  const startKind = BY_NAME.includes(picked) ? picked : null;
  set({ startKind, startFound: null });
  if (picked === "coordinates") takeMapCentre();
  else if (!startKind) void change({ kind: "start", start: { kind: picked } });
}

export async function lookForPlaces(kind: string, query: string) {
  const answer = await editing(() => backend.startPlaces(kind, query));
  if (answer?.ok) set({ startFound: answer.value });
}

export async function pickPlace(start: Start) {
  if (await change({ kind: "start", start })) set({ startKind: null });
}

/** As the phone's page does, the map's own camera now: the browser's view. */
export function takeMapCentre() {
  const camera = mapControl()?.camera();
  if (!camera) return;
  void change({ kind: "startAt", lat: camera.lat.toFixed(5), lon: camera.lng.toFixed(5),
    zoom: (Math.round(camera.zoom * 10) / 10).toString() });
}

// MARK: - Other languages

export function addLanguage(code: string) {
  set({ addedLanguages: new Set(get().addedLanguages).add(code) });
}

export async function removeLanguage(code: string, name?: string, note?: string) {
  const addedLanguages = new Set(get().addedLanguages);
  addedLanguages.delete(code);
  set({ addedLanguages });
  if (name) await change({ kind: "nameIn", language: code, name: "" });
  if (note) await change({ kind: "noteIn", language: code, note: "" });
}

// MARK: - Regions the phone lacks

export async function downloadRegion(region: Region) {
  const { mapID } = get();
  if (!mapID) return;
  const answer = await editing(() => backend.downloadRegion(mapID, region.id));
  if (answer?.ok) mapControl()?.readRegions();
  else if (answer) notice(answer.said);
}
