"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { categoriesOf } from "@/lib/category";
import { type MapsAsk, type MapsFilter, type MapsSort, type MapsView, NO_ASK, filterCounts, keepMapsView, readMapsView, shownMaps }
  from "@/lib/maps";
import { filledIn } from "@/lib/words";
import { importMap, offers, openNewMap, useViewer } from "@/store/viewer";
import { Others } from "../MapsPage";
import { Sym } from "../ui/Sym";
import { MapTile } from "./MapTile";
import { MapsTable } from "./MapsTable";

const SORTS: MapsSort[] = ["name", "changed", "size"];

/** 148 Sort as a button that opens a listbox of the three orders. */
function SortButton({ value, onPick }: { value: MapsSort; onPick: (sort: MapsSort) => void }) {
  const words = useViewer((state) => state.words);
  const [isOpen, setOpen] = useState(false);
  const names: Record<MapsSort, string> = { name: words.name, changed: words.lastChanged, size: words.size };
  return (
    <div className="sort">
      <button type="button" id="mapsSort" aria-haspopup="listbox" aria-expanded={isOpen}
        aria-label={`${words.sort}: ${names[value]}`} onClick={() => setOpen(!isOpen)}>
        <Sym name="slider.horizontal.3" />{words.sort} · {names[value]}
      </button>
      {isOpen ? (
        <ul role="listbox" aria-label={words.sort}>
          {SORTS.map((sort) => (
            <li key={sort} role="option" id={`mapsSort-${sort}`} aria-selected={sort === value}
              onClick={() => {
                onPick(sort);
                setOpen(false);
              }}>{names[sort]}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** 148 New map and Import, as the top bar and the Maps sheet have them. */
function HeaderActions() {
  const words = useViewer((state) => state.words);
  const canEdit = useViewer((state) => state.editToken != null);
  const file = useRef<HTMLInputElement>(null);
  if (!canEdit || !offers("newMap")) return null;
  const picked = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (chosen) await importMap(chosen);
  };
  return (
    <div className="maps-actions">
      <button type="button" className="tool tinted" id="mapsNew" onClick={openNewMap}><Sym name="plus" />{words.newMap}</button>
      <button type="button" className="tool" id="mapsImport" onClick={() => file.current?.click()}>
        <Sym name="square.and.arrow.down" />{words.importMap}</button>
      <input ref={file} id="mapsImportFile" type="file" accept=".mapson,application/json" hidden onChange={picked} />
    </div>
  );
}

/** 148 W17 at /maps: every map the phone shares, narrowed by the field, All / Mine / Shared with me, sort and category. */
export function MapsScreen() {
  const words = useViewer((state) => state.words);
  const maps = useViewer((state) => state.device?.maps);
  const isOpen = useViewer((state) => state.route.screen === "maps");
  const [ask, setAsk] = useState<MapsAsk>(NO_ASK);
  const [view, setView] = useState<MapsView>(readMapsView);
  if (!isOpen) return null;
  const pickView = (made: MapsView) => {
    setView(made);
    keepMapsView(made);
  };
  const all = maps ?? [];
  const counts = filterCounts(all);
  const categories = categoriesOf(all);
  const shown = shownMaps(all, ask);
  const tabs: [MapsFilter, string, number][] = [["all", words.kindAll, counts.all], ["mine", words.mapsMine, counts.mine],
    ["shared", words.mapsSharedWithMe, counts.shared]];
  const chosen = ask.category && categories.some((one) => one.toLowerCase() === ask.category?.toLowerCase())
    ? categories.find((one) => one.toLowerCase() === ask.category?.toLowerCase()) : "";
  return (
    <main id="maps" aria-labelledby="mapsTitle">
      <div className="maps-head">
        <div>
          <h1 id="mapsTitle">{words.maps}</h1>
          <p id="mapsCount">{filledIn(words.mapsCount, "count", String(all.length))}</p>
        </div>
        <HeaderActions />
      </div>
      {all.length ? (
        <div className="maps-toolbar">
          <input type="search" id="mapsFind" value={ask.text} placeholder={words.findMap} aria-label={words.findMap}
            autoComplete="off" spellCheck={false} onChange={(event) => setAsk({ ...ask, text: event.target.value })} />
          {counts.knowsRoles ? (
            <div role="tablist" className="data-tabs" aria-label={words.maps}>
              {tabs.map(([filter, name, count]) => (
                <button type="button" role="tab" key={filter} id={`mapsFilter-${filter}`} aria-selected={ask.filter === filter}
                  onClick={() => setAsk({ ...ask, filter })}>{name}<span>{count}</span></button>
              ))}
            </div>
          ) : null}
          <SortButton value={ask.sort} onPick={(sort) => setAsk({ ...ask, sort })} />
          {categories.length >= 2 ? (
            <select id="mapsCategory" aria-label={words.publishCategory} value={chosen}
              onChange={(event) => setAsk({ ...ask, category: event.target.value || null })}>
              <option value="">{words.publishCategory}</option>
              {categories.map((each) => <option key={each} value={each}>{each}</option>)}
            </select>
          ) : null}
          <div className="view-switch" role="group" aria-label={`${words.viewCards} / ${words.viewList}`}>
            {(["cards", "list"] as const).map((made) => (
              <button type="button" key={made} id={made === "cards" ? "mapsViewCards" : "mapsViewList"}
                className="tool round" aria-pressed={view === made}
                aria-label={made === "cards" ? words.viewCards : words.viewList}
                title={made === "cards" ? words.viewCards : words.viewList} onClick={() => pickView(made)}>
                <Sym name={made === "cards" ? "square.grid.2x2" : "line.3.horizontal"} />
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {shown.length && view === "list" ? <MapsTable maps={shown} /> : shown.length ? (
        <div className="maps-grid" id="mapsCards">{shown.map((each) => <MapTile key={each.id} shared={each} />)}</div>
      ) : all.length ? (
        <div className="maps-empty" id="mapsNone" role="status">
          <span>{filledIn(words.noMapNamed, "text", ask.text.trim() || (chosen || words.maps))}</span>
          <button type="button" className="pill" id="mapsClear" onClick={() => setAsk(NO_ASK)}>{words.clear}</button>
        </div>
      ) : <div className="maps-empty" id="mapsNothing">{words.nothing}</div>}
      <Others />
    </main>
  );
}
