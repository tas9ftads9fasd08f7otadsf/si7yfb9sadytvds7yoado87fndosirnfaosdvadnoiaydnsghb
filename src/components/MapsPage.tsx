"use client";

import { type FormEvent, useState } from "react";
import { isOlder } from "@/lib/version";
import type { SharedMap } from "@/lib/types";
import { filledIn } from "@/lib/words";
import { checkKey, pickMap, pickStyle, setLayerShown, shownMapOf, showEdit, useViewer } from "@/store/viewer";
import { MarkTile } from "./ui/MarkTile";
import { Switch } from "./ui/Switch";
import { Sym } from "./ui/Sym";

function useLayerCount() {
  const words = useViewer((state) => state.words);
  return (count: number) => words[`layers.${count}`] ?? String(count);
}

function MapMark({ shared }: { shared: SharedMap }) {
  const icon = useViewer((state) => state.pictures.get(shared.id)?.icon);
  return <MarkTile symbol={shared.symbol} tint={shared.iconTintHex} picture={icon} />;
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
  const styles = useViewer((state) => state.portable?.styles) ?? [];
  const styleID = useViewer((state) => state.styleID);
  const canEdit = useViewer((state) => state.editToken != null);
  const edits = useViewer((state) => state.edits);
  const layerCount = useLayerCount();
  return (
    <>
      <div className="hero">
        {preview ? <div className="picture" style={{ backgroundImage: `url("${preview}")` }}>
          <span className="badge">{words.onMapNow}</span>
        </div> : null}
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
      onClick={() => pickMap(shared.id, null)}>
      <MapMark shared={shared} />
      <span className="words">{shared.name}<small>{layerCount(shared.layers.length)}</small></span>
    </button>
  );
}

export function MapsPage() {
  const words = useViewer((state) => state.words);
  const device = useViewer((state) => state.device);
  const shown = useViewer(shownMapOf);
  const maps = device?.maps ?? [];
  return (
    <>
      <div id="current">
        {device && maps.length === 0 ? <div className="empty">{words.nothing}</div> : null}
        {shown ? <CurrentMap shared={shown} /> : null}
      </div>
      <div id="others">
        {maps.length ? <h2 className="title">{words.allMaps}</h2> : null}
        {maps.length ? <div className="list">{maps.map((each) => <MapRow key={each.id} shared={each} />)}</div> : null}
      </div>
    </>
  );
}
