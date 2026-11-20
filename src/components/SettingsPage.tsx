"use client";

import { useEffect, useState } from "react";
import type { PairStarted } from "@/backend/types";
import { PAIR_EVERY } from "@/lib/page";
import { allowEditing, useViewer } from "@/store/viewer";
import { backend } from "@backend";
import { PasswordForm } from "./MapsPage";

/** 92 Settings: a QR code the phone scans to let this browser edit, or its password typed. */
export function SettingsPage() {
  const words = useViewer((state) => state.words);
  const canEdit = useViewer((state) => state.editToken != null);
  if (canEdit) return <p className="foot-note" id="editAllowed">{words.editAllowed}</p>;
  return (
    <>
      {backend.pair ? <PairCode /> : null}
      <PasswordForm prefix="settings-" />
    </>
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
