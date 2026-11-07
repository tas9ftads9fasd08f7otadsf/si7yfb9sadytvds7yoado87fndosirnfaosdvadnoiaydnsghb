import { describe, expect, it } from "vitest";
import { edited, sideOf, toggled } from "./coverage";

describe("sideOf", () => {
  it("reads the include side from the top level, without the exclusion", () => {
    expect(sideOf({ countries: ["SK"], exclude: { world: true } }, "include")).toEqual({ countries: ["SK"] });
  });
  it("reads the exclude side from its own object", () => {
    expect(sideOf({ exclude: { regions: ["a"] } }, "exclude")).toEqual({ regions: ["a"] });
    expect(sideOf({}, "exclude")).toEqual({});
  });
});

describe("toggled", () => {
  it("adds, removes, and gives nothing for an empty list", () => {
    expect(toggled("a", undefined)).toEqual(["a"]);
    expect(toggled("a", ["a", "b"])).toEqual(["b"]);
    expect(toggled("a", ["a"])).toBeUndefined();
  });
});

describe("edited", () => {
  it("changes one side and keeps the other", () => {
    const made = edited({ countries: ["SK"], exclude: { regions: ["r"] } }, "include",
      (places) => { places.countries = ["CZ"]; });
    expect(made.countries).toEqual(["CZ"]);
    expect(made.exclude).toEqual({ regions: ["r"] });
  });
  it("drops an exclusion left empty", () => {
    const made = edited({ exclude: { world: true } }, "exclude", (places) => { places.world = undefined; });
    expect(made.exclude).toBeUndefined();
  });
  it("leaves the coverage it was given alone", () => {
    const given = { countries: ["SK"] };
    edited(given, "include", (places) => { places.countries = []; });
    expect(given.countries).toEqual(["SK"]);
  });
});
