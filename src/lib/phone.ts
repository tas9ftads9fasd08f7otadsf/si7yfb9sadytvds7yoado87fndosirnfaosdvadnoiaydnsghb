export const ROOT = "/riki/v1";
export const SESSION = "/web/session";
export const EDIT_CHECK = "/web/edit-check";
export const HEARTBEAT_EVERY = 5000;
export const LIVE_EVERY = 60000;
export const PHONE_EVERY = 5000;
export const REGIONS_EVERY = 10000;
export const TOKEN_KEY = "riki-edit-token";
export const THEME_KEY = "riki-theme";

export async function readJSON<T>(path: string): Promise<T> {
  const answer = await fetch(path, { cache: "no-store" });
  if (!answer.ok) throw new Error(await answer.text());
  return answer.json() as Promise<T>;
}

/** 21: null where the phone has nothing to say (204). */
export async function readJSONIfAny<T>(path: string): Promise<T | null> {
  const answer = await fetch(path, { cache: "no-store" });
  if (answer.status === 204) return null;
  if (!answer.ok) throw new Error(await answer.text());
  return answer.json() as Promise<T>;
}

export const symbolURL = (name?: string | null) => `url("/web/symbols/${encodeURIComponent(name || "map")}")`;

/** A password, typed with any case or gaps, as the phone reads it. */
export const typedKey = (typed: string) => typed.toUpperCase().replace(/[^0-9A-Z]/g, "");

/** The file name a `.mapson` answer carries, UTF-8 form first. */
export function savedName(disposition: string): string {
  const coded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (coded?.[1]) return decodeURIComponent(coded[1]);
  return /filename="([^"]+)"/i.exec(disposition)?.[1] ?? "Map.mapson";
}
