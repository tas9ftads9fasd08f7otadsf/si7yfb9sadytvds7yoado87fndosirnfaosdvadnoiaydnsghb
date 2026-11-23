"use client";

import { useState } from "react";
import { type Role, ROLES, roleOf, usedAs } from "@/lib/api";
import { type AnswerNode, answerChildren, answerNode, answerTrail, answerUp } from "@/lib/answer";
import type { APIReading } from "@/lib/types";
import { type Words, filledIn } from "@/lib/words";
import { useViewer } from "@/store/viewer";
import { Sym } from "../ui/Sym";

const ROLE_WORDS = { place: "apiRolePlace", latitude: "apiRoleLatitude", longitude: "apiRoleLongitude", name: "apiRoleName",
  picture: "apiRolePicture", colour: "apiRoleColour" } as const;
const KIND_WORDS = { text: "apiKindText", number: "apiKindNumber", empty: "apiKindEmpty" } as const;

/** What a stop in the answer is, as the row says it. */
export function describe(node: AnswerNode, words: Words): string {
  if (node.kind === "object") return filledIn(words.apiPartsCount, "count", String(node.count));
  if (node.kind === "list") return node.count ? filledIn(words.apiItemsCount, "count", String(node.count)) : words.apiEmptyList;
  const kind = words[KIND_WORDS[node.kind]];
  return node.sample ? `${kind} · ${node.sample}` : kind;
}

/** 171 Board 7: the answer as a tree; go into a list or object, Up goes back; read the points from a list, use a key. */
export function APIPoints({ answer, reading, pick, onDone }: { answer: unknown; reading: APIReading;
  pick: (change: Partial<APIReading>) => void; onDone: () => void }) {
  const words = useViewer((state) => state.words);
  // it opens beside the list the points are read from, so the choice of lists is in view
  const [path, setPath] = useState(() => answerNode(answer, reading.itemsPath) ? answerUp(reading.itemsPath) ?? "" : "");
  const here = answerNode(answer, path);
  const trail = answerTrail(answer, path);
  const list = [...trail].reverse().find((node) => node.holdsThings);
  const up = answerUp(path);
  const key = (node: AnswerNode) => list ? node.path.slice(list.path.length + (list.path ? 1 : 0)) : "";
  const roleHere = (node: AnswerNode): Role | "" => list && list.path === reading.itemsPath ? roleOf(reading, key(node)) ?? "" : "";
  return (
    <>
      <h2 className="title">{words.apiPoints}</h2>
      <div className="trail" id="apiTrail">
        {up !== null ? (
          <button type="button" id="apiUp" aria-label={words.apiUp} onClick={() => setPath(up)}>
            <Sym name="chevron.backward" />{words.apiUp}</button>
        ) : null}
        {trail.map((node) => (
          <button type="button" key={node.path} data-step={node.path} aria-current={node.path === path ? "location" : undefined}
            onClick={() => setPath(node.path)}>{node.name || words.apiAnswerRoot}</button>
        ))}
      </div>
      <div className="card" id="apiTree">
        {answerChildren(answer, path).map((node) => (
          <div className="row" key={node.path} data-node={node.path}>
            {node.kind === "object" || node.kind === "list" ? (
              <button type="button" className="words" disabled={!node.count} onClick={() => setPath(node.path)}>
                {node.name}<small>{describe(node, words)}</small>
              </button>
            ) : <span className="words">{node.name}<small>{describe(node, words)}</small></span>}
            {list && node.kind !== "object" && node.kind !== "list" ? (
              <select aria-label={`${words.apiUseAs} · ${node.name}`} value={roleHere(node)}
                onChange={(event) => pick(usedAs(reading, list.path, key(node), (event.target.value || null) as Role | null))}>
                <option value="">{words.apiNotUsed}</option>
                {ROLES.map((role) => <option key={role} value={role}>{words[ROLE_WORDS[role]]}</option>)}
              </select>
            ) : null}
          </div>
        ))}
      </div>
      {here?.holdsThings ? (
        path === reading.itemsPath
          ? <div className="foot-note" id="apiReadingFrom">{words.apiReadFromHere}</div>
          : <button type="button" className="action" id="apiReadFrom"
            onClick={() => pick(usedAs(reading, path, "", null))}>{words.apiReadFrom}</button>
      ) : null}
      <button type="button" className="action" id="apiPointsDone" onClick={onDone}>{words.apiDone}</button>
    </>
  );
}
