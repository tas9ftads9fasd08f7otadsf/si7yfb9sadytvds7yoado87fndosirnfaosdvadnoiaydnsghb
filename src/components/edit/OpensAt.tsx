"use client";

import { useEffect, useRef, useState } from "react";
import { BY_NAME, START_KINDS, samePlace } from "@/lib/places";
import type { FoundPlace, Portable, Start } from "@/lib/types";
import { change, lookForPlaces, pickPlace, pickStartKind, takeMapCentre, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { Sym } from "../ui/Sym";

const coordinatesOf = (start: Start) => ({ startLatitude: start.latitude?.toFixed(5) ?? "",
  startLongitude: start.longitude?.toFixed(5) ?? "", startZoom: start.zoom?.toFixed(1) ?? "" });

function Coordinates({ start }: { start: Start }) {
  const words = useViewer((state) => state.words);
  const shown = coordinatesOf(start);
  const typed = useRef(shown);
  const [wrong, setWrong] = useState<Record<string, boolean>>({});
  useEffect(() => {
    typed.current = coordinatesOf(start);
  }, [start]);
  const commit = (id: keyof typeof shown, text: string) => {
    typed.current = { ...typed.current, [id]: text.trim().replace(",", ".") };
    const { startLatitude: lat, startLongitude: lon, startZoom: zoom } = typed.current;
    const fits = { startLatitude: lat !== "" && Math.abs(Number(lat)) <= 90,
      startLongitude: lon !== "" && Math.abs(Number(lon)) <= 180,
      startZoom: zoom === "" || Number.isFinite(Number(zoom)) };
    setWrong({ startLatitude: !fits.startLatitude, startLongitude: !fits.startLongitude, startZoom: !fits.startZoom });
    if (Object.values(fits).every(Boolean)) void change({ start: "coordinates", lat, lon, zoom });
  };
  const fields = [["startLatitude", words.latitude], ["startLongitude", words.longitude], ["startZoom", words.zoomWord]] as const;
  return (
    <>
      {fields.map(([id, label]) => (
        <div className="field" key={id}>
          <label htmlFor={id}>{label}</label>
          <CommitField type="text" id={id} inputMode="decimal" autoComplete="off" spellCheck={false} value={shown[id]}
            aria-invalid={wrong[id] ?? undefined} onCommit={(text) => commit(id, text)} />
        </div>
      ))}
      <div className="field">
        <button type="button" className="action" id="useCentre" onClick={takeMapCentre}><Sym name="scope" />{words.useCentre}</button>
      </div>
    </>
  );
}

function PlaceRow({ place, current }: { place: FoundPlace; current: Start | null }) {
  const isPicked = current != null && samePlace(place.start, current);
  return (
    <button type="button" className={isPicked ? "row picked" : "row"} aria-pressed={isPicked} onClick={() => pickPlace(place.start)}>
      <span className="words">{place.title}{place.detail ? <small>{place.detail}</small> : null}</span>
      <Sym name={isPicked ? "checkmark.circle.fill" : "circle"} />
    </button>
  );
}

/** The phone lists regions and countries; its search finds states and cities. */
function Places({ kind, current }: { kind: string; current: Start | null }) {
  const words = useViewer((state) => state.words);
  const startFound = useViewer((state) => state.startFound);
  const [typed, setTyped] = useState("");
  const isListed = kind === "region" || kind === "country";
  useEffect(() => {
    if (isListed && !startFound) void lookForPlaces(kind, "");
  }, [isListed, kind, startFound]);
  const wanted = typed.trim().toLowerCase();
  const found = (startFound ?? []).filter((place) => !isListed || !wanted
    || place.title.toLowerCase().includes(wanted) || (place.start.country ?? "").toLowerCase() === wanted);
  if (current && !found.some((place) => samePlace(place.start, current))) {
    found.unshift({ start: current, title: current.name || current.region || current.country || "", detail: null });
  }
  return (
    <>
      <div className="field">
        <input type="search" id="startSearch" autoComplete="off" spellCheck={false} placeholder={words[`search.${kind}`]}
          aria-label={words[`search.${kind}`]} value={typed} onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (!isListed && event.key === "Enter" && typed.trim()) void lookForPlaces(kind, typed.trim());
          }} />
      </div>
      <div className="list places" id="startPlaces">
        {found.map((place, index) => <PlaceRow key={index} place={place} current={current} />)}
      </div>
      {isListed ? null : <div className="field foot-note">{words.foundAppleMaps}</div>}
    </>
  );
}

/** Where the map opens, as Edit map's Opens at page sets it. */
export function OpensAt({ portable }: { portable: Portable }) {
  const words = useViewer((state) => state.words);
  const startKind = useViewer((state) => state.startKind);
  const start = portable.start ?? null;
  const kind = startKind || start?.kind || "none";
  return (
    <>
      <h2 className="title">{words.opensAt}</h2>
      <div className="card" id="opensAt">
        <div className="field">
          <label htmlFor="startKind">{words.opensAt}</label>
          <select id="startKind" aria-label={words.opensAt} value={kind} onChange={(event) => pickStartKind(event.target.value)}>
            <option value="none">{words.whereLeft}</option>
            {START_KINDS.map((each) => <option key={each} value={each}>{words[`start.${each}`]}</option>)}
          </select>
        </div>
        {start?.kind === "location" ? <div className="field foot-note">{words.locationNote}</div> : null}
        {kind === "coordinates" && start?.kind === "coordinates" ? <Coordinates start={start} /> : null}
        {BY_NAME.includes(kind) ? <Places key={kind} kind={kind} current={start?.kind === kind ? start : null} /> : null}
      </div>
      <div className="foot-note">{words.opensNote}</div>
    </>
  );
}
