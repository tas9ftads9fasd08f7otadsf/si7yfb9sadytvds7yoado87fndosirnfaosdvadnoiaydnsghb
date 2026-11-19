"use client";

import { useEffect, useState } from "react";
import { backend } from "@backend";
import type { DetailsLayout, DetailsSheet, LayoutSample } from "@/lib/types";
import { useViewer } from "@/store/viewer";
import { FeatureCard } from "../FeatureCard";

/** 79: the sheet filled from one of the layer's points by the phone, so no rule is copied here. */
export function DetailsPreview({ layout, layer }: { layout: DetailsLayout; layer: string }) {
  const words = useViewer((state) => state.words);
  const mapID = useViewer((state) => state.mapID);
  const samples = layout.samples;
  const [at, setAt] = useState(0);
  const [answered, setAnswered] = useState<{ point: LayoutSample; sheet: DetailsSheet | null } | null>(null);
  const point = samples?.[Math.min(at, samples.length - 1)];
  // Each change is saved on the phone at once, so a new layout is a new fill.
  const laidOut = JSON.stringify([layout.sections, layout.header]);

  useEffect(() => {
    if (!mapID || !point) return;
    let current = true;
    backend.details(mapID, layer, point.properties).then(
      (sheet) => current && setAnswered({ point, sheet }),
      () => current && setAnswered({ point, sheet: null }));
    return () => { current = false; };
  }, [mapID, layer, point, laidOut]);

  if (!samples) return null;
  return (
    <div className="details-preview" role="group" aria-label={words.sheetPreview}>
      <div className="row">
        <span className="words"><small>{point?.caption ?? layout.sampleNote}</small></span>
        {samples.length > 1 ? (
          <button type="button" className="link" onClick={() => setAt((at + 1) % samples.length)}>{words.another}</button>
        ) : null}
      </div>
      {point ? (
        <FeatureCard properties={point.properties} layer=""
          details={answered?.point === point ? answered.sheet : null} />
      ) : null}
    </div>
  );
}
