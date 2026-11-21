"use client";

import { useState } from "react";
import { CATEGORY_MOST, categoriesOf, cleanCategory } from "@/lib/category";
import type { Portable } from "@/lib/types";
import { change, offers, shownMapOf, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";

/** 142 Edit map's Category, under the note: the owner's own label, saved on blur or Enter, blank clears it. */
export function Category({ portable }: { portable: Portable }) {
  const words = useViewer((state) => state.words);
  const maps = useViewer((state) => state.device?.maps);
  const role = useViewer((state) => shownMapOf(state)?.role);
  const ownsSettings = useViewer((state) => state.switches?.ownsSettings);
  const [said, setSaid] = useState<string | null>(null);
  if (!offers("category")) return null;
  // The label is the owner's word to everyone the map is shared with, so a reader or an editor only reads it.
  const isReadOnly = ownsSettings === false || (role != null && role !== "own");
  const save = async (text: string) => {
    const category = cleanCategory(text);
    if (category === (portable.category ?? "")) {
      setSaid(null);
      return;
    }
    if (await change({ kind: "category", category }, setSaid)) setSaid(null);
  };
  return (
    <>
      <h2 className="title">{words.publishCategory}</h2>
      <div className="card" id="categoryCard">
        <div className="field">
          <CommitField type="text" id="category" value={portable.category ?? ""} aria-label={words.publishCategory}
            maxLength={CATEGORY_MOST} placeholder={words.noneCategory} list="categoryList" autoComplete="off"
            disabled={isReadOnly} aria-invalid={said != null} aria-describedby={said ? "categorySaid" : undefined}
            onCommit={save} />
          <datalist id="categoryList">
            {categoriesOf(maps ?? []).map((each) => <option key={each} value={each} />)}
          </datalist>
          {said ? <small className="warning" role="alert" id="categorySaid">{said}</small> : null}
        </div>
      </div>
    </>
  );
}
