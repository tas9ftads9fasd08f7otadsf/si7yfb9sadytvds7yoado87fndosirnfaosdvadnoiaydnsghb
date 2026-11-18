import { describe, expect, it } from "vitest";
import { movedInFolder, movedOrder, shelfOf } from "./shelf";
import type { SharedMap } from "./types";

const map = (id: string, stackID?: string, stackName?: string): SharedMap =>
  ({ id, name: id.toUpperCase(), layers: [], stackID, stackName });

const maps = [map("a"), map("b", "F", "Hills"), map("c"), map("d", "F", "Hills"), map("e", "G")];

describe("shelfOf", () => {
  // 52 a folder of two or more folds at its first map; a folder of one is the map itself
  it("folds maps into folders as the phone's Maps sheet does", () => {
    const shelf = shelfOf(maps, "Folder");
    expect(shelf.map((item) => item.id)).toEqual(["a", "F", "c", "e"]);
    const folder = shelf[1];
    expect(folder?.kind === "folder" && folder.name).toBe("Hills");
    expect(folder?.kind === "folder" && folder.maps.map((each) => each.id)).toEqual(["b", "d"]);
  });

  // 56 a folder wears the mark and ground the phone sends with any of its maps
  it("dresses a folder as the phone does", () => {
    const dressed = [map("a", "F"), { ...map("b", "F"), stackSymbol: "tray.full", stackIconTintHex: "#B5D8F2" }];
    const [folder] = shelfOf(dressed, "Folder");
    expect(folder?.kind === "folder" && [folder.symbol, folder.tint]).toEqual(["tray.full", "#B5D8F2"]);
    const [plain] = shelfOf([map("a", "F"), map("b", "F")], "Folder");
    expect(plain?.kind === "folder" && [plain.symbol, plain.tint]).toEqual([undefined, undefined]);
  });

  // 52 a folder nobody named is called what the phone calls it
  it("names a nameless folder with the phone's word", () => {
    const shelf = shelfOf([map("a", "F"), map("b", "F")], "Složka");
    expect(shelf[0]?.kind === "folder" && shelf[0].name).toBe("Složka");
  });
});

describe("moving", () => {
  const shelf = shelfOf(maps, "Folder");

  // 52 a folder's maps move together, wherever they were listed
  it("moves a folder as one", () => {
    expect(movedOrder(shelf, 1, -1)).toEqual(["b", "d", "a", "c", "e"]);
    expect(movedOrder(shelf, 0, 1)).toEqual(["b", "d", "a", "c", "e"]);
    expect(movedOrder(shelf, 3, 1)).toBeNull();
    expect(movedOrder(shelf, 0, -1)).toBeNull();
  });

  // 52 inside a folder the rest of the list stays put
  it("moves a map inside its folder", () => {
    expect(movedInFolder(shelf, "F", 1, -1)).toEqual(["a", "d", "b", "c", "e"]);
    expect(movedInFolder(shelf, "F", 1, 1)).toBeNull();
    expect(movedInFolder(shelf, "nope", 0, 1)).toBeNull();
  });
});
