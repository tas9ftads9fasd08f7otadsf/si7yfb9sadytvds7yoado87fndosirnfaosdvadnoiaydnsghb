"use client";

import type { CSSProperties } from "react";
import type { OptionSection } from "@/lib/types";
import { setDrawn, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { DetailsLayoutPanel } from "./DetailsLayoutPanel";
import { Switch } from "../ui/Switch";
import { Sym } from "../ui/Sym";
import { ground } from "../ui/ground";

type Scoped = (query: Record<string, string>) => Record<string, string>;

/** A layer's colour: automatic, the palette, or any colour. */
function ColourSwatches({ section, pick }: { section: OptionSection; pick: (hex: string) => void }) {
  const words = useViewer((state) => state.words);
  const worn = (section.value ?? "").toUpperCase() || null;
  const hexes = [...(section.palette ?? [])];
  if (worn && !hexes.includes(worn)) hexes.push(worn);
  return (
    <div className="swatches" role="group" aria-label={section.title}>
      <CommitField type="color" value={(worn ?? section.automatic ?? "#8E8E93").toLowerCase()}
        aria-label={words.pickColour} title={words.pickColour} onCommit={(hex) => pick(hex.toUpperCase())} />
      <button type="button" aria-label={words["theme.auto"]} title={words["theme.auto"]} aria-pressed={!worn}
        data-hex="" style={ground(section.automatic)} onClick={worn ? () => pick("") : undefined}>
        <Sym name="wand.and.stars" />
      </button>
      {hexes.map((hex) => (
        <button key={hex} type="button" aria-label={hex} title={hex} aria-pressed={hex === worn} data-hex={hex}
          style={{ backgroundColor: hex }} onClick={hex === worn ? undefined : () => pick(hex)} />
      ))}
    </div>
  );
}

/** A number between the slider's two ends, sent once it is let go. */
function Slider({ section, send }: { section: OptionSection; send: (value: string) => void }) {
  const [least, most, step] = section.range ?? [0, 1, 0.1];
  return (
    <div className="field slider">
      <CommitField type="range" min={least} max={most} step={step} value={section.value ?? String(least)}
        aria-label={section.title} onCommit={send} />
      <div className="ends"><small>{section.ends?.[0]}</small><small>{section.ends?.[1]}</small></div>
    </div>
  );
}

/** The narrowing's values: each drawn or not and, given a palette, its own colour. */
function Values({ section, scoped }: { section: OptionSection; scoped: Scoped }) {
  const words = useViewer((state) => state.words);
  const tint = (value: string, ink: string) => setDrawn(scoped({ valueTint: value, ink }));
  return (
    <>
      <div className="row">
        <span className="words" />
        <button type="button" className="link" data-all={section.value}
          onClick={() => setDrawn(scoped({ allValuesShown: section.value ?? "1" }))}>{section.label}</button>
      </div>
      {(section.items ?? []).map((item) => (
        <div className="row value" key={item.id}>
          {section.palette ? (
            <span className="swatches">
              <CommitField type="color" value={(item.light || "#8E8E93").toLowerCase()} aria-label={item.title}
                title={words.pickColour} onCommit={(hex) => tint(item.id, hex.toUpperCase())} />
              {item.light ? <button type="button" aria-label={words["theme.auto"]} title={words["theme.auto"]}
                onClick={() => tint(item.id, "")}><Sym name="wand.and.stars" /></button> : null}
            </span>
          ) : null}
          <span className="words">{item.title}</span>
          <Switch isOn={item.isOn} label={item.title} onChange={(isOn) =>
            setDrawn(scoped({ valueShown: item.id, valueOn: isOn ? "1" : "0" }))} />
        </div>
      ))}
    </>
  );
}

function Section({ section, scoped }: { section: OptionSection; scoped: Scoped }) {
  const key = section.key ?? "";
  if (section.kind === "kinds") {
    return (section.items ?? []).map((item) => (
      <div className="row" key={item.id}>
        <span className="ink" style={{ "--light": item.light, "--dark": item.dark } as CSSProperties} />
        <span className="words">{item.title}</span>
        <Switch isOn={item.isOn} label={item.title} onChange={(isOn) =>
          setDrawn({ kindFamily: section.family ?? "", kind: item.id, shown: isOn ? "1" : "0" })} />
      </div>
    ));
  }
  if (section.kind === "connection") {
    return (section.items ?? []).map((item) => (
      <div className="row" key={item.id} data-locked={item.isLocked ? "" : undefined}>
        <span className="words">{item.title}<small>{item.detail}</small></span>
        <Switch isOn={item.isOn} label={item.title} isLocked={item.isLocked} onChange={(isOn) =>
          setDrawn(scoped({ connection: section.family ?? "", group: item.id, allowed: isOn ? "1" : "0" }))} />
      </div>
    ));
  }
  if (section.kind === "switch") {
    return (
      <div className="row"><span className="words">{section.label}</span>
        <Switch isOn={section.isOn === true} label={section.label ?? ""}
          onChange={(isOn) => setDrawn(scoped({ [key]: isOn ? "1" : "0" }))} /></div>
    );
  }
  if (section.kind === "choice") {
    return (
      <div className="field">
        <select aria-label={section.title || key} value={section.value ?? ""}
          onChange={(event) => setDrawn(scoped({ [key]: event.target.value }))}>
          {(section.options ?? []).map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}
        </select>
      </div>
    );
  }
  if (section.kind === "slider") {
    return <Slider section={section} send={(value) => setDrawn(scoped({ [key]: value }))} />;
  }
  if (section.kind === "values") return <Values section={section} scoped={scoped} />;
  if (section.kind === "details") return section.layout ? <DetailsLayoutPanel layout={section.layout} scoped={scoped} /> : null;
  if (section.kind === "text") {
    return (
      <div className="field">
        <CommitField type="url" value={section.value ?? ""} aria-label={section.title || key} spellCheck={false}
          autoCapitalize="off" onCommit={(text) => setDrawn(scoped({ [key]: text }))} />
      </div>
    );
  }
  if (section.kind === "colour") {
    return <ColourSwatches section={section} pick={(hex) => setDrawn(scoped({ [key]: hex }))} />;
  }
  return (section.styles ?? []).map((style) => (
    <div className="row" key={style.id}>
      <span className="words">{style.name}
        <small>{section.options?.find((option) => option.id === style.variant)?.detail ?? ""}</small></span>
      <select aria-label={style.name} value={style.variant}
        onChange={(event) => setDrawn({ railVariant: event.target.value, railStyle: style.id })}>
        {(section.options ?? []).map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}
      </select>
    </div>
  ));
}

/** Edit layer's road, rail, history, name and ski panels, as the phone lists them. */
export function OptionsPanel({ id, sections }: { id: string; sections: OptionSection[] }) {
  return (
    <div className="card options" data-options={id}>
      {sections.map((section, index) => (
        <div key={index} style={{ display: "contents" }}>
          {section.title ? <div className="field"><label>{section.title}</label></div> : null}
          <Section section={section} scoped={(query) => section.layerScoped ? { layer: id, ...query } : query} />
          <div className="foot-note">{section.footnote}</div>
        </div>
      ))}
    </div>
  );
}
