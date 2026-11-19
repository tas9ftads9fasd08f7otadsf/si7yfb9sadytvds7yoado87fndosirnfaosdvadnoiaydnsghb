import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { createReach, hostOf, isForbiddenHeader, probeOf } from "./reach";
import { indexedKeeping, type Keeping } from "./zones";

// 85 the site asks a host once whether it answers a browser, and remembers the answer
const memory = (): Keeping & { kept: Map<string, unknown> } => {
  const kept = new Map<string, unknown>();
  return { kept, load: async <T,>(key: string) => kept.get(key) as T | undefined, save: async (key, value) => { kept.set(key, value); } };
};

const answering = (response: () => Response | Promise<Response>) => vi.fn<typeof fetch>(async () => response());

describe("a host's reach", () => {
  it("answers true when a CORS request is answered, whatever the status, and asks with mode cors", async () => {
    const keeping = memory();
    const fetcher = answering(() => new Response("", { status: 404 }));
    const reach = createReach(keeping, { fetcher });
    expect(await reach.answers("https://cors.example/tiles/{z}/{x}/{y}.png")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe("https://cors.example/tiles/0/0/0.png");
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ mode: "cors", credentials: "omit" });
    expect(keeping.kept.get("reach/https://cors.example")).toEqual({ answers: true });
  });

  it("answers false on a TypeError, which is how a browser says a host did not allow it", async () => {
    const keeping = memory();
    const reach = createReach(keeping, { fetcher: answering(() => Promise.reject(new TypeError("Failed to fetch"))), online: () => true });
    expect(await reach.answers("https://closed.example/a")).toBe(false);
    expect(keeping.kept.get("reach/https://closed.example")).toEqual({ answers: false });
  });

  it("answers false on an opaque answer", async () => {
    const opaque = { type: "opaque", body: null } as unknown as Response;
    const reach = createReach(memory(), { fetcher: answering(() => opaque) });
    expect(await reach.answers("https://opaque.example/a")).toBe(false);
  });

  it("asks a host once: later addresses on it, and a later visit, are answered from memory", async () => {
    const keeping = memory();
    const fetcher = answering(() => new Response("{}"));
    const first = createReach(keeping, { fetcher });
    await Promise.all([first.answers("https://cors.example/a"), first.answers("https://cors.example/b")]);
    await first.answers("https://cors.example/c");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const later = createReach(keeping, { fetcher });
    expect(await later.answers("https://cors.example/d")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("remembers a refusal in IndexedDB", async () => {
    const keeping = indexedKeeping("reach-test");
    const refusing = createReach(keeping, { fetcher: answering(() => Promise.reject(new TypeError("x"))), online: () => true });
    expect(await refusing.answers("https://closed.example/a")).toBe(false);
    const fetcher = answering(() => new Response("{}"));
    expect(await createReach(indexedKeeping("reach-test"), { fetcher }).answers("https://closed.example/b")).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("says nothing of a host when the browser is offline or the host is slow, and asks again later", async () => {
    const keeping = memory();
    const offline = createReach(keeping, { fetcher: answering(() => Promise.reject(new TypeError("x"))), online: () => false });
    expect(await offline.answers("https://a.example/a")).toBeNull();
    expect(keeping.kept.size).toBe(0);
    const aborted = answering(() => Promise.reject(new DOMException("slow", "AbortError")));
    const reach = createReach(keeping, { fetcher: aborted, online: () => true });
    expect(await reach.answers("https://a.example/a")).toBeNull();
    expect(await reach.answers("https://a.example/a")).toBeNull();
    expect(aborted).toHaveBeenCalledTimes(2);
  });

  it("does not ask for an address that names no host", async () => {
    const fetcher = answering(() => new Response(""));
    const reach = createReach(memory(), { fetcher });
    expect(await reach.answers("/words/en.json")).toBe(true);
    expect(await reach.answers("data:text/plain,x")).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("addresses and headers", () => {
  it("names the origin of an address, a PMTiles one included", () => {
    expect(hostOf("pmtiles://https://tiles.example/a.pmtiles")).toBe("https://tiles.example");
    expect(hostOf("https://a.example:8443/x?y=1")).toBe("https://a.example:8443");
    expect(hostOf("ftp://a.example")).toBeNull();
  });

  it("fills a template's slots", () => {
    expect(probeOf("https://a.example/{z}/{x}/{y}.png?k={key}")).toBe("https://a.example/0/0/0.png?k=0");
  });

  it("knows the headers a browser may not set", () => {
    for (const name of ["Referer", "cookie", "Origin", "Host", "Proxy-Authorization", "Sec-Fetch-Mode"]) expect(isForbiddenHeader(name)).toBe(true);
    for (const name of ["Authorization", "X-Api-Key", "User-Agent"]) expect(isForbiddenHeader(name)).toBe(false);
  });
});
