import { answerItems, itemValue } from "./answer";
import type { APIDetailRow, APIPointRule, APIReading, CookiePreflight } from "./types";

/** 3397 Whether a tap shows the key: every key, until some have been picked, as the phone reads it. */
export function shows(reading: APIReading, key: string): boolean {
  const shown = reading.shownKeys ?? [];
  return shown.length === 0 || shown.includes(key);
}

/** 3397 The shown keys after one is switched, empty again once all of them are, as the phone stores it. */
export function shownSwitched(reading: APIReading, keys: string[], key: string, isShown: boolean): string[] {
  const shown = reading.shownKeys?.length ? [...reading.shownKeys] : [...keys];
  const next = isShown ? (shown.includes(key) ? shown : [...shown, key]) : shown.filter((each) => each !== key);
  return next.length === keys.length && keys.every((each) => next.includes(each)) ? [] : next;
}

export const NO_COOKIES: CookiePreflight = { isOn: false, page: "", seconds: 0 };

/** 3397 A new Details row, with the mark the phone gives one. */
export function newDetailRow(): APIDetailRow {
  return { id: crypto.randomUUID().toUpperCase(), title: "", symbol: "info.circle", value: "" };
}

export function rowChanged(rows: APIDetailRow[], id: string, change: Partial<APIDetailRow>): APIDetailRow[] {
  return rows.map((row) => row.id === id ? { ...row, ...change } : row);
}

/** 171 The places a key of the points can be used as. */
export const ROLES = ["place", "latitude", "longitude", "name", "picture", "colour"] as const;
export type Role = typeof ROLES[number];

/** The key a reading uses for a role, or "" when none. */
export function roleKey(reading: APIReading, role: Role): string {
  switch (role) {
    case "place": return reading.spelling === "position" ? reading.positionKey : "";
    case "latitude": return reading.spelling === "position" ? "" : reading.latitudeKey;
    case "longitude": return reading.spelling === "position" ? "" : reading.longitudeKey;
    case "name": return reading.nameKey ?? "";
    case "picture": return reading.imageKey ?? "";
    case "colour": return reading.colourKey ?? "";
  }
}

/** The role a key plays in the reading, if any; `key` is relative to the items. */
export function roleOf(reading: APIReading, key: string): Role | null {
  return ROLES.find((role) => roleKey(reading, role) === key) ?? null;
}

/** What a reading becomes when `key` of the list at `list` is used as `role`, or as nothing. */
export function usedAs(reading: APIReading, list: string, key: string, role: Role | null): Partial<APIReading> {
  const moved: Partial<APIReading> = list === reading.itemsPath ? {}
    : { itemsPath: list, latitudeKey: "", longitudeKey: "", positionKey: "", nameKey: null, colourKey: null, imageKey: null,
      shownKeys: [], filter: null };
  const held = list === reading.itemsPath ? roleOf(reading, key) : null;
  const cleared: Partial<APIReading> = {};
  if (held === "place") cleared.positionKey = "";
  if (held === "latitude") cleared.latitudeKey = "";
  if (held === "longitude") cleared.longitudeKey = "";
  if (held === "name") cleared.nameKey = null;
  if (held === "picture") cleared.imageKey = null;
  if (held === "colour") cleared.colourKey = null;
  const change: Partial<APIReading> = { ...moved, ...cleared };
  if (role === "place") Object.assign(change, { spelling: "position", positionKey: key, positionOrder: null });
  if (role === "latitude" || role === "longitude") {
    const wasPosition = (moved.spelling ?? reading.spelling) === "position";
    Object.assign(change, { spelling: wasPosition ? "decimal" : reading.spelling,
      ...(role === "latitude" ? { latitudeKey: key } : { longitudeKey: key }) });
  }
  if (role === "name") change.nameKey = key;
  if (role === "picture") change.imageKey = key;
  if (role === "colour") change.colourKey = key;
  return change;
}

export const OPS = ["is", "isNot", "contains", "notEmpty"] as const;

/** A rule still being written holds for every point. */
export function ruleComplete(rule: APIPointRule): boolean {
  return rule.key.trim() !== "" && (rule.op !== "contains" || (rule.value ?? "").trim() !== "");
}

function ruleText(value: unknown): string {
  if (Array.isArray(value)) return value.map(ruleText).filter((each) => each.trim()).join(", ");
  return typeof value === "object" && value !== null ? "" : value === null || value === undefined ? "" : String(value);
}

function hasContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object" && value !== null) return Object.keys(value).length > 0;
  return ruleText(value).trim() !== "";
}

const loose = (text: string) => text.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Whether an item of the answer meets the rule, as the app's `APIPointRule.holds` reads it. */
export function rulePasses(rule: APIPointRule, item: unknown): boolean {
  if (rule.key.trim() === "") return true;
  const found = itemValue(item, rule.key.trim());
  if (rule.op === "notEmpty") return hasContent(found);
  const have = loose(ruleText(found));
  const wanted = loose(rule.value ?? "");
  if (rule.op === "is") return have === wanted;
  if (rule.op === "isNot") return have !== wanted;
  return wanted === "" || have.includes(wanted);
}

/** The items the reading's filter keeps: all of them, with none. */
export function keptItems(answer: unknown, reading: APIReading): unknown[] {
  return answerItems(answer, reading.itemsPath).filter((item) => (reading.filter ?? []).every((rule) => rulePasses(rule, item)));
}

/** The keys the reading places, names, colours or filters by, each once, in that order. */
export function usedKeys(reading: APIReading): string[] {
  const placed = reading.spelling === "position" ? [reading.positionKey] : [reading.latitudeKey, reading.longitudeKey];
  const named = [reading.nameKey, reading.colourKey, reading.imageKey].map((key) => key ?? "");
  const ruled = (reading.filter ?? []).map((rule) => rule.key);
  return [...new Set([...placed, ...named, ...ruled].map((key) => key.trim()).filter(Boolean))];
}

export type KeyView = "all" | "used" | "picked";

/** The keys a view of the Keys page lists. */
export function keysIn(view: KeyView, reading: APIReading, keys: string[]): string[] {
  if (view === "used") return keys.filter((key) => usedKeys(reading).includes(key));
  if (view === "picked") return keys.filter((key) => shows(reading, key));
  return keys;
}

/** The reading with a rule added, changed or removed; none left is no filter. */
export function ruleChanged(reading: APIReading, index: number, change: Partial<APIPointRule> | null): APIPointRule[] | null {
  const rules = [...(reading.filter ?? [])];
  if (index >= rules.length) rules.push({ key: "", op: "is", value: "", ...change });
  else if (change === null) rules.splice(index, 1);
  else rules[index] = { ...rules[index]!, ...change };
  return rules.length ? rules : null;
}
