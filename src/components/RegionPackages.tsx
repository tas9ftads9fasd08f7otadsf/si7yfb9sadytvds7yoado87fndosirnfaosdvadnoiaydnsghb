"use client";

import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { filledIn } from "@/lib/words";
import type { Words } from "@/lib/words";
import type { RegionRow } from "@/lib/types";
import { sizeText } from "@/lib/size";
import { fetchRegion, loadRegionRows, removeRegion, useRegions } from "@/store/regions";
import { offers, useViewer } from "@/store/viewer";
import { Sym } from "./ui/Sym";

/** 112 What went wrong with a region's download, in the person's words. */
function failureText(words: Words, name: string, failure: { why: string; detail: string }): string {
  const said = (sentence: string) => filledIn(sentence, "region", name);
  switch (failure.why) {
    case "full": return said(words.regionFull);
    case "host": return filledIn(words.regionHostRefused, "reason", failure.detail);
    case "network": return said(words.regionInterrupted);
    default: return said(words.regionBadFile);
  }
}

const fetchBytes = (row: RegionRow) => row.fetch.reduce((sum, each) => sum + each.bytes, 0);

/** One region's line: what is held or lacks, a button to fetch or update it, and the progress or the failure. */
function RegionLine({ row }: { row: RegionRow }) {
  const words = useViewer((state) => state.words);
  const progress = useRegions((state) => state.progress[row.region]);
  const failure = useRegions((state) => state.failed[row.region]);
  const lacks = row.fetch.length > 0;
  const isUpdate = lacks && row.fetch.every((each) => each.update);
  const sentence = isUpdate ? words.updateRegion : words.downloadToSee;
  const label = filledIn(filledIn(sentence, "region", row.name), "size", sizeText(fetchBytes(row)));
  const heldBytes = row.held.reduce((sum, each) => sum + each.bytes, 0);
  return (
    <div className="row region-row" data-region={row.region}>
      <div className="words">{row.name}
        <small>{progress ? filledIn(filledIn(words.regionProgress, "region", row.name), "percent",
          `${Math.min(100, Math.floor((progress.done / Math.max(1, progress.total)) * 100))} %`)
          : row.held.length > 0 ? `${words.regionHeld} · ${sizeText(heldBytes)}` : label}</small>
        {failure ? <small className="undrawn" role="alert">{failureText(words, row.name, failure)}</small> : null}
        {progress ? <progress max={progress.total} value={progress.done} aria-label={row.name} /> : null}
      </div>
      {lacks && !progress ? (
        <button type="button" className="text-button" data-fetch={row.region} onClick={() => void fetchRegion(row.region)}>
          {isUpdate ? words.regionUpdate : words.download}</button>
      ) : null}
      {row.held.length > 0 && !progress ? (
        <button type="button" className="icon-button danger" data-remove={row.region} title={filledIn(words.removeRegion, "region", row.name)}
          aria-label={filledIn(words.removeRegion, "region", row.name)} onClick={() => void removeRegion(row.region)}>
          <Sym name="trash" />
        </button>
      ) : null}
    </div>
  );
}

/** 112 Over the map: the regions its style needs and the browser lacks, each with the one button that fetches it. */
export function RegionNeedsNote() {
  const words = useViewer((state) => state.words);
  const on = useViewer((state) => offers("regionPackages") && state.editToken != null);
  const rows = useRegions(useShallow((state) => state.rows.filter((row) => state.needs.some((need) => need.region === row.region) && row.fetch.length > 0)));
  const progress = useRegions((state) => state.progress);
  const failed = useRegions((state) => state.failed);
  if (!on || rows.length === 0) return null;
  return (
    <div id="regionNeeds" role="status">
      {rows.map((row) => {
        const text = filledIn(filledIn(words.downloadToSee, "region", row.name), "size", sizeText(fetchBytes(row)));
        const going = progress[row.region];
        return (
          <div key={row.region} className="need" data-region={row.region}>
            {going ? (
              <span><Sym name="arrow.down.circle" />{filledIn(filledIn(words.regionProgress, "region", row.name), "percent",
                `${Math.min(100, Math.floor((going.done / Math.max(1, going.total)) * 100))} %`)}</span>
            ) : (
              <button type="button" data-fetch={row.region} onClick={() => void fetchRegion(row.region)}>
                <Sym name="arrow.down.circle" />{text}</button>
            )}
            {failed[row.region] ? <small role="alert">{failureText(words, row.name, failed[row.region]!)}</small> : null}
          </div>
        );
      })}
    </div>
  );
}

/** 112 Edit map's card of region data: what this map needs and what the browser holds, to fetch, update or remove. */
export function RegionPackagesCard() {
  const words = useViewer((state) => state.words);
  const mapID = useViewer((state) => state.mapID);
  const rows = useRegions((state) => state.rows);
  useEffect(() => {
    void loadRegionRows();
  }, [mapID]);
  if (!offers("regionPackages") || rows.length === 0) return null;
  return (
    <>
      <div className="title-row"><h2 className="title">{words.regionPackages}</h2></div>
      <div className="list" id="regionPackages">{rows.map((row) => <RegionLine key={row.region} row={row} />)}</div>
      <div className="foot-note">{words.regionsNote}</div>
    </>
  );
}
