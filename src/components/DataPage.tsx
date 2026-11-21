"use client";

import { type ReactNode, useEffect } from "react";
import { DATA_TABS, type DataTab } from "@/lib/route";
import { heldSize } from "@/lib/size";
import type { Region, SharedLayer } from "@/lib/types";
import { filledIn } from "@/lib/words";
import { downloadRegion, go, loadRegionList, loadServers, offers, openServer, useViewer } from "@/store/viewer";
import { MarkTile } from "./ui/MarkTile";

interface Row {
  key: string;
  mark: ReactNode;
  name: string;
  sub?: string | null;
  cells: string[];
  /** 141 What the phone holds of it, where it sent a size. */
  size?: string | null;
  pill?: { text: string; tone: "on" | "plain" | "busy" };
  /** 128 Under the name, and beside the pill. */
  chips?: ReactNode;
  tags?: ReactNode;
  open?: () => void;
  act?: { text: string; run: () => void };
}

/** 141 One layer is held once, so a layer in several maps shows the largest size any of them sent. */
const heldBytes = (layers: SharedLayer[]) => layers.reduce<number | undefined>(
  (most, layer) => (layer.bytes != null && layer.bytes > (most ?? 0) ? layer.bytes : most), undefined);

/** 101 One layer however many maps hold it, by its name and kind. */
function layersOf(maps: { name: string; layers: SharedLayer[] }[]) {
  const byKey = new Map<string, { layer: SharedLayer; maps: string[]; held: SharedLayer[] }>();
  for (const map of maps) {
    for (const layer of map.layers) {
      const key = `${layer.name}\u0000${layer.kind}`;
      const held = byKey.get(key) ?? { layer, maps: [], held: [] };
      held.maps.push(map.name);
      held.held.push(layer);
      byKey.set(key, held);
    }
  }
  return [...byKey.values()].sort((one, other) => one.layer.name.localeCompare(other.layer.name));
}

/** 101 The design's W4: what the phone shares, by maps, layers, servers and the map's regions. */
export function DataPage() {
  const route = useViewer((state) => state.route);
  const words = useViewer((state) => state.words);
  const maps = useViewer((state) => state.device?.maps) ?? [];
  const mapID = useViewer((state) => state.mapID);
  const shownName = useViewer((state) => state.device?.maps.find((each) => each.id === state.mapID)?.name ?? "");
  const canEdit = useViewer((state) => state.editToken != null);
  const servers = useViewer((state) => state.servers?.servers);
  const regionList = useViewer((state) => state.regionList);
  const isOpen = route.screen === "data";
  const showsServers = canEdit && offers("servers");
  useEffect(() => {
    if (!isOpen) return;
    if (showsServers && !servers) void loadServers();
    if (!regionList && mapID) void loadRegionList();
  }, [isOpen, showsServers, servers, regionList, mapID]);
  if (route.screen !== "data") return null;
  const layers = layersOf(maps);
  const regions: { region: Region; state: "drawn" | "downloading" | "downloadable" }[] = [
    ...(regionList?.drawn ?? []).map((region) => ({ region, state: "drawn" as const })),
    ...(regionList?.downloading ?? []).map((region) => ({ region, state: "downloading" as const })),
    ...(regionList?.downloadable ?? []).map((region) => ({ region, state: "downloadable" as const }))];
  const tabs = DATA_TABS.filter((tab) => tab !== "servers" || showsServers);
  const tab: DataTab = tabs.includes(route.tab) ? route.tab : "layers";
  const counts: Record<DataTab, number | null> = { layers: layers.length,
    servers: servers?.length ?? null, regions: regionList ? regions.length : null };

  const rows: Row[] = tab === "layers" ? layers.map(({ layer, maps: holding, held }) => ({
      key: `${layer.name}/${layer.kind}`, mark: <MarkTile symbol={layer.symbol} small />, name: layer.name,
      sub: layer.kind, cells: [layer.kind, String(holding.length)], size: heldSize(heldBytes(held)),
      pill: { text: holding.slice(0, 2).join(", ") + (holding.length > 2 ? "…" : ""), tone: "plain" as const } }))
      : tab === "servers" ? (servers ?? []).map((server) => ({
        key: server.id, mark: <MarkTile symbol={server.symbol || "server.rack"} tint={server.iconTintHex} small />,
        name: server.name, sub: server.address, cells: [server.line, server.kind ?? ""],
        act: { text: words.view, run: () => openServer(server.id) } }))
        : regions.map(({ region, state }) => ({
          key: region.id, mark: <MarkTile symbol="map" small />, name: region.name, sub: shownName,
          cells: [shownName, ""], size: heldSize(region.bytes),
          pill: state === "drawn" ? { text: words.onThisPhone, tone: "on" as const }
            : state === "downloading" ? { text: words.downloading, tone: "busy" as const } : undefined,
          act: state === "downloadable" && canEdit ? { text: words.download, run: () => void downloadRegion(region) }
            : undefined }));
  const heads: Record<DataTab, string[]> = {
    layers: [words.layers, words.kind, words.usedIn, ""], servers: [words.servers, words.kind, "", ""],
    regions: [filledIn(words.regionsOf, "map", shownName), words.maps, "", ""] };
  // 141 A Size column only where some row has a size: an older phone sends none, and the column is left out.
  const sized = (tab === "layers" || tab === "regions") && rows.some((row) => row.size);
  return (
    <main id="data" aria-labelledby="dataTitle">
      <div className="data-head">
        <div>
          <h1 id="dataTitle">{words.data}</h1>
          <p>{words.dataNote}</p>
        </div>
        <div role="tablist" className="data-tabs" aria-labelledby="dataTitle">
          {tabs.map((each) => (
            <button type="button" role="tab" key={each} id={`dataTab-${each}`} aria-selected={each === tab}
              onClick={() => go({ screen: "data", tab: each })}>
              {words[each]}{counts[each] != null ? <span>{counts[each]}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="data-stats">
        {tabs.map((each) => (
          <div key={each}><small>{words[each]}</small><b>{counts[each] ?? "–"}</b></div>
        ))}
      </div>
      <div className={sized ? "data-table sized" : "data-table"} role="table" aria-label={words[tab]}>
        <div className="data-row head" role="row">
          {heads[tab].slice(0, 3).map((head, index) => <span role="columnheader" key={index}>{head}</span>)}
          {sized ? <span role="columnheader" className="size-cell">{words.size}</span> : null}
          <span role="columnheader">{heads[tab][3]}</span>
        </div>
        {rows.length ? rows.map((row) => (
          <div className="data-row" role="row" key={row.key} data-row={row.key}>
            <span role="cell" className="name-cell">
              {row.mark}
              <span className="words">
                {row.open ? <button type="button" className="link-name" onClick={row.open}>{row.name}</button> : row.name}
                {row.sub && row.sub !== row.cells[0] ? <small>{row.sub}</small> : null}
                {row.chips}
              </span>
            </span>
            <span role="cell">{row.cells[0]}</span>
            <span role="cell">{row.cells[1]}</span>
            {sized ? <span role="cell" className="size-cell">{row.size ?? ""}</span> : null}
            <span role="cell" className="end-cell">
              {row.pill ? <span className={`pill-tag ${row.pill.tone}`}>{row.pill.text}</span> : null}
              {row.tags}
              {row.act ? <button type="button" className="pill" onClick={row.act.run}>{row.act.text}</button> : null}
            </span>
          </div>
        )) : <div className="empty">{words.noneHere}</div>}
      </div>
    </main>
  );
}
