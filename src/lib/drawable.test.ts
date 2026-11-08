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

  it("leaves a style without terrain without one", () => {
    expect(drawable(style({})).terrain).toBeUndefined();
  });
});
