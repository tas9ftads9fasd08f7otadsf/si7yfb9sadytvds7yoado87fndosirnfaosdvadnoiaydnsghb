import { WASI } from "@bjorn3/browser_wasi_shim";
import { CoreNotReady } from "@/backend/types";
import type { Edit } from "@/lib/edit";
import type { AddressReading, Device, Portable, ShareRole } from "@/lib/types";
import { BASE } from "./base";
import type { CoreRow, CoreWrite } from "./records";

/** 112 A region package the browser holds, as the core is told of it: its files and its `contents.json` text. */
export interface StoredPackage {
  region: string;
  piece: string;
  version: number;
  files: string[];
  contents: string | null;
}

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

/** What an edit is asked with: the rows, the edit and who it is written as. */
export interface ApplyAsk {
  rows: CoreRow[];
  mapID: string;
  styleID: string | null;
  edit: Edit;
  author: string | null;
  origin: "web";
}

/** The core's answer to an edit: rows to write and the map as it stands, or a refusal. */
export type Applied =
  | { map: Portable; write: CoreWrite[]; remove?: string[]; history?: CoreWrite | null }
  | { refused: string; status?: number };

/** 86 What the browser got when it asked an address the core named. */
export interface Reply {
  url: string;
  /** 0 when the request failed. */
  status: number;
  contentType: string;
  text: string;
}

/**
 * `riki_read_address` asks what an address is without any network of its own: the page answers each round's
 * `fetch` list and asks again with every reply so far, until the core says what it read.
 */
export interface ReadAsk {
  address: string;
  replies: Reply[];
}

/** What it read: a tile template or TileJSON (`probe` is one tile's address), or a service's layers to pick from. */
export type AddressRead =
  | { fetch: string[] }
  | { read: { kind: string; probe?: string } & Partial<AddressReading> }
  | { refused: string; status?: number };

/** What `riki_add_layer` adds: from an address as the replies read it, and for a service the ticked layers. */
export type Adding =
  | { kind: "tiles"; address: string; replies: Reply[] }
  | { kind: "service"; address: string; replies: Reply[]; picks: string[] };

/** `riki_add_layer` is asked as `riki_apply` is, with what to add in place of an edit, and answers as it does. */
export interface AddAsk {
  rows: CoreRow[];
  mapID: string;
  styleID: string | null;
  add: Adding;
  author: string | null;
  origin: "web";
}

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
  /** 86 What an address is, in rounds; see `ReadAsk`. */
  readAddress(ask: ReadAsk): AddressRead;
  /** 86 The rows that add layers to a map, or a refusal, as `apply` answers. */
  addLayer(ask: AddAsk): Applied;
  changes(rows: CoreRow[]): HistoryEntry[];
  /** 108 Who holds the map; `CoreNotReady` while the module has no `riki_people`. */
  people(rows: CoreRow[], mapID: string): PeopleRead | { refused: string; status?: number };
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
  /** 108 Not in the pinned module yet. */
  riki_people?(pointer: number, length: number): number;
}

type Call = "riki_maps" | "riki_map" | "riki_apply" | "riki_style" | "riki_changes" | "riki_read_address" | "riki_add_layer"
  | "riki_people";

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
  if ((answer as { refused?: unknown } | null)?.refused === "coreNotReady") throw new CoreNotReady(`riki-core.wasm cannot answer ${call} yet`);
  return answer;
}

/** The core's functions behind `Core`. */
export function coreOf(exports: CoreExports): Core {
  return {
    maps: (rows) => callJSON(exports, "riki_maps", { rows }),
    map: (rows, id) => callJSON(exports, "riki_map", { rows, id }),
    style: (rows, mapID, styleID, catalog) => callJSON(exports, "riki_style", { rows, mapID, styleID, catalog }),
    apply: (ask) => callJSON(exports, "riki_apply", ask),
    readAddress: (ask) => callJSON(exports, "riki_read_address", ask),
    addLayer: (ask) => callJSON(exports, "riki_add_layer", ask),
    changes: (rows) => callJSON(exports, "riki_changes", { rows }),
    people: (rows, mapID) => callJSON(exports, "riki_people", { rows, id: mapID })
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
export function loadCore(fetcher: typeof fetch = fetch, base = BASE,
  onBytes?: (done: number, total: number | null) => void): Promise<Core> {
  loaded ??= (async () => {
    const address = `${base}/riki-core.wasm`;
    const answer = await fetcher(address);
    if (!answer.ok) throw new CoreMissing(address);
    const wasi = new WASI(CORE_ARGS, [], []);
    const { instance } = await WebAssembly.instantiate(await bytesOf(answer, onBytes),
      { wasi_snapshot_preview1: wasi.wasiImport as unknown as WebAssembly.ModuleImports });
    const exports = instance.exports as unknown as CoreExports & { _initialize?: () => void };
    if (exports._initialize) wasi.initialize(instance as unknown as Parameters<WASI["initialize"]>[0]);
    return coreOf(exports);
  })();
  loaded.catch(() => { loaded = null; });
  return loaded;
}

export function forgetCore() {
  loaded = null;
}
