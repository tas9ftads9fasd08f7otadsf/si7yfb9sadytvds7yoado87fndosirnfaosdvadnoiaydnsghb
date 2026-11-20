"use client";

import { useState } from "react";
import { toggleAddingPackages, useViewer } from "@/store/viewer";
import { MarkTile } from "../ui/MarkTile";
import { Sym } from "../ui/Sym";
import { type AddSource, AddLayer, addSources } from "./AddLayer";

const SOURCE_LOOK: Record<AddSource, { symbol: string; title: string; note: string }> = {
  builtin: { symbol: "map", title: "rikiMaps", note: "builtInNote" },
  tile: { symbol: "link", title: "tileURL", note: "tileNote" },
  file: { symbol: "doc", title: "files", note: "fileNote" },
  api: { symbol: "antenna.radiowaves.left.and.right", title: "apiLayers", note: "apiNote" },
  server: { symbol: "server.rack", title: "servers", note: "serverNote" },
};

/** 97 The design's W11: every source on the left, the picked one's part beside it. */
export function AddLayerModal() {
  const words = useViewer((state) => state.words);
  const isOpen = useViewer((state) => state.addingPackages);
  const name = useViewer((state) => state.portable?.name ?? "");
  const style = useViewer((state) => state.portable?.styles?.find((each) => each.id === state.styleID)?.name);
  const sources = addSources();
  const [source, setSource] = useState<AddSource>(sources[0] ?? "tile");
  if (!isOpen) return null;
  const shown = sources.includes(source) ? source : sources[0] ?? "tile";
  return (
    <div className="scrim" onPointerDown={(event) => {
      if (event.target === event.currentTarget) toggleAddingPackages();
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="addLayerTitle" id="addLayerDialog" className="modal wide"
        onKeyDown={(event) => { if (event.key === "Escape") toggleAddingPackages(); }}>
        <nav className="sources" aria-labelledby="addLayerTitle">
          <h1 id="addLayerTitle">{words.addLayer}</h1>
          {sources.map((each) => {
            const look = SOURCE_LOOK[each];
            return (
              <button type="button" key={each} id={`addFrom-${each}`} aria-pressed={each === shown}
                onClick={() => setSource(each)}>
                <MarkTile symbol={look.symbol} small />
                <span className="words">{words[look.title]}<small>{words[look.note]}</small></span>
              </button>
            );
          })}
        </nav>
        <div className="source-body">
          <div className="modal-head">
            <span className="into">{words.into} <b>{name}</b>{style ? ` · ${style}` : ""}</span>
            <button type="button" className="tool round" aria-label={words.close} onClick={toggleAddingPackages}>
              <Sym name="xmark" />
            </button>
          </div>
          <div className="source-part" id="addLayerPart"><AddLayer source={shown} /></div>
        </div>
      </div>
    </div>
  );
}
