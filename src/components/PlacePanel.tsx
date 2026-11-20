"use client";

import { featureTitle } from "@/lib/feature";
import { copyText, showPlace, useViewer } from "@/store/viewer";
import { FeatureCard } from "./FeatureCard";
import { Sym } from "./ui/Sym";

const coordinateText = (lat: number, lng: number) =>
  `${Math.abs(lat).toFixed(5)} ${lat < 0 ? "S" : "N"}, ${Math.abs(lng).toFixed(5)} ${lng < 0 ? "W" : "E"}`;

/** 100 W2's place panel beside the map: what a tap or a search found, with its place and its layer. */
export function PlacePanel() {
  const words = useViewer((state) => state.words);
  const place = useViewer((state) => state.place);
  const editing = useViewer((state) => state.editing
    || ["details", "data", "settings"].includes(state.route.screen));
  if (!place || editing) return null;
  const [first] = place.found;
  const title = first?.details?.title || featureTitle(first?.properties ?? {});
  const coordinates = coordinateText(place.lat, place.lng);
  const layers = [...new Set(place.found.map((each) => each.layer).filter(Boolean))].join(" · ");
  return (
    <section id="placePanel" aria-label={title || words.coordinates}>
      <div className="place-head">
        <span className="kind">{first?.layer ?? ""}</span>
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
        {place.found.map((one, index) => (
          <FeatureCard key={index} properties={one.properties} layer={one.layer} details={one.details} asked={one.asked} />
        ))}
      </div>
      <dl className="place-foot">
        <dt>{words.coordinates}</dt><dd>{coordinates}</dd>
        {layers ? <><dt>{words.fromLayer}</dt><dd>{layers}</dd></> : null}
      </dl>
    </section>
  );
}
