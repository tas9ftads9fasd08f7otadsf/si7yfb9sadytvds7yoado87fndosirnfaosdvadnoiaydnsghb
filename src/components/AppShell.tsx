"use client";

import { useEffect, useRef } from "react";
import { type MapControl, setMapControl } from "@/map/control";
import { drawStyle, loadWords, readAddress, restoreKept, showEdit, startSession, toggleSide, useViewer }
  from "@/store/viewer";
import { NavRail } from "./NavRail";
import { Gate, Notice, RegionOffer, SmallScreen, StatusBar } from "./Overlays";
import { SideBar } from "./SideBar";
import { TopBar } from "./TopBar";

const SMALL_SCREEN = "(max-width: 899px), (max-height: 499px)";

/** The whole page: the top bar, the rail, the screen the address names; the map is made once. */
export function AppShell() {
  const mapBox = useRef<HTMLDivElement>(null);
  const standing = useViewer((state) => state.standing);
  const sideShown = useViewer((state) => state.sideShown);

  useEffect(() => {
    let isGone = false;
    let made: MapControl | null = null;
    const small = matchMedia(SMALL_SCREEN);
    const dark = matchMedia("(prefers-color-scheme: dark)");
    const smallChanged = () => startSession(small.matches);
    const darkChanged = () => {
      if (useViewer.getState().theme === "auto") drawStyle();
    };
    small.addEventListener("change", smallChanged);
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
      startSession(small.matches);
    })();
    return () => {
      isGone = true;
      small.removeEventListener("change", smallChanged);
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
      if (event.key === "Escape" && useViewer.getState().editing) showEdit(false);
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "[") toggleSide();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("gated", standing != null && standing !== "admitted");
    if (standing) document.body.dataset.standing = standing;
  }, [standing]);

  useEffect(() => {
    document.body.classList.toggle("side-hidden", !sideShown);
  }, [sideShown]);

  return (
    <>
      <TopBar />
      <NavRail />
      <SideBar />
      <div id="map" ref={mapBox} />
      <RegionOffer />
      <StatusBar />
      <Notice />
      <Gate />
      <SmallScreen />
    </>
  );
}
