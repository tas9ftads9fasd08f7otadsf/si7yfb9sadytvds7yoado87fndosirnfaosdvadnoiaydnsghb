"use client";

import { useState } from "react";
import { OPS, type KeyView, keysIn, roleOf, ruleChanged, shownSwitched } from "@/lib/api";
import { answerItems, answerKeys } from "@/lib/answer";
import { keptItems, shows } from "@/lib/api";
import type { APIPointRule, APIRead, APIReading } from "@/lib/types";
import { filledIn } from "@/lib/words";
import { useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { Sym } from "../ui/Sym";
import { Switch } from "../ui/Switch";

const VIEWS = [["all", "apiViewAll"], ["used", "apiViewUsed"], ["picked", "apiViewPicked"]] as const;
const OP_WORDS = { is: "apiOpIs", isNot: "apiOpIsNot", contains: "apiOpContains", notEmpty: "apiOpNotEmpty" } as const;
const ROLE_WORDS = { place: "apiRolePlace", latitude: "apiRoleLatitude", longitude: "apiRoleLongitude", name: "apiRoleName",
  picture: "apiRolePicture", colour: "apiRoleColour" } as const;

/** 171 Board 7: a switch per key, nested ones by path, All keys / What's used / Picked; only points where a key is, isn't… */
export function APIKeys({ read, reading, pick, onDone }: { read: APIRead; reading: APIReading;
  pick: (change: Partial<APIReading>) => void; onDone: () => void }) {
  const words = useViewer((state) => state.words);
  const [view, setView] = useState<KeyView>("all");
  const found = answerKeys(read.answer, reading.itemsPath);
  const keys = found.length ? found.map((node) => node.path) : read.keys;
  const ruled = answerKeys(read.answer, reading.itemsPath, true).map((node) => node.path);
  const samples = new Map(found.map((node) => [node.path, node.sample]));
  const rules = reading.filter ?? [];
  const total = answerItems(read.answer, reading.itemsPath).length;
  const setRule = (index: number, change: Partial<APIPointRule> | null) => pick({ filter: ruleChanged(reading, index, change) });
  return (
    <>
      <h2 className="title">{words.apiTapShows}</h2>
      <div className="chips" role="tablist" aria-label={words.apiTapShows} id="apiKeyViews">
        {VIEWS.map(([each, word]) => (
          <button key={each} type="button" role="tab" aria-selected={each === view} data-view={each}
            className={each === view ? "picked" : undefined} onClick={() => setView(each)}>{words[word]}</button>
        ))}
      </div>
      <div className="card" id="apiKeyList">
        {keysIn(view, reading, keys).map((key) => {
          const role = roleOf(reading, key);
          const sample = samples.get(key) ?? read.samples?.[key];
          return (
            <div className="row" key={key} data-key={key}>
              <span className="words">{key}<small>{[role ? words[ROLE_WORDS[role]] : "", sample ?? ""].filter(Boolean).join(" · ")}</small></span>
              <Switch isOn={shows(reading, key)} label={key}
                onChange={(isOn) => pick({ shownKeys: shownSwitched(reading, keys, key, isOn) })} />
            </div>
          );
        })}
        {keysIn(view, reading, keys).length ? null : <div className="foot-note">{words.apiNoKeys}</div>}
      </div>
      <h2 className="title">{words.apiFilterTitle}</h2>
      <div className="card" id="apiFilter">
        {rules.map((rule, index) => (
          <div className="field" key={index} data-rule={index}>
            <select aria-label={words.apiRuleKey} value={rule.key} onChange={(event) => setRule(index, { key: event.target.value })}>
              <option value="">—</option>
              {[...new Set([...(ruled.length ? ruled : keys), rule.key].filter(Boolean))].map((key) => <option key={key} value={key}>{key}</option>)}
            </select>
            <select aria-label={words.apiFilterTitle} value={rule.op}
              onChange={(event) => setRule(index, { op: event.target.value as APIPointRule["op"] })}>
              {OPS.map((op) => <option key={op} value={op}>{words[OP_WORDS[op]]}</option>)}
            </select>
            {rule.op === "notEmpty" ? null : (
              <CommitField type="text" aria-label={words.apiRuleValue} placeholder={words.apiRuleValue} spellCheck={false}
                value={rule.value ?? ""} onCommit={(value) => setRule(index, { value })} />
            )}
            <button type="button" aria-label={words.apiRemoveRule} title={words.apiRemoveRule}
              onClick={() => setRule(index, null)}><Sym name="minus.circle" /></button>
          </div>
        ))}
        <button type="button" className="row add" id="apiAddRule" onClick={() => setRule(rules.length, {})}>
          <Sym name="plus" />{words.apiFilterAdd}
        </button>
      </div>
      <div className="foot-note" id="apiKept">{rules.length && total
        ? filledIn(filledIn(words.apiKept, "kept", String(keptItems(read.answer, reading).length)), "total", String(total))
        : words.apiFilterNote}</div>
      <button type="button" className="action" id="apiKeysDone" onClick={onDone}>{words.apiDone}</button>
    </>
  );
}
