"use client";

import { backend } from "@backend";
import { filledIn } from "@/lib/words";
import { THEMES, type Theme, setTheme, useViewer } from "@/store/viewer";
import { AccountName } from "./TopBar";
import { TileSource } from "./TileSource";
import { Sym } from "./ui/Sym";

/** 103 The rail's gear: what this browser keeps for itself, and which phone shares the maps. */
export function SettingsPage() {
  const isOpen = useViewer((state) => state.route.screen === "settings");
  const words = useViewer((state) => state.words);
  const theme = useViewer((state) => state.theme);
  const device = useViewer((state) => state.device);
  const connected = useViewer((state) => state.connected);
  const admitted = useViewer((state) => state.standing === "admitted");
  if (!isOpen) return null;
  return (
    <main id="settings" aria-labelledby="settingsTitle">
      <div className="settings-head">
        <h1 id="settingsTitle">{words.settings}</h1>
        <p>{words.settingsNote}</p>
      </div>
      <section aria-labelledby="appearanceTitle">
        <span className="group-title" id="appearanceTitle">{words.appearance}</span>
        <div className="segments" role="radiogroup" aria-labelledby="appearanceTitle">
          {(Object.keys(THEMES) as Theme[]).map((each) => (
            <button type="button" role="radio" key={each} id={`theme-${each}`} aria-checked={theme === each}
              onClick={() => setTheme(each)}><Sym name={THEMES[each]} />{words[`theme.${each}`]}</button>
          ))}
        </div>
      </section>
      <TileSource />
      {backend.author && admitted ? (
        <section aria-labelledby="nameTitle">
          <span className="group-title" id="nameTitle">{words.yourName}</span>
          <AccountName />
          <p className="foot-note">{words.nameNote}</p>
        </section>
      ) : null}
      {device ? (
        <section aria-labelledby="aboutTitle">
          <span className="group-title" id="aboutTitle">{words.about}</span>
          <dl className="group about">
            <dt>{words.sharedBy}</dt>
            <dd id="aboutDevice">{device.name}{connected == null ? null
              : <i className={connected ? "dot on" : "dot off"} role="img"
                aria-label={connected ? words.connected : words.notConnected} />}</dd>
            {device.appVersion ? <><dt>{words.app}</dt>
              <dd>{filledIn(words.appVersion, "version", device.appVersion)}</dd></> : null}
          </dl>
        </section>
      ) : null}
    </main>
  );
}
