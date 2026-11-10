export const ROOT = "/riki/v1";
export const SESSION = "/web/session";
export const EDIT_CHECK = "/web/edit-check";
export const WORDS_PATH = "/web/words";

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

/** The file name a `.mapson` answer carries, UTF-8 form first. */
export function savedName(disposition: string): string {
  const coded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (coded?.[1]) return decodeURIComponent(coded[1]);
  return /filename="([^"]+)"/i.exec(disposition)?.[1] ?? "Map.mapson";
}
