"use client";

import type { ArrangeAction } from "@/lib/edit";
import type { MapSwitches, Portable } from "@/lib/types";
import { change, moveStyle, pickStyle, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { Sym } from "../ui/Sym";

/** 50 The rows Edit map's Styles card and the styles' page offer only when they would change something. */
function ArrangeRows({ switches }: { switches: MapSwitches }) {
  const words = useViewer((state) => state.words);
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
  return (
    <>
      <h2 className="title">{words.styles}</h2>
      <div className="list" id="styleList">
        {styles.map((style, place) => (
          <div className="row" key={style.id} data-style={style.id}>
            <button type="button" className="icon-button" aria-label={style.name} onClick={() => pickStyle(style.id)}>
              <Sym name={style.id === styleID ? "checkmark.circle.fill" : "circle"} />
            </button>
            <div className="words">
              <CommitField type="text" value={style.name} aria-label={words.rename}
                onCommit={(name) => change({ kind: "styleName", style: style.id, name })} />
            </div>
            <button type="button" className="icon-button" aria-label={`${words.moveUp} ${style.name}`}
              title={words.moveUp} disabled={place === 0} onClick={() => moveStyle(style.id, -1)}>
              <Sym name="chevron.up" /></button>
            <button type="button" className="icon-button" aria-label={`${words.moveDown} ${style.name}`}
              title={words.moveDown} disabled={place === styles.length - 1} onClick={() => moveStyle(style.id, 1)}>
              <Sym name="chevron.down" /></button>
            <button type="button" className="icon-button danger" aria-label={words.delete} title={words.delete}
              disabled={styles.length < 2} onClick={() => change({ kind: "removeStyle", style: style.id })}><Sym name="trash" /></button>
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
