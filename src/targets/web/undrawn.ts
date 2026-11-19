import { UNDRAWN_KEY } from "@/lib/drawable";
import { hostOf, isForbiddenHeader, type Reach } from "./reach";

/** The prefix of the source a layer's own address is drawn from. */
export const CUSTOM_SOURCE = "riki-custom-";

interface Source {
  type?: string;
  url?: string;
  tiles?: string[];
  data?: unknown;
  /** The header names the core's layer sends, which a browser may not set. */
  "riki:headers"?: string[];
}

interface Style {
  sources?: Record<string, Source>;
  layers?: { source?: string }[];
  metadata?: Record<string, unknown>;
}

const addressesOf = (source: Source): string[] =>
  [source.url, ...(source.tiles ?? []), typeof source.data === "string" ? source.data : null]
    .filter((each): each is string => typeof each === "string");

/**
 * The style cut to what a browser can fetch: a source on a host that refuses browsers, or that needs a header a
 * browser may not set, is left out with its layers, and its layer named in the style's metadata.
 */
export async function drawnHere(style: unknown, reach: Reach, own: string[] = []): Promise<unknown> {
  const asked = style as Style;
  const sources = Object.entries(asked.sources ?? {});
  const dropped = new Set<string>();
  await Promise.all(sources.map(async ([name, source]) => {
    if ((source["riki:headers"] ?? []).some(isForbiddenHeader)) {
      dropped.add(name);
      return;
    }
    for (const address of addressesOf(source)) {
      const host = hostOf(address);
      if (!host || own.includes(host)) continue;
      if ((await reach.answers(address)) === false) {
        dropped.add(name);
        return;
      }
    }
  }));
  if (dropped.size === 0) return style;
  const undrawn = sources.map(([name]) => name).filter((name) => dropped.has(name) && name.startsWith(CUSTOM_SOURCE)).map((name) => name.slice(CUSTOM_SOURCE.length));
  return {
    ...asked,
    sources: Object.fromEntries(sources.filter(([name]) => !dropped.has(name))),
    layers: (asked.layers ?? []).filter((layer) => !layer.source || !dropped.has(layer.source)),
    metadata: { ...asked.metadata, [UNDRAWN_KEY]: undrawn }
  };
}
