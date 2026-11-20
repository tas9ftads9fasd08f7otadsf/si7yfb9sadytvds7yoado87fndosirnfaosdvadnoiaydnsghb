"use client";

import { useId, useState } from "react";
import type { DetailsLayout, LayoutBlock } from "@/lib/types";
import { setLayout, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { MarkTile } from "../ui/MarkTile";
import { Sym } from "../ui/Sym";
import { DetailsPreview } from "./DetailsPreview";
import { ActionsFields, BlockSettingsFields, HeaderFields } from "./DetailsSettings";
import { Translations } from "./DetailsTranslations";

type Send = (query: Record<string, string>) => void;
type Place = { section: number; block: number };

const at = ({ section, block }: Place, handle: string) =>
  ({ section: String(section), block: String(block), was: handle });
const atPlace = (section: number, block: number, handle: string) => at({ section, block }, handle);

/** A text block's words, heading and style, or an image block's link, sent once typed. */
export function BlockFields({ block, place, words, takes, send }:
  { block: LayoutBlock; place: Place; words: Record<string, string>; takes?: boolean; send: Send }) {
  const edit = (fields: Record<string, string>) => send({
    details: "edit", ...at(place, block.handle), kind: block.kind, value: block.value ?? "",
    title: block.heading ?? "", style: block.style ?? "", ...fields,
  });
  if (block.kind === "image") {
    return <CommitField type="url" value={block.value ?? ""} aria-label={words.link} spellCheck={false}
      autoCapitalize="off" onCommit={(value) => value.trim() && edit({ value })} />;
  }
  if (block.kind !== "text") return null;
  return (
    <div className="block-fields">
      <CommitField value={block.heading ?? ""} aria-label={words.heading} placeholder={words.heading}
        onCommit={(title) => edit({ title })} />
      <Translations label={`${block.name} ${place.section + 1}.${place.block + 1}`} base={block.heading}
        held={block.headingTranslations}
        takes={takes} send={(language, text) => send({ details: "translation", target: "text",
          ...at(place, block.handle), language, text })} />
      <CommitField multiline value={block.value ?? ""} aria-label={words.value} spellCheck={false}
        onCommit={(value) => value.trim() && edit({ value })} />
      <select aria-label={block.name} value={block.style ?? "box"} onChange={(event) => edit({ style: event.target.value })}>
        {["plain", "box", "warning"].map((style) => <option key={style} value={style}>{words[style]}</option>)}
      </select>
    </div>
  );
}

/** What a section adds at its foot: a kind the page fills in, or one of the app's parts. */
export function AddContent({ layout, section, send }: { layout: DetailsLayout; section: number; send: Send }) {
  const { words } = layout;
  const keysID = useId();
  const [kind, setKind] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const full = layout.used >= layout.limit;
  const part = layout.parts.find((block) => `app:${block.part}` === kind);
  const needs: Record<string, string[]> = { rows: ["title", "value"], link: ["label", "value"],
    image: ["value"], text: ["title", "value"] };
  const named: Record<string, string | undefined> = { title: kind === "rows" ? words.name : words.heading,
    label: words.label, value: kind === "rows" || kind === "text" ? words.value : words.link };
  const ready = part != null || (needs[kind] != null && (fields.value ?? "").trim() !== ""
    && (kind !== "link" || (fields.label ?? "").trim() !== ""));
  const add = () => {
    const place = String(layout.sections[section]?.blocks.length ?? 0);
    send(part ? { details: "add", section: String(section), place, kind: "app", part: part.part ?? "" }
      : { details: "add", section: String(section), place, kind, ...fields });
    setKind("");
    setFields({});
  };
  return (
    <div className="add-content" data-section={section}>
      <select aria-label={words.addContent} value={kind} onChange={(event) => { setKind(event.target.value); setFields({}); }}>
        <option value="">{words.addContent}</option>
        {full ? null : layout.offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.title}</option>)}
        {layout.parts.length ? (
          <optgroup label={words.fromTheApp}>
            {layout.parts.map((block) => <option key={block.part} value={`app:${block.part}`}>{block.name}</option>)}
          </optgroup>
        ) : null}
      </select>
      {(needs[kind] ?? []).map((field) => (
        <input key={field} aria-label={named[field]} placeholder={named[field]} value={fields[field] ?? ""}
          list={field === "value" ? keysID : undefined} spellCheck={false} autoCapitalize="off"
          onChange={(event) => setFields({ ...fields, [field]: event.target.value })} />
      ))}
      <datalist id={keysID}>{layout.keys.map((key) => <option key={key} value={`{${key}}`} />)}</datalist>
      {kind ? <button type="button" disabled={!ready} onClick={add}>{words.addContent}</button> : null}
    </div>
  );
}

type Picked = { kind: "header" } | { kind: "actions" } | { kind: "block"; section: number; block: number };

const blockIcon: Record<string, string> = { connectionCard: "rectangle.and.text.magnifyingglass", rows: "list.bullet",
  text: "text.alignleft", image: "photo", button: "arrow.up.forward.square", link: "link" };

/** 95 W16's panes: the layout to pick a part in, the picked part's settings, the sheet it makes. */
export function DetailsLayoutPanel({ layout, scoped }:
  { layout: DetailsLayout; scoped: (query: Record<string, string>) => Record<string, string> }) {
  const send: Send = (query) => void setLayout(scoped(query));
  const [picked, setPicked] = useState<Picked>(layout.header ? { kind: "header" }
    : layout.actions !== undefined ? { kind: "actions" } : { kind: "block", section: 0, block: 0 });
  return (
    <div className="details-layout">
      <div className="details-pane layout-pane">
        <LayoutList layout={layout} picked={picked} pick={setPicked} send={send} />
      </div>
      <div className="details-pane settings-pane"><Settings layout={layout} picked={picked} send={send} /></div>
      <div className="details-pane preview-pane">
        <div className="sheet">
          {layout.samples ? <DetailsPreview layout={layout} layer={scoped({}).layer ?? ""} />
            : <p className="empty">{layout.sampleNote}</p>}
        </div>
      </div>
    </div>
  );
}

function LayoutList({ layout, picked, pick, send }: { layout: DetailsLayout;
  picked: Picked; pick: (picked: Picked) => void; send: Send }) {
  const shared = useViewer((state) => state.words);
  const { words, sections } = layout;
  const [adding, setAdding] = useState<number | null>(null);
  const isPicked = (kind: Picked["kind"], section = -1, block = -1) => picked.kind === kind
    && (picked.kind !== "block" || (picked.section === section && picked.block === block));
  const actions = layout.actions?.items.filter((item) => item.isOn) ?? [];
  return (
    <>
      {layout.header ? (
        <button type="button" className="part-card head" aria-pressed={isPicked("header")} data-card="header"
          onClick={() => pick({ kind: "header" })}>
          <MarkTile symbol={layout.header.symbol || layout.header.layerSymbol} />
          <span className="words"><small>{words.header}</small><b>{layout.header.title || words.layerIcon}</b></span>
          <Sym name="chevron.forward" />
        </button>
      ) : null}
      {layout.actions !== undefined ? (
        <button type="button" className="part-card" aria-pressed={isPicked("actions")} data-card="actions"
          onClick={() => pick({ kind: "actions" })}>
          <span className="tile"><Sym name="capsule" /></span>
          <span className="words"><small>{words.actions}</small>
            <b>{actions.length ? actions.map((item) => item.name).join(" · ") : words.addActions}</b></span>
          <Sym name="chevron.forward" />
        </button>
      ) : null}
      {sections.map((section, index) => (
        <div className="layout-section" key={index} data-section={index}>
          <div className="section-head">
            <CommitField value={section.title ?? ""} placeholder={section.name} aria-label={words.sectionTitle}
              onCommit={(title) => send({ details: "sectionTitle", section: String(index), title })} />
            {sections.length > 1 ? (
              <button type="button" className="link danger" onClick={() =>
                send({ details: "removeSection", section: String(index) })}>{words.removeSection}</button>
            ) : null}
          </div>
          <Translations label={`${words.sectionTitle} ${index + 1}`} base={section.title} held={section.titleTranslations}
            takes={layout.takesTranslations}
            send={(language, text) => send({ details: "translation", target: "section", section: String(index),
              language, text })} />
          {section.blocks.map((block, place) => (
            <div className="layout-item" key={block.handle} data-block={block.kind} data-handle={block.handle}>
              <button type="button" className="remove" aria-label={`${shared.remove} ${block.name}`}
                onClick={() => send({ details: "remove", ...atPlace(index, place, block.handle) })}>
                <Sym name="minus" /></button>
              <button type="button" className="part-card small" aria-pressed={isPicked("block", index, place)}
                onClick={() => pick({ kind: "block", section: index, block: place })}>
                <span className="tile"><Sym name={blockIcon[block.kind] ?? "square.text.square"} /></span>
                <span className="words"><b>{block.name}</b><small>{blockLine(block)}</small></span>
                <Sym name="line.3.horizontal" />
              </button>
            </div>
          ))}
          <button type="button" className="add-content-toggle" aria-expanded={adding === index}
            onClick={() => setAdding(adding === index ? null : index)}>
            <Sym name="plus" />{words.addContent}
          </button>
          {adding === index ? <AddContent layout={layout} section={index} send={send} /> : null}
        </div>
      ))}
      <button type="button" className="add-section" onClick={() => send({ details: "addSection" })}>
        <Sym name="folder.badge.plus" />{words.addSection}
      </button>
      <small className="used">{layout.used >= layout.limit ? words.full : words.used}</small>
    </>
  );
}

const blockLine = (block: LayoutBlock) => block.heading || block.value || "";

function Settings({ layout, picked, send }: { layout: DetailsLayout; picked: Picked; send: Send }) {
  const shared = useViewer((state) => state.words);
  const { words, sections } = layout;
  if (picked.kind === "header") {
    return <><PaneTitle title={words.header} /><HeaderFields layout={layout} send={send} /></>;
  }
  if (picked.kind === "actions") {
    return <><PaneTitle title={words.actions} /><ActionsFields layout={layout} send={send} /></>;
  }
  const block = sections[picked.section]?.blocks[picked.block];
  if (!block) return <PaneTitle title={words.header} />;
  const { section, block: place } = picked;
  const last = place === (sections[section]?.blocks.length ?? 0) - 1;
  const up = place > 0 ? { section, block: place - 1 }
    : section > 0 ? { section: section - 1, block: sections[section - 1]?.blocks.length ?? 0 } : null;
  const down = !last ? { section, block: place + 1 }
    : section < sections.length - 1 ? { section: section + 1, block: 0 } : null;
  const move = (to: { section: number; block: number }) => send({ details: "move",
    ...atPlace(section, place, block.handle), toSection: String(to.section), toPlace: String(to.block) });
  return (
    <div className="layout-block" data-block={block.kind} data-handle={block.handle}>
      <PaneTitle title={block.name} />
      <div className="buttons">
        <button type="button" className="pill" aria-label={`${shared.moveUp} ${block.name}`} disabled={!up}
          onClick={up ? () => move(up) : undefined}><Sym name="chevron.up" />{shared.moveUp}</button>
        <button type="button" className="pill" aria-label={`${shared.moveDown} ${block.name}`} disabled={!down}
          onClick={down ? () => move(down) : undefined}><Sym name="chevron.down" />{shared.moveDown}</button>
      </div>
      <BlockFields block={block} place={{ section, block: place }} words={words} takes={layout.takesTranslations}
        send={send} />
      <BlockSettingsFields block={block} place={atPlace(section, place, block.handle)} layout={layout} send={send} />
    </div>
  );
}

function PaneTitle({ title }: { title?: string }) {
  const words = useViewer((state) => state.words);
  return <div className="pane-title"><small>{words.settings}</small><b>{title}</b></div>;
}
