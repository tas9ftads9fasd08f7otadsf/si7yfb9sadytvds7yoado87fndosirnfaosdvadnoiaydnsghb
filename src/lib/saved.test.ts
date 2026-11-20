import { describe, expect, it } from "vitest";
import { NO_FILTER, UNFILED, isCut, savedBox, savedDate, savedLine, shownSaved } from "./saved";
import type { SavedFolder, SavedRow } from "./types";

const row = (id: string, more: Partial<SavedRow> = {}): SavedRow => ({ id, name: id, kind: "point", latitude: 48, longitude: 17,
  savedAt: "2026-01-01T10:00:00Z", isComplete: true, ...more });

const rows = [
  row("Hut", { note: "Water nearby", category: "Shelter", folderID: "F1", savedAt: "2026-03-01T10:00:00Z" }),
  row("Ridge", { kind: "line", savedAt: "2026-05-01T10:00:00Z", bounds: { south: 1, west: 2, north: 3, east: 4 } }),
  row("Lake", { kind: "area", category: "Water", folderID: "F2", savedAt: "2026-04-01T10:00:00Z" })
];
const folders: SavedFolder[] = [
  { id: "F1", name: "Tatras", symbol: "folder", isShared: false, isSharedWithMe: false },
  { id: "F2", name: "Shared hikes", symbol: "folder", isShared: true, isSharedWithMe: true }
];
const names = (found: SavedRow[]) => found.map((each) => each.name);

describe("shownSaved", () => {
  // 135 newest first, whatever order the phone sent
  it("lists the newest first", () => {
    expect(names(shownSaved(rows, NO_FILTER))).toEqual(["Ridge", "Lake", "Hut"]);
  });

  // 135 the field narrows by name, note and category, in any case
  it("narrows by name, note and category", () => {
    expect(names(shownSaved(rows, { ...NO_FILTER, text: "ridg" }))).toEqual(["Ridge"]);
    expect(names(shownSaved(rows, { ...NO_FILTER, text: "WATER" }))).toEqual(["Lake", "Hut"]);
    expect(names(shownSaved(rows, { ...NO_FILTER, text: "shelter" }))).toEqual(["Hut"]);
    expect(shownSaved(rows, { ...NO_FILTER, text: "volcano" })).toEqual([]);
  });

  // 135 the chips are one kind each, and All is every kind
  it("keeps one kind at a time", () => {
    expect(names(shownSaved(rows, { ...NO_FILTER, kind: "line" }))).toEqual(["Ridge"]);
    expect(names(shownSaved(rows, { ...NO_FILTER, kind: "area" }))).toEqual(["Lake"]);
    expect(names(shownSaved(rows, { ...NO_FILTER, kind: "point" }))).toEqual(["Hut"]);
  });

  // 135 the folder picker: a folder, those in none, or all
  it("keeps one folder, or the unfiled", () => {
    expect(names(shownSaved(rows, { ...NO_FILTER, folder: "F1" }))).toEqual(["Hut"]);
    expect(names(shownSaved(rows, { ...NO_FILTER, folder: UNFILED }))).toEqual(["Ridge"]);
    expect(names(shownSaved(rows, { text: "water", kind: "area", folder: "F2" }))).toEqual(["Lake"]);
  });
});

describe("the saved screen's lines", () => {
  // 135 "Showing N of M" is for a listing the phone cut at its limit
  it("says a listing is cut when the phone holds more than it sent", () => {
    expect(isCut({ folders: [], features: rows, total: 3 })).toBe(false);
    expect(isCut({ folders: [], features: rows, total: 5200 })).toBe(true);
  });

  // 135 category, then folder, and nothing for what is missing
  it("names the category and the folder under a row", () => {
    expect(savedLine(rows[0]!, folders)).toBe("Shelter, Tatras");
    expect(savedLine(rows[1]!, folders)).toBe("");
    expect(savedLine(row("X", { folderID: "gone", category: "Spring" }), folders)).toBe("Spring");
  });

  // 135 a line's or an area's box goes to the map as west, south, east, north
  it("reads a box for a shape and none for a point", () => {
    expect(savedBox(rows[1]!)).toEqual([2, 1, 4, 3]);
    expect(savedBox(rows[0]!)).toBeUndefined();
  });

  // 135 a date the browser cannot read leaves the line empty
  it("reads a date and leaves an unreadable one empty", () => {
    expect(savedDate("2026-03-01T10:00:00Z")).toMatch(/2026/);
    expect(savedDate("never")).toBe("");
  });
});
