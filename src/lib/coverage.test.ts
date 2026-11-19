import { describe, expect, it } from "vitest";
import { edited, foldedContinents, shownCountries, sideOf, toggled } from "./coverage";

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

const countries = [{ id: "AT", name: "Austria" }, { id: "CZ", name: "Czechia" }, { id: "AF", name: "Afghanistan" },
  { id: "SK", name: "Slovakia" }];
const withRegions = new Set(["AT", "CZ", "SK"]);

describe("shownCountries", () => {
  // 74 TestFlight AK2D: every country of the world stood under the chosen one.
  it("lists only the chosen countries", () => {
    expect(shownCountries(["SK"], countries, withRegions, "")).toEqual(["SK"]);
  });
  // 74 With nothing chosen, the countries that have regions are offered.
  it("offers the countries with regions when none is chosen", () => {
    expect(shownCountries([], countries, withRegions, "")).toEqual(["AT", "CZ", "SK"]);
  });
  // 74 A search reaches every country, those with regions first.
  it("finds any country by a search", () => {
    expect(shownCountries(["SK"], countries, withRegions, "a")).toEqual(["SK", "AT", "CZ", "AF"]);
    expect(shownCountries([], countries, withRegions, "afgh")).toEqual(["AF"]);
  });
});

describe("foldedContinents", () => {
  const all = [{ id: "europe", name: "Europe" }, { id: "asia", name: "Asia" }, { id: "africa", name: "Africa" }];
  // 74 TestFlight AL-i: continents fold as the ranges do, a chosen one above the fold.
  it("keeps the chosen continents in sight and folds the rest", () => {
    const folded = foldedContinents(all, ["asia"]);
    expect(folded.inSight.map((each) => each.id)).toEqual(["asia"]);
    expect(folded.folded.map((each) => each.id)).toEqual(["europe", "africa"]);
  });
});
