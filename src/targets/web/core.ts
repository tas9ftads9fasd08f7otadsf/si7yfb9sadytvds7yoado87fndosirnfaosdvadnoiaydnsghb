import { WASI } from "@bjorn3/browser_wasi_shim";
import { CoreNotReady } from "@/backend/types";
import type { Edit } from "@/lib/edit";
import type { AddressReading, Device, Portable } from "@/lib/types";
import { BASE } from "./base";
import type { CoreRow, CoreWrite } from "./records";

/** What the style is built for: the theme, the layers hidden and where the pipeline's files are. */
export interface StyleCatalog {
  tilesBase: string;
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
}

type Call = "riki_maps" | "riki_map" | "riki_apply" | "riki_style" | "riki_changes" | "riki_read_address" | "riki_add_layer";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** One call: the request written into the module, the answer read out and both buffers freed. */
export function callJSON<T>(exports: CoreExports, call: Call, request: unknown): T {
  const bytes = encoder.encode(JSON.stringify(request));
  const input = exports.riki_alloc(bytes.length);
  new Uint8Array(exports.memory.buffer, input, bytes.length).set(bytes);
  const output = exports[call](input, bytes.length);
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
    changes: (rows) => callJSON(exports, "riki_changes", { rows })
  };
}

let loaded: Promise<Core> | null = null;

/** Instantiates `riki-core.wasm` once, with the WASI shim the Swift runtime asks for. */
export function loadCore(fetcher: typeof fetch = fetch, base = BASE): Promise<Core> {
  loaded ??= (async () => {
    const address = `${base}/riki-core.wasm`;
    const answer = await fetcher(address);
    if (!answer.ok) throw new CoreMissing(address);
    const wasi = new WASI([], [], []);
    const { instance } = await WebAssembly.instantiate(await answer.arrayBuffer(),
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
