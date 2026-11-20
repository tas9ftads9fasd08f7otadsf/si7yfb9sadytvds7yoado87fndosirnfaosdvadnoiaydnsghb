"use client";

import { heldWord, offlineWord, styleLinks } from "@/lib/maps";
import type { MapOffline, SharedMap } from "@/lib/types";
import { useViewer } from "@/store/viewer";
import { Link } from "./ui/Link";

const TONES: Record<MapOffline, "on" | "busy" | "plain"> = { ready: "on", partly: "busy", online: "plain", update: "busy" };

/** 128 What the phone holds of the map: ready, partly, online only or due an update. */
export function OfflinePill({ shared }: { shared: SharedMap }) {
  const words = useViewer((state) => state.words);
  const text = offlineWord(shared, words);
  if (!text || !shared.offline) return null;
  return <span className={`pill-tag ${TONES[shared.offline]}`} data-offline={shared.offline}>{text}</span>;
}

/** 128 How much of the phone's space the map takes. */
export function HeldPill({ shared }: { shared: SharedMap }) {
  const text = heldWord(shared);
  return text ? <span className="pill-tag plain" data-held>{text}</span> : null;
}

/** 128 The map's styles as links, each to its own address where the phone sent the ids. */
export function StyleChips({ shared }: { shared: SharedMap }) {
  const chips = styleLinks(shared);
  if (!chips.length) return null;
  return (
    <span className="style-chips">
      {chips.map((chip, place) => (
        <Link key={chip.id ?? place} className="style-chip" to={chip.id
          ? { screen: "map", map: shared.id, style: chip.id } : { screen: "map", map: shared.id }}>{chip.name}</Link>
      ))}
    </span>
  );
}
