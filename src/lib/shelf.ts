import type { SharedMap } from "./types";

/** 52 One row of the Maps list: a map, or a folder of two or more, as `MapShelf.of` folds them. */
export type ShelfItem =
  | { kind: "map"; id: string; map: SharedMap }
  | { kind: "folder"; id: string; name: string; maps: SharedMap[] };

export function shelfOf(maps: SharedMap[], untitled: string): ShelfItem[] {
  const counts = new Map<string, number>();
  for (const map of maps) if (map.stackID) counts.set(map.stackID, (counts.get(map.stackID) ?? 0) + 1);
  const drawn = new Set<string>();
  const shelf: ShelfItem[] = [];
  for (const map of maps) {
    const stack = map.stackID;
    if (!stack || (counts.get(stack) ?? 0) < 2) {
      shelf.push({ kind: "map", id: map.id, map });
    } else if (!drawn.has(stack)) {
      drawn.add(stack);
      const members = maps.filter((each) => each.stackID === stack);
      const name = members.map((each) => each.stackName?.trim()).find((each) => each) ?? untitled;
      shelf.push({ kind: "folder", id: stack, name, maps: members });
    }
  }
  return shelf;
}

/** Every map's id, the item at `index` moved by `by`, a folder's maps moving together. */
export function movedOrder(shelf: ShelfItem[], index: number, by: number): string[] | null {
  const target = index + by;
  if (target < 0 || target >= shelf.length || by === 0) return null;
  const items = [...shelf];
  const [moving] = items.splice(index, 1);
  if (!moving) return null;
  items.splice(target, 0, moving);
  return items.flatMap((item) => (item.kind === "map" ? [item.id] : item.maps.map((map) => map.id)));
}

/** A folder's own order, one of its maps moved by `by`; the rest of the list unchanged. */
export function movedInFolder(shelf: ShelfItem[], folder: string, index: number, by: number): string[] | null {
  const at = shelf.findIndex((item) => item.kind === "folder" && item.id === folder);
  const found = shelf[at];
  if (!found || found.kind !== "folder") return null;
  const target = index + by;
  if (target < 0 || target >= found.maps.length || by === 0) return null;
  const maps = [...found.maps];
  const [moving] = maps.splice(index, 1);
  if (!moving) return null;
  maps.splice(target, 0, moving);
  const items = [...shelf];
  items[at] = { ...found, maps };
  return items.flatMap((item) => (item.kind === "map" ? [item.id] : item.maps.map((map) => map.id)));
}
