"use client";

import { type FormEvent, useEffect, useState } from "react";
import { backend } from "@backend";
import { sharingLine } from "@/lib/maps";
import type { SharedMap } from "@/lib/types";
import { isOlder } from "@/lib/version";
import { filledIn } from "@/lib/words";
import { deleteMap, duplicateMap, editing, exportMap, offers, useViewer } from "@/store/viewer";
import { HeldPill, OfflinePill, StyleChips } from "../MapPills";
import { MapMark, useLayerCount, useStyleCount } from "../MapShelf";
import { Link } from "../ui/Link";
import { MarkTile } from "../ui/MarkTile";
import { Sym } from "../ui/Sym";

/** How many style chips a card draws before "+N". */
export const MOST_CHIPS = 3;

/** 148 The oldest app and viewer the map's author allows, in the ochre line the design gives it. */
function NeedsLine({ shared }: { shared: SharedMap }) {
  const words = useViewer((state) => state.words);
  const serving = useViewer((state) => state.device?.appVersion);
  const minimum = shared.minimumVersion;
  if (!minimum?.app && !minimum?.browser) return null;
  const said = (sentence: string, version: string) => filledIn(sentence, "version", version);
  return (
    <div className="needs" data-needs>
      {minimum.app ? <span>{said(words.needsApp, minimum.app)}</span> : null}
      {minimum.browser ? <span className={isOlder(serving, minimum.browser) ? "warning" : undefined}>
        {said(words.needsViewer, minimum.browser)}</span> : null}
    </div>
  );
}

/** 148 A map's styles as chips, three and then "+N", each a link to its own address. */
function Chips({ shared }: { shared: SharedMap }) {
  const more = (shared.styles?.length ?? 0) - MOST_CHIPS;
  return (
    <div className="chip-row">
      <StyleChips shared={{ ...shared, styles: shared.styles?.slice(0, MOST_CHIPS),
        styleIDs: shared.styleIDs?.slice(0, MOST_CHIPS) }} />
      {more > 0 ? <span className="style-chip more-chip">+{more}</span> : null}
    </div>
  );
}

/** 148 What the phone says Delete does, asked when More opens: none where it offers no Delete. */
function useReach(id: string, isOpen: boolean) {
  const [reach, setReach] = useState<"onlyYou" | "everyone" | "yourList" | null>(null);
  useEffect(() => {
    if (!isOpen || reach) return;
    let isCurrent = true;
    void editing(() => backend.switches(id), { quiet: true }).then((answer) => {
      if (isCurrent && answer?.ok) setReach(answer.value.deletion ?? null);
    });
    return () => {
      isCurrent = false;
    };
  }, [id, isOpen, reach]);
  return reach;
}

function DeleteAsk({ shared, reach, onClose }:
  { shared: SharedMap; reach: "onlyYou" | "everyone" | "yourList"; onClose: () => void }) {
  const words = useViewer((state) => state.words);
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === shared.name;
  const said = reach === "everyone" ? words.deleteEveryone : reach === "yourList" ? words.deleteYourList : null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (matches && (await deleteMap(typed.trim(), shared.id))) onClose();
  };
  return (
    <form className="confirm-delete" data-delete-ask role="alertdialog" aria-label={words.deleteMap} onSubmit={submit}>
      <b>{words.deleteMap}: {shared.name}</b>
      {said ? <span className="reach">{said}</span> : null}
      <span>{words.cannotUndo}</span>
      <input type="text" autoComplete="off" spellCheck={false} placeholder={shared.name} autoFocus
        aria-label={words.typeNameToDelete} value={typed} onChange={(event) => setTyped(event.target.value)} />
      <div className="buttons">
        <button type="button" className="action" onClick={onClose}>{words.cancel}</button>
        <button type="submit" className="action danger" data-delete-yes disabled={!matches}>
          <Sym name="trash" />{words.deleteAction}</button>
      </div>
    </form>
  );
}

/** 148 More: Duplicate and Delete of this map, through the calls Edit map makes. */
function More({ shared }: { shared: SharedMap }) {
  const words = useViewer((state) => state.words);
  const [isOpen, setOpen] = useState(false);
  const [isAsking, setAsking] = useState(false);
  const reach = useReach(shared.id, isOpen);
  const mayDuplicate = offers("duplicateMap") && shared.role !== "view";
  return (
    <span className="more">
      <button type="button" className="pill" data-more aria-expanded={isOpen}
        onClick={() => setOpen(!isOpen)}>{words.more}</button>
      {isOpen ? (
        <span className="menu" role="menu">
          {mayDuplicate ? (
            <button type="button" role="menuitem" data-duplicate onClick={() => void duplicateMap(shared.id)}>
              <Sym name="plus.square.on.square" />{words.duplicateMap}</button>
          ) : null}
          {reach ? (
            <button type="button" role="menuitem" data-delete onClick={() => setAsking(true)}>
              <Sym name="trash" />{words.deleteMap}</button>
          ) : null}
        </span>
      ) : null}
      {isAsking && reach ? <DeleteAsk shared={shared} reach={reach} onClose={() => setAsking(false)} /> : null}
    </span>
  );
}

/** 148 W17's card for one map: its preview, counts, styles, who has it, what the phone holds, and its actions. */
export function MapTile({ shared }: { shared: SharedMap }) {
  const words = useViewer((state) => state.words);
  const preview = useViewer((state) => state.pictures.get(shared.id)?.preview);
  const isShown = useViewer((state) => state.mapID === shared.id);
  const canEdit = useViewer((state) => state.editToken != null);
  const layerCount = useLayerCount();
  const styleCount = useStyleCount();
  const styles = shared.styles?.length ?? 0;
  const counts = styles ? `${styleCount(styles)} · ${layerCount(shared.layers.length)}` : layerCount(shared.layers.length);
  const sharing = sharingLine(shared, words);
  const note = shared.note?.split("\n")[0]?.trim();
  // A map shared to look at is not this phone's to change.
  const mayEdit = canEdit && shared.role !== "view";
  const to = { screen: "map", map: shared.id } as const;
  return (
    <article className="map-tile" data-map={shared.id}>
      <Link to={to} className="tile-preview" title={shared.name}>
        <span className="picture" style={preview ? { backgroundImage: `url("${preview}")` } : undefined}>
          {preview ? null : <MarkTile symbol={shared.symbol} tint={shared.iconTintHex} />}
        </span>
        {isShown ? <span className="glass" data-on-map>{words.onMapNow}</span> : null}
      </Link>
      <div className="tile-body">
        <div className="tile-head">
          <MapMark shared={shared} />
          <div className="words">
            <Link to={to} className="tile-name">{shared.name}</Link>
            <span className="muted">{counts}</span>
            {note ? <span className="muted note">{note}</span> : null}
          </div>
          {shared.isLocked ? <span className="lock" title={words.privacy}><Sym name="lock" /></span> : null}
        </div>
        {shared.category ? <span className="pill-tag plain" data-category>{shared.category}</span> : null}
        <Chips shared={shared} />
        <div className="pills">
          {sharing ? <span className="pill-tag plain" data-sharing>{sharing}</span> : null}
          <OfflinePill shared={shared} />
          <HeldPill shared={shared} />
        </div>
        <NeedsLine shared={shared} />
      </div>
      <div className="tile-foot">
        <Link to={to} className="pill open">{words.open}</Link>
        {mayEdit ? (
          <Link to={{ screen: "edit", map: shared.id, tab: "layers" }} className="pill edit">{words.edit}</Link>
        ) : null}
        {canEdit && offers("exportMap") ? (
          <button type="button" className="pill" data-export onClick={() => void exportMap(shared.id)}>
            {words.export}</button>
        ) : null}
        {canEdit ? <More shared={shared} /> : null}
      </div>
    </article>
  );
}
