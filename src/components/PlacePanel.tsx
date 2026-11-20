"use client";

import { featureTitle } from "@/lib/feature";
import { savedDate, savedLine } from "@/lib/saved";
import type { SavedRow } from "@/lib/types";
import { copyText, showPlace, useViewer } from "@/store/viewer";
import { FeatureCard } from "./FeatureCard";
import { Sym } from "./ui/Sym";

const coordinateText = (lat: number, lng: number) =>
  `${Math.abs(lat).toFixed(5)} ${lat < 0 ? "S" : "N"}, ${Math.abs(lng).toFixed(5)} ${lng < 0 ? "W" : "E"}`;

/** 135 What the phone saved of a place: its note, the map and layer it came from, and when. */
function SavedBody({ row }: { row: SavedRow }) {
  const words = useViewer((state) => state.words);
  const rows: [string, string][] = [];
  if (row.mapName) rows.push([words.map, row.mapName]);
  if (row.layerName) rows.push([words.fromLayer, row.layerName]);
  const date = savedDate(row.savedAt);
  if (date) rows.push([words.savedTitle, date]);
  return (
    <div className="feature" id="savedPlace">
      {row.note ? <p className="feature-note"><small>{words.note}</small>{row.note}</p> : null}
      <dl>{rows.flatMap(([key, value]) => [<dt key={`${key}-k`}>{key}</dt>, <dd key={key}>{value}</dd>])}</dl>
    </div>
  );
}

/** 100 W2's place panel beside the map: what a tap or a search found, with its place and its layer. */
export function PlacePanel() {
  const words = useViewer((state) => state.words);
  const place = useViewer((state) => state.place);
  const editing = useViewer((state) => state.editing
    || ["details", "data", "settings"].includes(state.route.screen));
  const savedFolders = useViewer((state) => state.saved?.folders);
  if (!place || editing) return null;
  const [first] = place.found;
  const saved = place.saved;
  const title = saved?.name || first?.details?.title || first?.title || featureTitle(first?.properties ?? {});
  const coordinates = coordinateText(place.lat, place.lng);
  const layers = [...new Set(place.found.map((each) => each.layer).filter(Boolean))].join(" · ");
  return (
    <section id="placePanel" aria-label={title || words.coordinates}>
      <div className="place-head">
        <span className="kind">{saved ? savedLine(saved, savedFolders ?? []) || words.savedTitle : first?.layer || first?.kind || ""}</span>
        <h2>{title || coordinates}</h2>
        <button type="button" className="tool round" id="placeClose" aria-label={words.close}
          onClick={() => showPlace(null)}><Sym name="xmark" /></button>
      </div>
      <div className="place-actions">
        <button type="button" onClick={() => void copyText(`${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`, words.copied)}>
          <Sym name="doc.on.doc" />{words.copy}</button>
        <button type="button" onClick={() => void copyText(location.href.replace(/#.*$/, "")
          + `#17/${place.lat.toFixed(5)}/${place.lng.toFixed(5)}`)}>
          <Sym name="square.and.arrow.up" />{words.share}</button>
      </div>
      <div className="place-body">
        {saved ? <SavedBody row={saved} /> : place.found.map((one, index) => (
          <FeatureCard key={index} properties={one.properties} layer={one.layer || one.kind || ""} details={one.details}
            asked={one.asked} title={one.title} />
        ))}
      </div>
      <dl className="place-foot">
        <dt>{words.coordinates}</dt><dd>{coordinates}</dd>
        {layers && !saved ? <><dt>{words.fromLayer}</dt><dd>{layers}</dd></> : null}
      </dl>
    </section>
  );
}
