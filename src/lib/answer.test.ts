import { describe, expect, it } from "vitest";
import { answerChildren, answerItems, answerKeys, answerNode, answerRoot, answerTrail, answerUp, itemValue,
  pointLists } from "./answer";
import { COFFEE_TRIP } from "./coffee-trip.fixture";

const names = (nodes: { name: string }[]) => nodes.map((node) => node.name);
const paths = (nodes: { path: string }[]) => nodes.map((node) => node.path);

describe("the answer as a tree", () => {
  // 171 the top level lists its parts with what each is
  it("lists the answer's parts by kind, count and sample", () => {
    const parts = answerChildren(COFFEE_TRIP, "");
    expect(names(parts)).toEqual(["cafes", "cities", "giveaways", "grid", "nothing", "trip"]);
    expect(parts[0]).toMatchObject({ path: "cafes", kind: "list", count: 3, holdsThings: true });
    expect(answerRoot(COFFEE_TRIP)).toMatchObject({ kind: "object", path: "" });
  });

  // 171 an empty list is seen, not opened, and no points are read from it
  it("shows an empty list with no count and nothing inside", () => {
    expect(answerNode(COFFEE_TRIP, "giveaways")).toMatchObject({ kind: "list", count: 0, holdsThings: false });
    expect(answerChildren(COFFEE_TRIP, "giveaways")).toEqual([]);
  });

  // 171 a list of objects opens into the keys of its things, the first that fills each
  it("opens a list of objects into the keys of its things", () => {
    const keys = answerChildren(COFFEE_TRIP, "cafes");
    expect(names(keys)).toEqual(["city", "extra", "id", "latLng", "name", "note", "owner", "tags"]);
    expect(keys.find((key) => key.name === "extra")?.sample).toBe("only here");
    expect(keys.find((key) => key.name === "note")?.sample).toBe("closed on Sundays");
    expect(keys.find((key) => key.name === "city")).toMatchObject({ kind: "object", count: 2, path: "cafes.city" });
    expect(paths(answerChildren(COFFEE_TRIP, "cafes.city"))).toEqual(["cafes.city.id", "cafes.city.name"]);
  });

  // 171 a list of lists opens by position, and the positions are paths the phone resolves
  it("opens a list of lists by position", () => {
    const rows = answerChildren(COFFEE_TRIP, "grid");
    expect(paths(rows)).toEqual(["grid.0", "grid.1"]);
    expect(rows.every((row) => row.kind === "list" && row.count === 2 && !row.holdsThings)).toBe(true);
    expect(answerNode(COFFEE_TRIP, "grid.1.0")).toMatchObject({ kind: "number", sample: "3" });
  });

  // 171 text, number, flag and nothing
  it("tells text, number and empty apart and cuts a sample short", () => {
    expect(answerChildren(COFFEE_TRIP, "trip").map((node) => [node.kind, node.sample]))
      .toEqual([["text", "Coffee trip"], ["text", "true"], ["number", "2026"]]);
    expect(answerNode(COFFEE_TRIP, "nothing")?.kind).toBe("empty");
    expect(answerNode({ s: "a".repeat(90) }, "s")?.sample).toHaveLength(40);
    expect(answerNode({ s: "  " }, "s")?.kind).toBe("empty");
  });

  // 171 Up goes back a step, the trail names every step down
  it("goes up a step and trails from the answer", () => {
    expect(answerUp("")).toBeNull();
    expect(answerUp("cafes")).toBe("");
    expect(answerUp("cafes.city.name")).toBe("cafes.city");
    expect(paths(answerTrail(COFFEE_TRIP, "cafes.city"))).toEqual(["", "cafes", "cafes.city"]);
    expect(answerNode(COFFEE_TRIP, "cafes.nowhere")).toBeNull();
    expect(answerChildren(COFFEE_TRIP, "nowhere")).toEqual([]);
  });

  // 171 only lists of objects offer points
  it("finds the lists points can be read from", () => {
    expect(paths(pointLists(COFFEE_TRIP))).toEqual(["cafes", "cities"]);
    expect(paths(pointLists([{ a: 1 }]))).toEqual([""]);
    expect(pointLists([[{ a: 1 }]])).toEqual([]);
  });

  // 171 a list's keys, nested ones by path, each with how many things carry it
  it("lists the scalar keys of a list's things, nested by path", () => {
    const keys = answerKeys(COFFEE_TRIP, "cafes");
    expect(paths(keys)).toEqual(["city.id", "city.name", "extra", "id", "latLng", "name", "note", "owner.contact.email"]);
    expect(keys.find((key) => key.path === "note")).toMatchObject({ count: 1, sample: "closed on Sundays" });
    expect(keys.find((key) => key.path === "name")?.count).toBe(3);
    expect(answerKeys(COFFEE_TRIP, "giveaways")).toEqual([]);
    // a rule can look into a list of plain values, which a tap does not show
    expect(paths(answerKeys(COFFEE_TRIP, "cafes", true))).toContain("tags");
    expect(answerKeys(COFFEE_TRIP, "cafes", true).find((key) => key.path === "tags")).toMatchObject({ count: 2, sample: "roaster, wifi" });
  });

  // 171 only the first fifty things describe a long list
  it("describes a long list by its first fifty things", () => {
    const all = Array.from({ length: 80 }, (_, id) => ({ id }));
    expect(answerKeys({ all }, "all")[0]?.count).toBe(50);
    expect(answerNode({ all }, "all")?.count).toBe(80);
  });

  // 171 an item's key is read as the phone reads it
  it("reads an item's key by dot path, into a list meaning its first thing", () => {
    expect(itemValue(COFFEE_TRIP.cafes[0], "city.name")).toBe("Budapest");
    expect(itemValue(COFFEE_TRIP.cafes[0], "tags.1")).toBe("wifi");
    expect(itemValue(COFFEE_TRIP, "cafes.name")).toBe("Espresso Embassy");
    expect(itemValue(COFFEE_TRIP.cafes[0], "name.x")).toBeUndefined();
    expect(answerItems(COFFEE_TRIP, "cafes")).toHaveLength(3);
    expect(answerItems(COFFEE_TRIP, "trip")).toHaveLength(1);
  });
});
