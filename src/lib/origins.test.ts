import { describe, expect, it } from "vitest";
import { movedPast, originGroups } from "./origins";
import type { SharedLayer } from "./types";

const riki = { key: "built-in:riki", title: "Riki Maps", symbol: "map" };
const host = { key: "host:a.org", title: "a.org", symbol: "square.grid.2x2" };
const layers: SharedLayer[] = [
  { id: "R", name: "Roads", kind: "Package", origin: riki }, { id: "T", name: "Topo", kind: "Tiles", origin: host },
  { id: "W", name: "Water", kind: "Package", origin: riki }, { id: "O", name: "Old", kind: "GeoJSON" }];

describe("originGroups", () => {
  // 58 a group stands where its topmost layer does, as the app's Edit map folds them
  it("folds the layers under their sources, in the order their top layers stand", () => {
    const groups = originGroups(layers);
    expect(groups.map((group) => group.origin.title)).toEqual(["Riki Maps", "a.org", "GeoJSON"]);
    expect(groups[0]?.layers.map((layer) => layer.id)).toEqual(["R", "W"]);
  });

  // 58 an older phone says no source, so the kind stands for it
  it("groups a layer with no source by its kind", () => {
    const old: SharedLayer = { id: "O", name: "Old", kind: "GeoJSON" };
    expect(originGroups([old, { ...old, id: "P" }])).toHaveLength(1);
  });
});

describe("movedPast", () => {
  // 58 inside a group a row passes the group's next row, wherever the others stand
  it("moves a row past its group's neighbour in the whole order", () => {
    const order = ["R", "T", "W", "O"];
    expect(movedPast(order, ["R", "W"], "R", 1)).toEqual(["T", "W", "R", "O"]);
    expect(movedPast(order, ["R", "W"], "W", -1)).toEqual(["W", "R", "T", "O"]);
    expect(movedPast(order, ["R", "W"], "W", 1)).toEqual(order);
    expect(movedPast(order, order, "T", 1)).toEqual(["R", "W", "T", "O"]);
  });
});
