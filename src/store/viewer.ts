import { create } from "zustand";
import { edited } from "@/lib/coverage";
import { EDIT_CHECK, HEARTBEAT_EVERY, ROOT, SESSION, THEME_KEY, TOKEN_KEY, readJSON, savedName, typedKey }
  from "@/lib/phone";
import { BY_NAME, startQuery } from "@/lib/places";
import type { RegionOffer } from "@/lib/region";
import type { APIRead, APIReading, Coverage, CoveragePlaces, CoverageSide, CoverageSideKey, CoverageSummary, Device, FoundPlace,
  LayerOptions, PackageRow, Packages, Pictures, Portable, Region, ServerList, ServerPick, ServiceRead,
  SessionAnswer, SharedMap, Standing, StackLayer, Start } from "@/lib/types";
import { ENGLISH, WORDS_PATH, type Words, readPhoneWords } from "@/lib/words";
import { mapControl } from "@/map/control";

export type Theme = "auto" | "light" | "dark";
export const THEMES: Record<Theme, string> = { auto: "circle.lefthalf.filled", light: "sun.max", dark: "moon" };

export interface ViewerState {
  words: Words;
  standing: Standing | null;
  edits: boolean;
  viewers: number | null;
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
  serverPicks: Map<string, ServerPick>;
  serviceRead: ServiceRead | null;
  layerOptions: LayerOptions | null;
  optionsOpen: Set<string>;
}

const firstState = (): ViewerState => ({
  words: ENGLISH, standing: null, edits: false, viewers: null, gateDevice: "", editToken: null, device: null,
  mapID: null, styleID: null, portable: null, hidden: new Set(), pictures: new Map(), sideShown: true,
  editing: false, editEpoch: 0, theme: "auto", notice: null, sharesLocation: false, regionOffer: null,
  zoomText: "", pointerText: "", addedLanguages: new Set(), startKind: null, startFound: null, coverage: null,
  coverageShown: false, coverageSide: "include", coverageOpen: new Map(), coverageQuery: "", coveragePlaces: null,
  packages: null, packageTicks: new Set(), addingPackages: false, servers: null, serverPicks: new Map(),
  serviceRead: null, layerOptions: null, optionsOpen: new Set()
});

export const useViewer = create<ViewerState>(firstState);

const get = useViewer.getState;
const set = useViewer.setState;

// Guards and timers no screen shows.
const busy = { sessionStarted: false, heartbeat: undefined as ReturnType<typeof setTimeout> | undefined,
  notice: undefined as ReturnType<typeof setTimeout> | undefined, layerOptions: null as string | null,
  packages: null as string | null, servers: false, coverage: null as string | null, addressKey: null as string | null };

export function resetViewer() {
  clearTimeout(busy.heartbeat);
  clearTimeout(busy.notice);
  Object.assign(busy, { sessionStarted: false, layerOptions: null, packages: null, servers: false, coverage: null,
    addressKey: null });
  set(firstState(), true);
}

export const shownMapOf = (state: ViewerState): SharedMap | undefined =>
  state.device?.maps.find((each) => each.id === state.mapID);

export function notice(text: string | null) {
  clearTimeout(busy.notice);
  set({ notice: text });
  if (text) busy.notice = setTimeout(() => notice(null), 4000);
}

const away = () => notice(get().words.away);

// MARK: - Starting up

/** The phone's words; English from a phone or a file that has none. */
export async function loadWords() {
  try {
    const said = readPhoneWords(await readJSON(WORDS_PATH));
    if (said) {
      set({ words: said.words as Words });
      document.documentElement.lang = said.language;
    }
  } catch { /* English */ }
}

export function restoreKept() {
  busy.addressKey = new URLSearchParams(location.search).get("edit");
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
    const answer = await fetch(SESSION, { cache: "no-store" });
    // A phone from before guests lets every browser in.
    if (answer.status === 404) applySession({ standing: "admitted", viewers: null });
    else if (answer.ok) applySession(await answer.json());
  } catch {
    away();
  }
  busy.heartbeat = setTimeout(heartbeat, HEARTBEAT_EVERY);
}

export async function askToJoin() {
  try {
    const answer = await fetch(`${SESSION}/ask`, { method: "POST", cache: "no-store" });
    if (answer.ok) applySession(await answer.json());
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

function remember() {
  const { mapID, styleID } = get();
  const query = new URLSearchParams();
  if (mapID) query.set("map", mapID);
  if (styleID) query.set("style", styleID);
  history.replaceState(null, "", `?${query.toString()}${location.hash}`);
}

export async function readDevice() {
  let device: Device;
  try {
    device = await readJSON<Device>(`${ROOT}/device`);
  } catch {
    if (get().standing !== "admitted") return;
    away();
    setTimeout(readDevice, 5000);
    return;
  }
  set({ device });
  const { words, mapID, styleID } = get();
  document.title = `${device.name} · ${words.app}`;
  const asked = new URLSearchParams(location.search);
  const first = device.maps.find((each) => each.id === (mapID || asked.get("map"))) ?? device.maps[0];
  if (first) await pickMap(first.id, styleID || asked.get("style"));
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
      keepPictures(shared.id, picturesOf(await readJSON<Portable>(`${ROOT}/maps/${shared.id}`)));
    } catch {
      keepPictures(shared.id, {});
    }
  }
}

export async function pickMap(id: string, styleID: string | null) {
  busy.layerOptions = null;
  set({ mapID: id, addedLanguages: new Set(), startKind: null, startFound: null, coverage: null, coverageShown: false,
    coverageOpen: new Map(), packages: null, addingPackages: false, serverPicks: new Map(), serviceRead: null,
    layerOptions: null, optionsOpen: new Set() });
  let portable: Portable | null = null;
  try {
    portable = await readJSON<Portable>(`${ROOT}/maps/${id}`);
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

export function showEdit(editing: boolean) {
  set({ editing });
  if (editing) {
    showSide(true);
    return;
  }
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
  let answer: Response;
  try {
    answer = await fetch(EDIT_CHECK, { method: "POST", cache: "no-store", headers: { "X-Riki-Edit": key } });
  } catch {
    away();
    return;
  }
  if (answer.ok) {
    keepToken((await answer.json()).token);
  } else {
    keepToken(null);
    const { words } = get();
    notice(answer.status === 429 ? words.tooManyTries : words.wrongPassword);
  }
  remember();
}

function keepToken(token: string | null) {
  set({ editToken: token || null });
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* kept for this page only */ }
}

/** A stale token sends the browser back to the password. */
async function askEditing(path: string, method = "POST", body?: BodyInit) {
  const answer = await fetch(path, { method, body, cache: "no-store", headers: { Authorization: `Bearer ${get().editToken}` } });
  if (answer.status === 401) {
    keepToken(null);
    if (get().editing) showEdit(false);
    notice(get().words.passwordAgain);
  }
  return answer;
}

// MARK: - Edit map

async function refreshDevice() {
  try {
    set({ device: await readJSON<Device>(`${ROOT}/device`) });
  } catch { /* names wait */ }
}

/** Sends one change; the phone answers with the map as it now stands. */
export async function change(query: Record<string, string>): Promise<boolean> {
  const { editToken, styleID, mapID } = get();
  if (!editToken) return false;
  const asked = new URLSearchParams(query);
  if (styleID) asked.set("styleID", styleID);
  let answer: Response;
  try {
    answer = await askEditing(`${ROOT}/maps/${mapID}/edit?${asked.toString()}`);
  } catch {
    away();
    return false;
  }
  if (answer.status === 401) return false;
  if (!answer.ok) {
    const said = await answer.text();
    notice(answer.status === 409 && /layers/i.test(said) ? get().words.layerCap : said);
    set({ editEpoch: get().editEpoch + 1 });
    return false;
  }
  const portable: Portable = await answer.json();
  set({ portable });
  if (mapID) keepPictures(mapID, picturesOf(portable));
  await refreshDevice();
  const stands = (portable.styles ?? []).some((style) => style.id === get().styleID);
  pickStyle(stands ? get().styleID : (portable.selectedStyleID ?? null));
  return true;
}

// MARK: - A new map

async function madeBy(path: string, body?: BodyInit) {
  let answer: Response;
  try {
    answer = await askEditing(path, "POST", body);
  } catch {
    away();
    return false;
  }
  if (answer.status === 401) return false;
  if (!answer.ok) {
    notice(await answer.text());
    return false;
  }
  const made: { id: string } = await answer.json();
  await refreshDevice();
  await pickMap(made.id, null);
  return true;
}

export const makeMap = (name: string) => madeBy(`${ROOT}/new-map?${new URLSearchParams({ name })}`);

export async function importMap(file: File) {
  return madeBy(`${ROOT}/new-map`, await file.arrayBuffer());
}

export async function exportMap() {
  let answer: Response;
  try {
    answer = await askEditing(`${ROOT}/maps/${get().mapID}/mapson`, "GET");
  } catch {
    away();
    return;
  }
  if (!answer.ok) return;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(await answer.blob());
  link.download = savedName(answer.headers.get("Content-Disposition") ?? "");
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function removeLayer(layer: StackLayer) {
  if (confirm(get().words.removeAsk.replace("{name}", layer.name))) void change({ removeLayer: layer.id });
}

// MARK: - A layer's options

export async function loadLayerOptions() {
  const { mapID } = get();
  if (!mapID || busy.layerOptions === mapID) return;
  busy.layerOptions = mapID;
  try {
    const answer = await askEditing(`${ROOT}/maps/${mapID}/layer-options`, "GET");
    if (answer.ok && get().mapID === mapID) set({ layerOptions: await answer.json() });
  } catch { /* offered once it answers */ } finally {
    busy.layerOptions = null;
  }
}

export function toggleOptions(id: string) {
  const optionsOpen = new Set(get().optionsOpen);
  if (!optionsOpen.delete(id)) optionsOpen.add(id);
  set({ optionsOpen });
}

/** Every choice goes into each style, so the phone's list is read again. */
export async function setDrawn(query: Record<string, string>) {
  if (await change(query)) set({ layerOptions: null });
}

// MARK: - Add layer

export const toggleAddingPackages = () => set({ addingPackages: !get().addingPackages });

export async function loadPackages() {
  const { mapID } = get();
  if (!mapID || busy.packages === mapID) return;
  busy.packages = mapID;
  try {
    const answer = await askEditing(`${ROOT}/maps/${mapID}/packages`, "GET");
    if (!answer.ok || get().mapID !== mapID) return;
    const packages: Packages = await answer.json();
    set({ packages, packageTicks: new Set(packages.ticked) });
  } catch {
    away();
  } finally {
    busy.packages = null;
  }
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
  if (!await change({ addPackages: overlays.join(",") })) set({ addingPackages: true });
}

export async function loadServers() {
  if (busy.servers) return;
  busy.servers = true;
  try {
    const answer = await askEditing(`${ROOT}/servers`, "GET");
    if (answer.ok) set({ servers: await answer.json() });
  } catch {
    away();
  } finally {
    busy.servers = false;
  }
}

export function tickServerRow(key: string, pick: ServerPick) {
  const serverPicks = new Map(get().serverPicks);
  if (!serverPicks.delete(key)) serverPicks.set(key, pick);
  set({ serverPicks });
}

/** Sends what adds layers; the phone answers with the map, and the adding is over. */
async function addedBy(path: string, body?: BodyInit): Promise<boolean> {
  let answer: Response;
  try {
    answer = await askEditing(path, "POST", body);
  } catch {
    away();
    return false;
  }
  if (answer.status === 401) return false;
  if (!answer.ok) {
    notice(await answer.text());
    return false;
  }
  const portable: Portable = await answer.json();
  set({ portable, addingPackages: false, packages: null, serviceRead: null, layerOptions: null });
  await refreshDevice();
  pickStyle(get().styleID);
  return true;
}

/** 3003: the phone reads the API and guesses its keys, or reads them as the page picked. */
export async function readAPI(address: string, reading?: APIReading | null): Promise<APIRead | null> {
  const query = new URLSearchParams({ address });
  if (reading) query.set("reading", JSON.stringify(reading));
  let read: Response;
  try {
    read = await askEditing(`${ROOT}/read-api?${query}`, "GET");
  } catch {
    away();
    return null;
  }
  if (read.status === 401) return null;
  if (!read.ok) {
    notice(await read.text());
    return null;
  }
  return read.json();
}

export async function addAPI(address: string, reading: APIReading, name: string) {
  const query = new URLSearchParams({ address, reading: JSON.stringify(reading), name });
  return addedBy(`${ROOT}/maps/${get().mapID}/add-api?${query}`);
}

export async function addServerLayers() {
  const picks = [...get().serverPicks.values()];
  const query = new URLSearchParams({ picks: JSON.stringify(picks) });
  if (await addedBy(`${ROOT}/maps/${get().mapID}/add-server-layers?${query}`)) set({ serverPicks: new Map() });
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
  await addedBy(`${ROOT}/maps/${get().mapID}/add-file?${new URLSearchParams({ file: file.name })}`, await file.arrayBuffer());
}

/** The phone says what an address is; a service's layers are ticked first. */
export async function addTiles(template: string) {
  let read: Response;
  try {
    read = await askEditing(`${ROOT}/read-address?${new URLSearchParams({ address: template })}`, "GET");
  } catch {
    away();
    return;
  }
  if (read.status === 401) return;
  if (!read.ok) {
    notice(await read.text());
    return;
  }
  const reading = await read.json();
  if (reading.kind === "layers") {
    set({ serviceRead: { address: template, reading, ticks: new Set() } });
    return;
  }
  await addedBy(`${ROOT}/maps/${get().mapID}/add-tiles?${new URLSearchParams({ template })}`);
}

export function tickServiceLayer(id: string) {
  const { serviceRead } = get();
  if (!serviceRead) return;
  const ticks = new Set(serviceRead.ticks);
  if (!ticks.delete(id)) ticks.add(id);
  set({ serviceRead: { ...serviceRead, ticks } });
}

export async function addServiceLayers() {
  const { serviceRead, mapID } = get();
  if (!serviceRead) return;
  const query = new URLSearchParams({ address: serviceRead.address, picks: JSON.stringify([...serviceRead.ticks]) });
  await addedBy(`${ROOT}/maps/${mapID}/add-service-layers?${query}`);
}

// MARK: - Coverage

export async function loadCoverage() {
  const { mapID, coveragePlaces } = get();
  if (!mapID || busy.coverage === mapID) return;
  busy.coverage = mapID;
  try {
    const [summary, places] = await Promise.all([
      askEditing(`${ROOT}/maps/${mapID}/coverage`, "GET"),
      coveragePlaces ? null : askEditing(`${ROOT}/coverage-places`, "GET")]);
    if (!summary.ok || (places && !places.ok) || mapID !== get().mapID) return;
    if (places) set({ coveragePlaces: await places.json() });
    set({ coverage: await summary.json() });
  } catch {
    away();
  } finally {
    busy.coverage = null;
  }
}

export const toggleCoverageShown = () => set({ coverageShown: !get().coverageShown });
export const pickCoverageSide = (coverageSide: CoverageSideKey) => set({ coverageSide });
export const setCoverageQuery = (coverageQuery: string) => set({ coverageQuery });
export const setCoverageOpen = (id: string, isOpen: boolean) =>
  set({ coverageOpen: new Map(get().coverageOpen).set(id, isOpen) });

export async function editCoverage(changeSide: (places: CoverageSide) => void) {
  const { coverage, coverageSide } = get();
  const made: Coverage = edited(coverage?.coverage ?? {}, coverageSide, changeSide);
  if (await change({ coverage: JSON.stringify(made) })) await loadCoverage();
}

// MARK: - Opens at

export function pickStartKind(picked: string) {
  const startKind = BY_NAME.includes(picked) ? picked : null;
  set({ startKind, startFound: null });
  if (picked === "coordinates") takeMapCentre();
  else if (!startKind) void change({ start: picked });
}

export async function lookForPlaces(kind: string, query: string) {
  const asked = new URLSearchParams({ kind });
  if (query) asked.set("q", query);
  try {
    const answer = await askEditing(`${ROOT}/start-places?${asked.toString()}`, "GET");
    if (answer.ok) set({ startFound: await answer.json() });
  } catch {
    away();
  }
}

export async function pickPlace(start: Start) {
  if (await change(startQuery(start))) set({ startKind: null });
}

/** As the phone's page does, the map's own camera now: the browser's view. */
export function takeMapCentre() {
  const camera = mapControl()?.camera();
  if (!camera) return;
  void change({ start: "coordinates", lat: camera.lat.toFixed(5), lon: camera.lng.toFixed(5),
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
  if (name) await change({ language: code, name: "" });
  if (note) await change({ language: code, note: "" });
}

// MARK: - Regions the phone lacks

export async function downloadRegion(region: Region) {
  let answer: Response;
  try {
    answer = await askEditing(`${ROOT}/maps/${get().mapID}/download?region=${encodeURIComponent(region.id)}`);
  } catch {
    away();
    return;
  }
  if (answer.status === 401) return;
  if (!answer.ok) {
    notice(await answer.text());
    return;
  }
  mapControl()?.readRegions();
}
