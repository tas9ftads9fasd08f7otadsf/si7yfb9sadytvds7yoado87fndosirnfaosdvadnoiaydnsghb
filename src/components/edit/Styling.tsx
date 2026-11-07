"use client";

import type { ReactNode } from "react";
import type { Portable } from "@/lib/types";
import { listed } from "@/lib/words";
import { change, shownMapOf, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { Sym } from "../ui/Sym";
import { ground } from "../ui/ground";

const APPEARANCES = { automatic: "auto", light: "light", dark: "dark" };

interface SwatchProps {
  label: string;
  isPicked: boolean;
  onPick: () => void;
  tint?: string | null;
  data?: Record<string, string>;
  children?: ReactNode;
}

function Swatch({ label, isPicked, onPick, tint, data, children }: SwatchProps) {
  return <button type="button" aria-label={label} title={label} aria-pressed={isPicked} style={ground(tint)} {...data}
    onClick={isPicked ? undefined : onPick}>{children}</button>;
}

/** The icon, its ground and light or dark, as Edit map's Styling page sets them. */
export function Styling({ portable }: { portable: Portable }) {
  const words = useViewer((state) => state.words);
  const shownSymbol = useViewer((state) => shownMapOf(state)?.symbol);
  const symbol = shownSymbol || portable.symbol || "map";
  const tint = (portable.iconTintHex ?? "").toUpperCase() || null;
  const symbols = [...new Set([symbol, ...listed(words.mapSymbols)])];
  const tints = listed(words.iconTints);
  if (tint && !tints.includes(tint)) tints.push(tint);
  const appearance = portable.readerAppearance || portable.appearance
    || (portable.staysLightInDarkMode ? "light" : "automatic");
  return (
    <>
      <h2 className="title">{words.styling}</h2>
      <div className="card">
        <div className="field"><label>{words.icon}</label></div>
        <div className="swatches" role="group" id="mapSymbols" aria-label={words.icon}>
          {symbols.map((name) => (
            <Swatch key={name} label={name} isPicked={name === symbol && !portable.iconPicture} tint={tint}
              data={{ "data-symbol": name }} onPick={() => change({ symbol: name })}><Sym name={name} /></Swatch>
          ))}
        </div>
        <div className="field"><label>{words.background}</label></div>
        <div className="swatches" role="group" id="iconTints" aria-label={words.background}>
          <CommitField type="color" value={(tint ?? "#8E8E93").toLowerCase()} aria-label={words.pickColour}
            title={words.pickColour} onCommit={(hex) => change({ iconTint: hex.toUpperCase() })} />
          <Swatch label={words["theme.auto"]} isPicked={!tint} onPick={() => change({ iconTint: "" })}>
            <Sym name="wand.and.stars" />
          </Swatch>
          {tints.map((hex) => (
            <Swatch key={hex} label={hex} isPicked={hex === tint} tint={hex} data={{ "data-hex": hex }}
              onPick={() => change({ iconTint: hex })} />
          ))}
        </div>
      </div>
      <h2 className="title">{words.appearance}</h2>
      <div className="chips" role="group" id="mapAppearance" aria-label={words.appearance}>
        {Object.entries(APPEARANCES).map(([each, word]) => (
          <button key={each} type="button" className={each === appearance ? "picked" : undefined}
            aria-pressed={each === appearance} onClick={each === appearance ? undefined : () => change({ appearance: each })}>
            {words[`theme.${word}`]}
          </button>
        ))}
      </div>
    </>
  );
}
