"use client";

import { mapControl } from "@/map/control";
import { THEMES, nextTheme, pickStyle, shownMapOf, toggleSide, useViewer } from "@/store/viewer";
import { Sym } from "./ui/Sym";

export function TopBar() {
  const words = useViewer((state) => state.words);
  const device = useViewer((state) => state.device);
  const mapName = useViewer((state) => shownMapOf(state)?.name ?? "");
  const styles = useViewer((state) => state.portable?.styles);
  const styleID = useViewer((state) => state.styleID);
  const viewers = useViewer((state) => state.viewers);
  const sideShown = useViewer((state) => state.sideShown);
  const sharesLocation = useViewer((state) => state.sharesLocation);
  const theme = useViewer((state) => state.theme);
  const sideLabel = `${sideShown ? words.hide : words.show} · ${words.maps} ( [ )`;
  const viewing = `${words.viewing}: ${viewers ?? ""}`;
  const themeLabel = `${words.appearance}: ${words[`theme.${theme}`]}`;
  return (
    <header id="top">
      <div id="brand"><Sym name="map" /><b id="appName">{words.app}</b>
        <span id="device" className="muted">{device?.name}</span></div>
      <button id="sideToggle" className="tool" type="button" aria-controls="side" aria-expanded={sideShown}
        title={sideLabel} aria-label={sideLabel} onClick={toggleSide}><Sym name="sidebar.left" /></button>
      <span id="mapName">{mapName}</span>
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
      <button id="phoneButton" className="tool" type="button" title={words.phoneHere} aria-label={words.phoneHere}
        style={{ display: sharesLocation ? "inline-flex" : "none" }} onClick={() => mapControl()?.showPhone()}>
        <Sym name="location.fill" />
      </button>
      <button id="themeToggle" className="tool" type="button" title={themeLabel} aria-label={themeLabel}
        onClick={nextTheme}><Sym name={THEMES[theme]} /></button>
    </header>
  );
}
