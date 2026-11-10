"use client";

import { useEffect, useRef, useState } from "react";
import type { SharedMap } from "@/lib/types";
import { go, openMap, pickStyle, shareAddress, showSide, shownMapOf, useViewer } from "@/store/viewer";
import { Link } from "./ui/Link";
import { MarkTile } from "./ui/MarkTile";
import { Sym } from "./ui/Sym";

function PickerRow({ shared, onPicked }: { shared: SharedMap; onPicked: () => void }) {
  const isShown = useViewer((state) => state.mapID === shared.id);
  const icon = useViewer((state) => state.pictures.get(shared.id)?.icon);
  return (
    <Link to={{ screen: "map", map: shared.id }} className="row" role="menuitem" current={isShown}
      onFollow={() => { onPicked(); openMap(shared.id); }}>
      <MarkTile symbol={shared.symbol} tint={shared.iconTintHex} picture={icon} small />
      <span className="words">{shared.name}</span>
    </Link>
  );
}

/** The map on screen; its menu lists the others, and All maps at its foot. */
function MapPicker() {
  const words = useViewer((state) => state.words);
  const shown = useViewer(shownMapOf);
  const maps = useViewer((state) => state.device?.maps) ?? [];
  const icon = useViewer((state) => (shown ? state.pictures.get(shown.id)?.icon : null));
  const [isOpen, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    // Caught first and marked, so Escape closes the menu and not Edit map under it.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [isOpen]);
  const close = () => setOpen(false);
  return (
    <div id="mapPicker" ref={box}>
      <button id="mapPickerButton" className="tool" type="button" aria-haspopup="menu" aria-expanded={isOpen}
        aria-label={words.maps} hidden={!shown} onClick={() => setOpen(!isOpen)}>
        <MarkTile symbol={shown?.symbol} tint={shown?.iconTintHex} picture={icon} />
        <span id="mapName">{shown?.name ?? ""}</span>
        <Sym name="chevron.down" />
      </button>
      {isOpen ? (
        <div className="menu" id="mapMenu" role="menu" aria-label={words.maps}>
          {maps.map((each) => <PickerRow key={each.id} shared={each} onPicked={close} />)}
          <div className="foot">
            <Link to={{ screen: "maps" }} id="allMaps" className="row" role="menuitem"
              onFollow={() => { close(); go({ screen: "maps" }); showSide(true); }}>
              <span className="words">{words.allMaps}</span>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TopBar() {
  const words = useViewer((state) => state.words);
  const device = useViewer((state) => state.device);
  const styles = useViewer((state) => state.portable?.styles);
  const styleID = useViewer((state) => state.styleID);
  const viewers = useViewer((state) => state.viewers);
  const viewing = `${words.viewing}: ${viewers ?? ""}`;
  return (
    <header id="top">
      <div id="brand"><span className="tile"><Sym name="map" /></span><b id="appName">{words.app}</b></div>
      <MapPicker />
      <span className="spacer" />
      <label id="styleLabel" style={{ display: (styles?.length ?? 0) > 1 ? "flex" : "none" }}>
        <span id="styleWord">{words.styles}</span>
        <select id="styleSelect" value={styleID ?? ""} onChange={(event) => pickStyle(event.target.value)}>
          {(styles ?? []).map((each) => <option key={each.id} value={each.id}>{each.name}</option>)}
        </select>
      </label>
      <span id="viewers" role="status" title={viewing} aria-label={viewing}
        style={{ display: viewers == null ? "none" : "inline-flex" }}>
        <Sym name="desktopcomputer" /><span id="viewerCount">{viewers}</span>
      </span>
      <button id="shareButton" className="tool round" type="button" title={words.share} aria-label={words.share}
        onClick={() => void shareAddress()}><Sym name="square.and.arrow.up" /></button>
      <span id="device" hidden={!device}><Sym name="iphone" />{device?.name}</span>
    </header>
  );
}
