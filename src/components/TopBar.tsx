"use client";

import { AppIcon } from "./ui/AppIcon";
import { useEffect, useRef, useState } from "react";
import { backend } from "@backend";
import { go, offers, openNewMap, toggleSide, shareAddress, showSide, shownMapOf, useViewer } from "@/store/viewer";
import { CommitField } from "./ui/CommitField";
import { MarkTile } from "./ui/MarkTile";
import { Sym } from "./ui/Sym";
import { SearchField } from "./Search";
import { Traffic } from "./Traffic";

/** 90 The map on screen, named; it opens the maps to pick another. */
function ShownMap() {
  const words = useViewer((state) => state.words);
  const shown = useViewer(shownMapOf);
  const icon = useViewer((state) => (shown ? state.pictures.get(shown.id)?.icon : null));
  return (
    <button type="button" id="mapPicker" hidden={!shown} title={words.allMaps}
      onClick={() => {
        go({ screen: "maps" });
        showSide(true);
      }}>
      <MarkTile symbol={shown?.symbol} tint={shown?.iconTintHex} picture={icon} />
      <span id="mapName">{shown?.name ?? ""}</span>
      <Sym name="chevron.down" className="chevron" />
    </button>
  );
}

/** 104 Hides the side bar for the whole map, and brings it back; `[` does the same. */
function SideToggle() {
  const words = useViewer((state) => state.words);
  const shown = useViewer((state) => state.sideShown);
  const beside = useViewer((state) => !state.editing && !["data", "settings", "details"].includes(state.route.screen));
  if (!beside) return null;
  const label = `${shown ? words.hideSide : words.showSideBar} ( [ )`;
  return (
    <button type="button" id="sideToggle" className="tool round" aria-controls="side" aria-expanded={shown}
      aria-label={shown ? words.hideSide : words.showSideBar} title={label} onClick={toggleSide}>
      <Sym name="sidebar.left" />
    </button>
  );
}

/** 90 New map, for a browser that may make one; 97 its window names it. */
function NewMapButton() {
  const words = useViewer((state) => state.words);
  const canEdit = useViewer((state) => state.editToken != null);
  if (!canEdit || !offers("newMap")) return null;
  return (
    <button type="button" id="topNewMap" className="tool tinted"
      onClick={openNewMap}><Sym name="plus" />{words.newMap}</button>
  );
}

/** 83 The name the site's changes are made under; blank leaves it to the Apple Account's. */
export function AccountName() {
  const words = useViewer((state) => state.words);
  const admitted = useViewer((state) => state.standing === "admitted");
  const account = useViewer((state) => state.gateDevice);
  const author = backend.author;
  const [name, setName] = useState(() => author?.read() ?? "");
  if (!author || !admitted) return null;
  return (
    <CommitField type="text" id="accountName" value={name} maxLength={100} aria-label={words.yourName}
      placeholder={account || words.yourName} autoComplete="name" spellCheck={false}
      onCommit={(typed) => {
        author.keep(typed);
        setName(author.read());
      }} />
  );
}

/** 76 Where the site puts its sign-out button, with 83 the name beside it; empty on the phone. */
function Account() {
  const into = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (into.current) backend.mountAccount?.("out", into.current);
  }, []);
  return (
    <>
      <span id="account" ref={into} />
    </>
  );
}

export function TopBar() {
  const words = useViewer((state) => state.words);
  const device = useViewer((state) => state.device);
  const viewers = useViewer((state) => state.viewers);
  const connected = useViewer((state) => state.connected);
  const viewing = `${words.viewing}: ${viewers ?? ""}`;
  const reach = connected ? words.connected : words.notConnected;
  return (
    <header id="top">
      <div className="start">
        <div id="brand"><AppIcon size={36} /><b id="appName">{words.app}</b></div>
        <SideToggle />
        <ShownMap />
      </div>
      <SearchField />
      <div className="end">
        <Traffic />
        <span id="viewers" role="status" title={viewing} aria-label={viewing}
          style={{ display: viewers == null ? "none" : "inline-flex" }}>
          <Sym name="desktopcomputer" /><span id="viewerCount">{viewers}</span>
        </span>
        <NewMapButton />
        <button id="shareButton" className="tool round" type="button" title={words.share} aria-label={words.share}
          onClick={() => void shareAddress()}><Sym name="square.and.arrow.up" /></button>
        <Account />
        <span id="device" hidden={!device}><Sym name="iphone" />
          {connected == null ? null
            : <i id="deviceDot" className={connected ? "dot on" : "dot off"} role="img" title={reach} aria-label={reach} />}
          {device?.name}
        </span>
      </div>
    </header>
  );
}
