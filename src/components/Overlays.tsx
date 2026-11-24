"use client";

import { APP_LINK, APP_OFFER_CLOSED_KEY, opensTheApp } from "@/lib/opens-the-app";
import { AppIcon } from "./ui/AppIcon";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";
import { backend } from "@backend";
import { downloadRegion, askToJoin, shownMapOf, useViewer } from "@/store/viewer";
import { filledIn, type Words } from "@/lib/words";
import type { Loading } from "@/lib/types";
import { Sym } from "./ui/Sym";

/** 105 Where the pointer is; the zoom is the badge's, and `[` is told by the side bar's button. */
export function StatusBar() {
  const pointer = useViewer((state) => state.pointerText);
  return <footer id="status"><span id="pointer">{pointer}</span></footer>;
}

const megabytes = (bytes: number) => (bytes / 1_000_000).toFixed(1);

/** 137 Each part of the first read with how much of it is done; a finished part is marked so. */
function bootSteps(words: Words, loading: Loading | null): { id: string; text: string; done: boolean }[] {
  if (!loading) return [];
  const steps: { id: string; text: string; done: boolean }[] = [];
  const { engine, zones } = loading;
  if (engine) {
    const said = engine.total == null ? words.loadingEngineSoFar
      : filledIn(words.loadingEngine, "total", megabytes(engine.total));
    steps.push({ id: "engine", text: filledIn(said, "done", megabytes(engine.done)), done: engine.done === engine.total });
  }
  if (zones && zones.total > 0) {
    steps.push({ id: "zones", text: filledIn(filledIn(words.loadingZones, "done", String(zones.done)), "total", String(zones.total)),
      done: zones.done === zones.total });
  }
  if (loading.records > 0) steps.push({ id: "records", text: filledIn(words.loadingRecords, "count", String(loading.records)), done: false });
  if (loading.files > 0) steps.push({ id: "files", text: filledIn(words.loadingFiles, "count", String(loading.files)), done: false });
  return steps;
}

/** Over everything until the phone's maps are read, so the page is not seen filling up piece by piece. */
export function Boot() {
  const words = useViewer((state) => state.words);
  const loading = useViewer((state) => state.loading);
  const stopped = useViewer((state) => state.loadFailed);
  const settled = useViewer((state) => state.device != null || state.connected === false
    || (state.standing != null && state.standing !== "admitted"));
  if (settled) return null;
  return (
    <div id="boot" role="status">
      <AppIcon size={56} />
      <div className="spinner" />
      <p>{filledIn(words.loadingApp, "app", words.app)}</p>
      <ul id="bootSteps">
        {bootSteps(words, loading).map((step) => (
          <li key={step.id} className={step.done ? "done" : undefined}>{step.text}</li>
        ))}
      </ul>
      {stopped ? <p id="bootStopped" role="alert">{filledIn(words.loadingStopped, "reason", stopped)}</p> : null}
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

/** 85 Over the map: the layers this browser cannot draw, and why. */
export function UndrawnNote() {
  const words = useViewer((state) => state.words);
  const names = useViewer(useShallow((state) => (shownMapOf(state)?.layers ?? [])
    .filter((layer) => state.undrawn.has(layer.id.toLowerCase())).map((layer) => layer.name)));
  if (names.length === 0) return null;
  return (
    <div id="undrawnNote" role="status">
      {names.map((name) => <div key={name}><b>{name}</b> {words.layerUndrawn}</div>)}
    </div>
  );
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
  const connected = useViewer((state) => state.connected);
  const device = useViewer((state) => state.gateDevice);
  const [asking, setAsking] = useState(false);
  const removed = standing === "removed";
  const signIn = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (standing === "signedOut" && signIn.current) backend.mountAccount?.("in", signIn.current);
  }, [standing]);
  const ask = async () => {
    setAsking(true);
    await askToJoin();
    setAsking(false);
  };
  if (standing === "refused" || (standing == null && connected === false)) {
    const refused = standing === "refused";
    return (
      <div id="gate" className="closed" role="dialog" aria-modal="true" aria-labelledby="gateTitle">
        <div className="sheet">
          <AppIcon size={48} className="gate-icon" />
          <div id="gateMark">{refused ? <Sym name="exclamationmark.triangle.fill" /> : <div className="spinner" />}</div>
          <h1 id="gateTitle">{refused ? words.refusedTitle : words.notConnected}</h1>
          <p id="gateText">{refused ? words.refusedText : words.reconnecting}</p>
        </div>
      </div>
    );
  }
  if (standing === "signedOut") {
    return (
      <div id="gate" className="closed" role="dialog" aria-modal="true" aria-labelledby="gateTitle">
        <div className="sheet">
          <AppIcon size={48} className="gate-icon" />
          <h1 id="gateTitle">{words.signInTitle}</h1>
          <p id="gateText">{words.signInText}</p>
          <div id="signIn" ref={signIn} />
        </div>
      </div>
    );
  }
  return (
    <div id="gate" role="dialog" aria-modal="true" aria-labelledby="gateTitle">
      <div className="sheet">
        <AppIcon size={48} className="gate-icon" />
        <div id="gateMark">{removed ? <Sym name="person.crop.circle.badge.xmark" /> : <div className="spinner" />}</div>
        <h1 id="gateTitle">{removed ? words.removedTitle : words.waiting}</h1>
        <p id="gateText">{removed ? words.removedText : words.waitingText}</p>
        <p id="gateDevice">{device}</p>
        <button id="askToJoin" type="button" hidden={!removed} disabled={asking} onClick={ask}>{words.askToJoin}</button>
      </div>
    </div>
  );
}

const noChange = () => () => undefined;

/** Read in the browser; the export's own render has no navigator and offers nothing. */
function useOpensTheApp(): boolean {
  return useSyncExternalStore(noChange, () => opensTheApp(navigator.userAgent, navigator.maxTouchPoints), () => false);
}

function wasClosed(): boolean {
  try {
    return sessionStorage.getItem(APP_OFFER_CLOSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** 179 Where the app runs, a phone is offered it above the page it may use as well. */
export function AppOffer() {
  const words = useViewer((state) => state.words);
  const inApp = useOpensTheApp();
  const [closed, setClosed] = useState(wasClosed);
  if (!inApp || closed) return null;
  const close = () => {
    setClosed(true);
    try {
      sessionStorage.setItem(APP_OFFER_CLOSED_KEY, "1");
    } catch { /* closed for this page only */ }
  };
  return (
    <div id="appOffer" className="glass">
      <AppIcon size={28} />
      <a id="openInApp" href={APP_LINK}>{words.openInApp}</a>
      <button type="button" className="tool round" id="appOfferClose" aria-label={words.close} title={words.close}
        onClick={close}><Sym name="xmark" /></button>
    </div>
  );
}
