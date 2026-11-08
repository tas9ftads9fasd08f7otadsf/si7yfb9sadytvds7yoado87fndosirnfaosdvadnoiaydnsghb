"use client";

import { flushSync } from "react-dom";
import type { Portable } from "@/lib/types";
import { listed } from "@/lib/words";
import { addLanguage, change, removeLanguage, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { Sym } from "../ui/Sym";

/** The name and note in other languages, as Edit map writes them. */
export function Languages({ portable }: { portable: Portable }) {
  const words = useViewer((state) => state.words);
  const added = useViewer((state) => state.addedLanguages);
  const languageName = (code: string) => words[`language.${code}`] ?? code;
  const byName = (one: string, other: string) => languageName(one).localeCompare(languageName(other));
  const names = portable.nameTranslations ?? {};
  const notes = portable.noteTranslations ?? {};
  const written = [...new Set([...Object.keys(names), ...Object.keys(notes), ...added])].sort(byName);
  const free = listed(words.languages).filter((code) => !written.includes(code)).sort(byName);
  const add = (code: string) => {
    if (!code) return;
    flushSync(() => addLanguage(code));
    document.querySelector<HTMLInputElement>(`[data-language="${code}"] input`)?.focus();
  };
  return (
    <>
      <h2 className="title">{words.otherLanguages}</h2>
      {written.map((code) => {
        const said = languageName(code);
        return (
          <div key={code} className="card language" data-language={code} style={{ marginTop: 8 }}>
            <div className="field language-head"><b>{said}</b>
              <button type="button" className="icon-button danger" aria-label={`${words.remove} · ${said}`}
                title={words.remove} onClick={() => removeLanguage(code, names[code], notes[code])}><Sym name="trash" /></button>
            </div>
            <div className="field"><label>{words.name}</label>
              <CommitField type="text" value={names[code] ?? ""} aria-label={`${words.name} · ${said}`} maxLength={200}
                onCommit={(name) => change({ language: code, name })} /></div>
            <div className="field"><label>{words.note}</label>
              <CommitField multiline rows={2} value={notes[code] ?? ""} aria-label={`${words.note} · ${said}`}
                maxLength={2000} onCommit={(note) => change({ language: code, note })} /></div>
          </div>
        );
      })}
      {free.length ? (
        <div className="field">
          <select id="addLanguage" aria-label={words.addLanguage} value="" onChange={(event) => add(event.target.value)}>
            <option value="">{words.addLanguage}</option>
            {free.map((code) => <option key={code} value={code}>{languageName(code)}</option>)}
          </select>
        </div>
      ) : null}
    </>
  );
}
