import { describe, expect, it } from "vitest";
import { heldWord, offlineWord, sharingLine, styleLinks } from "./maps";
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
