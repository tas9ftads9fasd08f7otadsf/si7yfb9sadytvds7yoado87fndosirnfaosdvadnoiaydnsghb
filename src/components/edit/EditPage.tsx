"use client";

import { useEffect } from "react";
import { EDIT_TABS, type EditTab, type Route } from "@/lib/route";
import { change, duplicateMap, exportMap, loadCoverage, loadLayerOptions, loadSwitches, offers, showEditTab, useViewer }
  from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { Sym } from "../ui/Sym";
import { Availability } from "./Availability";
import { CoverageCard } from "./CoverageCard";
import { DeleteMap } from "./DeleteMap";
import { EsriServices } from "./EsriServices";
import { Languages } from "./Languages";
import { Layers } from "./Layers";
import { Lock } from "./Lock";
import { MinimumVersion } from "./MinimumVersion";
import { Offline } from "./Offline";
import { OpensAt } from "./OpensAt";
import { People } from "./People";
import { Publish } from "./Publish";
import { RegionPackagesCard } from "../RegionPackages";
import { Styles } from "./Styles";
import { Styling } from "./Styling";

/** A refused change bumps `editEpoch`, which puts every field back. */
export function EditPage() {
  const epoch = useViewer((state) => state.editEpoch);
  const portable = useViewer((state) => state.portable);
  const hasOptions = useViewer((state) => state.layerOptions != null);
  const mapID = useViewer((state) => state.mapID);
  const hasCoverage = useViewer((state) => state.coverage != null && state.coveragePlaces != null);
  useEffect(() => {
    if (!hasOptions) void loadLayerOptions();
  }, [hasOptions, mapID]);
  useEffect(() => {
    if (!hasCoverage) void loadCoverage();
  }, [hasCoverage, mapID]);
  const hasSwitches = useViewer((state) => state.switches != null);
  useEffect(() => {
    if (!hasSwitches) void loadSwitches();
  }, [hasSwitches, mapID]);
  return portable ? <EditFields key={epoch} /> : null;
}

const tabOf = (route: Route): EditTab => route.screen === "edit" ? route.tab : "layers";

/** 94 Edit map's tabs, as the design's W5–W9 split it. */
export function EditTabs() {
  const words = useViewer((state) => state.words);
  const tab = useViewer((state) => tabOf(state.route));
  return (
    <div role="tablist" id="editTabs" aria-label={words.edit}>
      {EDIT_TABS.map((each) => (
        <button type="button" role="tab" key={each} id={`editTab-${each}`} aria-selected={each === tab}
          aria-controls="editBody" onClick={() => showEditTab(each)}>{words[each]}</button>
      ))}
    </div>
  );
}

function EditFields() {
  const words = useViewer((state) => state.words);
  const portable = useViewer((state) => state.portable);
  const switches = useViewer((state) => state.switches);
  const tab = useViewer((state) => tabOf(state.route));
  if (!portable) return null;
  switch (tab) {
    case "layers":
      return (
        <>
          <Layers portable={portable} />
          <EsriServices />
          <RegionPackagesCard />
          {portable.styles?.length ? <div className="foot-note">{words.layerCap}</div> : null}
        </>
      );
    case "styling":
      return <Styles portable={portable} />;
    case "sharing":
      return (
        <>
          <People />
          <Publish />
        </>
      );
    case "offline":
      return (
        <>
          <Offline />
          {offers("coverage") ? <CoverageCard /> : null}
        </>
      );
    case "general":
      return (
        <>
          <div className="card" style={{ marginTop: 8 }}>
            <div className="field"><label>{words.name}</label>
              <CommitField type="text" value={portable.name} aria-label={words.name} maxLength={200}
                onCommit={(name) => change({ kind: "name", name })} /></div>
          </div>
          <Styling portable={portable} />
          <h2 className="title">{words.note}</h2>
          <div className="card note-card">
            <div className="field">
              <CommitField multiline rows={3} value={portable.note ?? ""} aria-label={words.note} maxLength={2000}
                onCommit={(note) => change({ kind: "note", note })} /></div>
            <Languages portable={portable} />
          </div>
          <div className="list map-actions">
            {offers("duplicateMap") ? (
              <button type="button" className="row add" id="duplicateMap" onClick={() => void duplicateMap()}>
                <span className="tile"><Sym name="plus.square.on.square" /></span>{words.duplicateMap}
              </button>
            ) : null}
            {offers("exportMap") ? (
              <button type="button" className="row add" id="exportMap" onClick={exportMap}>
                <span className="tile"><Sym name="square.and.arrow.up" /></span>{words.export}
              </button>
            ) : null}
          </div>
          <DeleteMap place="edit" />
          <OpensAt portable={portable} />
          <MinimumVersion />
          {switches ? <Availability switches={switches} /> : null}
          {switches?.lock ? <Lock lock={switches.lock} /> : null}
        </>
      );
  }
}
