import { create } from "zustand";
import { backend } from "@backend";
import { RegionFailed } from "@/backend/types";
import type { RegionNeed, RegionRow } from "@/lib/types";
import { drawStyle, offers } from "./viewer";

/** 112 The region packages the style would draw from, what the browser holds, and a download on its way. */
export interface RegionsState {
  needs: RegionNeed[];
  rows: RegionRow[];
  progress: Record<string, { done: number; total: number }>;
  failed: Record<string, { why: RegionFailed["why"]; detail: string }>;
}

const FIRST: RegionsState = { needs: [], rows: [], progress: {}, failed: {} };

export const useRegions = create<RegionsState>(() => FIRST);

const set = useRegions.setState;
const get = useRegions.getState;
const running = new Map<string, AbortController>();

export const resetRegions = () => {
  for (const each of running.values()) each.abort();
  running.clear();
  set(FIRST, true);
};

const without = <T>(record: Record<string, T>, key: string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));

const same = (one: RegionNeed[], other: RegionNeed[]) =>
  one.length === other.length && one.every((each, at) => each.region === other[at]?.region && each.piece === other[at]?.piece);

/** The packages again, as the catalog and the store now stand. */
export async function loadRegionRows() {
  if (!offers("regionPackages") || !backend.regionPackages) return;
  try {
    const rows = await backend.regionPackages.rows(get().needs);
    set({ rows });
  } catch { /* the rows stay as they were */ }
}

/** The style the map drew names these; the same ones again change nothing. */
export function setNeeds(needs: RegionNeed[]) {
  if (same(get().needs, needs)) return;
  set({ needs });
  void loadRegionRows();
}

/** Fetches what a region lacks, shown as it comes; the map is drawn again from the copy kept. */
export async function fetchRegion(region: string) {
  const packages = backend.regionPackages;
  if (!packages || running.has(region)) return;
  const stop = new AbortController();
  running.set(region, stop);
  set({ failed: without(get().failed, region), progress: { ...get().progress, [region]: { done: 0, total: 1 } } });
  let shown = 0;
  try {
    await packages.download(region, get().needs, (done, total) => {
      const now = Date.now();
      if (now - shown < 100 && done < total) return;
      shown = now;
      set({ progress: { ...get().progress, [region]: { done, total } } });
    }, stop.signal);
    drawStyle();
  } catch (error) {
    if (!stop.signal.aborted) {
      const failure = error instanceof RegionFailed ? error : new RegionFailed("network", String(error));
      set({ failed: { ...get().failed, [region]: { why: failure.why, detail: failure.message } } });
    }
  } finally {
    running.delete(region);
    set({ progress: without(get().progress, region) });
    await loadRegionRows();
  }
}

/** Frees what a region took in the browser; the map then asks for it again. */
export async function removeRegion(region: string) {
  await backend.regionPackages?.remove(region);
  drawStyle();
  await loadRegionRows();
}
