import { describe, expect, it } from "vitest";
import { distanceText, findNames, folded, pointOn } from "./search";

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
