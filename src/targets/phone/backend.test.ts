import { afterEach, describe, expect, it, vi } from "vitest";
import type { Edit } from "@/lib/edit";
import type { Shelving } from "@/lib/edit";
import { apiAskQuery, backend, esriQueryOf, offlineQueryOf, queryOf, shelfQueryOf } from "./backend";
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
  [{ kind: "layerDetails", fields: { layer: "L", details: "move" } }, { layer: "L", details: "move" }],
  // 50 the styles' order, the arranging rows and Availability's switches
  [{ kind: "styleOrder", styles: ["W", "S"] }, { styleOrder: "W,S" }],
  [{ kind: "arrange", action: "unite" }, { arrange: "unite" }],
  [{ kind: "arrange", action: "stylePerLayer" }, { arrange: "stylePerLayer" }],
  [{ kind: "groupByOrigin", groups: true }, { groupByOrigin: "1" }],
  [{ kind: "availability", switch: "carPlay", shown: false }, { carPlay: "0" }],
  [{ kind: "availability", switch: "world", shown: true }, { world: "1" }],
  // 53
  [{ kind: "resetStyle", style: "S" }, { resetStyle: "S" }]
];

describe("queryOf", () => {
  it.each(EDITS)("%o", (edit, query) => {
    expect(queryOf(edit)).toEqual(query);
  });
});

describe("shelfQueryOf", () => {
  // 52 each arrangement as PeerWebShelf.shelving reads it
  it.each<[Shelving, Record<string, string>]>([
    [{ kind: "order", maps: ["a", "b"] }, { order: "a,b" }],
    [{ kind: "sort", sort: "nameDescending" }, { sort: "nameDescending" }],
    [{ kind: "makeFolder", name: "Hills", maps: ["a", "b"] }, { folder: "Hills", maps: "a,b" }],
    [{ kind: "join", folder: "F", map: "a" }, { stack: "F", map: "a" }],
    [{ kind: "leave", map: "a" }, { leave: "a" }],
    [{ kind: "renameFolder", folder: "F", name: "Tatras" }, { stack: "F", name: "Tatras" }],
    // 56 a folder's mark and ground
    [{ kind: "folderSymbol", folder: "F", symbol: "tray.full" }, { stack: "F", symbol: "tray.full" }],
    [{ kind: "folderTint", folder: "F", tint: "#B5D8F2" }, { stack: "F", iconTint: "#B5D8F2" }],
  ])("%o", (shelving, query) => {
    expect(shelfQueryOf(shelving)).toEqual(query);
  });

  // 52 posted to the shelf with the token, the list read back from the answer
  it("posts to the shelf and reads the list back", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ name: "iPad", maps: [] })));
    vi.stubGlobal("fetch", fetcher);
    backend.useToken(() => "t");
    const answer = await backend.shelve({ kind: "sort", sort: "nameAscending" });
    expect(answer).toEqual({ ok: true, value: { name: "iPad", maps: [] } });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/riki/v1/shelf?sort=nameAscending");
    expect(init.method).toBe("POST");
    vi.unstubAllGlobals();
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

  // 62 a delete posts the typed name with the token and reads no body back
  it("posts a delete with the typed name", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    backend.useToken(() => "t");
    expect(await backend.deleteMap("M", "High Tatras")).toEqual({ ok: true, value: null });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/riki/v1/maps/M/delete?name=High+Tatras");
    expect(init.method).toBe("POST");
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

  // 59 the People card reads with GET and changes with one POST each, carrying the token
  it("reads and changes a map's people at its people address", async () => {
    const fetcher = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    backend.useToken(() => "T");
    await backend.people({ kind: "map", id: "M" });
    await backend.askPeople({ kind: "map", id: "M" }, { kind: "invite", address: "eva@example.com", role: "editor" });
    const [read, readInit] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const [asked, askedInit] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
    expect([read, readInit.method]).toEqual(["/riki/v1/maps/M/people", "GET"]);
    expect([asked, askedInit.method]).toEqual(["/riki/v1/maps/M/people?invite=eva%40example.com&role=editor", "POST"]);
    expect(askedInit.headers).toEqual({ Authorization: "Bearer T" });
    // 68 a folder's share is asked at the folder
    await backend.askPeople({ kind: "folder", id: "F" }, { kind: "share" });
    expect((fetcher.mock.calls[2] as unknown as [string])[0]).toBe("/riki/v1/folders/F/people?share=1");
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

  // 61 a typed cookie travels in a header, never in the address; the page and colour in the query
  it("sends an API layer's cookie in a header and its page and colour in the query", async () => {
    const fetcher = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    const cookies = { isOn: true, page: "https://buses.example/", seconds: 300 };
    const reading = { itemsPath: "vehicles", spelling: "decimal", latitudeKey: "lat", longitudeKey: "lon", positionKey: "" };
    await backend.addAPI("M", "https://buses.example/now", reading, "Buses", { cookies, cookie: " s=1 ", tint: "#FF8800" });
    const [path, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const query = new URL(path, "http://phone").searchParams;
    expect(JSON.parse(query.get("cookies") ?? "")).toEqual(cookies);
    expect(query.get("tint")).toBe("#FF8800");
    expect(path).not.toContain("s=1");
    expect((init.headers as Record<string, string>)["X-Riki-Cookie"]).toBe("s=1");
    expect(apiAskQuery({ cookies: { ...cookies, isOn: false }, cookie: "s=1" })).toEqual({});
  });
});

// 57 the area, the zoom and the ticked layers as `PeerWebOffline.Asked` reads them
describe("offlineQueryOf", () => {
  it("writes the view, and what was chosen only when it was", () => {
    expect(offlineQueryOf({ box: [1, 2, 3, 4], chosen: false })).toEqual({ box: "1,2,3,4" });
    expect(offlineQueryOf({ box: [1, 2, 3, 4], chosen: true, zoom: 12, layers: ["A", "B"] }))
      .toEqual({ box: "1,2,3,4", chosen: "1", zoom: "12", layers: "A,B" });
  });
});

// 67 a service's change as `PeerWebEsriServices.asked` reads it
describe("esriQueryOf", () => {
  it("names the service and the one thing asked", () => {
    expect(esriQueryOf("G", { kind: "add", layer: 2 })).toEqual({ service: "G", add: "2" });
    expect(esriQueryOf("G", { kind: "remove", layer: 0 })).toEqual({ service: "G", remove: "0" });
    expect(esriQueryOf("G", { kind: "read" })).toEqual({ service: "G", read: "1" });
    expect(esriQueryOf("G", { kind: "forget" })).toEqual({ service: "G", forget: "1" });
  });
});
