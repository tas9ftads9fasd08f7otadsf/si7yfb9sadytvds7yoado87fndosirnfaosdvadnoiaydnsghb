import { WASI } from "@bjorn3/browser_wasi_shim";
import { CoreNotReady } from "@/backend/types";
import type { AddressReading, Device, MapSwitches, OtherLayers, Portable, ShareRole } from "@/lib/types";
import { BASE } from "./base";
import type { CoreRow, CoreWrite } from "./records";
import type { StoredForCore } from "./regions/packages";

/** 112 A region package the browser holds, as the core is told of it: its files, JSON texts and region's facts. */
export type StoredPackage = StoredForCore;

/** What the style is built for: the theme, the layers hidden and where the pipeline's and the site's files are. */
export interface StyleCatalog {
  /** 110 The site's glyphs, to which the core adds `/{fontstack}/{range}.pbf`; absolute. */
  glyphsBase: string;
  /** 110 The site's base sprite without its extension, as a style's `sprite` names it; absolute. */
  spriteBase: string;
  /** 112 The region packages held in this browser; the core draws from them and names the ones it lacks in `riki:needs`. */
  stored: StoredPackage[];
  theme: "light" | "dark";
  hidden: string[];
  tiles: string;
}

/**
 * 165 What an edit is asked with: the rows, the map, the edit as the query `PeerWebEdit(query:)` reads, or the layers
 * `riki_add_layer` made, and who it is written as.
 */
export interface ApplyAsk {
  rows: CoreRow[];
  id: string;
  styleID: string | null;
  edit?: Record<string, string>;
  layers?: unknown[];
  author: string | null;
}

/** The core's answer to an edit: rows to write and the map as it stands, or a refusal. */
export type Applied =
  | { map: Portable; write: CoreWrite[]; remove?: string[]; history?: CoreWrite | null }
  | { refused: string; status?: number; said?: string };

/** 86 What the browser got when it asked an address the core named. */
export interface Reply {
  url: string;
  /** 0 when the request failed. */
  status: number;
  contentType: string;
  text: string;
}

/** 165 `riki_read_address` has no network: it names the capabilities to fetch, and reads their text when asked again. */
export interface ReadAsk {
  address: string;
  document?: string;
}

/** 165 What it read: added as it is, a document to fetch first, or a service's layers to pick from. */
export type AddressRead =
  /** `probe`, one tile's address, is checked against the host before the layer is added. */
  | { kind: "direct"; probe?: string }
  | { kind: "fetch"; url: string }
  | ({ kind: "layers" } & AddressReading)
  | { refused: string; status?: number; said?: string };

/** A tile address, added through the tile path. */
export interface TilesAsk {
  rows: CoreRow[];
  mapID: string;
  styleID: string | null;
  add: { kind: "tiles"; address: string; replies: Reply[] };
  author: string | null;
  origin: "web";
}

/** 165 A service's ticked layers, read from the capabilities' text. */
export interface AddAsk {
  rows: CoreRow[];
  id: string;
  address: string;
  picks: string[];
  document: string;
}

/** 165 The layers the ticks made that the map took, and the map with them; `riki_apply` writes them. */
export type Added = { layers: unknown[]; map: Portable } | { refused: string; status?: number; said?: string };

/** One line of a map's history, newest first, as the core decodes its row. */
export interface HistoryEntry {
  id: string;
  /** The record name of the map it belongs to. */
  map: string;
  author: string | null;
  origin?: string | null;
  lines: string[];
}

/** 108 Who holds a map, read off its share and member rows by the app's rules (README). */
export interface PeopleRead {
  shared: boolean;
  role: ShareRole;
  people: { id: string; name: string | null; role: ShareRole; hasAccepted: boolean; isYou: boolean }[];
  linkRole: ShareRole | null;
}

/** The rules of the maps, as `riki-core.wasm` answers them; none of them is written again here. */
export interface Core {
  maps(rows: CoreRow[]): Device;
  map(rows: CoreRow[], id: string): Portable;
  style(rows: CoreRow[], mapID: string, styleID: string | null, catalog: StyleCatalog): unknown;
  apply(ask: ApplyAsk): Applied;
  /** 86 What an address is; see `ReadAsk`. */
  readAddress(ask: ReadAsk): AddressRead;
  /** 165 The layers a service's ticks add; `apply` writes them. */
  addLayer(ask: AddAsk): Added;
  /** 86 A tile address, as the rows that add it. */
  addTiles(ask: TilesAsk): Applied;
  changes(rows: CoreRow[]): HistoryEntry[];
  /** 108 Who holds the map; `CoreNotReady` while the module has no `riki_people`. */
  people(rows: CoreRow[], mapID: string): PeopleRead | { refused: string; status?: number };
  /** 175 Edit map's and Styles' switches; `CoreNotReady` while the module has no `riki_switches`. */
  switches(rows: CoreRow[], mapID: string): MapSwitches | { refused: string; status?: number };
  /** 176 The map's .mapson as the phone hands it out; `CoreNotReady` before rikimaps 3651. */
  exportMap(rows: CoreRow[], mapID: string): MapsonFile | { refused: string; status?: number };
  /** 198 Edit map's Duplicate as new rows; `CoreNotReady` before rikimaps 3671. */
  duplicate(rows: CoreRow[], mapID: string): Made | { refused: string; status?: number; said?: string };
  /** 203 Add layer's From your maps: the other maps' layers to tick; `CoreNotReady` before rikimaps 3685. */
  otherLayers(rows: CoreRow[], mapID: string): OtherLayers | { refused: string; status?: number; said?: string };
  /** 203 The ticked layers copied for the map, which `apply` then adds. */
  copyLayers(
    rows: CoreRow[],
    mapID: string,
    layers: string[],
  ): { layers: unknown[] } | { refused: string; status?: number; said?: string };
  /** 201 The Maps list arranged, `shelf` as the phone's `/shelf` query; `CoreNotReady` before rikimaps 3675. */
  shelve(rows: CoreRow[], shelf: Record<string, string>): Shelved | { refused: string; status?: number; said?: string };
  /** 200 The Maps sheet's Delete, the name as typed; `CoreNotReady` before rikimaps 3678. */
  deleteMap(
    rows: CoreRow[],
    mapID: string,
    name: string,
  ): Deleted | { refused: string; status?: number; said?: string };
  /** 199 New map's blank map as new rows; `CoreNotReady` before rikimaps 3679. */
  newMap(rows: CoreRow[], name: string): Made | { refused: string; status?: number; said?: string };
  /** 199 A .mapson file's maps as new rows; `CoreNotReady` before rikimaps 3680. */
  importMap(
    rows: CoreRow[],
    text: string,
    allowUnsigned: boolean,
  ): Imported | { refused: string; status?: number; said?: string };
}

/** 201 The rows an arrangement changes, and the list as it stands after. */
export interface Shelved {
  write: CoreWrite[];
  catalog: Device;
}

/** 200 What a deleted map takes with it: records in one zone, or private zones whole. */
export interface Deleted {
  reach: "onlyYou" | "everyone" | "yourList";
  database: "private" | "shared";
  zone: string;
  remove: string[];
  removeZones: string[];
}

/** 199 A file's maps the core made, in the file's order, and hosts whose keys the file held. */
export interface Imported extends Omit<Made, "map"> {
  maps: { id: string; name: string }[];
  leftHosts: string[];
}

/** 198 A map of the person's own the core made: its new rows, the zone they go to, and the map. */
export interface Made {
  database: "private" | "shared";
  zone: string;
  write: CoreWrite[];
  map: Portable;
}

/** 176 A .mapson file's name and text, as `riki_export` answers them. */
export interface MapsonFile {
  name: string;
  text: string;
}

/** The release asset is not in the site yet; the site cannot read a map without it. */
export class CoreMissing extends Error {
  constructor(address: string) {
    super(`riki-core.wasm is not at ${address}: the site is packed without RikiCore's release`);
  }
}

/** What the module exports: JSON in a buffer from `riki_alloc`, a length-prefixed JSON buffer back. */
export interface CoreExports {
  memory: WebAssembly.Memory;
  riki_alloc(length: number): number;
  riki_free(pointer: number, length: number): void;
  riki_maps(pointer: number, length: number): number;
  riki_map(pointer: number, length: number): number;
  riki_apply(pointer: number, length: number): number;
  riki_style(pointer: number, length: number): number;
  riki_changes(pointer: number, length: number): number;
  riki_read_address(pointer: number, length: number): number;
  riki_add_layer(pointer: number, length: number): number;
  /** 108 In modules from rikimaps 3560 on; an older one has none and says not ready. */
  riki_people?(pointer: number, length: number): number;
  /** 175 In modules from rikimaps 3650 on (ABI 0.6.0). */
  riki_switches?(pointer: number, length: number): number;
  /** 176 In modules from rikimaps 3651 on (ABI 0.7.0). */
  riki_export?(pointer: number, length: number): number;
  /** 198 In modules from rikimaps 3671 on. */
  riki_duplicate?(pointer: number, length: number): number;
  /** 203 In modules from rikimaps 3685 on. */
  riki_copies?(pointer: number, length: number): number;
  /** 201 In modules from rikimaps 3675 on. */
  riki_shelve?(pointer: number, length: number): number;
  /** 200 In modules from rikimaps 3678 on. */
  riki_delete?(pointer: number, length: number): number;
  /** 199 In modules from rikimaps 3679 on. */
  riki_new_map?(pointer: number, length: number): number;
  /** 199 In modules from rikimaps 3680 on. */
  riki_import?(pointer: number, length: number): number;
}

type Call =
  | "riki_maps"
  | "riki_map"
  | "riki_apply"
  | "riki_style"
  | "riki_changes"
  | "riki_read_address"
  | "riki_add_layer"
  | "riki_people"
  | "riki_switches"
  | "riki_export"
  | "riki_duplicate"
  | "riki_copies"
  | "riki_shelve"
  | "riki_delete"
  | "riki_new_map"
  | "riki_import";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** One call: the request written into the module, the answer read out and both buffers freed. */
export function callJSON<T>(exports: CoreExports, call: Call, request: unknown): T {
  const run = exports[call];
  if (!run) throw new CoreNotReady(`riki-core.wasm has no ${call} yet`);
  const bytes = encoder.encode(JSON.stringify(request));
  const input = exports.riki_alloc(bytes.length);
  new Uint8Array(exports.memory.buffer, input, bytes.length).set(bytes);
  const output = run(input, bytes.length);
  exports.riki_free(input, bytes.length);
  const length = new DataView(exports.memory.buffer).getUint32(output, true);
  const text = decoder.decode(new Uint8Array(exports.memory.buffer, output + 4, length));
  exports.riki_free(output, length + 4);
  const answer = JSON.parse(text) as T;
  // While the rules are still moving into the module, a call it cannot answer yet says so by this word.
  if ((answer as { refused?: unknown } | null)?.refused === "coreNotReady")
    throw new CoreNotReady(`riki-core.wasm cannot answer ${call} yet`);
  return answer;
}

/** 157 The core holds no such map; thrown, as the phone's 404 is, so the page opens nothing to edit. */
export class NoSuchMap extends Error {
  constructor(readonly id: string) {
    super(`The rows hold no map ${id}`);
  }
}

/** The core's functions behind `Core`. */
export function coreOf(exports: CoreExports): Core {
  return {
    maps: (rows) => callJSON(exports, "riki_maps", { rows }),
    map: (rows, id) => {
      const answer = callJSON<Portable | { refused: string }>(exports, "riki_map", { rows, id });
      if ("refused" in answer) throw new NoSuchMap(id);
      return answer;
    },
    style: (rows, mapID, styleID, catalog) => callJSON(exports, "riki_style", { rows, id: mapID, styleID, catalog }),
    apply: (ask) => callJSON(exports, "riki_apply", ask),
    readAddress: (ask) => callJSON(exports, "riki_read_address", ask),
    addLayer: (ask) => callJSON(exports, "riki_add_layer", ask),
    addTiles: (ask) => callJSON(exports, "riki_add_layer", ask),
    changes: (rows) => callJSON(exports, "riki_changes", { rows }),
    people: (rows, mapID) => callJSON(exports, "riki_people", { rows, id: mapID }),
    switches: (rows, mapID) => callJSON(exports, "riki_switches", { rows, id: mapID }),
    exportMap: (rows, mapID) => callJSON(exports, "riki_export", { rows, id: mapID }),
    duplicate: (rows, mapID) => callJSON(exports, "riki_duplicate", { rows, id: mapID }),
    otherLayers: (rows, mapID) => callJSON(exports, "riki_copies", { rows, id: mapID }),
    copyLayers: (rows, mapID, layers) => callJSON(exports, "riki_copies", { rows, id: mapID, layers }),
    shelve: (rows, shelf) => callJSON(exports, "riki_shelve", { rows, shelf }),
    deleteMap: (rows, mapID, name) => callJSON(exports, "riki_delete", { rows, id: mapID, name }),
    newMap: (rows, name) => callJSON(exports, "riki_new_map", { rows, name }),
    importMap: (rows, text, allowUnsigned) => callJSON(exports, "riki_import", { rows, text, allowUnsigned }),
  };
}

/** 155 Foundation's `UserDefaults` traps in the module when it is given no `argv[0]`. */
export const CORE_ARGS = ["riki-core"];

let loaded: Promise<Core> | null = null;

/** 137 The answer's bytes, told piece by piece as they arrive; a server may not say the size. */
async function bytesOf(answer: Response, onBytes?: (done: number, total: number | null) => void): Promise<ArrayBuffer> {
  const reader = onBytes ? answer.body?.getReader() : undefined;
  if (!reader) return answer.arrayBuffer();
  const total = Number(answer.headers.get("content-length")) || null;
  const pieces: Uint8Array[] = [];
  let done = 0;
  onBytes?.(0, total);
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    pieces.push(read.value);
    done += read.value.byteLength;
    onBytes?.(done, total);
  }
  onBytes?.(done, done);
  const whole = new Uint8Array(done);
  let at = 0;
  for (const piece of pieces) {
    whole.set(piece, at);
    at += piece.byteLength;
  }
  return whole.buffer;
}

/** Instantiates `riki-core.wasm` once, with the WASI shim the Swift runtime asks for. */
export function loadCore(
  fetcher: typeof fetch = fetch,
  base = BASE,
  onBytes?: (done: number, total: number | null) => void,
): Promise<Core> {
  loaded ??= (async () => {
    const address = `${base}/riki-core.wasm`;
    const answer = await fetcher(address);
    if (!answer.ok) throw new CoreMissing(address);
    const wasi = new WASI(CORE_ARGS, [], []);
    const { instance } = await WebAssembly.instantiate(await bytesOf(answer, onBytes), {
      wasi_snapshot_preview1: wasi.wasiImport as unknown as WebAssembly.ModuleImports,
    });
    const exports = instance.exports as unknown as CoreExports & { _initialize?: () => void };
    if (exports._initialize) wasi.initialize(instance as unknown as Parameters<WASI["initialize"]>[0]);
    return coreOf(exports);
  })();
  loaded.catch(() => {
    loaded = null;
  });
  return loaded;
}

export function forgetCore() {
  loaded = null;
}
