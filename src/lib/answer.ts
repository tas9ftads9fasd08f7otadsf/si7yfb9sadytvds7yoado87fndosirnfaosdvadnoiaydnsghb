/** 171 An API's answer as the tree the Points page walks, by the dot paths a reading uses; the app's `APIAnswerTree`. */
export type AnswerKind = "object" | "list" | "text" | "number" | "empty";

export interface AnswerNode {
  /** The dot path `itemsPath` and the keys are written in; empty is the answer itself. */
  path: string;
  name: string;
  kind: AnswerKind;
  /** An object's parts or a list's things; for a key of items, how many carry it. */
  count: number;
  sample?: string;
  /** A list of objects, which is what points are read from. */
  holdsThings: boolean;
}

/** A list of things is described by this many of them, each key by the first that fills it. */
export const ITEMS_SEEN = 50;
export const SAMPLE_LENGTH = 40;
/** How far down a thing's keys are listed, `owner.name` being two. */
export const KEY_DEPTH = 3;

type Part = { name: string; value: unknown };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isScalar = (value: unknown) => ["string", "number", "boolean"].includes(typeof value);
const textOf = (value: unknown) => isScalar(value) ? String(value) : null;
const filled = (value: unknown) => (textOf(value) ?? "").trim() !== "";
const join = (prefix: string, name: string) => prefix ? `${prefix}.${name}` : name;
const nameOf = (path: string) => path.split(".").filter(Boolean).pop() ?? "";

function partsOf(value: unknown): Part[] {
  if (isObject(value)) return Object.keys(value).sort().map((name) => ({ name, value: value[name] }));
  if (!Array.isArray(value)) return [];
  const seen = value.slice(0, ITEMS_SEEN);
  if (!seen.some(isObject)) return seen.map((each, index) => ({ name: String(index), value: each }));
  const first = new Map<string, unknown>();
  for (const thing of seen) {
    if (!isObject(thing)) continue;
    for (const [key, part] of Object.entries(thing)) {
      if (!first.has(key) || (!filled(first.get(key)) && filled(part))) first.set(key, part);
    }
  }
  return [...first.keys()].sort().map((name) => ({ name, value: first.get(name) }));
}

function nodeOf(name: string, path: string, value: unknown): AnswerNode {
  if (isObject(value)) return { path, name, kind: "object", count: Object.keys(value).length, holdsThings: false };
  if (Array.isArray(value)) {
    const first = value[0];
    return { path, name, kind: "list", count: value.length, holdsThings: isObject(first) && Object.keys(first).length > 0 };
  }
  const text = textOf(value);
  const sample = text !== null && text.trim() ? text.trim().slice(0, SAMPLE_LENGTH) : undefined;
  if (typeof value === "number") return { path, name, kind: "number", count: 0, sample, holdsThings: false };
  return { path, name, kind: text === null || !text.trim() ? "empty" : "text", count: 0, sample, holdsThings: false };
}

function resolve(answer: unknown, path: string): { found: boolean; value?: unknown } {
  let here = answer;
  for (const step of path.split(".").filter(Boolean)) {
    const next = partsOf(here).find((part) => part.name === step);
    if (!next) return { found: false };
    here = next.value;
  }
  return { found: true, value: here };
}

export function answerRoot(answer: unknown): AnswerNode {
  return nodeOf("", "", answer);
}

export function answerNode(answer: unknown, path: string): AnswerNode | null {
  const at = resolve(answer, path);
  return at.found ? nodeOf(nameOf(path), path, at.value) : null;
}

/** What is inside the object or list at `path`; a list of objects shows the keys of its things. */
export function answerChildren(answer: unknown, path: string): AnswerNode[] {
  const at = resolve(answer, path);
  return at.found ? partsOf(at.value).map((part) => nodeOf(part.name, join(path, part.name), part.value)) : [];
}

/** The path Up goes to; null at the answer itself. */
export function answerUp(path: string): string | null {
  if (!path) return null;
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(0, dot);
}

/** The answer, then each step down to `path`. */
export function answerTrail(answer: unknown, path: string): AnswerNode[] {
  const steps = [path];
  for (let above = answerUp(path); above !== null; above = answerUp(above)) steps.unshift(above);
  return steps.flatMap((step) => answerNode(answer, step) ?? []);
}

/** Lists of objects anywhere in the answer, shallowest first: where points can be read from. */
export function pointLists(answer: unknown, under = "", depth = 0): AnswerNode[] {
  if (depth >= 6) return [];
  const at = resolve(answer, under);
  if (!at.found) return [];
  if (Array.isArray(at.value)) {
    const node = nodeOf(nameOf(under), under, at.value);
    return node.holdsThings ? [node] : [];
  }
  return isObject(at.value)
    ? Object.keys(at.value).sort().flatMap((name) => pointLists(answer, join(under, name), depth + 1))
    : [];
}

const isScalars = (value: unknown) => Array.isArray(value) && value.every((each) => isScalar(each));

function scalarsIn(value: unknown, depth: number, lists: boolean, prefix = ""): [string, unknown][] {
  if (depth <= 0 || !isObject(value)) return [];
  return Object.keys(value).sort().flatMap((key) => {
    const part = value[key];
    const path = join(prefix, key);
    if (isScalar(part) || part === null) return [[path, part] as [string, unknown]];
    // a list of plain values, tags say, is a key a rule can look into though a tap cannot show it
    if (lists && isScalars(part)) return [[path, (part as unknown[]).join(", ")] as [string, unknown]];
    return scalarsIn(part, depth - 1, lists, path);
  });
}

/** Every scalar key of the things in the list at `path`, nested ones by path, with how many carry each. */
export function answerKeys(answer: unknown, path: string, withLists = false): AnswerNode[] {
  const at = resolve(answer, path);
  if (!at.found) return [];
  const things = Array.isArray(at.value) ? at.value.slice(0, ITEMS_SEEN) : isObject(at.value) ? [at.value] : [];
  const found = new Map<string, AnswerNode>();
  for (const thing of things) {
    for (const [key, value] of scalarsIn(thing, KEY_DEPTH, withLists)) {
      const seen = found.get(key);
      if (seen) {
        if (filled(value)) seen.count += 1;
        seen.sample ??= nodeOf("", key, value).sample;
      } else {
        found.set(key, { ...nodeOf(nameOf(key), key, value), count: filled(value) ? 1 : 0 });
      }
    }
  }
  return [...found.keys()].sort().map((key) => found.get(key)!);
}

/** The things the reading's items path holds, as the phone reads them: a list, or the answer's one object. */
export function answerItems(answer: unknown, path: string): unknown[] {
  const at = resolve(answer, path);
  if (!at.found) return [];
  return Array.isArray(at.value) ? at.value : isObject(at.value) ? [at.value] : [];
}

/** A key of an item by its dot path, as the phone reads it; into a list means its first thing. */
export function itemValue(item: unknown, key: string): unknown {
  let here = item;
  for (const step of key.split(".").filter(Boolean)) {
    if (Array.isArray(here)) {
      const index = /^\d+$/.test(step) ? Number(step) : -1;
      here = index >= 0 ? here[index] : isObject(here[0]) ? (here[0] as Record<string, unknown>)[step] : undefined;
    } else if (isObject(here)) here = here[step];
    else return undefined;
  }
  return here;
}
