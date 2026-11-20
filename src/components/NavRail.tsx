"use client";

import { useEffect } from "react";
import type { Route } from "@/lib/route";
import { go, loadSaved, offers, showSide, toggleSide, useViewer } from "@/store/viewer";
import { Link } from "./ui/Link";
import { Sym } from "./ui/Sym";

type Item = "map" | "search" | "saved" | "maps" | "data" | "servers" | "settings";

/** The item lit for a screen. */
export function railItemOf(route: Route): Item | null {
  switch (route.screen) {
    case "search":
    case "place":
      return "search";
    case "home":
    case "map":
    case "edit":
    case "details":
      return "map";
    case "saved":
      return "saved";
    case "maps":
      return "maps";
    case "data":
      return "data";
    case "servers":
      return "servers";
    case "settings":
      return "settings";
    default:
      return null;
  }
}

/** 107 The rail's Search: back on the map where a page covers it, the cursor in the top bar's field. */
function focusSearch(mapRoute: Route) {
  const { route } = useViewer.getState();
  if (route.screen !== "map" && route.screen !== "search" && route.screen !== "place") go(mapRoute);
  showSide(true);
  requestAnimationFrame(() => document.getElementById("search")?.focus());
}

export function NavRail() {
  const words = useViewer((state) => state.words);
  const route = useViewer((state) => state.route);
  const mapID = useViewer((state) => state.mapID);
  const sideShown = useViewer((state) => state.sideShown);
  const canEdit = useViewer((state) => state.editToken != null);
  const readsSaved = useViewer((state) => state.savedReadable);
  const hasSaved = canEdit && readsSaved && offers("saved");
  // 135 Read once the browser may edit, so a phone that answers 404 leaves the item out.
  useEffect(() => {
    if (hasSaved) void loadSaved();
  }, [hasSaved]);
  const lit = railItemOf(route);
  const onMap = route.screen === "map";
  const mapRoute: Route = mapID ? { screen: "map", map: mapID } : { screen: "maps" };
  // On the map its item folds the side bar, as `[` does; elsewhere it goes back to the map.
  const followMap = () => {
    if (onMap) toggleSide();
    else go(mapRoute);
  };
  const followSide = (to: Route) => () => {
    go(to);
    showSide(true);
  };
  return (
    <nav id="rail" aria-label={words.app}>
      <Link to={mapRoute} id="railMap" current={lit === "map"} onFollow={followMap}
        title={onMap ? `${sideShown ? words.hide : words.show} · ${words.maps} ( [ )` : undefined}>
        <Sym name="map" /><span>{words.map}</span>
      </Link>
      {mapID ? (
        <button type="button" id="railSearch" aria-current={lit === "search" ? "page" : undefined}
          onClick={() => focusSearch(mapRoute)}>
          <Sym name="magnifyingglass" /><span>{words.search}</span>
        </button>
      ) : null}
      {hasSaved ? (
        <Link to={{ screen: "saved" }} id="railSaved" current={lit === "saved"} onFollow={followSide({ screen: "saved" })}>
          <Sym name="star" /><span>{words.savedTitle}</span>
        </Link>
      ) : null}
      <Link to={{ screen: "maps" }} id="railMaps" current={lit === "maps"} onFollow={followSide({ screen: "maps" })}>
        <Sym name="square.grid.2x2" /><span>{words.maps}</span>
      </Link>
      <Link to={{ screen: "data", tab: "maps" }} id="railData" current={lit === "data"} onFollow={() => go({ screen: "data", tab: "maps" })}>
        <Sym name="cylinder.split.1x2" /><span>{words.data}</span>
      </Link>
      {canEdit && offers("servers") ? (
        <Link to={{ screen: "servers" }} id="railServers" current={lit === "servers"}
          onFollow={followSide({ screen: "servers" })}>
          <Sym name="server.rack" /><span>{words.servers}</span>
        </Link>
      ) : null}
      <Link to={{ screen: "settings" }} id="railSettings" className="foot" current={lit === "settings"}
        title={words.settings} onFollow={() => go({ screen: "settings" })}>
        <Sym name="gearshape" />
      </Link>
    </nav>
  );
}
