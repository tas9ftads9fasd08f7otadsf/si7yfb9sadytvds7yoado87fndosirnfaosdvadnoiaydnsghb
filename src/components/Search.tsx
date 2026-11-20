"use client";

import { useEffect, useRef, useState } from "react";
import { distanceText } from "@/lib/search";
import { filledIn } from "@/lib/words";
import { mapControl } from "@/map/control";
import { openFound, openHit, search, useViewer } from "@/store/viewer";
import { MarkTile } from "./ui/MarkTile";
import { Sym } from "./ui/Sym";

/** 100 The top bar's search; ⌘K or Ctrl+K comes here, Escape clears it. */
export function SearchField() {
  const words = useViewer((state) => state.words);
  const routed = useViewer((state) => (state.route.screen === "search" ? state.route.text : ""));
  const hasMap = useViewer((state) => state.mapID != null);
  const [typed, setTyped] = useState(routed);
  const field = useRef<HTMLInputElement>(null);
  const wait = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        field.current?.focus();
        field.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  if (!hasMap) return <div className="middle" />;
  const run = (text: string) => {
    clearTimeout(wait.current);
    wait.current = setTimeout(() => search(text), 200);
  };
  return (
    <label id="searchBox" className="middle">
      <Sym name="magnifyingglass" />
      <input type="search" id="search" value={typed} placeholder={words.searchPlaceholder} autoComplete="off"
        spellCheck={false} aria-label={words.searchPlaceholder}
        onChange={(event) => {
          setTyped(event.target.value);
          run(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            clearTimeout(wait.current);
            search(typed);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setTyped("");
            search("");
            field.current?.blur();
          }
        }} ref={field} />
      <kbd aria-hidden="true">⌘K</kbd>
    </label>
  );
}

/** 100 W2's results in the side bar: the map's own names, then the places the phone found. */
export function SearchResults() {
  const words = useViewer((state) => state.words);
  const text = useViewer((state) => (state.route.screen === "search" ? state.route.text : ""));
  const hits = useViewer((state) => state.nameHits);
  const places = useViewer((state) => state.foundPlaces);
  const picked = useViewer((state) => state.place);
  const ready = useViewer((state) => !state.mapBusy && state.portable != null);
  useEffect(() => {
    if (hits == null && text && ready) search(text);
  }, [hits, text, ready]);
  const centre = mapControl()?.camera();
  return (
    <div id="searchResults">
      <div className="group-title split">
        <span>{filledIn(words.resultsFor, "text", text)}</span>
        <span className="count">{hits?.length ?? ""}</span>
      </div>
      {hits?.length ? (
        <div className="group" role="group" aria-label={words.inMapData}>
          {hits.map((hit, index) => {
            const isOpen = picked?.lng === hit.lng && picked.lat === hit.lat;
            return (
              <button type="button" className={isOpen ? "row hit picked" : "row hit"} key={index}
                aria-current={isOpen || undefined} onClick={() => openHit(hit)}>
                <span className="tile"><Sym name="mappin" /></span>
                <span className="words">{hit.name}<small>{hit.layer}</small></span>
                {centre ? <small className="distance">{distanceText(centre, hit)}</small> : null}
              </button>
            );
          })}
        </div>
      ) : hits ? <div className="empty">{words.noResults}</div> : null}
      {places?.length ? (
        <>
          <span className="group-title">{words.placesFound}</span>
          <div className="group" role="group" aria-label={words.placesFound}>
            {places.map((place, index) => (
              <button type="button" className="row hit" key={index} onClick={() => openFound(place)}>
                <MarkTile symbol="building.2" small />
                <span className="words">{place.title}<small>{place.detail ?? ""}</small></span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
