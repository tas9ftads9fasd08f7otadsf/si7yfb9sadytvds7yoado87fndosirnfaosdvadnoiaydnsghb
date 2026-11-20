"use client";

import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { isOlder } from "@/lib/version";
import type { SharedMap } from "@/lib/types";
import { filledIn } from "@/lib/words";
import { checkKey, importMap, offers, openNewMap, shownMapOf, showEdit, toggleMapCard, useViewer }
  from "@/store/viewer";
import { DeleteMap } from "./edit/DeleteMap";
import { MapMark, MapShelf, useLayerCount } from "./MapShelf";
import { LayerToggles, StylePicker, useLayersOn, useStyleName } from "./MapLayers";
import { railItemOf } from "./NavRail";
import { SearchResults } from "./Search";
import { ServerCards } from "./Servers";
import { TileSource } from "./TileSource";
import { Sym } from "./ui/Sym";

/** The oldest app and viewer the map's author allows; this viewer is the phone's app. */
function Versions({ shared }: { shared: SharedMap }) {
  const words = useViewer((state) => state.words);
  const serving = useViewer((state) => state.device?.appVersion);
  const minimum = shared.minimumVersion;
  if (!minimum?.app && !minimum?.browser) return null;
  const said = (sentence: string, version: string) => filledIn(sentence, "version", version);
  return (
    <div className="versions" id="mapVersions">
      {minimum.app ? <span>{said(words.needsApp, minimum.app)}</span> : null}
      {minimum.browser ? (isOlder(serving, minimum.browser)
        ? <span className="warning" role="alert">{said(words.updatePhone, minimum.browser)}</span>
        : <span>{said(words.needsViewer, minimum.browser)}</span>) : null}
    </div>
  );
}

/** 92 `prefix` keeps the ids apart where Settings shows the form beside the Maps page. */
export function PasswordForm({ prefix = "" }: { prefix?: string }) {
  const words = useViewer((state) => state.words);
  const [typed, setTyped] = useState("");
  const [checking, setChecking] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setChecking(true);
    await checkKey(typed);
    setChecking(false);
  };
  return (
    <form className="password" id={`${prefix}passwordForm`} onSubmit={submit}>
      <label htmlFor={`${prefix}passwordField`}>{words.typePassword}</label>
      <input type="text" id={`${prefix}passwordField`} placeholder="7Q4 K29" maxLength={12} autoComplete="off"
        autoCapitalize="characters" spellCheck={false} aria-label={words.password} value={typed}
        onChange={(event) => setTyped(event.target.value)} />
      <button type="submit" className="action" disabled={checking}><Sym name="lock.open" />{words.unlock}</button>
    </form>
  );
}

/** 90 The map on screen: a card with Edit and the fold, its style and its layers under it. */
function CurrentMap({ shared }: { shared: SharedMap }) {
  const words = useViewer((state) => state.words);
  const preview = useViewer((state) => state.pictures.get(shared.id)?.preview);
  const unread = useViewer((state) => !state.pictures.has(shared.id));
  const picking = useViewer((state) => state.picking);
  const canEdit = useViewer((state) => state.editToken != null);
  const edits = useViewer((state) => state.edits);
  const isOpen = useViewer((state) => state.mapCardOpen);
  const styleName = useStyleName();
  const layerCount = useLayerCount();
  const layersOn = useLayersOn(shared);
  return (
    <>
      <div className={picking ? "hero pending" : "hero"} aria-busy={picking}>
        <MapMark shared={shared} />
        <div className="words"><b>{shared.name}</b><span className="muted">{layerCount(shared.layers.length)}</span></div>
        {canEdit ? (
          <button type="button" className="pill" id="editButton" onClick={() => showEdit(true)}>
            <Sym name="pencil" />{words.edit}
          </button>
        ) : null}
        <button type="button" className="fold" id="mapCardFold" aria-expanded={isOpen}
          aria-label={isOpen ? words.hide : words.show} onClick={toggleMapCard}>
          <Sym name={isOpen ? "chevron.up" : "chevron.down"} />
        </button>
      </div>
      {isOpen ? (
        <>
          {preview ? <div className="picture" style={{ backgroundImage: `url("${preview}")` }}>
            <span className="badge">{words.onMapNow}</span>
          </div> : unread ? <div className="picture pending" /> : null}
          <Versions shared={shared} />
          <TileSource />
          <StylePicker id="sideStyle" />
          {canEdit ? (
            <>
              <div className="group-title split">
                <span>{styleName ? filledIn(words.layersIn, "style", styleName) : words.layers}</span>
                <span className="count">{layersOn}</span>
              </div>
              <LayerToggles shared={shared} id="layerList" />
            </>
          ) : edits ? <PasswordForm /> : null}
          <DeleteMap place="card" />
        </>
      ) : null}
    </>
  );
}

/** Only for a browser allowed to change maps: 97 New map opens its window; Import takes a file. */
function NewMap() {
  const words = useViewer((state) => state.words);
  const canEdit = useViewer((state) => state.editToken != null);
  const file = useRef<HTMLInputElement>(null);
  if (!canEdit || !offers("newMap")) return null;
  const picked = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (chosen) await importMap(chosen);
  };
  return (
    <div id="newMap" className="list">
      <button type="button" className="row add" id="newMapButton" onClick={openNewMap}>
        <Sym name="plus.circle.fill" />{words.newMap}
      </button>
      <button type="button" className="row add" id="importMap" onClick={() => file.current?.click()}>
        <Sym name="square.and.arrow.down" />{words.importMap}
      </button>
      <input ref={file} id="importFile" type="file" accept=".mapson,application/json" hidden onChange={picked} />
    </div>
  );
}

export function MapsPage() {
  const words = useViewer((state) => state.words);
  const device = useViewer((state) => state.device);
  const shown = useViewer(shownMapOf);
  const onMap = useViewer((state) => railItemOf(state.route) === "map");
  const searching = useViewer((state) => state.route.screen === "search");
  const maps = device?.maps ?? [];
  if (searching) return <div id="current"><SearchResults /></div>;
  return (
    <>
      <div id="current">
        {device && maps.length === 0 ? <div className="empty">{words.nothing}</div> : null}
        {shown ? <CurrentMap shared={shown} /> : null}
      </div>
      {shown && onMap ? null : (
        <div id="others">
          {maps.length ? <h2 className="title">{words.allMaps}</h2> : null}
          {maps.length ? <MapShelf maps={maps} /> : null}
          <NewMap />
          <ServerCards />
        </div>
      )}
    </>
  );
}
