"use client";

import { flushSync } from "react-dom";
import { useRef, useState } from "react";
import { listed } from "@/lib/words";
import { useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { Sym } from "../ui/Sym";

/** 81: a Details title in other languages, a field each; a blank text takes the language away. */
export function Translations({ label, base, held, takes, send }: { label: string; base?: string | null;
  held?: Record<string, string> | null; takes?: boolean; send: (language: string, text: string) => void }) {
  const words = useViewer((state) => state.words);
  const [added, setAdded] = useState<string[]>([]);
  const part = useRef<HTMLDetailsElement>(null);
  const kept = held ?? {};
  const named = (code: string) => words[`language.${code}`] ?? code;
  const byName = (one: string, other: string) => named(one).localeCompare(named(other));
  const shown = [...new Set([...Object.keys(kept), ...added])].sort(byName);
  // The phone refuses a translation of a title not written yet, so none is offered.
  const free = base?.trim() ? listed(words.languages).filter((code) => !shown.includes(code)).sort(byName) : [];
  if (!takes || (!shown.length && !free.length)) return null;
  const drop = (code: string) => setAdded(added.filter((one) => one !== code));
  const commit = (code: string, text: string) => {
    if (text.trim()) return send(code, text);
    drop(code);
    if (kept[code] !== undefined) send(code, "");
  };
  const add = (code: string) => {
    if (!code) return;
    flushSync(() => setAdded([...added, code]));
    part.current?.querySelector<HTMLInputElement>(`[data-language="${code}"] input`)?.focus();
  };
  return (
    <details className="translations" ref={part} data-translations={label}>
      <summary>{words.otherLanguages}{shown.length ? ` (${shown.length})` : ""}</summary>
      <div className="block-fields" role="group" aria-label={`${label} · ${words.otherLanguages}`}>
        {shown.map((code) => (
          <div className="row translation" key={code} data-language={code}>
            <small>{named(code)}</small>
            <CommitField value={kept[code] ?? ""} aria-label={`${label} · ${named(code)}`} maxLength={200}
              onCommit={(text) => commit(code, text)} />
            <button type="button" aria-label={`${words.remove} · ${label} · ${named(code)}`}
              onClick={() => commit(code, "")}><Sym name="minus.circle" /></button>
          </div>
        ))}
        {free.length ? (
          <select aria-label={`${words.addLanguage} · ${label}`} value="" onChange={(event) => add(event.target.value)}>
            <option value="">{words.addLanguage}</option>
            {free.map((code) => <option key={code} value={code}>{named(code)}</option>)}
          </select>
        ) : null}
      </div>
    </details>
  );
}
