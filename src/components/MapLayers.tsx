"use client";

import { useEffect, useRef, useState } from "react";
import type { SharedMap } from "@/lib/types";
import { filledIn } from "@/lib/words";
import { change, go, offers, pickStyle, setLayerShown, showEdit, showSideStyles, showSwitcher, shownMapOf, toggleAddingPackages,
  useViewer } from "@/store/viewer";
import { MarkTile } from "./ui/MarkTile";
import { Switch } from "./ui/Switch";
import { Sym } from "./ui/Sym";

export const useStyleName = () => useViewer((state) =>
  state.portable?.styles?.find((each) => each.id === state.styleID)?.name ?? "");

/** 90 The style on the map, as a drop-down whose list folds out under it; 107 All styles beside its title. */
export function StylePicker({ id, onAll }: { id: string; onAll?: () => void }) {
  const words = useViewer((state) => state.words);
  const styles = useViewer((state) => state.portable?.styles) ?? [];
  const styleID = useViewer((state) => state.styleID);
  const name = useStyleName();
  const [isOpen, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [isOpen]);
  if (styles.length < 2) return null;
  return (
    <div className="style-picker" ref={box}>
      <span className="group-title split">
        <span id={`${id}Title`}>{words.style}</span>
        {onAll ? <button type="button" className="text-link" id={`${id}All`} onClick={onAll}>{words.allStyles}</button>
          : null}
      </span>
      <button type="button" id={id} className="picker" aria-haspopup="listbox" aria-expanded={isOpen}
        aria-labelledby={`${id}Title ${id}`} onClick={() => setOpen(!isOpen)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && isOpen) {
            event.preventDefault();
            setOpen(false);
          }
        }}>
        <span className="name">{name}</span><Sym name={isOpen ? "chevron.up" : "chevron.down"} />
      </button>
      {isOpen ? (
        <div role="listbox" aria-label={words.style} className="picker-list">
          {styles.map((style) => (
            <button type="button" role="option" key={style.id} aria-selected={style.id === styleID}
              onClick={() => {
                pickStyle(style.id);
                setOpen(false);
              }}>{style.name}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 90 How many of the map's layers the style draws. */
export function useLayersOn(shared: SharedMap) {
  const words = useViewer((state) => state.words);
  const hidden = useViewer((state) => state.hidden);
  const on = shared.layers.filter((layer) => !hidden.has(layer.id)).length;
  // 113 the app's own words for it, as Edit map's groups count theirs
  return filledIn(filledIn(words.groupLayersOn, "on", String(on)), "count", String(shared.layers.length));
}

/** 97 Add layer's window, where the browser may add one. */
function AddLayerButton() {
  const words = useViewer((state) => state.words);
  if (!offers("addLayer")) return null;
  return (
    <button type="button" className="add-layer" onClick={() => {
      showSwitcher(false);
      toggleAddingPackages();
    }}><span className="tile"><Sym name="plus" /></span>{words.addLayer}</button>
  );
}

/** The map's layers, each with its switch; 97 Add layer at its foot. */
export function LayerToggles({ shared, id }: { shared: SharedMap; id?: string }) {
  const hidden = useViewer((state) => state.hidden);
  return (
    <div className="group" id={id}>
      {shared.layers.map((layer) => (
        <div className="row layer" key={layer.id}>
          <MarkTile symbol={layer.symbol} small />
          <div className="words">{layer.name}<small>{layer.kind}</small></div>
          <Switch isOn={!hidden.has(layer.id)} label={layer.name} onChange={(isOn) => setLayerShown(layer.id, isOn)} />
        </div>
      ))}
      <AddLayerButton />
    </div>
  );
}

/** 90 Over the map: the style on it, and for a browser that may edit, its layers and switches. */
export function LayerSwitcher() {
  const words = useViewer((state) => state.words);
  const shown = useViewer(shownMapOf);
  const isOpen = useViewer((state) => state.switcherOpen);
  const canEdit = useViewer((state) => state.editToken != null);
  const styleCount = useViewer((state) => state.portable?.styles?.length ?? 0);
  const name = useStyleName();
  const editing = useViewer((state) => state.editing);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) showSwitcher(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [isOpen]);
  const covered = useViewer((state) => ["details", "data", "settings", "maps"].includes(state.route.screen));
  if (!shown || editing || covered || (!canEdit && styleCount < 2)) return null;
  return (
    <div id="switcher" ref={box}>
      <button type="button" id="switcherButton" className="glass" aria-haspopup="dialog" aria-expanded={isOpen}
        onClick={() => showSwitcher(!isOpen)}>
        <Sym name="square.3.layers.3d" />{name || words.layers}<Sym name="chevron.down" />
      </button>
      {isOpen ? <SwitcherPanel shared={shown} canEdit={canEdit} /> : null}
    </div>
  );
}

function SwitcherPanel({ shared, canEdit }: { shared: SharedMap; canEdit: boolean }) {
  const words = useViewer((state) => state.words);
  const layersOn = useLayersOn(shared);
  return (
    <section id="switcherPanel" role="dialog" aria-label={words.layers}>
      <div className="head"><b>{words.layers}</b>{canEdit ? <span>{layersOn}</span> : null}</div>
      <StylePicker id="switcherStyle" />
      {canEdit ? <LayerToggles shared={shared} /> : null}
      {canEdit ? (
        <div className="buttons">
          <button type="button" className="tinted" onClick={() => {
            showSwitcher(false);
            showEdit(true);
          }}>{words.edit}</button>
        </div>
      ) : null}
    </section>
  );
}

/** 94 Over the map while Edit map is open: what it draws is the edit, as it is saved. */
export function LivePreview() {
  const words = useViewer((state) => state.words);
  const editing = useViewer((state) => state.editing);
  const name = useStyleName();
  if (!editing) return null;
  return (
    <span id="livePreview" className="glass" role="status">
      <Sym name="eye" />{name ? `${words.livePreview} · ${name}` : words.livePreview}
    </span>
  );
}

/** 107 The side bar's Styles: a card a style, its picture, how many layers it draws, the one on the map. */
export function StyleCards() {
  const words = useViewer((state) => state.words);
  const portable = useViewer((state) => state.portable);
  const styleID = useViewer((state) => state.styleID);
  const canEdit = useViewer((state) => state.editToken != null);
  const mapID = useViewer((state) => state.mapID);
  const styles = portable?.styles ?? [];
  const all = (portable?.stack ?? []).length;
  const toStyling = () => {
    showSideStyles(false);
    if (mapID) go({ screen: "edit", map: mapID, tab: "styling" });
  };
  return (
    <div id="styleCards">
      <div className="cards-head">
        <button type="button" className="tool round" aria-label={words.layers} onClick={() => showSideStyles(false)}>
          <Sym name="chevron.backward" />
        </button>
        <h2>{words.styles}</h2>
        {canEdit ? <button type="button" className="text-link" onClick={toStyling}>{words.editStyles}</button> : null}
      </div>
      {styles.map((style) => {
        const hidden = style.arrangement?.hidden?.length ?? 0;
        const isOn = style.id === styleID;
        return (
          <button type="button" key={style.id} className="style-card" aria-pressed={isOn} data-style-card={style.id}
            onClick={() => pickStyle(style.id)}>
            {style.iconPicture ? <span className="cover" style={{ backgroundImage:
              `url("data:image/jpeg;base64,${style.iconPicture}")` }} /> : null}
            <span className="lines">
              <MarkTile symbol={style.symbol || "map"} tint={style.iconTintHex} small />
              <span className="words">{style.name}
                <small>{filledIn(filledIn(words.groupLayersOn, "on", String(all - hidden)), "count", String(all))}</small>
              </span>
              {isOn ? <span className="pill-tag busy">{words.onMapNow}</span> : null}
            </span>
          </button>
        );
      })}
      {canEdit ? (
        <button type="button" className="new-style" onClick={async () => {
          if (await change({ kind: "addStyle", name: `${words.newStyle} ${styles.length + 1}` })) toStyling();
        }}><Sym name="plus" />{words.newStyle}</button>
      ) : null}
    </div>
  );
}
