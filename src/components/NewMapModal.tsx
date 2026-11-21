"use client";

import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { filledIn, listed } from "@/lib/words";
import { change, closeModal, duplicateMap, importMap, makeMap, offers, shownMapOf, showEdit, useViewer } from "@/store/viewer";
import { MarkTile } from "./ui/MarkTile";
import { Modal } from "./ui/Modal";
import { Sym } from "./ui/Sym";
import { ground } from "./ui/ground";

type Start = "empty" | "copy" | "file";

/** 97 The design's W10: New map over the map, its name, colour and what it starts from. */
export function NewMapModal() {
  const words = useViewer((state) => state.words);
  const route = useViewer((state) => state.route);
  const shown = useViewer(shownMapOf);
  const [name, setName] = useState("");
  const [tint, setTint] = useState<string | null>(null);
  const [start, setStart] = useState<Start>("empty");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const isOpen = route.modal?.kind === "new";
  useEffect(() => {
    if (isOpen) field.current?.focus();
  }, [isOpen]);
  if (!isOpen) return null;
  const close = closeModal;
  const tints = listed(words.iconTints);
  const starts: { id: Start; symbol: string; title: string; note: string }[] = [
    { id: "empty", symbol: "plus", title: words.emptyMap, note: words.emptyMapNote },
    ...(shown && offers("duplicateMap")
      ? [{ id: "copy" as const, symbol: "plus.square.on.square", title: filledIn(words.copyOf, "map", shown.name),
        note: words.copyOfNote }] : []),
    { id: "file", symbol: "square.and.arrow.down", title: words.importMap, note: words.importMapNote }];
  const ready = start === "file" || start === "copy" || name.trim() !== "";
  const create = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!ready || busy) return;
    if (start === "file") return file.current?.click();
    setBusy(true);
    const made = start === "copy" ? await duplicateMap() : await makeMap(name.trim());
    if (made && start === "copy" && name.trim()) await change({ kind: "name", name: name.trim() });
    if (made && tint) await change({ kind: "iconTint", tint });
    setBusy(false);
    if (made) showEdit(true);
  };
  const picked = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (chosen && await importMap(chosen)) showEdit(true);
  };
  return (
    <Modal labelledBy="newMapTitle" onClose={close}>
      <form id="newMapDialog" className="modal" onSubmit={create}>
        <div className="modal-head">
          <h1 id="newMapTitle">{words.newMap}</h1>
          <button type="button" className="tool round" aria-label={words.close} onClick={close}><Sym name="xmark" /></button>
        </div>
        <div className="name-line">
          <MarkTile symbol="map" tint={tint} />
          <label>{words.name}
            <input ref={field} id="newMapName" value={name} maxLength={200} placeholder={words.newMapPlaceholder}
              onChange={(event) => setName(event.target.value)} />
          </label>
        </div>
        {tints.length ? (
          <div className="tints" role="group" aria-label={words.background}>
            {tints.map((hex) => (
              <button type="button" key={hex} aria-label={hex} aria-pressed={hex === tint} style={ground(hex)}
                onClick={() => setTint(hex === tint ? null : hex)} />
            ))}
          </div>
        ) : null}
        <div className="starts" role="group" aria-label={words.startFrom}>
          <span className="group-title">{words.startFrom}</span>
          <div className="grid">
            {starts.map((each) => (
              <button type="button" key={each.id} aria-pressed={start === each.id} onClick={() => setStart(each.id)}>
                <span className="tile"><Sym name={each.symbol} /></span><b>{each.title}</b><small>{each.note}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="secondary" onClick={close}>{words.cancel}</button>
          <button type="submit" className="primary" id="newMapSave" disabled={!ready || busy}>{words.createAndEdit}</button>
        </div>
        <input ref={file} type="file" accept=".mapson,application/json" hidden onChange={picked} />
      </form>
    </Modal>
  );
}
