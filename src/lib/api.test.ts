import { describe, expect, it } from "vitest";
import { newDetailRow, rowChanged, shows, shownSwitched } from "./api";
import type { APIReading } from "./types";

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
});
