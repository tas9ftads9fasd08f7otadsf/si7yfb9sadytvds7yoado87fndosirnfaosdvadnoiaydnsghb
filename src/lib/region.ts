import type { Box, Region, RegionList } from "./types";

export interface Centre {
  lng: number;
  lat: number;
}

export type RegionOffer = { kind: "downloading" | "absent"; region: Region } | null;

export function regionUnder(list: Region[] | undefined, centre: Centre): Region | undefined {
  return (list ?? []).find(({ box }) =>
    centre.lng >= box[0] && centre.lng <= box[2] && centre.lat >= box[1] && centre.lat <= box[3]);
}

/** Over a region the phone has not downloaded, offered as the phone offers it. */
export function regionOffer(known: RegionList | null, view: Box, centre: Centre): RegionOffer {
  if (!known) return null;
  const [west, south, east, north] = view;
  const drawnInView = (known.drawn ?? []).some(({ box }) =>
    box[0] <= east && box[2] >= west && box[1] <= north && box[3] >= south);
  if (drawnInView) return null;
  const busy = regionUnder(known.downloading, centre);
  if (busy) return { kind: "downloading", region: busy };
  const here = regionUnder(known.downloadable, centre);
  return here ? { kind: "absent", region: here } : null;
}
