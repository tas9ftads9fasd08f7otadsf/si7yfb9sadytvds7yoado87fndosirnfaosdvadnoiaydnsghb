"use client";

import { useState } from "react";
import type { LockOffer } from "@/lib/types";
import { filledIn } from "@/lib/words";
import { change, useViewer } from "@/store/viewer";
import { Switch } from "../ui/Switch";

/** 118 Edit map's Privacy row; the phone asks Face ID before it locks or unlocks. */
export function Lock({ lock }: { lock: LockOffer }) {
  const words = useViewer((state) => state.words);
  const [asking, setAsking] = useState(false);
  const title = lock.brand ? filledIn(words.lockWith, "brand", lock.brand) : words.lockMap;
  const ask = async (locked: boolean) => {
    setAsking(true);
    await change({ kind: "lock", locked });
    setAsking(false);
  };
  return (
    <>
      <h2 className="title">{words.privacy}</h2>
      <div className="list" id="privacy">
        <div className="row" data-switch="lock">
          <div className="words">{title}<small id="lockNote">{asking ? words.confirmOnPhone : lock.note}</small></div>
          <Switch isOn={lock.isOn} label={title} isLocked={!lock.mayChange || asking}
            onChange={(locked) => void ask(locked)} />
        </div>
      </div>
      {lock.sharedNote ? <div className="foot-note">{lock.sharedNote}</div> : null}
    </>
  );
}
