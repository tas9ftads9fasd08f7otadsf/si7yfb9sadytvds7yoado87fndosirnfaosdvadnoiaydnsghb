"use client";

import { ALL_SAVED, KIND_SYMBOL, type SavedKindFilter, UNFILED, isCut, savedDate, savedLine, shownSaved }
  from "@/lib/saved";
import type { SavedRow } from "@/lib/types";
import { filledIn } from "@/lib/words";
import { openSaved, setSavedFilter, useViewer } from "@/store/viewer";
import { MarkTile } from "./ui/MarkTile";

const KINDS: SavedKindFilter[] = ["all", "point", "line", "area"];

function SavedLine({ row, line, isOpen }: { row: SavedRow; line: string; isOpen: boolean }) {
  return (
    <button type="button" className={isOpen ? "row hit picked" : "row hit"} data-saved={row.id}
      aria-current={isOpen || undefined} onClick={() => openSaved(row)}>
      <MarkTile symbol={row.symbol || KIND_SYMBOL[row.kind]} tint={row.ink} small />
      <span className="words">{row.name}<small>{line}</small></span>
      <small className="distance">{savedDate(row.savedAt)}</small>
    </button>
  );
}

/** 135 The phone's saved places, read only: a field, kind chips and a folder picker over the rows. */
export function SavedPage() {
  const words = useViewer((state) => state.words);
  const saved = useViewer((state) => state.saved);
  const filter = useViewer((state) => state.savedFilter);
  const openID = useViewer((state) => (state.route.screen === "saved" ? state.route.id : undefined));
  if (!saved) return <div id="savedPage"><div className="group-title"><span>{words.savedTitle}</span></div></div>;
  const rows = shownSaved(saved.features, filter);
  const kindWords: Record<SavedKindFilter, string> = { all: words.kindAll, point: words.kindPoints,
    line: words.kindLines, area: words.kindAreas };
  const count = isCut(saved) ? filledIn(filledIn(words.showingOf, "shown", String(saved.features.length)), "total",
    String(saved.total)) : filledIn(words.savedCount, "count", String(rows.length));
  return (
    <div id="savedPage">
      <div className="group-title split"><span>{words.savedTitle}</span><span className="count" id="savedCount">{count}</span></div>
      {saved.features.length === 0 ? (
        <div className="empty" id="savedEmpty"><b>{words.nothingSavedYet}</b><br />{words.tapAnyPlace}</div>
      ) : (
        <>
          <label className="field saved-search">
            <input type="search" id="savedSearch" value={filter.text} placeholder={words.searchSaved}
              aria-label={words.searchSaved} autoComplete="off" spellCheck={false}
              onChange={(event) => setSavedFilter({ text: event.target.value })} />
          </label>
          <div className="chips" id="savedKinds">
            {KINDS.map((kind) => (
              <button type="button" key={kind} className={filter.kind === kind ? "picked" : undefined}
                aria-pressed={filter.kind === kind} onClick={() => setSavedFilter({ kind })}>{kindWords[kind]}</button>
            ))}
          </div>
          <label className="field saved-folder">
            <select id="savedFolder" value={filter.folder} aria-label={words.folder}
              onChange={(event) => setSavedFilter({ folder: event.target.value })}>
              <option value={ALL_SAVED}>{words.allSaved}</option>
              <option value={UNFILED}>{words.unfiledSaved}</option>
              {saved.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </label>
          {rows.length === 0 ? <div className="empty" id="savedNone">{words.nothingMatches}</div> : (
            <div className="group" role="list" aria-label={words.savedTitle}>
              {rows.map((row) => (
                <SavedLine key={row.id} row={row} line={savedLine(row, saved.folders)} isOpen={row.id === openID} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
