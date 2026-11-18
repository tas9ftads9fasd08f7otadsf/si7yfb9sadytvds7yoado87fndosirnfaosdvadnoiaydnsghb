import type { APIDetailRow, APIReading, CookiePreflight } from "./types";

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
