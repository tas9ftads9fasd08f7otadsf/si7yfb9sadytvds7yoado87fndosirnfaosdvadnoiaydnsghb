"use client";

import { useEffect, useState } from "react";
import { backend } from "@backend";
import type { PairStarted } from "@/backend/types";
import { PAIR_EVERY } from "@/lib/page";
import { filledIn } from "@/lib/words";
import { THEMES, type Theme, allowEditing, offers, setTheme, useViewer } from "@/store/viewer";
import { PasswordForm } from "./MapsPage";
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
      {offers("pairing") ? <EditHere /> : null}
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
            <dt className="whole" id="aboutDevice">{filledIn(words.sharedBy, "name", device.name)}</dt>
            <dd>{connected == null ? null
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

/** 92 A QR code the phone scans to let this browser edit, or its password typed. */
function EditHere() {
  const words = useViewer((state) => state.words);
  const canEdit = useViewer((state) => state.editToken != null);
  return (
    <section aria-labelledby="editHereTitle">
      <span className="group-title" id="editHereTitle">{words.editHere}</span>
      <div className="group edit-here">
        {canEdit ? <p className="foot-note" id="editAllowed">{words.editAllowed}</p> : (
          <>
            {backend.pair ? <PairCode /> : null}
            <PasswordForm prefix="settings-" />
          </>
        )}
      </div>
    </section>
  );
}

/** Asked again when the phone refused it or it ran out, so a code on screen always works. */
function PairCode() {
  const words = useViewer((state) => state.words);
  const [ask, setAsk] = useState<PairStarted | null>(null);
  const [refused, setRefused] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    void backend.pair?.().then((answer) => { if (live && answer.ok) setAsk(answer.value); }).catch(() => {});
    return () => { live = false; };
  }, [round]);

  useEffect(() => {
    if (!ask) return;
    const timer = setInterval(async () => {
      const answer = await backend.pairState?.(ask.id).catch(() => null);
      if (!answer) return;
      if (answer.ok && "token" in answer.value) {
        clearInterval(timer);
        allowEditing(answer.value.token);
      } else if (!answer.ok) {
        clearInterval(timer);
        setRefused(answer.status === 403);
        setAsk(null);
        setRound((value) => value + 1);
      }
    }, PAIR_EVERY);
    return () => clearInterval(timer);
  }, [ask]);

  return (
    <section className="pair" id="pairCode" aria-live="polite">
      <p>{words.scanToEdit}</p>
      {ask && backend.pairPicture ? (
        <div className="pair-picture" role="img" aria-label={words.scanToEdit} id="pairPicture"
          style={{ backgroundImage: `url(${JSON.stringify(backend.pairPicture(ask.id))})` }} />
      ) : <div className="pair-wait" aria-hidden="true" />}
      {ask ? <p className="pair-code"><small>{words.pairCode}</small><b>{ask.code}</b></p> : null}
      {refused ? <p className="foot-note" role="alert">{words.editRefused}</p> : null}
    </section>
  );
}
