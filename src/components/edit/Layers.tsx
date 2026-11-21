"use client";

import { type DragEvent, Fragment } from "react";
import { groundID } from "@/lib/ground";
import { movedPast, originGroups, type OriginGroup } from "@/lib/origins";
import { heldSize } from "@/lib/size";
import type { Portable, SharedLayer, StackLayer } from "@/lib/types";
import { filledIn } from "@/lib/words";
import { change, groupByOrigin, offers, removeLayer, shownMapOf, toggleAddingPackages, toggleOptions, toggleOrigin,
  useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { MarkTile } from "../ui/MarkTile";
import { Switch } from "../ui/Switch";
import { Sym } from "../ui/Sym";
import { OptionsPanel } from "./OptionsPanel";

/** 141 The kind, and beside it what the phone holds of the layer where it sent a size. */
const kindLine = (listed: SharedLayer) => [listed.kind, heldSize(listed.bytes)].filter(Boolean).join(" \u00B7 ");

interface RowProps {
  layer: StackLayer;
  listed: SharedLayer;
  isBase: boolean;
  movable: string[];
  /** 58 The rows it moves among: its group's while grouped, else every movable one. */
  peers: string[];
}

function LayerRow({ layer, listed, isBase, movable, peers }: RowProps) {
  const words = useViewer((state) => state.words);
  const isHidden = useViewer((state) => state.hidden.has(layer.id));
  const sections = useViewer((state) =>
    state.layerOptions?.layers.find((each) => each.id.toUpperCase() === layer.id.toUpperCase())?.sections);
  const isOpen = useViewer((state) => state.optionsOpen.has(layer.id));
  const isUndrawn = useViewer((state) => state.undrawn.has(layer.id.toLowerCase()));
  const place = peers.indexOf(listed.id);
  const move = (order: string[]) => void change({ kind: "order", layers: order });
  const moveBy = (by: -1 | 1) => move(movedPast(movable, peers, listed.id, by));
  // 94 the design's handle: a row dropped on another takes its place, as Move up and down step it
  const dropped = (event: DragEvent) => {
    event.preventDefault();
    const from = event.dataTransfer.getData("text/x-riki-layer");
    const fromPlace = peers.indexOf(from);
    if (fromPlace < 0 || from === listed.id) return;
    let order = movable;
    let among = peers;
    const steps = place - fromPlace;
    for (let step = 0; step < Math.abs(steps); step += 1) {
      order = movedPast(order, among, from, steps > 0 ? 1 : -1);
      among = movedPast(among, among, from, steps > 0 ? 1 : -1);
    }
    move(order);
  };
  return (
    <div className={isOpen ? "layer-item open" : "layer-item"} data-layer={layer.id}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("text/x-riki-layer")) event.preventDefault();
      }} onDrop={dropped}>
      <div className="row">
        <span className="handle" draggable={peers.length > 1} title={words.moveUp + " / " + words.moveDown}
          onDragStart={(event) => {
            event.dataTransfer.setData("text/x-riki-layer", listed.id);
            event.dataTransfer.effectAllowed = "move";
          }}><Sym name="line.3.horizontal" /></span>
        <MarkTile symbol={layer.symbol} tint={layer.tintHex} small />
        <div className="words">
          <CommitField type="text" value={layer.name} aria-label={words.rename}
            onCommit={(name) => change({ kind: "layerName", layer: layer.id, name })} />
          <small>{kindLine(listed)}</small>
          {isUndrawn ? <small className="undrawn">{words.layerUndrawn}</small> : null}
        </div>
        <Switch isOn={!isHidden} label={layer.name} onChange={(isOn) => change({ kind: "layerShown", layer: layer.id, shown: isOn })} />
        <button type="button" className="icon-button settings" aria-label={`${words.layerOptions} ${layer.name}`}
          title={words.layerOptions} aria-expanded={isOpen} onClick={() => toggleOptions(layer.id)}>
          <Sym name={isOpen ? "chevron.down" : "chevron.forward"} />
        </button>
      </div>
      {isOpen ? (
        <div className="layer-settings">
          {isBase ? null : (
            <label className="opacity"><span>{words.opacity}</span>
              <CommitField type="range" min="0" max="1" step="0.05" value={String(layer.opacity ?? 1)}
                aria-label={words.opacity} onCommit={(opacity) => change({ kind: "layerOpacity", layer: layer.id, opacity })} />
            </label>
          )}
          <div className="buttons">
            <button type="button" className="pill" aria-label={words.moveUp} disabled={place <= 0}
              onClick={() => moveBy(-1)}><Sym name="chevron.up" />{words.moveUp}</button>
            <button type="button" className="pill" aria-label={words.moveDown}
              disabled={place < 0 || place >= peers.length - 1} onClick={() => moveBy(1)}>
              <Sym name="chevron.down" />{words.moveDown}</button>
            <button type="button" className="pill danger" aria-label={words.deleteLayer}
              onClick={() => removeLayer(layer)}><Sym name="trash" />{words.deleteLayer}</button>
          </div>
          {sections ? <OptionsPanel id={layer.id} sections={sections} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** 58 A source's header, folding its layers open as Edit map's group header does. */
function OriginHeader({ group, isOpen }: { group: OriginGroup; isOpen: boolean }) {
  const words = useViewer((state) => state.words);
  const hidden = useViewer((state) => state.hidden);
  const on = group.layers.filter((layer) => !hidden.has(layer.id)).length;
  const count = filledIn(filledIn(words.groupLayersOn, "on", String(on)), "count", String(group.layers.length));
  return (
    <button type="button" className="row origin" data-origin={group.origin.key} aria-expanded={isOpen}
      onClick={() => toggleOrigin(group.origin.key)}>
      <Sym name={isOpen ? "chevron.down" : "chevron.forward"} />
      <MarkTile symbol={group.origin.symbol} small />
      <span className="words">{group.origin.title}</span>
      <small>{count}</small>
    </button>
  );
}

export function Layers({ portable }: { portable: Portable }) {
  const words = useViewer((state) => state.words);
  const adding = useViewer((state) => state.addingPackages);
  const hidden = useViewer((state) => state.hidden);
  const grouping = useViewer((state) => state.switches);
  const originsOpen = useViewer((state) => state.originsOpen);
  const sharedLayers = useViewer((state) => shownMapOf(state)?.layers) ?? [];
  const ground = groundID(portable.id);
  const stack = portable.stack ?? [];
  const byID = new Map(stack.map((layer) => [layer.id.toUpperCase(), layer]));
  const movable = sharedLayers.map((layer) => layer.id).filter((id) => id.toUpperCase() !== ground);
  // 3083: the list's own switch, as the app's header has; the phone keeps it to its layer cap.
  const switchable = stack.filter((layer) => layer.id.toUpperCase() !== ground);
  const allOn = switchable.length > 0 && switchable.every((layer) => !hidden.has(layer.id));
  const row = (listed: SharedLayer, peers: string[]) => {
    const layer = byID.get(listed.id.toUpperCase());
    if (!layer || listed.id.toUpperCase() === ground) {
      return (
        <div className="row" key={listed.id}>
          <MarkTile symbol={listed.symbol} small />
          <div className="words">{listed.name}<small>{kindLine(listed)}</small></div>
        </div>
      );
    }
    const isBase = stack[0]?.id.toUpperCase() === listed.id.toUpperCase();
    return (
      <Fragment key={listed.id}>
        <LayerRow layer={layer} listed={listed} isBase={isBase} movable={movable} peers={peers} />
      </Fragment>
    );
  };
  return (
    <>
      <div className="title-row">
        <h2 className="title">{`${words.layers} · ${words.dragToOrder}`}
          <span className="count">{switchable.length}</span></h2>
        <button type="button" className="text-button" id="allLayers" disabled={switchable.length === 0}
          onClick={() => change({ kind: "layersShown", shown: !allOn })}>{allOn ? words.allLayersOff : words.allLayersOn}</button>
      </div>
      <div className="list">
        {grouping?.groupingOffered ? (
          <div className="row" id="groupBySource">
            <div className="words">{words.groupBySource}</div>
            <Switch isOn={grouping.groupsByOrigin} label={words.groupBySource} onChange={(groups) => void groupByOrigin(groups)} />
          </div>
        ) : null}
        {grouping?.groupsByOrigin ? originGroups(sharedLayers).map((group) => {
          const isOpen = originsOpen.has(group.origin.key);
          const peers = group.layers.map((layer) => layer.id).filter((id) => movable.includes(id));
          return (
            <Fragment key={group.origin.key}>
              <OriginHeader group={group} isOpen={isOpen} />
              {isOpen ? group.layers.map((listed) => row(listed, peers)) : null}
            </Fragment>
          );
        }) : sharedLayers.map((listed) => row(listed, movable))}
        {offers("addLayer") ? (
          <button type="button" className="row add" id="addLayer" aria-expanded={adding} onClick={toggleAddingPackages}>
            <Sym name={adding ? "chevron.down" : "plus.circle.fill"} />{words.addLayer}
          </button>
        ) : null}
      </div>
    </>
  );
}
