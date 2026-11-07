import { describe, expect, it } from "vitest";
import { samePlace, startQuery } from "./places";

describe("samePlace", () => {
  it("compares kind, region, country and name, a missing one as blank", () => {
    expect(samePlace({ kind: "city", name: "Poprad" }, { kind: "city", name: "Poprad", region: "" })).toBe(true);
    expect(samePlace({ kind: "city", name: "Poprad" }, { kind: "state", name: "Poprad" })).toBe(false);
  });
});

describe("startQuery", () => {
  it("writes the box west, south, east, north", () => {
    const query = startQuery({ kind: "region", region: "tatry", latitude: 49, longitude: 20, zoom: 0,
      box: { minLon: 1, minLat: 2, maxLon: 3, maxLat: 4 } });
    expect(query).toEqual({ start: "region", region: "tatry", lat: "49", lon: "20", zoom: "0", box: "1,2,3,4" });
  });
  it("leaves out what a place does not have", () => {
    expect(startQuery({ kind: "country", country: "SK" })).toEqual({ start: "country", country: "SK" });
  });
});
