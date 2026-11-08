import type { StyleSpecification } from "maplibre-gl";

/** One layer of a type this MapLibre lacks stops the whole style loading. */
export const DRAWN_TYPES = ["background", "fill", "line", "symbol", "circle", "heatmap", "fill-extrusion",
  "raster", "hillshade"] as const;

/** One property only the app's MapLibre reads does the same. */
export const FORK_ONLY = { layout: ["symbol-z-offset"], paint: [] as string[], terrain: ["plane"] };

function without<T extends object>(object: T | undefined, keys: string[]): T | undefined {
  if (!object) return object;
  const kept = { ...object } as Record<string, unknown>;
  for (const key of keys) delete kept[key];
  return kept as unknown as T;
}

/** The style a phone serves, cut to what the browser's MapLibre can draw. */
export function drawable(style: StyleSpecification): StyleSpecification {
  const types = new Set<string>(DRAWN_TYPES);
  const layers = (style.layers ?? []).filter((layer) => types.has(layer.type)).map((layer) => ({
    ...layer,
    layout: without((layer as { layout?: object }).layout, FORK_ONLY.layout),
    paint: without((layer as { paint?: object }).paint, FORK_ONLY.paint)
  }));
  const drawn = { ...style, layers } as StyleSpecification;
  if (style.terrain) drawn.terrain = without(style.terrain, FORK_ONLY.terrain);
  return drawn;
}
