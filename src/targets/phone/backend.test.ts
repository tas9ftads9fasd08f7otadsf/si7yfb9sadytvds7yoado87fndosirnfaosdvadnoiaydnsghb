import { afterEach, describe, expect, it, vi } from "vitest";
import type { Edit } from "@/lib/edit";
import { backend, queryOf } from "./backend";
import { savedName } from "./phone";

// 36 every edit is the query `PeerWebEdit(query:)` reads, as the store sent it before the split
const EDITS: [Edit, Record<string, string>][] = [
  [{ kind: "name", name: "Tatras" }, { name: "Tatras" }],
  [{ kind: "note", note: "Hikes" }, { note: "Hikes" }],
  [{ kind: "nameIn", language: "sk", name: "Tatry" }, { language: "sk", name: "Tatry" }],
  [{ kind: "noteIn", language: "sk", note: "" }, { language: "sk", note: "" }],
  [{ kind: "layerShown", layer: "L", shown: false }, { layer: "L", shown: "0" }],
  [{ kind: "layersShown", shown: true }, { shownAll: "1" }],
  [{ kind: "layerName", layer: "L", name: "Huts" }, { layer: "L", name: "Huts" }],
  [{ kind: "layerOpacity", layer: "L", opacity: "0.5" }, { layer: "L", opacity: "0.5" }],
  [{ kind: "order", layers: ["A", "B"] }, { order: "A,B" }],
  [{ kind: "styleName", style: "S", name: "Winter" }, { style: "S", name: "Winter" }],
  [{ kind: "addStyle", name: "New style 2" }, { addStyle: "New style 2" }],
  [{ kind: "removeStyle", style: "S" }, { removeStyle: "S" }],
  [{ kind: "minimumVersion", app: "0.18", browser: "" }, { minimumApp: "0.18", minimumBrowser: "" }],
  [{ kind: "start", start: { kind: "country", country: "SK" } }, { start: "country", country: "SK" }],
  [{ kind: "start", start: { kind: "location" } }, { start: "location" }],
  [{ kind: "startAt", lat: "49.10000", lon: "20.00000", zoom: "" },
    { start: "coordinates", lat: "49.10000", lon: "20.00000", zoom: "" }],
  [{ kind: "coverage", coverage: { continents: ["europe"] } }, { coverage: "{\"continents\":[\"europe\"]}" }],
  [{ kind: "appearance", appearance: "dark" }, { appearance: "dark" }],
  [{ kind: "symbol", symbol: "tram" }, { symbol: "tram" }],
  [{ kind: "iconTint", tint: "" }, { iconTint: "" }],
  [{ kind: "addPackages", overlays: ["roads", "rails"] }, { addPackages: "roads,rails" }],
  [{ kind: "removeLayer", layer: "L" }, { removeLayer: "L" }],
  [{ kind: "layerOptions", fields: { layer: "L", lineWidth: "2" } }, { layer: "L", lineWidth: "2" }],
  [{ kind: "layerDetails", fields: { layer: "L", details: "move" } }, { layer: "L", details: "move" }]
];

describe("queryOf", () => {
  it.each(EDITS)("%o", (edit, query) => {
    expect(queryOf(edit)).toEqual(query);
  });
});

describe("the phone backend", () => {
  afterEach(() => vi.unstubAllGlobals());

  // 36 the token is read when each call is made, and a refusal keeps the phone's words
  it("sends an edit with the style and the current token, and keeps a refusal's words", async () => {
    const fetcher = vi.fn(async () => new Response("A name cannot be blank", { status: 400 }));
    vi.stubGlobal("fetch", fetcher);
    let token = "first";
    backend.useToken(() => token);
    token = "second";
    const answer = await backend.change("M", "S", { kind: "name", name: "" });
    expect(answer).toEqual({ ok: false, status: 400, said: "A name cannot be blank" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/riki/v1/maps/M/edit?name=&styleID=S");
    expect(init.headers).toEqual({ Authorization: "Bearer second" });
  });

  // 43 the style is asked with direct=1 only by a browser loading tiles from their source
  it("asks for a style with direct=1 only when loading from the source", async () => {
    const fetcher = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    const asked = (call: number) => new URL((fetcher.mock.calls[call] as unknown as [string])[0], "http://phone").searchParams;
    const ask = { mapID: "M", styleID: null, hidden: [], theme: "light" as const, tiles: "4.00" };
    await backend.style({ ...ask, direct: true });
    await backend.style(ask);
    expect(asked(0).get("direct")).toBe("1");
    expect(asked(1).has("direct")).toBe(false);
  });

  // 36 a phone from before guests answers no session, and lets every browser in
  it("reads an older phone's missing session as let in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    expect(await backend.session()).toEqual({ ok: true, value: { standing: "admitted", viewers: null } });
  });

  // 36 an unreachable phone rejects, so the store says it is away
  it("rejects when the phone cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(backend.servers()).rejects.toThrow("offline");
  });

  it("names a saved file as the phone sent it, UTF-8 form first", () => {
    expect(savedName(`attachment; filename="a.mapson"; filename*=UTF-8''Pre%C5%A1ov.mapson`)).toBe("Prešov.mapson");
    expect(savedName(`attachment; filename="a.mapson"`)).toBe("a.mapson");
    expect(savedName("")).toBe("Map.mapson");
  });
});
