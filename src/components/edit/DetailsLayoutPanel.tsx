"use client";

import { useId, useState } from "react";
import type { DetailsLayout, LayoutBlock } from "@/lib/types";
import { setLayout, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { Sym } from "../ui/Sym";

type Send = (query: Record<string, string>) => void;
type Place = { section: number; block: number };

const at = ({ section, block }: Place, handle: string) =>
  ({ section: String(section), block: String(block), was: handle });

/** A text block's words, heading and style, or an image block's link, sent once typed. */
function BlockFields({ block, place, words, send }:
  { block: LayoutBlock; place: Place; words: Record<string, string>; send: Send }) {
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
      <CommitField multiline value={block.value ?? ""} aria-label={words.value} spellCheck={false}
        onCommit={(value) => value.trim() && edit({ value })} />
      <select aria-label={block.name} value={block.style ?? "box"} onChange={(event) => edit({ style: event.target.value })}>
        {["plain", "box", "warning"].map((style) => <option key={style} value={style}>{words[style]}</option>)}
      </select>
    </div>
  );
}

/** What a section adds at its foot: a kind the page fills in, or one of the app's parts. */
function AddContent({ layout, section, send }: { layout: DetailsLayout; section: number; send: Send }) {
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

/** Edit layer's Details page: sections and blocks, each change sent to the phone on its own. */
export function DetailsLayoutPanel({ layout, scoped }:
  { layout: DetailsLayout; scoped: (query: Record<string, string>) => Record<string, string> }) {
  const shared = useViewer((state) => state.words);
  const send: Send = (query) => void setLayout(scoped(query));
  const { words, sections } = layout;
  const move = (place: Place, handle: string, to: Place) =>
    send({ details: "move", ...at(place, handle), toSection: String(to.section), toPlace: String(to.block) });
  return (
    <div className="details-layout">
      {sections.map((section, index) => (
        <div className="layout-section" key={index} data-section={index}>
          <div className="row">
            <CommitField value={section.title ?? ""} placeholder={section.name} aria-label={words.sectionTitle}
              onCommit={(title) => send({ details: "sectionTitle", section: String(index), title })} />
            {sections.length > 1 ? (
              <button type="button" className="link" onClick={() =>
                send({ details: "removeSection", section: String(index) })}>{words.removeSection}</button>
            ) : null}
          </div>
          {section.blocks.map((block, place) => {
            const here = { section: index, block: place };
            const last = place === section.blocks.length - 1;
            const up = place > 0 ? { section: index, block: place - 1 }
              : index > 0 ? { section: index - 1, block: sections[index - 1]?.blocks.length ?? 0 } : null;
            const down = !last ? { section: index, block: place + 1 }
              : index < sections.length - 1 ? { section: index + 1, block: 0 } : null;
            return (
              <div className="layout-block" key={block.handle} data-block={block.kind} data-handle={block.handle}>
                <div className="row">
                  <span className="words">{block.name}</span>
                  <button type="button" aria-label={`${shared.moveUp} ${block.name}`} disabled={!up}
                    onClick={up ? () => move(here, block.handle, up) : undefined}><Sym name="chevron.up" /></button>
                  <button type="button" aria-label={`${shared.moveDown} ${block.name}`} disabled={!down}
                    onClick={down ? () => move(here, block.handle, down) : undefined}><Sym name="chevron.down" /></button>
                  <button type="button" aria-label={`${shared.remove} ${block.name}`}
                    onClick={() => send({ details: "remove", ...at(here, block.handle) })}><Sym name="minus.circle" /></button>
                </div>
                <BlockFields block={block} place={here} words={words} send={send} />
              </div>
            );
          })}
          <AddContent layout={layout} section={index} send={send} />
        </div>
      ))}
      <div className="row">
        <span className="words"><small>{layout.used >= layout.limit ? words.full : words.used}</small></span>
        <button type="button" className="link" onClick={() => send({ details: "addSection" })}>{words.addSection}</button>
      </div>
    </div>
  );
}
