"use client";

import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { isOlder } from "@/lib/version";
import type { SharedMap } from "@/lib/types";
import { filledIn } from "@/lib/words";
import { checkKey, importMap, makeMap, openMap, pickStyle, setLayerShown, shownMapOf, showEdit, useViewer } from "@/store/viewer";
import { railItemOf } from "./NavRail";
import { ServerCards } from "./Servers";
import { MarkTile } from "./ui/MarkTile";
import { Switch } from "./ui/Switch";
import { Sym } from "./ui/Sym";

function useLayerCount() {
  const words = useViewer((state) => state.words);
  return (count: number) => words[`layers.${count}`] ?? String(count);
}

function MapMark({ shared }: { shared: SharedMap }) {
  const icon = useViewer((state) => state.pictures.get(shared.id)?.icon);
  const pending = useViewer((state) => !state.pictures.has(shared.id));
  return <MarkTile symbol={shared.symbol} tint={shared.iconTintHex} picture={icon} pending={pending} />;
}

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

function LayerSwitches({ shared }: { shared: SharedMap }) {
  const words = useViewer((state) => state.words);
  const hidden = useViewer((state) => state.hidden);
  return (
    <>
      <h2 className="title">{words.layers}</h2>
      <div className="list" id="layerList">
        {shared.layers.map((layer) => (
          <div className="row" key={layer.id}>
            <MarkTile symbol={layer.symbol} small />
            <div className="words">{layer.name}<small>{layer.kind}</small></div>
            <Switch isOn={!hidden.has(layer.id)} label={layer.name} onChange={(isOn) => setLayerShown(layer.id, isOn)} />
          </div>
        ))}
      </div>
    </>
  );
}

function PasswordForm() {
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
    <form className="password" id="passwordForm" onSubmit={submit}>
      <label htmlFor="passwordField">{words.typePassword}</label>
      <input type="text" id="passwordField" placeholder="7Q4 K29" maxLength={12} autoComplete="off"
        autoCapitalize="characters" spellCheck={false} aria-label={words.password} value={typed}
        onChange={(event) => setTyped(event.target.value)} />
      <button type="submit" className="action" disabled={checking}><Sym name="lock.open" />{words.unlock}</button>
    </form>
  );
}

/** The map on screen: its picture, styles, layers and Edit map. */
function CurrentMap({ shared }: { shared: SharedMap }) {
  const words = useViewer((state) => state.words);
  const preview = useViewer((state) => state.pictures.get(shared.id)?.preview);
  const unread = useViewer((state) => !state.pictures.has(shared.id));
  const picking = useViewer((state) => state.picking);
  const styles = useViewer((state) => state.portable?.styles) ?? [];
  const styleID = useViewer((state) => state.styleID);
  const canEdit = useViewer((state) => state.editToken != null);
  const edits = useViewer((state) => state.edits);
  const layerCount = useLayerCount();
  return (
    <>
      <div className={picking ? "hero pending" : "hero"} aria-busy={picking}>
        {preview ? <div className="picture" style={{ backgroundImage: `url("${preview}")` }}>
          <span className="badge">{words.onMapNow}</span>
        </div> : unread ? <div className="picture pending" /> : null}
        <div className="lines">
          <MapMark shared={shared} />
          <div className="words"><b>{shared.name}</b><span className="muted">{layerCount(shared.layers.length)}</span></div>
        </div>
      </div>
      <Versions shared={shared} />
      {canEdit && styles.length > 1 ? (
        <div className="chips" role="group" aria-label={words.styles}>
          {styles.map((style) => (
            <button key={style.id} type="button" className={style.id === styleID ? "picked" : undefined}
              aria-pressed={style.id === styleID} onClick={() => pickStyle(style.id)}>{style.name}</button>
          ))}
        </div>
      ) : null}
      {canEdit ? <LayerSwitches shared={shared} /> : null}
      {canEdit ? (
        <button type="button" className="action" id="editButton" onClick={() => showEdit(true)}>
          <Sym name="slider.horizontal.3" />{words.edit}
        </button>
      ) : edits ? <PasswordForm /> : null}
    </>
  );
}

function MapRow({ shared }: { shared: SharedMap }) {
  const isShown = useViewer((state) => state.mapID === shared.id);
  const layerCount = useLayerCount();
  return (
    <button type="button" className={isShown ? "row picked" : "row"} aria-current={isShown ? "true" : undefined}
      onClick={() => openMap(shared.id)}>
      <MapMark shared={shared} />
      <span className="words">{shared.name}<small>{layerCount(shared.layers.length)}</small></span>
    </button>
  );
}

/** Only for a browser allowed to change maps: the phone makes it, and shares it at once. */
function NewMap() {
  const words = useViewer((state) => state.words);
  const canEdit = useViewer((state) => state.editToken != null);
  const [isNaming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const file = useRef<HTMLInputElement>(null);
  if (!canEdit) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !(await makeMap(name))) return;
    setName("");
    setNaming(false);
  };
  const picked = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (chosen) await importMap(chosen);
  };
  return (
    <div id="newMap" className="list">
      {isNaming ? (
        <form className="password" onSubmit={submit}>
          <input id="newMapName" type="text" aria-label={words.name} placeholder={words.name} autoFocus
            value={name} onChange={(event) => setName(event.target.value)} />
          <button type="submit" className="action" id="newMapSave">{words.save}</button>
        </form>
      ) : (
        <button type="button" className="row add" id="newMapButton" onClick={() => setNaming(true)}>
          <Sym name="plus.circle.fill" />{words.newMap}
        </button>
      )}
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
  const maps = device?.maps ?? [];
  return (
    <>
      <div id="current">
        {device && maps.length === 0 ? <div className="empty">{words.nothing}</div> : null}
        {shown ? <CurrentMap shared={shown} /> : null}
      </div>
      {shown && onMap ? null : (
        <div id="others">
          {maps.length ? <h2 className="title">{words.allMaps}</h2> : null}
          {maps.length ? <div className="list">{maps.map((each) => <MapRow key={each.id} shared={each} />)}</div> : null}
          <NewMap />
          <ServerCards />
        </div>
      )}
    </>
  );
}
