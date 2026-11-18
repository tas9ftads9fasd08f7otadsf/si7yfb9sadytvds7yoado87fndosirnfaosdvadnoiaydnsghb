"use client";

import { type FormEvent, useEffect, useState } from "react";
import { deleteMap, loadSwitches, useViewer } from "@/store/viewer";
import { Sym } from "../ui/Sym";

/** 62 The Maps sheet's Delete, offered where the phone offers it, the map's name typed to confirm. */
export function DeleteMap({ place }: { place: "card" | "edit" }) {
  const words = useViewer((state) => state.words);
  const name = useViewer((state) => state.portable?.name);
  const canEdit = useViewer((state) => state.editToken != null);
  const reach = useViewer((state) => state.switches?.deletion);
  const hasSwitches = useViewer((state) => state.switches != null);
  const mapID = useViewer((state) => state.mapID);
  // Held by map, so another map shown starts unasked.
  const [askedFor, setAskedFor] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (canEdit && !hasSwitches) void loadSwitches();
  }, [canEdit, hasSwitches, mapID]);
  if (!canEdit || !reach || name == null) return null;
  const id = `deleteMap-${place}`;
  const ask = (map: string | null) => {
    setAskedFor(map);
    setTyped("");
  };
  if (askedFor !== mapID) {
    return (
      <button type="button" className="action danger" id={id} onClick={() => ask(mapID)}>
        <Sym name="trash" />{words.deleteMap}
      </button>
    );
  }
  const matches = typed.trim() === name;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (matches) await deleteMap(typed.trim());
  };
  const said = reach === "everyone" ? words.deleteEveryone : reach === "yourList" ? words.deleteYourList : null;
  return (
    <form className="password confirm-delete" id={`${id}-confirm`} role="alertdialog" aria-label={words.deleteMap}
      onSubmit={submit}>
      <b>{words.deleteMap}: {name}</b>
      {said ? <span className="reach">{said}</span> : null}
      <span>{words.cannotUndo}</span>
      <label htmlFor={`${id}-name`}>{words.typeNameToDelete}</label>
      <input type="text" id={`${id}-name`} autoComplete="off" spellCheck={false} placeholder={name}
        aria-label={words.typeNameToDelete} value={typed} autoFocus onChange={(event) => setTyped(event.target.value)} />
      <div className="buttons">
        <button type="button" className="action" onClick={() => ask(null)}>
          {words.cancel}
        </button>
        <button type="submit" className="action danger" id={`${id}-yes`} disabled={!matches}>
          <Sym name="trash" />{words.deleteAction}
        </button>
      </div>
    </form>
  );
}
