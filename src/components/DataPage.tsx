"use client";

import { type ReactNode, useEffect } from "react";
import { DATA_TABS, type DataTab } from "@/lib/route";
import type { Region, SharedLayer } from "@/lib/types";
import { filledIn } from "@/lib/words";
import { downloadRegion, go, loadRegionList, loadServers, offers, openMap, openServer, useViewer } from "@/store/viewer";
import { MapMark, useLayerCount } from "./MapShelf";
import { MarkTile } from "./ui/MarkTile";

interface Row {
  key: string;
  mark: ReactNode;
  name: string;
  sub?: string | null;
  cells: string[];
  pill?: { text: string; tone: "on" | "plain" | "busy" };
  open?: () => void;
  act?: { text: string; run: () => void };
}

/** 101 One layer however many maps hold it, by its name and kind. */
function layersOf(maps: { name: string; layers: SharedLayer[] }[]) {
  const byKey = new Map<string, { layer: SharedLayer; maps: string[] }>();
  for (const map of maps) {
    for (const layer of map.layers) {
      const key = `${layer.name}\u0000${layer.kind}`;
      const held = byKey.get(key) ?? { layer, maps: [] };
      held.maps.push(map.name);
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
  const layerCount = useLayerCount();
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
  const tab: DataTab = tabs.includes(route.tab) ? route.tab : "maps";
  const counts: Record<DataTab, number | null> = { maps: maps.length, layers: layers.length,
    servers: servers?.length ?? null, regions: regionList ? regions.length : null };
  const inMaps = (count: number) => count === 1 ? words.oneMap : filledIn(words.inMaps, "count", String(count));

  const rows: Row[] = tab === "maps" ? maps.map((map) => ({
    key: map.id, mark: <MapMark shared={map} />, name: map.name, sub: map.stackName,
    cells: [layerCount(map.layers.length), map.stackName ?? ""],
    pill: map.id === mapID ? { text: words.onMapNow, tone: "on" as const } : undefined, open: () => openMap(map.id) }))
    : tab === "layers" ? layers.map(({ layer, maps: holding }) => ({
      key: `${layer.name}/${layer.kind}`, mark: <MarkTile symbol={layer.symbol} small />, name: layer.name,
      sub: layer.kind, cells: [layer.kind, inMaps(holding.length)],
      pill: { text: holding.slice(0, 2).join(", ") + (holding.length > 2 ? "…" : ""), tone: "plain" as const } }))
      : tab === "servers" ? (servers ?? []).map((server) => ({
        key: server.id, mark: <MarkTile symbol={server.symbol || "server.rack"} tint={server.iconTintHex} small />,
        name: server.name, sub: server.address, cells: [server.line, server.kind ?? ""],
        act: { text: words.view, run: () => openServer(server.id) } }))
        : regions.map(({ region, state }) => ({
          key: region.id, mark: <MarkTile symbol="map" small />, name: region.name, sub: shownName,
          cells: [shownName, ""],
          pill: state === "drawn" ? { text: words.onThisPhone, tone: "on" as const }
            : state === "downloading" ? { text: words.downloading, tone: "busy" as const } : undefined,
          act: state === "downloadable" && canEdit ? { text: words.download, run: () => void downloadRegion(region) }
            : undefined }));
  const heads: Record<DataTab, string[]> = { maps: [words.maps, words.layers, words.folder, ""],
    layers: [words.layers, words.kind, words.usedIn, ""], servers: [words.servers, words.kind, "", ""],
    regions: [filledIn(words.regionsOf, "map", shownName), words.maps, "", ""] };
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
      <div className="data-table" role="table" aria-label={words[tab]}>
        <div className="data-row head" role="row">
          {heads[tab].map((head, index) => <span role="columnheader" key={index}>{head}</span>)}
        </div>
        {rows.length ? rows.map((row) => (
          <div className="data-row" role="row" key={row.key} data-row={row.key}>
            <span role="cell" className="name-cell">
              {row.mark}
              <span className="words">
                {row.open ? <button type="button" className="link-name" onClick={row.open}>{row.name}</button> : row.name}
                {row.sub && row.sub !== row.cells[0] ? <small>{row.sub}</small> : null}
              </span>
            </span>
            <span role="cell">{row.cells[0]}</span>
            <span role="cell">{row.cells[1]}</span>
            <span role="cell" className="end-cell">
              {row.pill ? <span className={`pill-tag ${row.pill.tone}`}>{row.pill.text}</span> : null}
              {row.act ? <button type="button" className="pill" onClick={row.act.run}>{row.act.text}</button> : null}
            </span>
          </div>
        )) : <div className="empty">{words.noneHere}</div>}
      </div>
    </main>
  );
}
