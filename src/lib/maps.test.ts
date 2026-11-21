import { describe, expect, it, vi } from "vitest";
import { NO_ASK, changedWord, filterCounts, heldWord, keepMapsView, listColumns, offlineWord, readMapsView, sharingLine,
  shownMaps, styleLinks } from "./maps";
import type { SharedMap } from "./types";
import { ENGLISH } from "./words";

const words = { ...ENGLISH };
const map = (fields: Partial<SharedMap> = {}): SharedMap => ({ id: "a", name: "Tatras", layers: [], ...fields });

describe("offlineWord", () => {
  // 128 each state 3490 sends has its words; an older phone or a newer state has none
  it("words each state the phone sends and nothing else", () => {
    expect(offlineWord(map({ offline: "ready" }), words)).toBe("Ready offline");
    expect(offlineWord(map({ offline: "partly" }), words)).toBe("Partly offline");
    expect(offlineWord(map({ offline: "online" }), words)).toBe("Online only");
    expect(offlineWord(map({ offline: "update" }), words)).toBe("Update");
    expect(offlineWord(map(), words)).toBeNull();
    expect(offlineWord(map({ offline: "later" as never }), words)).toBeNull();
  });
});

describe("heldWord", () => {
  // 128 a map held nowhere has no size pill, and an older phone sends no size
  it("says the size of what is held", () => {
    expect(heldWord(map({ bytes: 1_200_000_000 }))).toBe("1.2 GB");
    expect(heldWord(map({ bytes: 0 }))).toBeNull();
    expect(heldWord(map())).toBeNull();
  });
});

describe("sharingLine", () => {
  // 128 W1's line: others it is shared with, then the role; each part only when it came
  it("joins who else has the map with this phone's role", () => {
    expect(sharingLine(map({ people: 3, role: "own" }), words)).toBe("Shared with 3 · Owner");
    expect(sharingLine(map({ people: 0, role: "view" }), words)).toBe("View only");
    expect(sharingLine(map({ role: "edit" }), words)).toBe("Can edit");
    expect(sharingLine(map({ people: 2 }), words)).toBe("Shared with 2");
    expect(sharingLine(map(), words)).toBeNull();
    expect(sharingLine(map({ role: "later" as never }), words)).toBeNull();
  });
});

describe("styleLinks", () => {
  // 128 ids open the style; names alone, or ids that do not line up, open the map
  it("gives each name its id only when the phone's ids line up", () => {
    expect(styleLinks(map({ styles: ["Summer", "Winter"], styleIDs: ["s", "w"] })))
      .toEqual([{ name: "Summer", id: "s" }, { name: "Winter", id: "w" }]);
    expect(styleLinks(map({ styles: ["Summer", "Winter"] }))).toEqual([
      { name: "Summer", id: undefined }, { name: "Winter", id: undefined }]);
    expect(styleLinks(map({ styles: ["Summer", "Winter"], styleIDs: ["s"] })).map((link) => link.id))
      .toEqual([undefined, undefined]);
    expect(styleLinks(map())).toEqual([]);
  });
});

const shelf: SharedMap[] = [
  map({ id: "1", name: "Doprava", role: "own", changedAt: 1_700_300_000, bytes: 1_200_000_000, category: "Transit" }),
  map({ id: "2", name: "Riki Maps", role: "own", changedAt: 1_700_200_000, bytes: 854_000_000, category: "transit" }),
  map({ id: "3", name: "Historická 2", role: "view", changedAt: 1_700_100_000, category: "Old maps" }),
  map({ id: "4", name: "Fitness", role: "edit", bytes: 182_000_000 }),
  map({ id: "5", name: "Bratislava", role: "own" })];
const ids = (list: SharedMap[]) => list.map((each) => each.id);

describe("shownMaps", () => {
  // 148 the field narrows by a map's name or its category, in any case
  it("narrows by name or category", () => {
    expect(ids(shownMaps(shelf, { ...NO_ASK, text: "RIKI" }))).toEqual(["2"]);
    expect(ids(shownMaps(shelf, { ...NO_ASK, text: "transit" }))).toEqual(["1", "2"]);
    expect(ids(shownMaps(shelf, { ...NO_ASK, text: "  volcano " }))).toEqual([]);
  });

  // 148 Mine are the owner's, Shared with me the others'; a map with no role is in neither
  it("filters Mine and Shared with me by the role the phone sent", () => {
    expect(ids(shownMaps(shelf, { ...NO_ASK, filter: "mine" }))).toEqual(["5", "1", "2"]);
    expect(ids(shownMaps(shelf, { ...NO_ASK, filter: "shared" }))).toEqual(["4", "3"]);
    expect(ids(shownMaps([map({ id: "9", name: "Old phone's" })], { ...NO_ASK, filter: "mine" }))).toEqual([]);
    expect(ids(shownMaps([map({ id: "9", name: "Old phone's" })], NO_ASK))).toEqual(["9"]);
  });

  // 148 a category is picked whatever its case
  it("keeps one category, whatever its case", () => {
    expect(ids(shownMaps(shelf, { ...NO_ASK, category: "TRANSIT" }))).toEqual(["1", "2"]);
    expect(ids(shownMaps(shelf, { ...NO_ASK, category: "Old maps", filter: "mine" }))).toEqual([]);
  });

  // 148 by name, last changed (newest first) or size (largest first); a missing field sorts last
  it("sorts by name, last changed or size, a missing field last", () => {
    expect(ids(shownMaps(shelf, NO_ASK))).toEqual(["5", "1", "4", "3", "2"]);
    expect(ids(shownMaps(shelf, { ...NO_ASK, sort: "changed" }))).toEqual(["1", "2", "3", "5", "4"]);
    expect(ids(shownMaps(shelf, { ...NO_ASK, sort: "size" }))).toEqual(["1", "2", "4", "5", "3"]);
  });

  it("leaves the maps it was given as they were", () => {
    const before = ids(shelf);
    shownMaps(shelf, { ...NO_ASK, sort: "size" });
    expect(ids(shelf)).toEqual(before);
  });
});

describe("filterCounts", () => {
  // 148 the tabs' counts; an older phone sends no roles, and the tabs are left out
  it("counts each filter and knows whether the phone sent roles", () => {
    expect(filterCounts(shelf)).toEqual({ all: 5, mine: 3, shared: 2, knowsRoles: true });
    expect(filterCounts([map()]).knowsRoles).toBe(false);
  });
});

describe("the List view", () => {
  // 149 Cards until the browser chose the list; a browser that keeps nothing still draws cards
  it("keeps the choice of Cards or List in the browser", () => {
    localStorage.clear();
    expect(readMapsView()).toBe("cards");
    keepMapsView("list");
    expect(localStorage.getItem("riki-maps-view")).toBe("list");
    expect(readMapsView()).toBe("list");
    keepMapsView("cards");
    expect(readMapsView()).toBe("cards");
    localStorage.setItem("riki-maps-view", "grid");
    expect(readMapsView()).toBe("cards");
  });

  it("draws cards where the browser's storage cannot be read", () => {
    const blocked = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readMapsView()).toBe("cards");
    blocked.mockRestore();
  });

  // 149 a column is there only where some map has the field that feeds it
  it("lists a column only where some map has its field", () => {
    expect(listColumns(shelf)).toEqual({ styles: false, shared: true, offline: false, size: true, changed: true });
    expect(listColumns([map({ offline: "ready", styles: [] })])).toEqual({ styles: true, shared: false, offline: true,
      size: false, changed: false });
    expect(listColumns([map()])).toEqual({ styles: false, shared: false, offline: false, size: false, changed: false });
  });
});

describe("changedWord", () => {
  const now = new Date(2026, 10, 20, 15, 0);
  const at = (year: number, month: number, day: number) => new Date(year, month, day, 9, 0).getTime() / 1000;
  // 148 Today, Yesterday, then the day; the year only when it is not this one; none where the phone sent none
  it("says Today, Yesterday, the day, and the year of an older one", () => {
    expect(changedWord(at(2026, 10, 20), now, "en")).toBe("Today");
    expect(changedWord(at(2026, 10, 19), now, "en")).toBe("Yesterday");
    expect(changedWord(at(2026, 9, 3), now, "en")).toBe("Oct 3");
    expect(changedWord(at(2025, 11, 31), now, "en")).toBe("Dec 31, 2025");
    expect(changedWord(undefined, now, "en")).toBeNull();
  });
});
