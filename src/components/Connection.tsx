"use client";

import { useEffect, useState } from "react";
import { stillLive } from "@/lib/live";
import type { DetailsConnection, DetailsLive } from "@/lib/types";

const TONES = ["good", "late", "veryLate"];
const toneOf = (tone?: string) => (tone && TONES.includes(tone) ? ` tone-${tone}` : "");

/** The time now, counted on while something on the card ages. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** 130 The phone's LIVE pill: red while its answers keep arriving in the window, counted on from when the page asked. */
export function LivePill({ live, asked }: { live: DetailsLive; asked?: number }) {
  const now = useNow(live.isLive);
  const isLive = stillLive(live, asked, now);
  return (
    <span className={isLive ? "live-pill on" : "live-pill"} data-live={isLive}>
      {isLive ? live.label : live.notLiveLabel}
    </span>
  );
}

/** 130 A vehicle's running state as the phone's sheet draws it, every part worded by the phone. */
export function ConnectionCard({ connection, answeredAt }: { connection: DetailsConnection; answeredAt?: Date | null }) {
  const { delay, labels } = connection;
  const tone = toneOf(delay?.tone);
  const updated = connection.updated
    ?? answeredAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const moved = connection.actual != null && connection.actual !== connection.planned;
  return (
    <div className="connection">
      <div className="connection-head">
        <div>
          <small>{labels.delay}</small>
          <strong className={`delay${tone}`}>{delay?.sentence ?? "—"}</strong>
          {connection.station ? <small className="station">{connection.station}</small> : null}
        </div>
        {updated ? <div className="end"><small>{labels.updated}</small><span>{updated}</span></div> : null}
      </div>
      {connection.route ? <p className="connection-route">{connection.route}</p> : null}
      {connection.operatorLine ? <p className="connection-operator">{connection.operatorLine}</p> : null}
      {connection.planned != null || connection.actual != null ? (
        <div className="connection-times">
          <div>
            <small>{labels.planned}</small>
            {moved ? <s>{connection.planned ?? "—"}</s> : <span>{connection.planned ?? "—"}</span>}
          </div>
          {delay ? <span className={`short${tone}`}>{delay.short}</span> : null}
          <div className="end"><small>{labels.actual}</small><span>{connection.actual ?? "—"}</span></div>
        </div>
      ) : null}
      {connection.note ? <p className="feature-note warning"><small>{labels.note}</small>{connection.note}</p> : null}
    </div>
  );
}
