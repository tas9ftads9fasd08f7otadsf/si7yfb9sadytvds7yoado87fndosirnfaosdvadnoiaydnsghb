"use client";

import { Fragment } from "react";
import { groundID } from "@/lib/ground";
import type { Portable, SharedLayer, StackLayer } from "@/lib/types";
import { change, removeLayer, shownMapOf, toggleAddingPackages, toggleOptions, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { MarkTile } from "../ui/MarkTile";
import { Switch } from "../ui/Switch";
import { Sym } from "../ui/Sym";
import { OptionsPanel } from "./OptionsPanel";

interface RowProps {
  layer: StackLayer;
  listed: SharedLayer;
  isBase: boolean;
  movable: string[];
}

function LayerRow({ layer, listed, isBase, movable }: RowProps) {
  const words = useViewer((state) => state.words);
  const isHidden = useViewer((state) => state.hidden.has(layer.id));
  const sections = useViewer((state) =>
    state.layerOptions?.layers.find((each) => each.id.toUpperCase() === layer.id.toUpperCase())?.sections);
  const isOpen = useViewer((state) => state.optionsOpen.has(layer.id));
  const place = movable.indexOf(listed.id);
  const move = (by: number) => {
    const order = movable.slice();
    order.splice(place, 1);
    order.splice(place + by, 0, listed.id);
    void change({ kind: "order", layers: order });
  };
  return (
    <>
      <div className="row">
        <MarkTile symbol={layer.symbol} tint={layer.tintHex} small />
        <div className="words">
          <CommitField type="text" value={layer.name} aria-label={words.rename}
            onCommit={(name) => change({ kind: "layerName", layer: layer.id, name })} />
          <small>{listed.kind}</small>
          {isBase ? null : <CommitField type="range" min="0" max="1" step="0.05" value={String(layer.opacity ?? 1)}
            aria-label={words.opacity} title={words.opacity} onCommit={(opacity) => change({ kind: "layerOpacity", layer: layer.id, opacity })} />}
        </div>
        {sections ? (
          <button type="button" className="icon-button" aria-label={words.layerOptions} title={words.layerOptions}
            aria-expanded={isOpen} onClick={() => toggleOptions(layer.id)}>
            <Sym name={isOpen ? "chevron.down" : "slider.horizontal.3"} />
          </button>
        ) : null}
        <button type="button" className="icon-button" aria-label={words.moveUp} title={words.moveUp}
          disabled={place <= 0} onClick={() => move(-1)}><Sym name="chevron.up" /></button>
        <button type="button" className="icon-button" aria-label={words.moveDown} title={words.moveDown}
          disabled={place < 0 || place >= movable.length - 1} onClick={() => move(1)}><Sym name="chevron.down" /></button>
        <Switch isOn={!isHidden} label={layer.name} onChange={(isOn) => change({ kind: "layerShown", layer: layer.id, shown: isOn })} />
        <button type="button" className="icon-button danger" aria-label={words.deleteLayer} title={words.deleteLayer}
          onClick={() => removeLayer(layer)}><Sym name="trash" /></button>
      </div>
      {sections && isOpen ? <OptionsPanel id={layer.id} sections={sections} /> : null}
    </>
  );
}

export function Layers({ portable }: { portable: Portable }) {
  const words = useViewer((state) => state.words);
  const adding = useViewer((state) => state.addingPackages);
  const hidden = useViewer((state) => state.hidden);
  const styleName = useViewer((state) => state.portable?.styles?.find((each) => each.id === state.styleID)?.name);
  const sharedLayers = useViewer((state) => shownMapOf(state)?.layers) ?? [];
  const ground = groundID(portable.id);
  const stack = portable.stack ?? [];
  const byID = new Map(stack.map((layer) => [layer.id.toUpperCase(), layer]));
  const movable = sharedLayers.map((layer) => layer.id).filter((id) => id.toUpperCase() !== ground);
  // 3083: the list's own switch, as the app's header has; the phone keeps it to its layer cap.
  const switchable = stack.filter((layer) => layer.id.toUpperCase() !== ground);
  const allOn = switchable.length > 0 && switchable.every((layer) => !hidden.has(layer.id));
  return (
    <>
      <div className="title-row">
        <h2 className="title">{words.layers + (styleName ? ` · ${styleName}` : "")}</h2>
        <button type="button" className="text-button" id="allLayers" disabled={switchable.length === 0}
          onClick={() => change({ kind: "layersShown", shown: !allOn })}>{allOn ? words.allLayersOff : words.allLayersOn}</button>
      </div>
      <div className="list">
        {sharedLayers.map((listed) => {
          const layer = byID.get(listed.id.toUpperCase());
          if (!layer || listed.id.toUpperCase() === ground) {
            return (
              <div className="row" key={listed.id}>
                <MarkTile symbol={listed.symbol} small />
                <div className="words">{listed.name}<small>{listed.kind}</small></div>
              </div>
            );
          }
          const isBase = stack[0]?.id.toUpperCase() === listed.id.toUpperCase();
          return <Fragment key={listed.id}><LayerRow layer={layer} listed={listed} isBase={isBase} movable={movable} /></Fragment>;
        })}
        <button type="button" className="row add" id="addLayer" aria-expanded={adding} onClick={toggleAddingPackages}>
          <Sym name={adding ? "chevron.down" : "plus.circle.fill"} />{words.addLayer}
        </button>
      </div>
    </>
  );
}
