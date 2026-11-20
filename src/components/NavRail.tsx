"use client";

import type { Route } from "@/lib/route";
import { THEMES, go, nextTheme, offers, showSide, toggleSide, useViewer } from "@/store/viewer";
import { Link } from "./ui/Link";
import { Sym } from "./ui/Sym";

type Item = "map" | "maps" | "data" | "servers";

/** The item lit for a screen; Search, Saved and Settings join as their screens arrive. */
export function railItemOf(route: Route): Item | null {
  switch (route.screen) {
    case "home":
    case "map":
    case "search":
    case "place":
    case "edit":
    case "details":
      return "map";
    case "maps":
      return "maps";
    case "data":
      return "data";
    case "servers":
      return "servers";
    default:
      return null;
  }
}

export function NavRail() {
  const words = useViewer((state) => state.words);
  const route = useViewer((state) => state.route);
  const mapID = useViewer((state) => state.mapID);
  const sideShown = useViewer((state) => state.sideShown);
  const canEdit = useViewer((state) => state.editToken != null);
  const theme = useViewer((state) => state.theme);
  const lit = railItemOf(route);
  const onMap = route.screen === "map";
  const mapRoute: Route = mapID ? { screen: "map", map: mapID } : { screen: "maps" };
  const themeLabel = `${words.appearance}: ${words[`theme.${theme}`]}`;
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
      <button id="themeToggle" className="foot" type="button" title={themeLabel} aria-label={themeLabel}
        onClick={nextTheme}><Sym name={THEMES[theme]} /></button>
    </nav>
  );
}
