"use client";

import { useEffect } from "react";
import { go, loadLayerOptions, useViewer } from "@/store/viewer";
import { Sym } from "../ui/Sym";
import { DetailsLayoutPanel } from "./DetailsLayoutPanel";

/** 95 W16 at its own address: a layer's Details layout over the map, with Done back to Edit map. */
export function DetailsScreen() {
  const route = useViewer((state) => state.route);
  const words = useViewer((state) => state.words);
  const mapID = useViewer((state) => state.mapID);
  const loaded = useViewer((state) => state.layerOptions != null);
  const layerID = route.screen === "details" ? route.layer.toUpperCase() : "";
  const found = useViewer((state) => state.layerOptions?.layers.find((each) => each.id.toUpperCase() === layerID));
  const layer = useViewer((state) => state.portable?.stack?.find((each) => each.id.toUpperCase() === layerID));
  useEffect(() => {
    if (layerID && !loaded && mapID) void loadLayerOptions();
  }, [layerID, loaded, mapID]);
  if (route.screen !== "details") return null;
  const section = found?.sections.find((each) => each.kind === "details");
  const back = () => go({ screen: "edit", map: route.map, tab: "layers" });
  const id = found?.id ?? route.layer;
  return (
    <main id="details" aria-labelledby="detailsTitle">
      <div className="pane-head">
        <button type="button" className="tool round" id="detailsBack" aria-label={words.edit} onClick={back}>
          <Sym name="chevron.backward" />
        </button>
        <h1><span id="detailsTitle">{words.details}</span><small>{layer?.name ?? ""}</small></h1>
        <button type="button" className="head-done" id="detailsDone" onClick={back}>{words.done}</button>
      </div>
      {section?.layout ? <DetailsLayoutPanel layout={section.layout}
        scoped={(query) => section.layerScoped ? { layer: id, ...query } : query} />
        : <div className="empty">{words.loading}</div>}
    </main>
  );
}
