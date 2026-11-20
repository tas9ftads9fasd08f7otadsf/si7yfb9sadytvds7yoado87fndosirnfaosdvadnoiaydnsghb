import type { StyleSpecification } from "maplibre-gl";
import type { RegionNeed } from "./types";

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

/** Set on a style a target cut: the layers, lowercased, whose source a browser cannot fetch. */
export const UNDRAWN_KEY = "riki:undrawn";

export function undrawnOf(style: StyleSpecification): string[] {
  const named = (style.metadata as Record<string, unknown> | undefined)?.[UNDRAWN_KEY];
  return Array.isArray(named) ? named.map(String) : [];
}

/** 112 Set by the core on a style that would draw from region packages the browser does not hold. */
export const NEEDS_KEY = "riki:needs";

export function needsOf(style: StyleSpecification): RegionNeed[] {
  const named = (style.metadata as Record<string, unknown> | undefined)?.[NEEDS_KEY];
  if (!Array.isArray(named)) return [];
  return named.flatMap((each) => {
    const { region, piece } = (each ?? {}) as Partial<RegionNeed>;
    return typeof region === "string" && typeof piece === "string" ? [{ region, piece }] : [];
  });
}
