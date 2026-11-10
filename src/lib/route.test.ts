import { describe, expect, it } from "vitest";
import { type Route, mapOf, pathOf, plainCamera, readRoute } from "./route";

// 30 every screen of the redesign's address table, read and written back.
const TABLE: [string, Route][] = [
  ["/", { screen: "home" }],
  ["/maps", { screen: "maps" }],
  ["/maps/M1", { screen: "map", map: "M1" }],
  ["/maps/M1/style/S2", { screen: "map", map: "M1", style: "S2" }],
  ["/maps/M1/layers", { screen: "map", map: "M1", panel: "layers" }],
  ["/maps/M1/search/Hlavn%C3%A1%20stanica", { screen: "search", map: "M1", text: "Hlavná stanica" }],
  ["/maps/M1/place/L1/F9", { screen: "place", map: "M1", layer: "L1", feature: "F9" }],
  ["/maps/M1/edit/layers", { screen: "edit", map: "M1", tab: "layers" }],
  ["/maps/M1/edit/general", { screen: "edit", map: "M1", tab: "general" }],
  ["/maps/M1/edit/styling", { screen: "edit", map: "M1", tab: "styling" }],
  ["/maps/M1/edit/styling/S2", { screen: "edit", map: "M1", tab: "styling", style: "S2" }],
  ["/maps/M1/edit/sharing", { screen: "edit", map: "M1", tab: "sharing" }],
  ["/maps/M1/edit/offline", { screen: "edit", map: "M1", tab: "offline" }],
  ["/maps/M1/layers/L1/details", { screen: "details", map: "M1", layer: "L1" }],
  ["/new", { screen: "home", modal: { kind: "new" } }],
  ["/maps/M1/layers/new/tile", { screen: "map", map: "M1", modal: { kind: "add", source: "tile" } }],
  ["/maps/M1/layers/new/server", { screen: "map", map: "M1", modal: { kind: "add", source: "server" } }],
  ["/maps/M1/layers/new/builtin", { screen: "map", map: "M1", modal: { kind: "add", source: "builtin" } }],
  ["/maps/M1/layers/new/file", { screen: "map", map: "M1", modal: { kind: "add", source: "file" } }],
  ["/data/layers", { screen: "data", tab: "layers" }],
  ["/data/servers", { screen: "data", tab: "servers" }],
  ["/data/regions", { screen: "data", tab: "regions" }],
  ["/servers", { screen: "servers" }],
  ["/servers/S1/layers", { screen: "servers", server: "S1", part: "layers" }],
  ["/servers/S1/general", { screen: "servers", server: "S1", part: "general" }],
  ["/servers/S1/sharing", { screen: "servers", server: "S1", part: "sharing" }],
  ["/settings", { screen: "settings" }],
  ["/unlock/7Q4K29", { screen: "unlock", key: "7Q4K29" }]
];

describe("readRoute and pathOf", () => {
  it.each(TABLE)("%s both ways", (path, route) => {
    expect(readRoute(path)).toEqual(route);
    expect(pathOf(route)).toBe(path);
  });

  it("reads unknown and broken paths as home", () => {
    for (const path of ["/mapsx", "/web/app/x.js", "/%E0%A4%A", "/unlock", "/unlock/"]) {
      expect(readRoute(path)).toEqual({ screen: "home" });
    }
  });

  it("fills in what a partial path leaves out", () => {
    expect(readRoute("/data")).toEqual({ screen: "data", tab: "layers" });
    expect(readRoute("/data/nothing")).toEqual({ screen: "data", tab: "layers" });
    expect(readRoute("/maps/M1/edit")).toEqual({ screen: "edit", map: "M1", tab: "layers" });
    expect(readRoute("/maps/M1/edit/colours")).toEqual({ screen: "edit", map: "M1", tab: "layers" });
    expect(readRoute("/maps/M1/style")).toEqual({ screen: "map", map: "M1" });
    expect(readRoute("/maps/M1/place/L1")).toEqual({ screen: "map", map: "M1" });
    expect(readRoute("/maps/M1/search")).toEqual({ screen: "map", map: "M1" });
    expect(readRoute("/maps/M1/elsewhere")).toEqual({ screen: "map", map: "M1" });
    expect(readRoute("/servers/S1")).toEqual({ screen: "servers", server: "S1", part: "layers" });
    expect(pathOf({ screen: "servers", server: "S1" })).toBe("/servers/S1/layers");
  });

  it("ignores a trailing slash, a query and the camera", () => {
    expect(readRoute("/maps/M1/")).toEqual({ screen: "map", map: "M1" });
    expect(readRoute("/maps/")).toEqual({ screen: "maps" });
    expect(readRoute("/maps/M1?edit=1#14/48.1/17.1")).toEqual({ screen: "map", map: "M1" });
    expect(readRoute("/index.html")).toEqual({ screen: "home" });
  });

  it("encodes and decodes each segment once", () => {
    const route: Route = { screen: "search", map: "a/b", text: "50% off?#" };
    expect(pathOf(route)).toBe("/maps/a%2Fb/search/50%25%20off%3F%23");
    expect(readRoute(pathOf(route))).toEqual(route);
    expect(readRoute("/maps/M1/search/%2541")).toEqual({ screen: "search", map: "M1", text: "%41" });
  });

  it("names the map a route draws", () => {
    expect(mapOf({ screen: "edit", map: "M1", tab: "general" })).toBe("M1");
    expect(mapOf({ screen: "maps" })).toBeUndefined();
  });
});

// 30 links kept from before the plain camera still open where they pointed.
describe("plainCamera", () => {
  it("rewrites the named camera once", () => {
    expect(plainCamera("#at=14/48.1583/17.1063")).toBe("#14/48.1583/17.1063");
    expect(plainCamera("#14/48.1583/17.1063")).toBeNull();
    expect(plainCamera("")).toBeNull();
  });
});
