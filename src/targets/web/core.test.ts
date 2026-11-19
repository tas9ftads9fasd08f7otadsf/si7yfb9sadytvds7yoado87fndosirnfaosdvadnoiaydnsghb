import { afterEach, describe, expect, it } from "vitest";
import account from "../../../e2e/fixtures/cloud-account.json";
import { fakeCoreWasm } from "../../../e2e/fake-core.mjs";
import { CoreMissing, callJSON, coreOf, forgetCore, loadCore, type CoreExports } from "./core";

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
    const alloc = (length: number) => { const at = top; top += length; return at; };
    return { memory, riki_alloc: alloc, riki_free: (p, l) => { freed.push([p, l]); }, freed,
      riki_maps: respond, riki_map: respond, riki_apply: respond, riki_style: respond, riki_changes: respond,
      riki_read_address: respond, riki_add_layer: respond };
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
    expect(core.style([], "M", "S", { tilesBase: "t", theme: "dark", hidden: ["h"], tiles: "2x2" }))
      .toEqual({ rows: [], mapID: "M", styleID: "S", catalog: { tilesBase: "t", theme: "dark", hidden: ["h"], tiles: "2x2" } });
  });

  // 78 the edit is asked with the rows and who writes it; the core's answer is read back whole
  it("asks riki_apply with the edit and the author, and riki_changes with the rows", () => {
    const exports = echo();
    const core = coreOf(exports);
    const ask: Parameters<typeof core.apply>[0] = { rows: [], mapID: "M", styleID: null,
      edit: { kind: "name", name: "x" }, author: "Rita", origin: "web" };
    expect(core.apply(ask)).toEqual(ask);
    expect(core.changes([])).toEqual({ rows: [] });
  });

  // 86 an address is read in rounds, and a layer is added as an edit is applied
  it("asks riki_read_address with the address and the replies, and riki_add_layer with what to add", () => {
    const core = coreOf(echo());
    const replies = [{ url: "https://a.example/x.json", status: 200, contentType: "application/json", text: "{}" }];
    expect(core.readAddress({ address: "https://a.example/x.json", replies })).toEqual({ address: "https://a.example/x.json", replies });
    const ask: Parameters<typeof core.addLayer>[0] = { rows: [], mapID: "M", styleID: null,
      add: { kind: "service", address: "https://a.example/wms", replies, picks: ["roads"] }, author: "Rita", origin: "web" };
    expect(core.addLayer(ask)).toEqual(ask);
  });

  it("loads a module through the WASI shim and answers what it recorded", async () => {
    const bytes = fakeCoreWasm(account.core);
    const fetcher = async () => new Response(bytes.slice().buffer as ArrayBuffer, { status: 200 });
    const core = await loadCore(fetcher as typeof fetch, "/editor");
    expect(core.maps([]).maps.map((each) => each.name)).toEqual(["High Tatras", "Doprava"]);
    expect(core.map([], "x").name).toBe("High Tatras");
    // 78 the stand-in holds the edit's answer and the history's too
    expect(core.apply({ rows: [], mapID: "x", styleID: null, edit: { kind: "name", name: "n" }, author: null, origin: "web" }))
      .toMatchObject({ write: [{ id: "own-tatras-layer" }] });
    expect(core.changes([])).toEqual([]);
    // 86 the stand-in holds what an address reads as, and the rows an added layer writes
    expect(core.readAddress({ address: "https://cors.example/{z}/{x}/{y}.png", replies: [] }))
      .toEqual({ read: { kind: "tiles", probe: "https://cors.example/0/0/0.png" } });
    expect(core.addLayer({ rows: [], mapID: "x", styleID: null, author: null, origin: "web",
      add: { kind: "tiles", address: "https://cors.example/{z}/{x}/{y}.png", replies: [] } }))
      .toMatchObject({ write: [{ id: "own-tatras-layer-2" }], history: { id: "change-web-2" } });
    expect(await loadCore(fetcher as typeof fetch, "/editor")).toBe(core);
  });

  it("says plainly that riki-core.wasm is missing, and tries again next time", async () => {
    const missing = async () => new Response("", { status: 404 });
    await expect(loadCore(missing as typeof fetch, "/editor")).rejects.toThrow(CoreMissing);
    await expect(loadCore(missing as typeof fetch, "/editor")).rejects.toThrow("/editor/riki-core.wasm");
  });
});
