"use client";

import { useState } from "react";
import { downloadRegion, askToJoin, useViewer } from "@/store/viewer";
import { filledIn } from "@/lib/words";
import { Sym } from "./ui/Sym";

export function StatusBar() {
  const words = useViewer((state) => state.words);
  const zoom = useViewer((state) => state.zoomText);
  const pointer = useViewer((state) => state.pointerText);
  return (
    <footer id="status">
      <span id="zoom">{zoom}</span><span id="pointer">{pointer}</span><span className="spacer" />
      <span id="keys"><kbd>[</kbd>{` ${words.maps}`}</span>
    </footer>
  );
}

/** Over everything until the phone's maps are read, so the page is not seen filling up piece by piece. */
export function Boot() {
  const words = useViewer((state) => state.words);
  const settled = useViewer((state) => state.device != null || state.connected === false
    || (state.standing != null && state.standing !== "admitted"));
  if (settled) return null;
  return (
    <div id="boot" role="status">
      <span className="tile"><Sym name="map" /></span>
      <div className="spinner" />
      <p>{filledIn(words.loadingApp, "app", words.app)}</p>
    </div>
  );
}

/** Runs along the map's top while a map, its style or its tiles are on their way. */
export function LoadingBar() {
  const words = useViewer((state) => state.words);
  const busy = useViewer((state) => state.picking || state.mapBusy);
  if (!busy) return null;
  return <div id="loadingBar" role="progressbar" aria-label={words.loading}><i /></div>;
}

/** Rows that pulse where the phone's answer will be listed. */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  const words = useViewer((state) => state.words);
  return (
    <div className="list skeleton" role="status" aria-label={words.loading}>
      {Array.from({ length: rows }, (_, index) => (
        <div className="row pending" key={index}><span className="mark small" /><span className="bar" /></div>
      ))}
    </div>
  );
}

export function Notice() {
  const text = useViewer((state) => state.notice);
  return <div id="notice" role="status" className={text ? "shown" : undefined}>{text ?? ""}</div>;
}

/** Stays while the phone does not answer; the page keeps asking, so nothing is reloaded. */
export function Offline() {
  const words = useViewer((state) => state.words);
  const connected = useViewer((state) => state.connected);
  if (connected !== false) return null;
  return (
    <div id="offline" role="alert">
      <div className="spinner" /><b>{words.notConnected}</b><span>{words.reconnecting}</span>
    </div>
  );
}

export function RegionOffer() {
  const words = useViewer((state) => state.words);
  const offer = useViewer((state) => state.regionOffer);
  const canEdit = useViewer((state) => state.editToken != null);
  const said = (sentence: string) => filledIn(sentence, "region", offer?.region.name ?? "");
  let content = null;
  if (offer?.kind === "downloading") {
    content = <span><Sym name="arrow.down.circle" />{said(words.downloadingRegion)}</span>;
  } else if (offer && canEdit) {
    content = <button type="button" id="regionDownload" onClick={() => downloadRegion(offer.region)}>
      <Sym name="arrow.down.circle" />{said(words.downloadRegion)}
    </button>;
  } else if (offer) {
    content = <span>{said(words.regionNotOnPhone)}</span>;
  }
  return <div id="regionOffer" role="status" style={{ display: content ? "flex" : "none" }}>{content}</div>;
}

export function Gate() {
  const words = useViewer((state) => state.words);
  const standing = useViewer((state) => state.standing);
  const device = useViewer((state) => state.gateDevice);
  const [asking, setAsking] = useState(false);
  const removed = standing === "removed";
  const ask = async () => {
    setAsking(true);
    await askToJoin();
    setAsking(false);
  };
  return (
    <div id="gate" role="dialog" aria-modal="true" aria-labelledby="gateTitle">
      <div className="sheet">
        <div id="gateMark">{removed ? <Sym name="person.crop.circle.badge.xmark" /> : <div className="spinner" />}</div>
        <h1 id="gateTitle">{removed ? words.removedTitle : words.waiting}</h1>
        <p id="gateText">{removed ? words.removedText : words.waitingText}</p>
        <p id="gateDevice">{device}</p>
        <button id="askToJoin" type="button" hidden={!removed} disabled={asking} onClick={ask}>{words.askToJoin}</button>
      </div>
    </div>
  );
}

export function SmallScreen() {
  const words = useViewer((state) => state.words);
  return (
    <div id="small" role="dialog" aria-modal="true" aria-labelledby="smallTitle">
      <div className="sheet">
        <Sym name="desktopcomputer" />
        <h1 id="smallTitle">{words.smallTitle}</h1>
        <p id="smallText">{words.smallText}</p>
      </div>
    </div>
  );
}
