"use client";

import { useEffect, useRef } from "react";
import { isVersion } from "@/lib/version";
import { change, notice, shownMapOf, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";

/** The oldest app and browser viewer, as Edit map's Minimum version page writes them. */
export function MinimumVersion() {
  const words = useViewer((state) => state.words);
  const asked = useViewer((state) => shownMapOf(state)?.minimumVersion);
  const app = asked?.app ?? "";
  const browser = asked?.browser ?? "";
  const typed = useRef({ app, browser });
  useEffect(() => {
    typed.current = { app, browser };
  }, [app, browser]);
  const commit = (part: "app" | "browser", text: string) => {
    typed.current = { ...typed.current, [part]: text.trim() };
    const made = typed.current;
    if ([made.app, made.browser].some((each) => each && !isVersion(each))) {
      notice(words.versionShape);
      return;
    }
    if (made.app === app && made.browser === browser) return;
    void change({ kind: "minimumVersion", app: made.app, browser: made.browser });
  };
  const shared = { type: "text", placeholder: words.anyVersion, inputMode: "decimal", autoComplete: "off",
    spellCheck: false, maxLength: 20 } as const;
  return (
    <>
      <h2 className="title">{words.minimumVersion}</h2>
      <div className="card" id="minimumVersion">
        <div className="field"><label htmlFor="minimumApp">{words.minimumApp}</label>
          <CommitField {...shared} id="minimumApp" value={app} aria-label={words.minimumApp}
            onCommit={(text) => commit("app", text)} /></div>
        <div className="field"><label htmlFor="minimumBrowser">{words.minimumBrowser}</label>
          <CommitField {...shared} id="minimumBrowser" value={browser} aria-label={words.minimumBrowser}
            onCommit={(text) => commit("browser", text)} /></div>
      </div>
      <div className="foot-note">{words.minimumNote}</div>
    </>
  );
}
