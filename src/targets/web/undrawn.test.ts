import { describe, expect, it, vi } from "vitest";
import type { Reach } from "./reach";
import { drawnHere } from "./undrawn";

// 85 a layer whose host refuses browsers, or needs a header they may not set, is left out of the site's style
const style = {
  version: 8,
  sources: {
    "riki-base": { type: "vector", url: "pmtiles://https://tiles.example/a.pmtiles" },
    "riki-custom-t1": { type: "raster", tiles: ["https://cors.example/{z}/{x}/{y}.png"] },
    "riki-custom-t2": { type: "raster", tiles: ["https://closed.example/{z}/{x}/{y}.png"] },
    "riki-custom-t3": { type: "raster", tiles: ["https://cors.example/{z}/{x}/{y}.png"], "riki:headers": ["Referer"] },
    "riki-custom-t4": { type: "raster", tiles: ["https://cors.example/{z}/{x}/{y}.png"], "riki:headers": ["X-Api-Key"] },
    "riki-custom-g1": { type: "geojson", data: { type: "FeatureCollection", features: [] } }
  },
  layers: [{ id: "ground", type: "background" }, { id: "t1", type: "raster", source: "riki-custom-t1" },
    { id: "t2", type: "raster", source: "riki-custom-t2" }, { id: "t3", type: "raster", source: "riki-custom-t3" },
    { id: "t4", type: "raster", source: "riki-custom-t4" }, { id: "g1", type: "line", source: "riki-custom-g1" }]
};
const reach = (refusing: string[]): Reach => ({ answers: vi.fn(async (address: string) => !refusing.some((host) => address.startsWith(host))) });

describe("a style cut to what a browser can fetch", () => {
  it("leaves out a source on a refusing host, and one needing a header a browser may not set, with their layers", async () => {
    const cut = await drawnHere(style, reach(["https://closed.example"]), ["https://tiles.example"]) as typeof style & { metadata: Record<string, unknown> };
    expect(Object.keys(cut.sources)).toEqual(["riki-base", "riki-custom-t1", "riki-custom-t4", "riki-custom-g1"]);
    expect(cut.layers.map((layer) => layer.id)).toEqual(["ground", "t1", "t4", "g1"]);
    expect(cut.metadata["riki:undrawn"]).toEqual(["t2", "t3"]);
  });

  it("does not ask the pipeline's host, and asks a host for each address it holds", async () => {
    const asked = reach([]);
    const same = await drawnHere(style, asked, ["https://tiles.example"]);
    expect(asked.answers).not.toHaveBeenCalledWith("pmtiles://https://tiles.example/a.pmtiles");
    expect(asked.answers).toHaveBeenCalledWith("https://closed.example/{z}/{x}/{y}.png");
    expect((same as typeof style & { metadata?: unknown }).metadata).toEqual({ "riki:undrawn": ["t3"] });
  });

  it("returns a style as it is when every source can be drawn", async () => {
    const plain = { version: 8, sources: { a: { type: "raster", tiles: ["https://cors.example/{z}.png"] } }, layers: [] };
    expect(await drawnHere(plain, reach([]))).toBe(plain);
  });

  it("draws a source whose reach is not known yet", async () => {
    const unknown: Reach = { answers: async () => null };
    const cut = await drawnHere({ ...style, sources: { x: style.sources["riki-custom-t1"] }, layers: [] }, unknown) as { sources: object };
    expect(Object.keys(cut.sources)).toEqual(["x"]);
  });
});
