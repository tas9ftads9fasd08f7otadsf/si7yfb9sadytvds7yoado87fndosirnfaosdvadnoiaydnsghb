"use client";

import { useEffect } from "react";
import { change, exportMap, loadCoverage, loadLayerOptions, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { Sym } from "../ui/Sym";
import { AddLayer } from "./AddLayer";
import { CoverageCard } from "./CoverageCard";
import { Languages } from "./Languages";
import { Layers } from "./Layers";
import { MinimumVersion } from "./MinimumVersion";
import { OpensAt } from "./OpensAt";
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
  return portable ? <EditFields key={epoch} /> : null;
}

function EditFields() {
  const words = useViewer((state) => state.words);
  const portable = useViewer((state) => state.portable);
  const adding = useViewer((state) => state.addingPackages);
  if (!portable) return null;
  return (
    <>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="field"><label>{words.name}</label>
          <CommitField type="text" value={portable.name} aria-label={words.name} maxLength={200}
            onCommit={(name) => change({ name })} /></div>
        <div className="field"><label>{words.note}</label>
          <CommitField multiline rows={3} value={portable.note ?? ""} aria-label={words.note} maxLength={2000}
            onCommit={(note) => change({ note })} /></div>
      </div>
      <Languages portable={portable} />
      <Styling portable={portable} />
      <CoverageCard />
      <OpensAt portable={portable} />
      <MinimumVersion />
      <Styles portable={portable} />
      <Layers portable={portable} />
      {adding ? <AddLayer /> : null}
      {portable.styles?.length ? <div className="foot-note">{words.layerCap}</div> : null}
      <button type="button" className="action" id="exportMap" onClick={exportMap}>
        <Sym name="square.and.arrow.up" />{words.export}
      </button>
    </>
  );
}
