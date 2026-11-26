import { afterEach, describe, expect, it, vi } from "vitest";
import account from "../../../e2e/fixtures/cloud-account.json";
import { fakeCoreWasm } from "../../../e2e/fake-core.mjs";
import { CoreNotReady } from "@/backend/types";
import { CORE_ARGS, CoreMissing, NoSuchMap, callJSON, coreOf, forgetCore, loadCore, type CoreExports } from "./core";

const shimArgs = vi.hoisted(() => [] as string[][]);
vi.mock("@bjorn3/browser_wasi_shim", async (original) => {
  const real = await original<typeof import("@bjorn3/browser_wasi_shim")>();
  class Recorded extends real.WASI {
    constructor(...made: ConstructorParameters<typeof real.WASI>) {
      shimArgs.push(made[0]);
      super(...made);
    }
  }
  return { ...real, WASI: Recorded };
});

// 76 the typed wrapper around the core's exports, and its loading
describe("the core's wrapper", () => {
  afterEach(forgetCore);

  /** The exports as JavaScript, echoing the request back inside a length-prefixed buffer. */
  function echo(): CoreExports & { freed: [number, number][] } {
    const memory = new WebAssembly.Memory({ initial: 1 });
    let top = 1024;
    const freed: [number, number][] = [];
    const respond = (pointer: number, length: number) => {
      const request = new Uint8Array(memory.buffer, pointer, length).slice();
      const at = top;
      top += 4 + length;
      new DataView(memory.buffer).setUint32(at, length, true);
      new Uint8Array(memory.buffer, at + 4, length).set(request);
      return at;
    };
    const alloc = (length: number) => {
      const at = top;
      top += length;
      return at;
    };
    return {
      memory,
      riki_alloc: alloc,
      riki_free: (p, l) => {
        freed.push([p, l]);
      },
      freed,
      riki_maps: respond,
      riki_map: respond,
      riki_apply: respond,
      riki_style: respond,
      riki_changes: respond,
      riki_read_address: respond,
      riki_add_layer: respond,
      riki_people: respond,
      riki_switches: respond,
      riki_export: respond,
      riki_duplicate: respond,
      riki_shelve: respond,
      riki_delete: respond,
      riki_new_map: respond,
      riki_import: respond,
    };
  }

  it("writes the request as JSON, reads the answer back and frees both buffers", () => {
    const exports = echo();
    expect(callJSON(exports, "riki_map", { id: "é", rows: [1] })).toEqual({ id: "é", rows: [1] });
    expect(exports.freed).toHaveLength(2);
  });

  it("sends rows and ids as the core's four functions are asked", () => {
    const exports = echo();
    const core = coreOf(exports);
    expect(core.map([], "M")).toEqual({ rows: [], id: "M" });
    // 110 the site's glyphs and sprite and 112 the region packages held go with the catalog, for the core to put in the style
    // 165 each package carries its JSON files' text and its region's facts, which the style builder reads
    const stored = [
      {
        region: "tatry",
        piece: "base",
        version: 7,
        files: ["contents.json", "base.pmtiles"],
        texts: { "contents.json": "{}" },
        country: "slovensko",
        range: false,
        bbox: [19.6, 49.1, 20.4, 49.3],
      },
    ];
    const catalog = {
      glyphsBase: "https://s/glyphs",
      spriteBase: "https://s/sprites/temaki-sprite",
      stored,
      theme: "dark" as const,
      hidden: ["h"],
      tiles: "2x2",
    };
    // 165 riki_style names the map `id`, as every other call does
    expect(core.style([], "M", "S", catalog)).toEqual({ rows: [], id: "M", styleID: "S", catalog });
  });

  // 165 the edit is asked as the query PeerWebEdit(query:) reads, with the rows and who writes it
  it("asks riki_apply with the edit and the author, and riki_changes with the rows", () => {
    const exports = echo();
    const core = coreOf(exports);
    const ask: Parameters<typeof core.apply>[0] = {
      rows: [],
      id: "M",
      styleID: null,
      edit: { name: "x" },
      author: "Rita",
    };
    expect(core.apply(ask)).toEqual(ask);
    expect(core.changes([])).toEqual({ rows: [] });
  });

  // 88 the core may refuse a call whose rules are not in the module yet; the page shows a notice for it
  it("turns a coreNotReady refusal into a typed error, and leaves a refusal of the rules alone", () => {
    const exports = echo();
    expect(() => callJSON(exports, "riki_map", { refused: "coreNotReady", call: "riki_map" })).toThrow(CoreNotReady);
    expect(() => coreOf(exports).maps([])).not.toThrow();
    expect(callJSON(exports, "riki_apply", { refused: "Only the owner may do this", status: 403 })).toEqual({
      refused: "Only the owner may do this",
      status: 403,
    });
  });

  // 165 an address is read with the capabilities' text, and the ticked layers are made from the same text
  it("asks riki_read_address with the address and the document, and riki_add_layer with the picks", () => {
    const core = coreOf(echo());
    expect(core.readAddress({ address: "https://a.example/wms", document: "<x/>" })).toEqual({
      address: "https://a.example/wms",
      document: "<x/>",
    });
    const ask: Parameters<typeof core.addLayer>[0] = {
      rows: [],
      id: "M",
      address: "https://a.example/wms",
      picks: ["roads"],
      document: "<x/>",
    };
    expect(core.addLayer(ask)).toEqual(ask);
  });

  // 108 riki_people takes the rows and the map's id; a module without it is not ready, not broken
  it("asks riki_people with the rows and the map, and says not ready where the module has none", () => {
    const exports = echo();
    expect(coreOf(exports).people([], "M")).toEqual({ rows: [], id: "M" });
    const without: CoreExports = { ...exports, riki_people: undefined };
    expect(() => coreOf(without).people([], "M")).toThrow(CoreNotReady);
  });

  // 175 riki_switches takes the rows and the map's id, as riki_people does
  it("asks riki_switches with the rows and the map, and says not ready where the module has none", () => {
    const exports = echo();
    expect(coreOf(exports).switches([], "M")).toEqual({ rows: [], id: "M" });
    const without: CoreExports = { ...exports, riki_switches: undefined };
    expect(() => coreOf(without).switches([], "M")).toThrow(CoreNotReady);
  });

  // 176 riki_export takes the rows and the map's id; a module from before rikimaps 3651 is not ready
  it("asks riki_export with the rows and the map, and says not ready where the module has none", () => {
    const exports = echo();
    expect(coreOf(exports).exportMap([], "M")).toEqual({ rows: [], id: "M" });
    const without: CoreExports = { ...exports, riki_export: undefined };
    expect(() => coreOf(without).exportMap([], "M")).toThrow(CoreNotReady);
  });

  // 201 riki_shelve takes the rows and the shelf query; a module before rikimaps 3675 is not ready
  it("asks riki_shelve with the rows and the shelf, and says not ready where the module has none", () => {
    const exports = echo();
    expect(coreOf(exports).shelve([], { sort: "nameAscending" })).toEqual({
      rows: [],
      shelf: { sort: "nameAscending" },
    });
    const without: CoreExports = { ...exports, riki_shelve: undefined };
    expect(() => coreOf(without).shelve([], {})).toThrow(CoreNotReady);
  });

  // 200 riki_delete takes the rows, the map and the name as typed; a module before rikimaps 3678 is not ready
  it("asks riki_delete with the map and the typed name, and says not ready where the module has none", () => {
    const exports = echo();
    expect(coreOf(exports).deleteMap([], "M", "High Tatras")).toEqual({ rows: [], id: "M", name: "High Tatras" });
    const without: CoreExports = { ...exports, riki_delete: undefined };
    expect(() => coreOf(without).deleteMap([], "M", "x")).toThrow(CoreNotReady);
  });

  // 199 riki_new_map and riki_import take the rows and what was typed or read; older modules are not ready
  it("asks riki_new_map with the name and riki_import with the text, and says not ready without them", () => {
    const exports = echo();
    expect(coreOf(exports).newMap([], "Lakes")).toEqual({ rows: [], name: "Lakes" });
    expect(coreOf(exports).importMap([], "{}", true)).toEqual({ rows: [], text: "{}", allowUnsigned: true });
    const without: CoreExports = { ...exports, riki_new_map: undefined, riki_import: undefined };
    expect(() => coreOf(without).newMap([], "Lakes")).toThrow(CoreNotReady);
    expect(() => coreOf(without).importMap([], "{}", true)).toThrow(CoreNotReady);
  });

  // 198 riki_duplicate takes the rows and the map's id; a module from before rikimaps 3671 is not ready
  it("asks riki_duplicate with the rows and the map, and says not ready where the module has none", () => {
    const exports = echo();
    expect(coreOf(exports).duplicate([], "M")).toEqual({ rows: [], id: "M" });
    const without: CoreExports = { ...exports, riki_duplicate: undefined };
    expect(() => coreOf(without).duplicate([], "M")).toThrow(CoreNotReady);
  });

  it("loads a module through the WASI shim and answers what it recorded", async () => {
    const bytes = fakeCoreWasm(account.core);
    const fetcher = async () => new Response(bytes.slice().buffer as ArrayBuffer, { status: 200 });
    const core = await loadCore(fetcher as typeof fetch, "/editor");
    expect(core.maps([]).maps.map((each) => each.name)).toEqual(["High Tatras", "Doprava"]);
    expect(core.map([], "x").name).toBe("High Tatras");
    // 78 the stand-in holds the edit's answer and the history's too
    expect(core.apply({ rows: [], id: "x", styleID: null, edit: { name: "n" }, author: null })).toMatchObject({
      write: [{ id: "own-tatras-layer" }],
    });
    expect(core.changes([])).toEqual([]);
    // 108 and who holds a map
    expect(core.people([], "x")).toMatchObject({ shared: true, role: "editor", linkRole: null });
    // 86 the stand-in holds what an address reads as, and the rows an added layer writes
    expect(core.readAddress({ address: "https://cors.example/{z}/{x}/{y}.png" })).toEqual({
      kind: "direct",
      probe: "https://cors.example/0/0/0.png",
    });
    expect(
      core.addTiles({
        rows: [],
        mapID: "x",
        styleID: null,
        author: null,
        origin: "web",
        add: { kind: "tiles", address: "https://cors.example/{z}/{x}/{y}.png", replies: [] },
      }),
    ).toMatchObject({ write: [{ id: "own-tatras-layer-2" }], history: { id: "change-web-2" } });
    expect(await loadCore(fetcher as typeof fetch, "/editor")).toBe(core);
  });

  // 157 rikimaps 3557's riki_map refuses a map the rows lack, which reached the page as a map
  it("throws NoSuchMap where the core refuses the map, as the phone's 404 throws", async () => {
    const bytes = fakeCoreWasm({ ...account.core, riki_map: { refused: "noSuchMap", call: "riki_map", status: 404 } });
    const fetcher = async () => new Response(bytes.slice().buffer as ArrayBuffer, { status: 200 });
    const core = await loadCore(fetcher as typeof fetch, "/editor");
    expect(() => core.map([], "nothing")).toThrow(NoSuchMap);
    expect(() => core.map([], "nothing")).toThrow("The rows hold no map nothing");
  });

  // 155 the module trapped in Foundation's UserDefaults when its shim gave it no argv[0]
  it("gives the module its name as its one argument", async () => {
    const fetcher = async () => new Response(fakeCoreWasm(account.core).slice().buffer as ArrayBuffer, { status: 200 });
    await loadCore(fetcher as typeof fetch, "/editor");
    expect(CORE_ARGS).toEqual(["riki-core"]);
    expect(shimArgs.at(-1)).toEqual(["riki-core"]);
  });

  // 137 the loading screen counts the engine's megabytes as they arrive
  it("tells the bytes of the module as they arrive, and the whole once it is in", async () => {
    forgetCore();
    const bytes = fakeCoreWasm(account.core).slice();
    const half = Math.floor(bytes.length / 2);
    const fetcher = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.slice(0, half));
            controller.enqueue(bytes.slice(half));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-length": String(bytes.length) } },
      );
    const told: [number, number | null][] = [];
    const core = await loadCore(fetcher as typeof fetch, "/editor", (done, total) => told.push([done, total]));
    expect(core.maps([]).maps).toHaveLength(2);
    expect(told).toEqual([
      [0, bytes.length],
      [half, bytes.length],
      [bytes.length, bytes.length],
      [bytes.length, bytes.length],
    ]);
    forgetCore();
  });

  it("says plainly that riki-core.wasm is missing, and tries again next time", async () => {
    const missing = async () => new Response("", { status: 404 });
    await expect(loadCore(missing as typeof fetch, "/editor")).rejects.toThrow(CoreMissing);
    await expect(loadCore(missing as typeof fetch, "/editor")).rejects.toThrow("/editor/riki-core.wasm");
  });
});
