"use client";

import { pickStyle, shareAddress, shownMapOf, useViewer } from "@/store/viewer";
import { MarkTile } from "./ui/MarkTile";
import { Sym } from "./ui/Sym";
import { Traffic } from "./Traffic";

/** 47 The map on screen, named; the style switcher is the header's only drop-down. */
function ShownMap() {
  const shown = useViewer(shownMapOf);
  const icon = useViewer((state) => (shown ? state.pictures.get(shown.id)?.icon : null));
  return (
    <div id="mapPicker" hidden={!shown}>
      <MarkTile symbol={shown?.symbol} tint={shown?.iconTintHex} picture={icon} />
      <span id="mapName">{shown?.name ?? ""}</span>
    </div>
  );
}

export function TopBar() {
  const words = useViewer((state) => state.words);
  const device = useViewer((state) => state.device);
  const styles = useViewer((state) => state.portable?.styles);
  const styleID = useViewer((state) => state.styleID);
  const viewers = useViewer((state) => state.viewers);
  const connected = useViewer((state) => state.connected);
  const viewing = `${words.viewing}: ${viewers ?? ""}`;
  const reach = connected ? words.connected : words.notConnected;
  return (
    <header id="top">
      <div id="brand"><span className="tile"><Sym name="map" /></span><b id="appName">{words.app}</b></div>
      <ShownMap />
      <span className="spacer" />
      <label id="styleLabel" style={{ display: (styles?.length ?? 0) > 1 ? "flex" : "none" }}>
        <span id="styleWord">{words.styles}</span>
        <select id="styleSelect" value={styleID ?? ""} onChange={(event) => pickStyle(event.target.value)}>
          {(styles ?? []).map((each) => <option key={each.id} value={each.id}>{each.name}</option>)}
        </select>
      </label>
      <Traffic />
      <span id="viewers" role="status" title={viewing} aria-label={viewing}
        style={{ display: viewers == null ? "none" : "inline-flex" }}>
        <Sym name="desktopcomputer" /><span id="viewerCount">{viewers}</span>
      </span>
      <button id="shareButton" className="tool round" type="button" title={words.share} aria-label={words.share}
        onClick={() => void shareAddress()}><Sym name="square.and.arrow.up" /></button>
      <span id="device" hidden={!device}><Sym name="iphone" />
        {connected == null ? null
          : <i id="deviceDot" className={connected ? "dot on" : "dot off"} role="img" title={reach} aria-label={reach} />}
        {device?.name}
      </span>
    </header>
  );
}
