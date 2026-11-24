"use client";

import { useEffect, useRef } from "react";
import { type MapControl, setMapControl } from "@/map/control";
import { drawSaved, drawStyle, loadWords, readAddress, restoreKept, showEdit, startSession, toggleSide, useViewer }
  from "@/store/viewer";
import { AddLayerModal } from "./edit/AddLayerModal";
import { DataPage } from "./DataPage";
import { DetailsScreen } from "./edit/DetailsScreen";
import { MapsScreen } from "./list/MapsPage";
import { LayerSwitcher, LivePreview } from "./MapLayers";
import { NavRail } from "./NavRail";
import { NewMapModal } from "./NewMapModal";
import { PlacePanel } from "./PlacePanel";
import { SettingsPage } from "./SettingsPage";
import { AppOffer, Gate, Notice, Offline, RegionOffer, StatusBar, UndrawnNote } from "./Overlays";
import { RegionNeedsNote } from "./RegionPackages";
import { SideBar } from "./SideBar";
import { TopBar } from "./TopBar";
import { Boot, LoadingBar } from "./Overlays";

/** The whole page: the top bar, the rail, the screen the address names; the map is made once. */
export function AppShell() {
  const mapBox = useRef<HTMLDivElement>(null);
  const standing = useViewer((state) => state.standing);
  const connected = useViewer((state) => state.connected);
  const sideShown = useViewer((state) => state.sideShown);
  const editing = useViewer((state) => state.editing);

  useEffect(() => {
    let isGone = false;
    let made: MapControl | null = null;
    const dark = matchMedia("(prefers-color-scheme: dark)");
    const darkChanged = () => {
      if (useViewer.getState().theme === "auto") drawStyle();
    };
    dark.addEventListener("change", darkChanged);
    window.addEventListener("popstate", readAddress);
    readAddress();
    restoreKept();
    void (async () => {
      await loadWords();
      const { createMapView } = await import("@/map/map-view");
      if (isGone || !mapBox.current) return;
      made = createMapView(mapBox.current);
      setMapControl(made);
      drawSaved();
      startSession();
    })();
    return () => {
      isGone = true;
      dark.removeEventListener("change", darkChanged);
      window.removeEventListener("popstate", readAddress);
      setMapControl(null);
      made?.remove();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (event.key === "Escape" && !event.defaultPrevented && useViewer.getState().editing) showEdit(false);
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "[") toggleSide();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    // 134 Before anyone is let in, a page that cannot reach its cloud shows nothing behind the gate.
    document.body.classList.toggle("gated", standing != null ? standing !== "admitted" : connected === false);
    if (standing) document.body.dataset.standing = standing;
  }, [standing, connected]);

  useEffect(() => {
    document.body.classList.toggle("side-hidden", !sideShown);
  }, [sideShown]);

  useEffect(() => {
    document.body.classList.toggle("editing", editing);
  }, [editing]);

  // 151 The place panel covers the map's right edge, so its controls move left of it, as W2 and W13 draw.
  const hasPanel = useViewer((state) => state.place != null && !state.editing
    && !["details", "data", "settings", "maps"].includes(state.route.screen));
  useEffect(() => {
    document.body.classList.toggle("place-open", hasPanel);
  }, [hasPanel]);

  return (
    <>
      <TopBar />
      <NavRail />
      <SideBar />
      <div id="map" ref={mapBox} />
      <LayerSwitcher />
      <LivePreview />
      <PlacePanel />
      <DetailsScreen />
      <DataPage />
      <MapsScreen />
      <SettingsPage />
      <NewMapModal />
      <AddLayerModal />
      <LoadingBar />
      <RegionOffer />
      <UndrawnNote />
      <RegionNeedsNote />
      <StatusBar />
      <Notice />
      <Offline />
      <Gate />
      <AppOffer />
      <Boot />
    </>
  );
}
