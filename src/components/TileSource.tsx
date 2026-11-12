"use client";

import { setTilesDirect, useViewer } from "@/store/viewer";

/** Offered only where the phone allows it: tiles through the phone, or straight from their source. */
export function TileSource() {
  const words = useViewer((state) => state.words);
  const allowed = useViewer((state) => state.directAllowed);
  const direct = useViewer((state) => state.tilesDirect);
  if (!allowed) return null;
  const choice = (isDirect: boolean, id: string, title: string) => (
    <button type="button" id={id} role="radio" aria-checked={direct === isDirect}
      className={direct === isDirect ? "picked" : undefined} onClick={() => setTilesDirect(isDirect)}>{title}</button>
  );
  return (
    <div id="tileSource">
      <h2 className="title">{words.tilesVia}</h2>
      <div className="chips" role="radiogroup" aria-label={words.tilesVia}>
        {choice(false, "tilesViaPhone", words.viaPhone)}
        {choice(true, "tilesViaSource", words.viaSource)}
      </div>
      {direct ? <div className="foot-note" id="tileSourceNote">{words.viaSourceNote}</div> : null}
    </div>
  );
}
