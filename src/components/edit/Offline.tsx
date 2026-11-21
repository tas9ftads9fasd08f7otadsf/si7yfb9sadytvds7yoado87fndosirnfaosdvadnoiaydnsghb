"use client";

import { useEffect } from "react";
import { heldSize } from "@/lib/size";
import type { OfflinePlan, OfflineRow, Region } from "@/lib/types";
import { chooseOfflineArea, discardStored, downloadRegion, loadOffline, loadRegionList, offlineDownload, openOffline, setOfflineZoom, stopOffline,
  tickOfflineLayer, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { Sym } from "../ui/Sym";

/** 57 Edit map's Offline: what each layer stores, and Download tiles for the whole map, counted by the phone. */
export function Offline() {
  const words = useViewer((state) => state.words);
  const plan = useViewer((state) => state.offline);
  const open = useViewer((state) => state.offlineOpen);
  const mapID = useViewer((state) => state.mapID);
  useEffect(() => {
    void loadOffline();
    return stopOffline;
  }, [mapID]);
  if (!plan) return <MapRegions />;
  const stored = plan.rows.filter((row) => row.stored > 0);
  return (
    <>
      <MapRegions />
      <h2 className="title">{words.offline}</h2>
      <div className="list" id="offlineStored">
        {stored.map((row) => <StoredRow row={row} key={row.id} />)}
        <button type="button" className="row add" id="downloadTiles" aria-expanded={open}
          onClick={() => openOffline(!open)}>
          <Sym name="arrow.down.to.line" />{words.downloadTiles}
        </button>
      </div>
      {open ? <DownloadTiles plan={plan} /> : null}
    </>
  );
}

/** 111 W9: the map's regions as a table, on the phone or on their way, a Download for the rest. */
function MapRegions() {
  const words = useViewer((state) => state.words);
  const regionList = useViewer((state) => state.regionList);
  const mapID = useViewer((state) => state.mapID);
  useEffect(() => {
    void loadRegionList();
  }, [mapID]);
  const rows: { region: Region; state: "drawn" | "downloading" | "downloadable" }[] = [
    ...(regionList?.drawn ?? []).map((region) => ({ region, state: "drawn" as const })),
    ...(regionList?.downloading ?? []).map((region) => ({ region, state: "downloading" as const })),
    ...(regionList?.downloadable ?? []).map((region) => ({ region, state: "downloadable" as const }))];
  if (!rows.length) return null;
  return (
    <>
      <h2 className="title">{words.regions}</h2>
      <div className="list" id="mapRegions" role="table" aria-label={words.regions}>
        {rows.map(({ region, state }) => (
          <div className="row region-row" role="row" key={region.id} data-region={region.id}>
            <span className="words" role="cell">{region.name}</span>
            {rows.some((one) => one.region.bytes) ? (
              <span role="cell" className="region-size">{heldSize(region.bytes) ?? ""}</span>
            ) : null}
            <span role="cell">
              {state === "downloadable" ? (
                <button type="button" className="pill" onClick={() => void downloadRegion(region)}>{words.download}</button>
              ) : <span className={`pill-tag ${state === "drawn" ? "on" : "busy"}`}>
                {state === "drawn" ? words.onThisPhone : words.downloading}</span>}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function StoredRow({ row }: { row: OfflineRow }) {
  const words = useViewer((state) => state.words);
  return (
    <div className="row" data-stored={row.id}>
      <div className="words">{row.name}<small>{row.job ?? row.storedLine}</small></div>
      {row.discard ? (
        <button type="button" className="text-button" aria-label={row.discard.ask}
          onClick={() => void discardStored(row.id)}>{words.delete}</button>
      ) : null}
    </div>
  );
}

function DownloadTiles({ plan }: { plan: OfflinePlan }) {
  const words = useViewer((state) => state.words);
  const ticked = plan.rows.some((row) => row.isIncluded);
  return (
    <div className="card" id="downloadTilesCard">
      <h3 className="title">{words.downloadTiles}</h3>
      <div className="list">
        <div className="row">
          <Sym name="square.dashed" />
          <div className="words">{words.downloadArea}<small id="offlineArea">{plan.area}</small></div>
          <button type="button" className="text-button" id="chooseOfflineArea" onClick={chooseOfflineArea}>
            {words.chooseOnMap}
          </button>
        </div>
        <div className="row">
          <div className="words">{words.maximumZoom}<small id="offlineZoom">{plan.zoomLabel}</small>
            <CommitField type="range" min={plan.minZoom} max={plan.maxZoom} step={1} value={String(plan.zoom)}
              aria-label={words.maximumZoom} onCommit={(zoom) => setOfflineZoom(Number(zoom))} />
          </div>
        </div>
      </div>
      {plan.limits ? <div className="foot-note">{plan.limits}</div> : null}
      <div className="title-row"><h3 className="title">{words.layersToStore}</h3>
        <small className="foot-note">{words.urlLayersOnly}</small></div>
      <div className="list" id="offlineLayers">
        {plan.rows.length === 0 ? <div className="row dimmed">{words.nothingToStore}</div> : null}
        {plan.rows.map((row) => <LayerRow row={row} key={row.id} />)}
      </div>
      <div className="list" id="offlineSummary">
        <div className="row">
          <div className="words">{words.estimated}
            <small>{plan.toFetch}</small><small id="offlineHeld">{plan.held}</small><small>{plan.free}</small>
          </div>
          <strong id="offlineTotal" className={plan.exceedsSpace ? "destructive" : undefined}>{plan.total}</strong>
        </div>
      </div>
      <button type="button" className="action" id="startOfflineDownload"
        disabled={!ticked || plan.exceedsSpace || plan.isQueued} onClick={() => void offlineDownload("start")}>
        <Sym name={plan.isQueued ? "checkmark" : "arrow.down.to.line"} />{plan.isQueued ? words.queued : words.download}
      </button>
      {plan.cancel ? (
        <>
          <button type="button" className="action" id="cancelOfflineDownload"
            onClick={() => void offlineDownload("cancel")}>{plan.cancel}</button>
          <div className="foot-note">{words.fetchedStay}</div>
        </>
      ) : null}
      {plan.exceedsSpace ? <div className="foot-note" role="alert">{words.noSpace}</div> : null}
      <div className="foot-note">{words.onlyURLLayers}</div>
    </div>
  );
}

function LayerRow({ row }: { row: OfflineRow }) {
  const progress = row.fraction != null ? <progress max={1} value={row.fraction} aria-label={row.job ?? ""} /> : null;
  if (!row.isDownloadable) {
    return <div className="row dimmed" data-layer={row.id}><div className="words">{row.name}<small>{row.detail}</small></div></div>;
  }
  return (
    <label className="row" data-layer={row.id}>
      <input type="checkbox" checked={row.isIncluded} onChange={() => tickOfflineLayer(row.id)} />
      <div className="words">{row.name}<small>{row.job ?? row.detail}</small>{progress}</div>
      <small>{formatBytes(row.bytes)}</small>
    </label>
  );
}

/** The phone writes the totals; a row's own size is short enough to write here. */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
