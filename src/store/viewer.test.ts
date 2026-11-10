import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Portable } from "@/lib/types";
import { type MapControl, setMapControl } from "@/map/control";
import { FILE_LIMIT, addFile, addPackages, addServer, applySession, importServers, change, checkKey, go, loadWords,
  notice, readAddress, resetViewer, restoreKept, setLayerShown, showEdit, tickPackage, useViewer } from "./viewer";

const get = useViewer.getState;
const portable: Portable = { id: "a", name: "Tatras", styles: [{ id: "s", name: "Summer" }], selectedStyleID: "s" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const device = { name: "iPad", maps: [{ id: "a", name: "Tatras", layers: [] }] };

function answering(route: (url: string, init?: RequestInit) => Response) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => route(url, init));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

const control = () => ({ draw: vi.fn(), stopLive: vi.fn(), resize: vi.fn(), watchPhone: vi.fn(), showPhone: vi.fn(),
  readRegions: vi.fn(), camera: vi.fn(), snapshot: vi.fn(), remove: vi.fn() }) satisfies MapControl;

beforeEach(() => {
  resetViewer();
  setMapControl(null);
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("change", () => {
  beforeEach(() => useViewer.setState({ editToken: "t", mapID: "a", styleID: "s", portable, device }));

  it("does nothing without a token", async () => {
    useViewer.setState({ editToken: null });
    const fetcher = answering(() => json({}));
    expect(await change({ name: "x" })).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends the style and the bearer token, and keeps the map the phone answers", async () => {
    const fetcher = answering((url) => url.includes("/edit") ? json({ ...portable, name: "New" }) : json(device));
    expect(await change({ name: "New" })).toBe(true);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("/riki/v1/maps/a/edit?name=New&styleID=s");
    expect(init?.headers).toEqual({ Authorization: "Bearer t" });
    expect(get().portable?.name).toBe("New");
  });

  it("falls back to the phone's selected style when the shown one is gone", async () => {
    useViewer.setState({ styleID: "gone" });
    answering((url) => url.includes("/edit") ? json(portable) : json(device));
    await change({ removeStyle: "gone" });
    expect(get().styleID).toBe("s");
  });

  it("puts the fields back and says why on a refusal", async () => {
    answering(() => new Response("A name cannot be blank", { status: 400 }));
    expect(await change({ name: "" })).toBe(false);
    expect(get().notice).toBe("A name cannot be blank");
    expect(get().editEpoch).toBe(1);
  });

  it("turns the phone's layer limit into its own sentence", async () => {
    answering(() => new Response("Too many layers", { status: 409 }));
    await change({ layer: "l", shown: "1" });
    expect(get().notice).toBe(get().words.layerCap);
  });

  it("sends the browser back to the password on a stale token", async () => {
    useViewer.setState({ editing: true });
    sessionStorage.setItem("riki-edit-token", "t");
    answering(() => new Response("", { status: 401 }));
    expect(await change({ name: "x" })).toBe(false);
    expect(get().editToken).toBeNull();
    expect(get().editing).toBe(false);
    expect(get().notice).toBe(get().words.passwordAgain);
    expect(sessionStorage.getItem("riki-edit-token")).toBeNull();
  });

  it("says the phone is away when it cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await change({ name: "x" })).toBe(false);
    expect(get().notice).toBe(get().words.away);
  });
});

describe("the edit password", () => {
  it("trades the key, sent as the phone reads it, for a token", async () => {
    const fetcher = answering(() => json({ token: "signed" }));
    await checkKey("7q4-k29");
    expect(fetcher.mock.calls[0]![1]?.headers).toEqual({ "X-Riki-Edit": "7Q4K29" });
    expect(get().editToken).toBe("signed");
    expect(sessionStorage.getItem("riki-edit-token")).toBe("signed");
  });

  it("tells a wrong password from too many", async () => {
    answering(() => new Response("", { status: 403 }));
    await checkKey("nope");
    expect(get().notice).toBe(get().words.wrongPassword);
    answering(() => new Response("", { status: 429 }));
    await checkKey("nope");
    expect(get().notice).toBe(get().words.tooManyTries);
  });

  it("asks nothing for a blank password", async () => {
    const fetcher = answering(() => json({}));
    await checkKey(" - ");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("the session", () => {
  it("stops the live layers of a browser no longer let in", () => {
    const map = control();
    setMapControl(map);
    applySession({ standing: "removed" });
    expect(map.stopLive).toHaveBeenCalled();
  });

  it("drops the token when the phone stops allowing edits", () => {
    useViewer.setState({ editToken: "t", standing: "admitted" });
    applySession({ standing: "admitted", edits: false });
    expect(get().editToken).toBeNull();
  });

  it("counts viewers only when the phone says how many", () => {
    useViewer.setState({ standing: "admitted" });
    applySession({ standing: "admitted", viewers: 2 });
    expect(get().viewers).toBe(2);
    applySession({ standing: "admitted", viewers: null });
    expect(get().viewers).toBeNull();
  });
});

describe("words", () => {
  it("takes the phone's words and language", async () => {
    answering(() => json({ language: "sk", words: { maps: "Mapy" } }));
    await loadWords();
    expect(get().words.maps).toBe("Mapy");
    expect(document.documentElement.lang).toBe("sk");
  });

  it("stays in English on a phone without them", async () => {
    answering(() => new Response("", { status: 404 }));
    await loadWords();
    expect(get().words.maps).toBe("Maps");
  });
});

describe("the rest", () => {
  it("redraws when a layer is switched", () => {
    const map = control();
    setMapControl(map);
    useViewer.setState({ standing: "admitted", device, mapID: "a" });
    setLayerShown("l", false);
    expect(get().hidden.has("l")).toBe(true);
    expect(map.draw).toHaveBeenCalledOnce();
    setLayerShown("l", true);
    expect(get().hidden.has("l")).toBe(false);
  });

  it("does not draw for a browser not let in", () => {
    const map = control();
    setMapControl(map);
    useViewer.setState({ standing: "waiting", device, mapID: "a" });
    setLayerShown("l", false);
    expect(map.draw).not.toHaveBeenCalled();
  });

  it("unticks a package's rivals as one is ticked", () => {
    useViewer.setState({ packageTicks: new Set(["a"]) });
    tickPackage({ name: "B", overlay: "b", exclusive: ["a"] });
    expect([...get().packageTicks]).toEqual(["b"]);
    tickPackage({ name: "B", overlay: "b" });
    expect(get().packageTicks.size).toBe(0);
  });

  it("reopens Add layer when the packages are refused", async () => {
    useViewer.setState({ editToken: "t", mapID: "a", addingPackages: true });
    answering(() => new Response("No", { status: 400 }));
    await addPackages(["x"]);
    expect(get().addingPackages).toBe(true);
  });

  it("clears a notice after four seconds", () => {
    vi.useFakeTimers();
    notice("Hello");
    vi.advanceTimersByTime(3999);
    expect(get().notice).toBe("Hello");
    vi.advanceTimersByTime(1);
    expect(get().notice).toBeNull();
    vi.useRealTimers();
  });
});

describe("addServer", () => {
  beforeEach(() => useViewer.setState({ editToken: "t", mapID: "a", styleID: "s", portable, device }));

  // 2996 kind, address and name go to the phone, and its servers replace the list
  it("keeps the servers the phone answers with", async () => {
    const servers = { servers: [{ id: "n", name: "Survey", line: "Esri / ArcGIS", rows: [] }] };
    const fetcher = answering(() => json(servers));
    expect(await addServer("arcgis", "https://gis.test/rest/services", "Survey")).toBe(true);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain("/add-server?kind=arcgis&address=https%3A%2F%2Fgis.test%2Frest%2Fservices&name=Survey");
    expect(init?.method).toBe("POST");
    expect(get().servers).toEqual(servers);
  });

  // 2996 the phone's reading failure is shown, and the list stays as it was
  it("shows why the phone could not read it", async () => {
    answering(() => new Response("Server replied 404", { status: 409 }));
    expect(await addServer("tiles", "https://t.test/{z}/{x}/{y}.png", "")).toBe(false);
    expect(get().notice).toBe("Server replied 404");
    expect(get().servers).toBeNull();
  });
});

describe("addFile", () => {
  beforeEach(() => useViewer.setState({ editToken: "t", mapID: "a", styleID: "s", portable, device }));

  // 2995 the file is the body, named in the address, and the map the phone answers is kept
  it("posts the file and keeps the map with its new layer", async () => {
    const added = { ...portable, layers: [{ id: "l", name: "Huts" }] };
    const fetcher = answering((url) => url.includes("/add-file") ? json(added) : json(device));
    await addFile(new File(["{\"type\":\"FeatureCollection\"}"], "huts.geojson"));
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain("/maps/a/add-file?file=huts.geojson");
    expect(init?.method).toBe("POST");
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toContain("FeatureCollection");
    expect(get().portable).toEqual(added);
  });

  // 2995 a file the phone could never take is not sent
  it("says what fits instead of sending a file over the limit", async () => {
    const fetcher = answering(() => json({}));
    const big = new File(["x"], "big.geojson");
    Object.defineProperty(big, "size", { value: FILE_LIMIT + 1 });
    await addFile(big);
    expect(fetcher).not.toHaveBeenCalled();
    expect(get().notice).toContain("16 MB");
  });

  // 2995 the phone's refusal is shown as it said it
  it("shows what the phone refused", async () => {
    answering(() => new Response("plan.dxf stays on the phone", { status: 409 }));
    await addFile(new File(["0"], "plan.dxf"));
    expect(get().notice).toBe("plan.dxf stays on the phone");
  });
});

describe("importServers", () => {
  beforeEach(() => useViewer.setState({ editToken: "t", mapID: "a", styleID: "s", portable, device }));

  // 2997 the file is the body, and the phone's whole list replaces the page's
  it("posts the file and keeps the servers the phone answers with", async () => {
    const servers = { servers: [{ id: "n", name: "Basemap.at", line: "Tiles", rows: [] }] };
    const fetcher = answering(() => json(servers));
    await importServers(new File(["{\"servers\":[]}"], "Mine.servson"));
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain("/import-servers");
    expect(init?.method).toBe("POST");
    expect(get().servers).toEqual(servers);
  });

  // 2997 a refusal is said as the phone said it
  it("shows what the phone refused", async () => {
    answering(() => new Response("That file holds no Riki Maps servers.", { status: 409 }));
    await importServers(new File(["{"], "x.servson"));
    expect(get().notice).toBe("That file holds no Riki Maps servers.");
  });
});

// 30 the address names the screen; the store follows it and keeps it in step.
describe("the address", () => {
  const twoStyles: Portable = { id: "a", name: "Tatras", selectedStyleID: "s",
    styles: [{ id: "s", name: "Summer" }, { id: "w", name: "Winter" }] };
  const two = { name: "iPad", maps: [{ id: "a", name: "Tatras", layers: [] }, { id: "b", name: "Bratislava", layers: [] }] };

  beforeEach(() => {
    history.replaceState(null, "", "/");
    localStorage.clear();
  });

  it("reads the screen from the path, and the edit and server screens from it", () => {
    history.replaceState(null, "", "/servers/S1/general");
    readAddress();
    expect(get().route).toEqual({ screen: "servers", server: "S1", part: "general" });
    expect(get().serverID).toBe("S1");
    expect(get().serverPart).toBe("general");
    go({ screen: "edit", map: "a", tab: "layers" });
    expect(location.pathname).toBe("/maps/a/edit/layers");
    expect(get().editing).toBe(true);
    expect(get().serverID).toBeNull();
  });

  it("pushes a screen and replaces when asked, keeping the camera", () => {
    history.replaceState(null, "", "/maps#6/48.5/19.5");
    const length = history.length;
    go({ screen: "data", tab: "layers" });
    expect(location.pathname + location.hash).toBe("/data/layers#6/48.5/19.5");
    expect(history.length).toBe(length + 1);
    go({ screen: "settings" }, { replace: true });
    expect(history.length).toBe(length + 1);
  });

  it("names the style only when it is not the one the map opens on", () => {
    useViewer.setState({ standing: "admitted", device: two, mapID: "a", portable: twoStyles, styleID: "s",
      route: { screen: "map", map: "a" } });
    go({ screen: "map", map: "a", style: "w" });
    expect(get().styleID).toBe("w");
    expect(location.pathname).toBe("/maps/a/style/w");
    go({ screen: "map", map: "a", style: "s" });
    expect(location.pathname).toBe("/maps/a");
  });

  it("puts home on the map shown and remembers it for next time", () => {
    useViewer.setState({ standing: "admitted", device: two, mapID: "b", portable: twoStyles, styleID: "s" });
    go({ screen: "home" });
    expect(location.pathname).toBe("/maps/b");
    go({ screen: "map", map: "a" });
    expect(localStorage.getItem("riki-map")).toBe("a");
  });

  it("sends home to the maps when the phone shares none", () => {
    useViewer.setState({ standing: "admitted", device: { name: "iPad", maps: [] } });
    go({ screen: "home" });
    expect(location.pathname).toBe("/maps");
  });

  it("opens Edit map at its address and Done goes back to the map", () => {
    useViewer.setState({ mapID: "a", route: { screen: "map", map: "a" } });
    showEdit(true);
    expect(location.pathname).toBe("/maps/a/edit/layers");
    showEdit(false);
    expect(location.pathname).toBe("/maps/a");
    expect(get().editing).toBe(false);
  });

  it("takes the key from the unlock address and drops it once the phone answers", async () => {
    history.replaceState(null, "", "/unlock/7Q4K29");
    readAddress();
    restoreKept();
    answering(() => json({ token: "t" }));
    await checkKey("7Q4K29");
    expect(get().editToken).toBe("t");
    expect(location.pathname).toBe("/");
    expect(get().route).toEqual({ screen: "home" });
  });

  it("drops the key from the address even when the phone refuses it", async () => {
    history.replaceState(null, "", "/unlock/AAAAAA");
    readAddress();
    answering(() => new Response("", { status: 403 }));
    await checkKey("AAAAAA");
    expect(location.pathname).toBe("/");
    expect(get().notice).toBe(get().words.wrongPassword);
  });
});
