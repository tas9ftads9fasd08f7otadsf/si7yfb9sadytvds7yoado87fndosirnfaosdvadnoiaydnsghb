"use client";

import { useState } from "react";
import type { ArrangeAction } from "@/lib/edit";
import type { MapSwitches, Portable, PortableStyle } from "@/lib/types";
import { listed } from "@/lib/words";
import { change, moveStyle, offers, pickStyle, setStylePicture, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { Sym } from "../ui/Sym";
import { Swatch } from "./Styling";

/** 51 A style's own icon, its ground and its note, as the phone's style page sets them. */
function StyleOptions({ style }: { style: PortableStyle }) {
  const words = useViewer((state) => state.words);
  const symbol = style.symbol || "map";
  const tint = (style.iconTintHex ?? "").toUpperCase() || null;
  const symbols = [...new Set([symbol, ...listed(words.styleSymbols)])];
  const tints = listed(words.iconTints);
  if (tint && !tints.includes(tint)) tints.push(tint);
  return (
    <div className="card" data-style-options={style.id}>
      <div className="field"><label>{words.icon}</label></div>
      <div className="swatches" role="group" aria-label={`${words.icon} ${style.name}`}>
        {symbols.map((name) => (
          <Swatch key={name} label={name} isPicked={name === symbol && !style.iconPicture} tint={tint}
            data={{ "data-symbol": name }}
            onPick={() => change({ kind: "styleSymbol", style: style.id, symbol: name })}><Sym name={name} /></Swatch>
        ))}
      </div>
      <div className="field"><label>{words.background}</label></div>
      <div className="swatches" role="group" aria-label={`${words.background} ${style.name}`}>
        <CommitField type="color" value={(tint ?? "#8E8E93").toLowerCase()} aria-label={words.pickColour}
          title={words.pickColour}
          onCommit={(hex) => change({ kind: "styleTint", style: style.id, tint: hex.toUpperCase() })} />
        <Swatch label={words["theme.auto"]} isPicked={!tint}
          onPick={() => change({ kind: "styleTint", style: style.id, tint: "" })}><Sym name="wand.and.stars" /></Swatch>
        {tints.map((hex) => (
          <Swatch key={hex} label={hex} isPicked={hex === tint} tint={hex} data={{ "data-hex": hex }}
            onPick={() => change({ kind: "styleTint", style: style.id, tint: hex })} />
        ))}
      </div>
      {offers("pictures") ? (
        <>
          <div className="field"><label>{words.picture}</label></div>
          <div className="field pictured">
            {style.iconPicture ? <span className="shown" data-picture="style"
              style={{ backgroundImage: `url("data:image/jpeg;base64,${style.iconPicture}")` }} /> : null}
            <label className="action">{words.choosePicture}
              <input type="file" accept="image/*" hidden aria-label={`${words.choosePicture} · ${style.name}`}
                data-style-picture={style.id} onChange={(event) => {
                  const picked = event.target.files?.[0];
                  event.target.value = "";
                  if (picked) void setStylePicture(style.id, picked);
                }} />
            </label>
            {style.iconPicture ? (
              <button type="button" className="action" aria-label={`${words.removePicture} · ${style.name}`}
                onClick={() => void setStylePicture(style.id)}>{words.removePicture}</button>
            ) : null}
          </div>
        </>
      ) : null}
      <div className="field">
        <label>{words.note}</label>
        <CommitField type="text" value={style.notes ?? ""} aria-label={`${words.note} ${style.name}`}
          onCommit={(note) => change({ kind: "styleNote", style: style.id, note })} />
      </div>
      <StyleLanguages style={style} />
    </div>
  );
}

/** 51 A style's name in other languages, as the phone's style page writes it. */
function StyleLanguages({ style }: { style: PortableStyle }) {
  const words = useViewer((state) => state.words);
  const [added, setAdded] = useState<string[]>([]);
  const languageName = (code: string) => words[`language.${code}`] ?? code;
  const names = style.nameTranslations ?? {};
  const written = [...new Set([...Object.keys(names), ...added])]
    .sort((one, other) => languageName(one).localeCompare(languageName(other)));
  const free = listed(words.languages).filter((code) => !written.includes(code));
  const name = (language: string, text: string) =>
    change({ kind: "styleNameIn", style: style.id, language, name: text });
  return (
    <>
      <div className="field"><label>{words.otherLanguages}</label></div>
      {written.map((code) => (
        <div className="field language-head" key={code} data-style-language={code}>
          <CommitField type="text" value={names[code] ?? ""} maxLength={200}
            aria-label={`${words.name} · ${languageName(code)} · ${style.name}`}
            placeholder={languageName(code)} onCommit={(text) => name(code, text)} />
          <button type="button" className="icon-button danger" title={words.remove}
            aria-label={`${words.remove} · ${languageName(code)} · ${style.name}`}
            onClick={() => { setAdded(added.filter((one) => one !== code)); if (names[code]) name(code, ""); }}>
            <Sym name="trash" /></button>
        </div>
      ))}
      {free.length ? (
        <div className="field">
          <select aria-label={`${words.addLanguage} · ${style.name}`} value=""
            onChange={(event) => event.target.value && setAdded([...added, event.target.value])}>
            <option value="">{words.addLanguage}</option>
            {free.map((code) => <option key={code} value={code}>{languageName(code)}</option>)}
          </select>
        </div>
      ) : null}
    </>
  );
}

/** 50 The rows Edit map's Styles card and the styles' page offer only when they would change something. */
function ArrangeRows({ switches }: { switches: MapSwitches }) {
  const words = useViewer((state) => state.words);
  const styleID = useViewer((state) => state.styleID);
  // 53 one way back, as Edit map offers: the removed styles first, else the style on screen
  const resets = switches.removedStyles === 0 && styleID != null && switches.editedStyles?.includes(styleID);
  const arrange = (action: ArrangeAction) => change({ kind: "arrange", action });
  return (
    <>
      {switches.layersWithoutStyle > 0 ? (
        <button type="button" className="row add" id="stylePerLayer" onClick={() => arrange("stylePerLayer")}>
          <Sym name="square.stack.3d.up" />
          <span className="words">{words.stylePerLayer}<small>{words.stylePerLayerNote}</small></span>
        </button>
      ) : null}
      {switches.removedStyles > 0 ? (
        <button type="button" className="row add" id="restoreStyles" onClick={() => arrange("restoreStyles")}>
          <Sym name="arrow.uturn.backward" />{words.restoreStyles}
        </button>
      ) : null}
      {resets ? (
        <button type="button" className="row add" id="resetStyle"
          onClick={() => change({ kind: "resetStyle", style: styleID })}>
          <Sym name="arrow.uturn.backward" />{words.resetStyle}
        </button>
      ) : null}
      {switches.differsFromDefault ? (
        <button type="button" className="row add" id="resetLayerOrder" onClick={() => arrange("reset")}>
          <Sym name="square.3.layers.3d" />{words.resetOrder}
        </button>
      ) : null}
      {switches.stylesDisagree ? (
        <div className="row" id="layerOrderDiffers">
          <Sym name="square.3.layers.3d" />
          <span className="words"><small>{words.orderDiffers}</small></span>
          <button type="button" className="text-button" id="uniteLayerOrder" onClick={() => arrange("unite")}>
            {words.unite}</button>
        </div>
      ) : null}
    </>
  );
}

export function Styles({ portable }: { portable: Portable }) {
  const words = useViewer((state) => state.words);
  const styleID = useViewer((state) => state.styleID);
  const switches = useViewer((state) => state.switches);
  const styles = portable.styles ?? [];
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <>
      <h2 className="title">{words.styles}</h2>
      <div className="list" id="styleList">
        {styles.map((style, place) => (
          <div key={style.id}>
          <div className="row" data-style={style.id}>
            <button type="button" className="icon-button" aria-label={style.name} onClick={() => pickStyle(style.id)}>
              <Sym name={style.id === styleID ? "checkmark.circle.fill" : "circle"} />
            </button>
            <div className="words">
              <CommitField type="text" value={style.name} aria-label={words.rename}
                onCommit={(name) => change({ kind: "styleName", style: style.id, name })} />
            </div>
            <button type="button" className="icon-button" aria-label={`${words.layerOptions} ${style.name}`}
              title={words.layerOptions} aria-expanded={opened === style.id}
              onClick={() => setOpened(opened === style.id ? null : style.id)}>
              <Sym name="slider.horizontal.3" /></button>
            <button type="button" className="icon-button" aria-label={`${words.moveUp} ${style.name}`}
              title={words.moveUp} disabled={place === 0} onClick={() => moveStyle(style.id, -1)}>
              <Sym name="chevron.up" /></button>
            <button type="button" className="icon-button" aria-label={`${words.moveDown} ${style.name}`}
              title={words.moveDown} disabled={place === styles.length - 1} onClick={() => moveStyle(style.id, 1)}>
              <Sym name="chevron.down" /></button>
            <button type="button" className="icon-button danger" aria-label={words.delete} title={words.delete}
              disabled={styles.length < 2} onClick={() => change({ kind: "removeStyle", style: style.id })}><Sym name="trash" /></button>
          </div>
          {opened === style.id ? <StyleOptions style={style} /> : null}
          </div>
        ))}
        <button type="button" className="row add" onClick={() => change({ kind: "addStyle", name: `${words.newStyle} ${styles.length + 1}` })}>
          <Sym name="plus.circle.fill" />{words.newStyle}
        </button>
        {switches ? <ArrangeRows switches={switches} /> : null}
      </div>
    </>
  );
}
