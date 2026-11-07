import type { CSSProperties } from "react";

/** A map's or a layer's colour, softened into the panel as `SymbolTile` wears it. */
export function ground(tint?: string | null): CSSProperties | undefined {
  return /^#[0-9a-f]{6}$/i.test(tint ?? "")
    ? { backgroundColor: `color-mix(in srgb, ${tint} 45%, var(--panel))` } : undefined;
}
