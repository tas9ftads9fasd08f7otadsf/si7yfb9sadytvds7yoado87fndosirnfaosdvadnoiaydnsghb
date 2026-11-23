"use client";

import { type CSSProperties, createContext, useContext, useEffect, useId, useState } from "react";
import type { DetailsLayout, LayerTest, OptionSection, RoadSigns } from "@/lib/types";
import { go, iconURL, loadRoadSigns, setDrawn, testLayer, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { type Aspect, ASPECT_WORDS, aspectsOffered, colourTitleKey, drawsPoints, markOf, offeredSections } from "@/lib/markers";
import { MarkSymbols } from "./MarkSymbols";
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

/** 69 The signs' key: one country at a time, found by its name, its signs as the phone draws them. */
function SignKey({ section }: { section: OptionSection }) {
  const [country, setCountry] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [key, setKey] = useState<RoadSigns | null>(null);
  useEffect(() => {
    let current = true;
    void loadRoadSigns({ country, q: query }).then((read) => { if (current && read) setKey(read); });
    return () => { current = false; };
  }, [country, query]);
  return (
    <div className="sign-key" data-country={key?.country ?? ""}>
      <div className="field">
        <input type="search" value={query} placeholder={section.label} aria-label={section.label}
          onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="sign-countries" role="group" aria-label={section.title}>
        {(key?.countries ?? []).map((option) => (
          <button key={option.id} type="button" className="chip" aria-pressed={option.id === key?.country}
            data-code={option.id} onClick={() => setCountry(option.id)}>{option.title}</button>
        ))}
      </div>
      <ul className="sign-grid" aria-label={key?.countryName}>
        {(key?.signs ?? []).map((sign) => (
          <li key={sign.id} data-sign={sign.id}>
            <span className="sign" aria-hidden="true" style={{ backgroundImage: `url("${iconURL(sign.id)}")` }} />
            <span>{sign.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An address, or with `keys` a template whose `{key}` the layer's keys are offered for. */
function TextField({ section, send }: { section: OptionSection; send: (text: string) => void }) {
  const keysID = useId();
  const keys = section.keys;
  return (
    <div className="field">
      <CommitField type={keys ? "text" : "url"} value={section.value ?? ""} aria-label={section.title || section.key}
        spellCheck={false} autoCapitalize="off" list={keys ? keysID : undefined} onCommit={send} />
      {keys ? <datalist id={keysID}>{keys.map((one) => <option key={one} value={`{${one}}`} />)}</datalist> : null}
    </div>
  );
}

/** 60 The headers a layer sends: a value is set here, never read back, as the phone keeps keys. */
function Headers({ section, scoped }: { section: OptionSection; scoped: Scoped }) {
  const words = useViewer((state) => state.words);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const listID = `headers-${scoped({}).layer ?? ""}`;
  const add = async () => {
    if (!name.trim()) return;
    await setDrawn(scoped({ header: name.trim(), headerValue: value }));
    setName("");
    setValue("");
  };
  return (
    <>
      {(section.items ?? []).map((item) => (
        <div className="row header" key={item.id} data-header={item.id} data-set={item.isOn ? "" : undefined}>
          <span className="words">{item.title}<small>{item.detail}</small></span>
          <CommitField type="password" value="" autoComplete="off" placeholder={words.headerValue}
            aria-label={`${item.title} ${words.headerValue}`}
            onCommit={(text) => setDrawn(scoped({ header: item.id, headerValue: text }))} />
          <button type="button" className="link" aria-label={`${words.remove} ${item.title}`}
            onClick={() => setDrawn(scoped({ removeHeader: item.id }))}>{words.remove}</button>
        </div>
      ))}
      <div className="row header-add">
        <input list={listID} value={name} placeholder={words.headerName} aria-label={words.headerName}
          autoCapitalize="off" spellCheck={false} onChange={(event) => setName(event.target.value)} />
        <datalist id={listID}>
          {(section.options ?? []).map((option) => <option key={option.id} value={option.id}>{option.detail}</option>)}
        </datalist>
        <input type="password" value={value} autoComplete="off" placeholder={words.headerValue}
          aria-label={words.headerValue} onChange={(event) => setValue(event.target.value)} />
        <button type="button" className="link" disabled={!name.trim()} onClick={() => void add()}>{section.label}</button>
      </div>
    </>
  );
}

/** 60 Test or Read: the phone asks the address with its keys; the answer is said beside the button. */
function Probe({ section, scoped }: { section: OptionSection; scoped: Scoped }) {
  const words = useViewer((state) => state.words);
  const [asking, setAsking] = useState(false);
  const [tested, setTested] = useState<LayerTest | null>(null);
  const test = async () => {
    setAsking(true);
    setTested(await testLayer(scoped({}).layer ?? ""));
    setAsking(false);
  };
  return (
    <div className="row probe" data-reachable={tested ? String(tested.reachable) : undefined}>
      <span className="words" role="status">{asking ? words.testing : tested?.said ?? ""}</span>
      <button type="button" className="link" disabled={asking} onClick={() => void test()}>{section.label}</button>
    </div>
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
  if (section.kind === "signKey") return <SignKey section={section} />;
  if (section.kind === "headers") return <Headers section={section} scoped={scoped} />;
  if (section.kind === "probe") return <Probe section={section} scoped={scoped} />;
  if (section.kind === "details") return section.layout ? <OpenDetails layout={section.layout} /> : null;
  if (section.kind === "text") return <TextField section={section} send={(text) => setDrawn(scoped({ [key]: text }))} />;
  if (section.kind === "symbols") return <MarkSymbols section={section} pick={(name) => setDrawn(scoped({ [key]: name }))} />;
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

/** 95 The layer's Details layout opens as W16's page of its own. */
function OpenDetails({ layout }: { layout: DetailsLayout }) {
  const words = useViewer((state) => state.words);
  const layerID = useContext(PanelLayer);
  const mapID = useViewer((state) => state.mapID);
  return (
    <button type="button" className="row add open-details" data-layer-details={layerID}
      onClick={() => mapID && go({ screen: "details", map: mapID, layer: layerID })}>
      <Sym name="rectangle.and.text.magnifyingglass" />
      <span className="words">{words.details}<small>{layout.words.used}</small></span>
      <Sym name="chevron.forward" />
    </button>
  );
}

const PanelLayer = createContext("");

/** 168: a point layer's panel, titled Map markers, one aspect of its look at a time. */
function MapMarkers({ id, kind, sections }: { id: string; kind: string; sections: OptionSection[] }) {
  const words = useViewer((state) => state.words);
  const offered = aspectsOffered(kind, sections);
  const [picked, pick] = useState<Aspect>("colour");
  const aspect = offered.includes(picked) ? picked : "colour";
  const mark = markOf(sections);
  const shown = offeredSections(kind, sections).filter((one) => one.aspect === aspect);
  const retitled = (one: OptionSection) => one.aspect === "colour" && (one.key === "colourMode" || (one.key === "tint" && !one.title))
    ? { ...one, title: words[colourTitleKey(mark)] } : one;
  return (
    <div className="map-markers" data-map-markers={id}>
      <h3 className="title">{words.mapMarkers}</h3>
      <div className="chips" role="tablist" aria-label={words.mapMarkers}>
        {offered.map((each) => (
          <button key={each} type="button" role="tab" aria-selected={each === aspect} data-aspect={each}
            className={each === aspect ? "picked" : undefined} onClick={() => pick(each)}>{words[ASPECT_WORDS[each]]}</button>
        ))}
      </div>
      <Sections id={id} sections={shown.map(retitled)} />
    </div>
  );
}

function Sections({ id, sections }: { id: string; sections: OptionSection[] }) {
  return sections.map((section, index) => (
    <div key={`${section.key ?? ""}${index}`} style={{ display: "contents" }}>
      {section.title ? <div className="field"><label>{section.title}</label></div> : null}
      <Section section={section} scoped={(query) => section.layerScoped ? { layer: id, ...query } : query} />
      <div className="foot-note">{section.footnote}</div>
    </div>
  ));
}

/** Edit layer's road, rail, history, name and ski panels, as the phone lists them. */
export function OptionsPanel({ id, sections, kind = "" }: { id: string; sections: OptionSection[]; kind?: string }) {
  const marked = drawsPoints(sections);
  const plain = sections.filter((one) => !one.aspect);
  return (
    <PanelLayer.Provider value={id}><div className="card options" data-options={id}>
      <Sections id={id} sections={marked ? plain : offeredSections(kind, sections)} />
      {marked ? <MapMarkers id={id} kind={kind} sections={sections} /> : null}
    </div></PanelLayer.Provider>
  );
}
