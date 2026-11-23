import { describe, expect, it } from "vitest";
import { keptItems, keysIn, newDetailRow, roleOf, rowChanged, ruleChanged, ruleComplete, rulePasses, shows, shownSwitched,
  usedAs, usedKeys } from "./api";
import { COFFEE_TRIP } from "./coffee-trip.fixture";
import type { APIPointRule, APIReading } from "./types";

const reading: APIReading = { itemsPath: "vehicles", spelling: "decimal", latitudeKey: "lat", longitudeKey: "lon",
  positionKey: "" };
const keys = ["lat", "lon", "line"];

describe("API layer form", () => {
  // 61 A tap shows every key until one is switched off; all back on stores none, as the phone's form does
  it("switches the keys a tap shows as the phone stores them", () => {
    expect(shows(reading, "line")).toBe(true);
    const off = shownSwitched(reading, keys, "line", false);
    expect(off).toEqual(["lat", "lon"]);
    expect(shows({ ...reading, shownKeys: off }, "line")).toBe(false);
    expect(shownSwitched({ ...reading, shownKeys: off }, keys, "line", true)).toEqual([]);
  });

  // 61 A Details row is written as `APIDetailRow` decodes: an id, a title, a mark and a value
  it("makes and changes Details rows the phone can read", () => {
    const row = newDetailRow();
    expect(row).toMatchObject({ title: "", symbol: "info.circle", value: "" });
    expect(row.id).toMatch(/^[0-9A-F-]{36}$/);
    expect(rowChanged([row], row.id, { title: "Line" })[0]?.title).toBe("Line");
  });

  // 171 the filter's rules read an item as the app's APIPointRule does: loosely, a missing key being empty
  describe("filter", () => {
    const rule = (key: string, op: APIPointRule["op"], value?: string): APIPointRule => ({ key, op, value });
    const kept = (...rules: APIPointRule[]) => keptItems(COFFEE_TRIP, { ...reading, itemsPath: "cafes", filter: rules })
      .map((item) => (item as { name: string }).name);

    it("keeps points where a key is the value, ignoring case and accents", () => {
      expect(kept(rule("city.name", "is", "bratislava"))).toEqual(["Café Nové"]);
      expect(kept(rule("name", "is", "cafe nove"))).toEqual(["Café Nové"]);
      expect(kept(rule("id", "is", "3"))).toEqual(["Kávovar"]);
      expect(kept(rule("name", "is", "Café"))).toEqual([]);
    });

    it("drops points where a key is the value and keeps those without the key", () => {
      expect(kept(rule("city.name", "isNot", "Budapest"))).toEqual(["Café Nové", "Kávovar"]);
      expect(kept(rule("extra", "isNot", "only here"))).toEqual(["Espresso Embassy", "Café Nové"]);
    });

    it("finds part of a value, and a tag in a list", () => {
      expect(kept(rule("name", "contains", "esp"))).toEqual(["Espresso Embassy"]);
      expect(kept(rule("tags", "contains", "wifi"))).toEqual(["Espresso Embassy", "Café Nové"]);
      expect(kept(rule("nowhere", "contains", "x"))).toEqual([]);
    });

    it("keeps points whose key says something: missing, blank and empty lists say nothing", () => {
      expect(kept(rule("note", "notEmpty"))).toEqual(["Café Nové"]);
      expect(kept(rule("tags", "notEmpty"))).toEqual(["Espresso Embassy", "Café Nové"]);
      expect(kept(rule("owner", "notEmpty"))).toEqual(["Espresso Embassy", "Café Nové"]);
      expect(kept(rule("extra", "notEmpty"))).toEqual(["Kávovar"]);
    });

    it("needs every rule to hold, and no rules keep everything", () => {
      expect(kept(rule("tags", "contains", "wifi"), rule("city.name", "isNot", "Budapest"))).toEqual(["Café Nové"]);
      expect(kept()).toHaveLength(3);
    });

    it("lets a rule still being written hide nothing", () => {
      expect(kept(rule("", "is", "x"))).toHaveLength(3);
      expect(kept(rule("name", "contains", " "))).toHaveLength(3);
      expect(ruleComplete(rule("", "is", "x"))).toBe(false);
      expect(ruleComplete(rule("name", "contains"))).toBe(false);
      expect(ruleComplete(rule("name", "notEmpty"))).toBe(true);
      expect(rulePasses(rule("name", "is", "x"), null)).toBe(false);
    });

    it("adds, changes and removes rules, none left being no filter", () => {
      const one = ruleChanged(reading, 0, { key: "name" });
      expect(one).toEqual([{ key: "name", op: "is", value: "" }]);
      const changed = ruleChanged({ ...reading, filter: one }, 0, { op: "notEmpty" });
      expect(changed).toEqual([{ key: "name", op: "notEmpty", value: "" }]);
      expect(ruleChanged({ ...reading, filter: changed }, 0, null)).toBeNull();
    });

    it("counts a filter's keys among the keys the reading uses, each once", () => {
      const used = usedKeys({ ...reading, spelling: "position", positionKey: "latLng", nameKey: "name",
        filter: [rule("name", "is", "x"), rule("tags", "contains", "wifi"), rule(" ", "is", "y")] });
      expect(used).toEqual(["latLng", "name", "tags"]);
      const keys = ["latLng", "name", "tags", "note"];
      const asked = { ...reading, spelling: "position", positionKey: "latLng", filter: [rule("tags", "notEmpty")] };
      expect(keysIn("used", asked, keys)).toEqual(["latLng", "tags"]);
      expect(keysIn("all", asked, keys)).toEqual(keys);
      expect(keysIn("picked", { ...asked, shownKeys: ["note"] }, keys)).toEqual(["note"]);
    });
  });

  // 171 Use as: a key of a list's things becomes the place, the name, the picture or the colour
  describe("use as", () => {
    const cafes: APIReading = { ...reading, itemsPath: "cafes", spelling: "position", positionKey: "latLng", nameKey: "name" };

    it("tells what role a key has in the reading", () => {
      expect(roleOf(cafes, "latLng")).toBe("place");
      expect(roleOf(cafes, "name")).toBe("name");
      expect(roleOf(cafes, "note")).toBeNull();
    });

    it("sets a key as a role in the list the points are read from, and clears the role it had", () => {
      expect(usedAs(cafes, "cafes", "note", "colour")).toEqual({ colourKey: "note" });
      expect(usedAs(cafes, "cafes", "name", "picture")).toEqual({ nameKey: null, imageKey: "name" });
      expect(usedAs(cafes, "cafes", "name", null)).toEqual({ nameKey: null });
    });

    it("moves to the list first when the key is of another, forgetting the old list's keys", () => {
      const change = usedAs(cafes, "cities", "name", "name");
      expect(change).toMatchObject({ itemsPath: "cities", positionKey: "", nameKey: "name", shownKeys: [], filter: null });
      expect(usedAs(cafes, "cities", "", null)).toMatchObject({ itemsPath: "cities", nameKey: null });
    });

    it("makes a place of one key, or of a latitude and a longitude", () => {
      const lonLat: APIReading = { ...reading, itemsPath: "cities" };
      expect(usedAs(lonLat, "cities", "lat", "latitude")).toEqual({ spelling: "decimal", latitudeKey: "lat" });
      expect(usedAs(cafes, "cafes", "city.id", "latitude")).toMatchObject({ spelling: "decimal", latitudeKey: "city.id" });
      expect(usedAs(lonLat, "cities", "name", "place")).toMatchObject({ spelling: "position", positionKey: "name", positionOrder: null });
    });
  });
});
