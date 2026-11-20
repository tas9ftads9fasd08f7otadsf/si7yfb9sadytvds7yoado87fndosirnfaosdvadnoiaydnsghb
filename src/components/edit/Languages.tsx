"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import type { Portable } from "@/lib/types";
import { listed } from "@/lib/words";
import { addLanguage, change, removeLanguage, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";

/** The name and note in other languages, as Edit map writes them; 109 a chip each, W6's, the picked one's fields. */
export function Languages({ portable }: { portable: Portable }) {
  const words = useViewer((state) => state.words);
  const added = useViewer((state) => state.addedLanguages);
  const [picked, setPicked] = useState<string | null>(null);
  const languageName = (code: string) => words[`language.${code}`] ?? code;
  const byName = (one: string, other: string) => languageName(one).localeCompare(languageName(other));
  const names = portable.nameTranslations ?? {};
  const notes = portable.noteTranslations ?? {};
  const written = [...new Set([...Object.keys(names), ...Object.keys(notes), ...added])].sort(byName);
  const free = listed(words.languages).filter((code) => !written.includes(code)).sort(byName);
  const shown = picked && written.includes(picked) ? picked : written[0] ?? null;
  const add = (code: string) => {
    if (!code) return;
    flushSync(() => {
      addLanguage(code);
      setPicked(code);
    });
    document.querySelector<HTMLInputElement>(`[data-language="${code}"] input`)?.focus();
  };
  const said = shown ? languageName(shown) : "";
  return (
    <div className="language-chips">
      <div className="chips" role="group" aria-label={words.otherLanguages}>
        {written.map((code) => (
          <button type="button" key={code} data-language-chip={code} aria-pressed={code === shown}
            className={code === shown ? "picked" : undefined} onClick={() => setPicked(code)}>{languageName(code)}</button>
        ))}
        {free.length ? (
          <select id="addLanguage" aria-label={words.addLanguage} value="" onChange={(event) => add(event.target.value)}>
            <option value="">{words.addLanguage}</option>
            {free.map((code) => <option key={code} value={code}>{languageName(code)}</option>)}
          </select>
        ) : null}
      </div>
      {shown ? (
        <div className="language" data-language={shown}>
          <div className="field"><label>{words.name}</label>
            <CommitField type="text" value={names[shown] ?? ""} aria-label={`${words.name} · ${said}`} maxLength={200}
              onCommit={(name) => change({ kind: "nameIn", language: shown, name })} /></div>
          <div className="field"><label>{words.note}</label>
            <CommitField multiline rows={2} value={notes[shown] ?? ""} aria-label={`${words.note} · ${said}`}
              maxLength={2000} onCommit={(note) => change({ kind: "noteIn", language: shown, note })} /></div>
          <button type="button" className="text-link danger" aria-label={`${words.remove} · ${said}`}
            onClick={() => removeLanguage(shown, names[shown], notes[shown])}>{words.remove}</button>
        </div>
      ) : null}
    </div>
  );
}
