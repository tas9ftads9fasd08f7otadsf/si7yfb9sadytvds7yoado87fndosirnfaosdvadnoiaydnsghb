import type { Keeping } from "./zones";

/** What the site learned of a host: whether a browser's request to it is answered. */
export interface Reach {
  /** True when the host answers a browser, false when it refuses, null when the browser could not tell. */
  answers(address: string): Promise<boolean | null>;
}

const REACH_PREFIX = "reach/";
const ASK_FOR = 10_000;

const FORBIDDEN = new Set(["accept-charset", "accept-encoding", "access-control-request-headers", "access-control-request-method",
  "connection", "content-length", "cookie", "cookie2", "date", "dnt", "expect", "host", "keep-alive", "origin", "referer",
  "set-cookie", "te", "trailer", "transfer-encoding", "upgrade", "via"]);

/** A header a browser's request may not carry, by the Fetch standard's list. */
export const isForbiddenHeader = (name: string) => {
  const lower = name.trim().toLowerCase();
  return FORBIDDEN.has(lower) || lower.startsWith("proxy-") || lower.startsWith("sec-");
};

/** The origin an address is answered from, or null where it names no host (a data address, a path). */
export function hostOf(address: string): string | null {
  try {
    const url = new URL(address.replace(/^pmtiles:\/\//, ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** The address with a tile template's slots filled, so a request can be made for it. */
export const probeOf = (address: string) => address.replace(/\{[^}]*\}/g, "0");

interface Options {
  fetcher?: typeof fetch;
  online?: () => boolean;
  limit?: number;
}

/** Asks a host once with `mode: "cors"` and keeps the answer in this browser. */
export function createReach(keeping: Keeping, { fetcher = (...asked) => fetch(...asked), online = () => navigator.onLine,
  limit = ASK_FOR }: Options = {}): Reach {
  const asked = new Map<string, Promise<boolean | null>>();

  async function ask(origin: string, address: string): Promise<boolean | null> {
    const kept = await keeping.load<{ answers: boolean }>(REACH_PREFIX + origin);
    if (typeof kept?.answers === "boolean") return kept.answers;
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), limit);
    try {
      const answer = await fetcher(probeOf(address), { mode: "cors", credentials: "omit", cache: "no-store", signal: stop.signal });
      void answer.body?.cancel().catch(() => {});
      const answers = answer.type !== "opaque" && answer.type !== "opaqueredirect";
      await keeping.save(REACH_PREFIX + origin, { answers });
      return answers;
    } catch (error) {
      // Offline or timed out says nothing of the host.
      if (!(error instanceof TypeError) || !online()) return null;
      await keeping.save(REACH_PREFIX + origin, { answers: false });
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    answers(address) {
      const origin = hostOf(address);
      if (!origin) return Promise.resolve(true);
      let found = asked.get(origin);
      if (!found) {
        found = ask(origin, address);
        asked.set(origin, found);
        void found.then((answer) => { if (answer === null) asked.delete(origin); });
      }
      return found;
    }
  };
}
