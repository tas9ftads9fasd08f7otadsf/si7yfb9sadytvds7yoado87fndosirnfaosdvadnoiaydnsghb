import { describe, expect, it } from "vitest";
import type { PhonePlace } from "./types";
import { distanceText, findNames, folded, indexedPlaces, pointOn, withPhoneHits, worthAsking } from "./search";

const named = (name: string, layer = "Places", at: [number, number] | null = [17.1, 48.1]) =>
  ({ properties: { name }, layer, at });

describe("search", () => {
  // 100 accents and case do not matter, as a person types
  it("folds accents and case", () => {
    expect(folded("  Košice ")).toBe("kosice");
  });

  // 100 a name starting with the words leads; a name in one spot once, however many layers draw it
  it("finds names, those starting with the words first", () => {
    const hits = findNames([named("Nové Mesto"), named("Mestská hala"), named("Mestská hala"),
      named("Mestská hala", "building"), named("Mestská hala", "poi", [18, 49]), named("Petržalka"),
      { properties: {}, layer: "x", at: [0, 0] }], "mest");
    expect(hits.map((hit) => [hit.name, hit.layer])).toEqual([["Mestská hala", "Places"],
      ["Mestská hala", "Poi"], ["Nové Mesto", "Places"]]);
    expect(findNames([named("Mesto")], "m")).toEqual([]);
    expect(findNames([named("Mesto", "Places", null)], "mesto")).toEqual([]);
  });

  // 100 a line or an area is reached at a point on it
  it("takes a point on any geometry", () => {
    expect(pointOn({ type: "Point", coordinates: [1, 2] })).toEqual([1, 2]);
    expect(pointOn({ type: "LineString", coordinates: [[0, 0], [1, 1], [2, 2]] })).toEqual([1, 1]);
    expect(pointOn({ type: "Polygon", coordinates: [[[5, 5], [6, 6], [7, 7]]] })).toEqual([6, 6]);
    expect(pointOn(null)).toBeNull();
  });

  // 100
  it("says a distance in metres, then kilometres", () => {
    expect(distanceText({ lng: 17, lat: 48 }, { lng: 17, lat: 48.001 })).toBe("110 m");
    expect(distanceText({ lng: 17, lat: 48 }, { lng: 17, lat: 48.012 })).toBe("1.3 km");
    expect(distanceText({ lng: 17, lat: 48 }, { lng: 17, lat: 48.3 })).toBe("33 km");
  });
});

// 129 the phone's places search: asked as its own field starts matching, its answers joined to the names read off the map
describe("the phone's places", () => {
  const hut: PhonePlace = { title: "Chata pod Rysmi", layer: "Huts", layerID: "L1", lat: 49.18, lon: 20.08,
    properties: { Nazov: "Chata pod Rysmi" } };
  const poprad: PhonePlace = { title: "Poprad", detail: "Prešov Region", kind: "city", lat: 49.06, lon: 20.3,
    box: [20.2, 49, 20.4, 49.1], properties: { name: "Poprad" } };

  it("is asked for three letters or a number", () => {
    expect(worthAsking("po")).toBe(false);
    expect(worthAsking(" pop ")).toBe(true);
    expect(worthAsking("61")).toBe(true);
    expect(worthAsking("6a")).toBe(false);
    expect(worthAsking("x".repeat(101))).toBe(false);
  });

  it("lists a name in one spot once, as the phone's, so it can ask for its Details", () => {
    const local = findNames([named("Chata pod Rysmi", "Huts", [20.08, 49.18]), named("Rysy", "peaks", [20.09, 49.18])], "rys");
    const merged = withPhoneHits(local, [hut, { ...hut, title: "Rysy chata", lat: 49.2 }, poprad]);
    expect(merged.map((hit) => [hit.name, hit.layerID])).toEqual([["Rysy", undefined], ["Chata pod Rysmi", "L1"],
      ["Rysy chata", "L1"]]);
  });

  it("keeps a line's or an area's box for the map to frame", () => {
    const [hit] = withPhoneHits([], [{ ...hut, box: [20, 49, 20.1, 49.2] }]);
    expect(hit?.box).toEqual([20, 49, 20.1, 49.2]);
    expect(withPhoneHits([], [hut])[0]).not.toHaveProperty("box");
  });

  it("puts the places that are no layer's feature in their own list", () => {
    expect(indexedPlaces([hut, poprad])).toEqual([{ start: { kind: "coordinates", name: "Poprad", latitude: 49.06, longitude: 20.3,
      box: { minLon: 20.2, minLat: 49, maxLon: 20.4, maxLat: 49.1 } }, title: "Poprad", detail: "Prešov Region", kind: "city",
    properties: { name: "Poprad" } }]);
  });
});
