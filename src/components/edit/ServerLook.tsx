"use client";

import { useState } from "react";
import type { ServerLookAsk, ServerLookPart } from "@/lib/types";
import { filledIn } from "@/lib/words";
import { setDrawn, useViewer } from "@/store/viewer";
import { Sym } from "../ui/Sym";

const said = (titles: string[]) => new Intl.ListFormat(undefined, { style: "long", type: "conjunction" }).format(titles);

/** 172, 182: as the app's update card: the server's tile, what changed, and a yellow Review. */
export function ServerLookBanner({ look, review }: { look: ServerLookAsk; review: () => void }) {
  const words = useViewer((state) => state.words);
  return (
    <div className="server-look-banner" role="status" data-server-version={look.version}>
      <span className="tone-tile" aria-hidden="true"><Sym name="arrow.up.circle" /></span>
      <span className="words"><b>{words.serverUpdate}</b>
        <small>{filledIn(words.serverChanged, "parts", said(look.parts.map((one) => one.title)))}</small></span>
      <button type="button" className="pill review" onClick={review}>{words.reviewServer}</button>
    </div>
  );
}

type Pick = "server" | "mine";

/** A part changed here too defaults to Keep mine, so taking the server's is always a choice. */
const firstPick = (part: ServerLookPart): Pick => part.changedHere ? "mine" : "server";

/** 172 Board 4: each part a Server's / Keep mine picker; Take version N or Keep mine for now. */
export function ServerLookReview({ id, look, close }: { id: string; look: ServerLookAsk; close: () => void }) {
  const words = useViewer((state) => state.words);
  const [picks, setPicks] = useState<Record<string, Pick>>(() =>
    Object.fromEntries(look.parts.map((one) => [one.id, firstPick(one)])));
  const taken = look.parts.filter((one) => picks[one.id] === "server").map((one) => one.id);
  const answer = async (fields: Record<string, string>) => {
    await setDrawn({ layer: id, ...fields });
    close();
  };
  const version = String(look.version);
  return (
    <div className="server-look-review" data-review={id}>
      <div className="row head">
        <button type="button" className="link" onClick={close}>{words.backToLayer}</button>
        <h3 className="title">{words.reviewServerTitle}</h3>
      </div>
      {look.parts.map((part) => (
        <div className="field part" key={part.id} data-part={part.id}>
          <label id={`review-${id}-${part.id}`}>{part.title}</label>
          <div className="chips" role="radiogroup" aria-labelledby={`review-${id}-${part.id}`}>
            {(["server", "mine"] as const).map((pick) => (
              <button key={pick} type="button" role="radio" aria-checked={picks[part.id] === pick}
                className={picks[part.id] === pick ? "picked" : undefined}
                onClick={() => setPicks({ ...picks, [part.id]: pick })}>
                {pick === "server" ? words.serversPart : words.keepMinePart}</button>
            ))}
          </div>
          {part.changed ? <small className="changed">{part.changed}</small> : null}
          {part.changedHere ? <small className="changed-here">{words.changedHereToo}</small> : null}
        </div>
      ))}
      <div className="row actions">
        <button type="button" className="link" onClick={() => void answer({ serverKeep: version })}>{words.keepForNow}</button>
        <button type="button" className="pill take" disabled={taken.length === 0}
          onClick={() => void answer({ serverTake: taken.join(","), serverVersion: version })}>
          {filledIn(words.takeVersion, "version", version)}</button>
      </div>
    </div>
  );
}
