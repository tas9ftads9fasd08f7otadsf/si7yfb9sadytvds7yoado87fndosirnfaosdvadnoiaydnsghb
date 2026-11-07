import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Portable } from "@/lib/types";
import { type MapControl, setMapControl } from "@/map/control";
import { addPackages, applySession, change, checkKey, loadWords, notice, resetViewer, setLayerShown, tickPackage,
  useViewer } from "./viewer";

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
  readRegions: vi.fn(), camera: vi.fn(), remove: vi.fn() }) satisfies MapControl;

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
