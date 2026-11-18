"use client";

import type { OptionSection } from "@/lib/types";
import { Sym } from "../ui/Sym";

/** 64 The icons a layer's points may wear, grouped as the phone's picker groups them. */
export function MarkSymbols({ section, pick }: { section: OptionSection; pick: (symbol: string) => void }) {
  const worn = section.value ?? null;
  const groups = new Map<string, string[]>();
  for (const { id, detail = "" } of section.options ?? []) groups.set(detail, [...(groups.get(detail) ?? []), id]);
  const swatch = (name: string) => (
    <button key={name} type="button" aria-label={name} title={name} aria-pressed={name === worn} data-symbol={name}
      onClick={name === worn ? undefined : () => pick(name)}><Sym name={name} /></button>
  );
  return (
    <>
      <div className="swatches" role="group" aria-label={section.title}>
        {[...new Set([...(worn ? [worn] : []), ...(section.palette ?? [])])].map(swatch)}
      </div>
      {[...groups].map(([group, names]) => (
        <div key={group} style={{ display: "contents" }}>
          <div className="field"><label>{group}</label></div>
          <div className="swatches" role="group" aria-label={`${section.title} · ${group}`}>{names.map(swatch)}</div>
        </div>
      ))}
    </>
  );
}
