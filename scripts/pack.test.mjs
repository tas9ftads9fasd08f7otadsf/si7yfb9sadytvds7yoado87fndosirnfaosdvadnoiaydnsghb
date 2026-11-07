import { describe, expect, it } from "vitest";
import { asked, ships, styleFacts } from "./pack.mjs";

describe("what the bundle carries", () => {
  it("takes the page and its assets, not Next's route payloads", () => {
    expect(ships("index.html")).toBe(true);
    expect(ships("_next/static/chunks/a.js")).toBe(true);
    expect(ships("licenses/pmtiles.txt")).toBe(true);
    expect(ships("index.txt")).toBe(false);
    expect(ships("__next._tree.txt")).toBe(false);
    expect(ships("404.html")).toBe(false);
  });

  it("reads what the page asks for", () => {
    expect(asked(`<script src="/web/app/_next/static/a.js"></script><link href='/web/app/b.css'>`))
      .toEqual(["_next/static/a.js", "b.css"]);
  });

  it("gathers the style facts from every layer's layout and paint", () => {
    const facts = styleFacts({ layout_line: { "line-cap": {} }, paint_fill: { "fill-color": {} }, other: { nope: {} },
      filter_operator: { values: { "!in": {} } }, terrain: { source: {} } }, ["get"]);
    expect(facts).toEqual({ properties: ["fill-color", "line-cap"], operators: ["!in", "get"], terrainKeys: ["source"] });
  });
});
