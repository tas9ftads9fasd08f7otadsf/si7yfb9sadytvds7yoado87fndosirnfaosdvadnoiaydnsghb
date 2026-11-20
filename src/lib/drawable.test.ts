import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { drawable } from "./drawable";

const style = (rest: object) => ({ version: 8, sources: {}, layers: [], ...rest }) as unknown as StyleSpecification;

describe("drawable", () => {
  it("keeps the terrain's source and loses its plane", () => {
    const made = drawable(style({ terrain: { source: "dem", exaggeration: 1.3, plane: 700 } }));
    expect(made.terrain).toEqual({ source: "dem", exaggeration: 1.3 });
  });

  it("keeps only layers of a type this MapLibre draws", () => {
    const made = drawable(style({ layers: [{ id: "a", type: "fill" }, { id: "b", type: "color-relief" },
      { id: "c", type: "hillshade" }] }));
    expect(made.layers.map((layer) => layer.id)).toEqual(["a", "c"]);
  });

  it("strips what only the app's MapLibre reads and leaves the rest", () => {
    const made = drawable(style({ layers: [{ id: "n", type: "symbol",
      layout: { "text-field": "x", "symbol-z-offset": 3 } }] }));
    expect((made.layers[0] as { layout: object }).layout).toEqual({ "text-field": "x" });
  });

  // 125 bug: Safari's MapLibre threw on one layer's two zoom curves, then on every redraw and tap
  it("leaves out a layer whose value MapLibre cannot build, and names it", () => {
    const twoCurves = ["coalesce", ["interpolate", ["linear"], ["zoom"], 1, 1, 5, 2],
      ["step", ["zoom"], 1, 5, 2]];
    const made = drawable(style({ sources: { s: { type: "geojson", data: { type: "FeatureCollection", features: [] } } },
      layers: [{ id: "kept", type: "line", source: "s", paint: { "line-width": 2 } },
        { id: "bad", type: "line", source: "s", paint: { "line-width": twoCurves } },
        { id: "badFilter", type: "line", source: "s", filter: ["==", ["get"], 1] },
        { id: "label", type: "symbol", source: "s", layout: { "text-field": "x" } }] }));
    expect(made.layers.map((layer) => layer.id)).toEqual(["kept", "label"]);
    expect((made.metadata as Record<string, unknown>)["riki:refused"]).toEqual(["bad", "badFilter"]);
  });

  // 125 a style MapLibre takes whole comes back as it was, with nothing named
  it("names nothing on a style every layer of which MapLibre builds", () => {
    const made = drawable(style({ layers: [{ id: "a", type: "background", paint: { "background-color": "#fff" } }] }));
    expect(made.metadata).toBeUndefined();
  });

  it("leaves a style without terrain without one", () => {
    expect(drawable(style({})).terrain).toBeUndefined();
  });
});

// 112 the core names the region packages a style would draw from and the browser lacks
describe("the region packages a style needs", () => {
  it("reads them from the style's metadata, leaving out what is not a region and a piece", async () => {
    const { needsOf } = await import("./drawable");
    const style = { metadata: { "riki:needs": [{ region: "tatry", piece: "base" }, { region: "tatry" }, null, "x", { region: 1, piece: "b" }] } };
    expect(needsOf(style as never)).toEqual([{ region: "tatry", piece: "base" }]);
    expect(needsOf({} as never)).toEqual([]);
    expect(needsOf({ metadata: { "riki:needs": "tatry" } } as never)).toEqual([]);
  });
});
