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
      riki_maps: respond, riki_map: respond, riki_apply: respond, riki_style: respond };
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

  it("loads a module through the WASI shim and answers what it recorded", async () => {
    const bytes = fakeCoreWasm(account.core);
    const fetcher = async () => new Response(bytes.slice().buffer as ArrayBuffer, { status: 200 });
    const core = await loadCore(fetcher as typeof fetch, "/editor");
    expect(core.maps([]).maps.map((each) => each.name)).toEqual(["High Tatras", "Doprava"]);
    expect(core.map([], "x").name).toBe("High Tatras");
    expect(await loadCore(fetcher as typeof fetch, "/editor")).toBe(core);
  });

  it("says plainly that riki-core.wasm is missing, and tries again next time", async () => {
    const missing = async () => new Response("", { status: 404 });
    await expect(loadCore(missing as typeof fetch, "/editor")).rejects.toThrow(CoreMissing);
    await expect(loadCore(missing as typeof fetch, "/editor")).rejects.toThrow("/editor/riki-core.wasm");
  });
});
