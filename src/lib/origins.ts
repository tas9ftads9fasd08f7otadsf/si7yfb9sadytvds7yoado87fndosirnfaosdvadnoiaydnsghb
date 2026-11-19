import type { LayerOrigin, SharedLayer } from "./types";

export interface OriginGroup {
  origin: LayerOrigin;
  layers: SharedLayer[];
}

/** 58 A layer's source, or its kind where an older phone names none, as the app's last resort is. */
export function originOf(layer: SharedLayer): LayerOrigin {
  return layer.origin ?? { key: `kind:${layer.kind}`, title: layer.kind, symbol: layer.symbol ?? "square.3.layers.3d" };
}

/** 58 Top first, as `MapDefinition.originGroups`: a group stands where its topmost layer does. */
export function originGroups(topFirst: SharedLayer[]): OriginGroup[] {
  const groups = new Map<string, OriginGroup>();
  for (const layer of topFirst) {
    const origin = originOf(layer);
    const group = groups.get(origin.key);
    if (group) group.layers.push(layer);
    else groups.set(origin.key, { origin, layers: [layer] });
  }
  return [...groups.values()];
}

/** 58 The whole order once `id` passes the next of `peers` up or down, as a drag inside a group lands. */
export function movedPast(order: string[], peers: string[], id: string, by: -1 | 1): string[] {
  const passed = peers[peers.indexOf(id) + by];
  if (passed == null || !peers.includes(id)) return order;
  const moved = order.filter((each) => each !== id);
  const at = moved.indexOf(passed);
  moved.splice(by < 0 ? at : at + 1, 0, id);
  return moved;
}
