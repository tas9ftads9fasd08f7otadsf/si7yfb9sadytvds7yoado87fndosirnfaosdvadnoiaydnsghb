import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device } from "@/lib/types";
import { type MapControl, setMapControl } from "@/map/control";
import { coordinatesIn, resetViewer, search, useViewer } from "@/store/viewer";
import { PlacePanel } from "./PlacePanel";
import { SearchField, SearchResults } from "./Search";

const device = { name: "iPad", maps: [{ id: "a", name: "Tatras", layers: [] }] } as unknown as Device;
const flyTo = vi.fn();
const control = { namedFeatures: () => [
  { properties: { name: "Chata pod Rysmi" }, layer: "huts", at: [20.08, 49.18] as [number, number] },
  { properties: { name: "Rysy" }, layer: "peaks", at: [20.09, 49.18] as [number, number] }],
  flyTo, camera: () => ({ lat: 49.18, lng: 20.08, zoom: 13 }) } as unknown as MapControl;

describe("search and places", () => {
  beforeEach(() => {
    resetViewer();
    vi.useFakeTimers();
    history.replaceState(null, "", "/maps/a");
    setMapControl(control);
    useViewer.setState({ device, mapID: "a", route: { screen: "map", map: "a" } });
  });
  afterEach(() => {
    vi.useRealTimers();
    setMapControl(null);
  });

  // 100 the words typed are an address; the map's names that hold them are listed
  it("searches the map's names as the words are typed", () => {
    render(<SearchField />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "rys" } });
    act(() => vi.advanceTimersByTime(250));
    expect(useViewer.getState().route).toEqual({ screen: "search", map: "a", text: "rys" });
    expect(location.pathname).toBe("/maps/a/search/rys");
    expect(useViewer.getState().nameHits?.map((hit) => hit.name)).toEqual(["Rysy", "Chata pod Rysmi"]);
  });

  // 100 Escape empties the field and the map comes back to the side bar
  it("clears the search with Escape", () => {
    render(<SearchField />);
    act(() => search("rys"));
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(useViewer.getState().route).toEqual({ screen: "map", map: "a" });
    expect(useViewer.getState().nameHits).toBeNull();
  });

  // 100 ⌘K or Ctrl+K puts the cursor in the field
  it("takes ⌘K to the field", () => {
    render(<SearchField />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });

  // 100 a result takes the map there and opens the place panel with what the feature carries
  it("opens a result in the place panel", () => {
    act(() => search("chata"));
    render(<><SearchResults /><PlacePanel /></>);
    expect(screen.getByText("Results for “chata”")).toBeTruthy();
    act(() => fireEvent.click(screen.getByRole("button", { name: /Chata pod Rysmi/ })));
    expect(flyTo).toHaveBeenCalledWith(20.08, 49.18);
    const panel = screen.getByRole("region", { name: "Chata pod Rysmi" });
    expect(panel.textContent).toContain("49.18000 N, 20.08000 E");
    expect(panel.textContent).toContain("Huts");
    act(() => fireEvent.click(screen.getByRole("button", { name: "Close" })));
    expect(useViewer.getState().place).toBeNull();
  });

  // 100 nothing by that name is said so
  it("says when nothing goes by the name", () => {
    act(() => search("zz"));
    render(<SearchResults />);
    expect(screen.getByText("Nothing on the map goes by that name.")).toBeTruthy();
  });

  // 100 coordinates typed as people write them go straight to that point
  it("reads typed coordinates", () => {
    expect(coordinatesIn("48.1486, 17.1077")).toEqual([48.1486, 17.1077]);
    expect(coordinatesIn("48.1486 17.1077")).toEqual([48.1486, 17.1077]);
    expect(coordinatesIn("98, 17")).toBeNull();
    expect(coordinatesIn("Rysy")).toBeNull();
    act(() => search("49.18, 20.08"));
    expect(useViewer.getState().nameHits).toEqual([{ name: "49.18, 20.08", layer: "Coordinates", lat: 49.18,
      lng: 20.08, properties: {} }]);
  });
});

// 129 the top bar's search asks the phone for places, with the centre of the map and no edit password
describe("the phone's places search", () => {
  const hut = { title: "Chata pod Rysmi", layer: "Huts", layerID: "L1", lat: 49.18, lon: 20.08,
    properties: { Nazov: "Chata pod Rysmi", Elevation: "2250" } };
  const poprad = { title: "Popradské pleso", detail: "High Tatras", kind: "lake", lat: 49.0675, lon: 20.0711,
    box: [20.06, 49.06, 20.08, 49.07], properties: { name: "Popradské pleso", ele: "1494" } };
  const sheet = { title: "Hut Chata pod Rysmi", keys: ["Elevation"],
    sections: [{ blocks: [{ kind: "rows", rows: [{ title: "Height", value: "2250 m" }] }] }] };

  function phoneSays(route: (path: string, init?: RequestInit) => Response) {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => route(new URL(url, "http://phone").pathname, init));
    vi.stubGlobal("fetch", fetcher);
    return fetcher;
  }
  const asked = (fetcher: ReturnType<typeof phoneSays>, path: string) =>
    fetcher.mock.calls.filter(([url]) => new URL(String(url), "http://phone").pathname === path);
  const places = (list: unknown[]) => new Response(JSON.stringify({ places: list }));
  const typeIn = async (text: string) => {
    await act(async () => {
      search(text);
      await vi.advanceTimersByTimeAsync(300);
    });
  };

  beforeEach(() => {
    resetViewer();
    vi.useFakeTimers();
    flyTo.mockClear();
    history.replaceState(null, "", "/maps/a");
    setMapControl(control);
    useViewer.setState({ device, mapID: "a", route: { screen: "map", map: "a" } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setMapControl(null);
  });

  // 129
  it("asks with the centre of the map and no password, and lists the map's data apart from the places", async () => {
    useViewer.setState({ editToken: "t" });
    const fetcher = phoneSays((path) => path.endsWith("/search") ? places([hut, poprad]) : new Response("", { status: 500 }));
    render(<SearchResults />);
    await typeIn("rys");
    const [[url, init]] = asked(fetcher, "/riki/v1/maps/a/search") as [[string, RequestInit | undefined]];
    expect(Object.fromEntries(new URL(url, "http://phone").searchParams)).toEqual({ q: "rys", lat: "49.18000", lon: "20.08000" });
    expect(init?.headers).toBeUndefined();
    expect(asked(fetcher, "/riki/v1/start-places")).toHaveLength(0);
    const data = screen.getByRole("group", { name: "In this map's data" });
    expect(data.textContent).toContain("Chata pod Rysmi");
    expect(data.querySelectorAll("button")).toHaveLength(2);
    const found = screen.getByRole("group", { name: "Places" });
    expect(found.textContent).toContain("Popradské pleso");
    expect(found.textContent).toContain("High Tatras");
    expect(found.textContent).not.toContain("Chata pod Rysmi");
  });

  // 129 a feature of the map's own wears the layer's Details, as a tap's card does
  it("opens a feature of a layer in the place panel and asks the layer's Details for it", async () => {
    const fetcher = phoneSays((path) => path.endsWith("/search") ? places([hut])
      : path.endsWith("/details") ? new Response(JSON.stringify(sheet)) : new Response("", { status: 500 }));
    render(<><SearchResults /><PlacePanel /></>);
    await typeIn("chata");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Chata pod Rysmi/ })); });
    const [[url]] = asked(fetcher, "/riki/v1/maps/a/details") as [[string]];
    const query = new URL(url, "http://phone").searchParams;
    expect(query.get("layer")).toBe("L1");
    expect(JSON.parse(query.get("values") ?? "")).toEqual(hut.properties);
    const panel = screen.getByRole("region", { name: "Hut Chata pod Rysmi" });
    expect(panel.textContent).toContain("2250 m");
    expect(panel.textContent).toContain("Huts");
  });

  // 129 an indexed place has no layer: the panel shows its kind and tags, and the map frames its box
  it("opens a place of the phone's index in the place panel and frames it", async () => {
    phoneSays(() => places([poprad]));
    render(<><SearchResults /><PlacePanel /></>);
    await typeIn("poprad");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Popradské pleso/ })); });
    expect(flyTo).toHaveBeenCalledWith(20.0711, 49.0675, [20.06, 49.06, 20.08, 49.07]);
    const panel = screen.getByRole("region", { name: "Popradské pleso" });
    expect(panel.querySelector(".kind")?.textContent).toBe("lake");
    expect(panel.textContent).toContain("1494");
    expect(panel.textContent).toContain("49.06750 N, 20.07110 E");
    expect(panel.textContent).not.toContain("From layer");
  });

  // 129 a phone from before 3492 answers 404: the names of the map and an editing browser's cities, as before
  it("keeps the names and the cities when the phone has no places search, and asks it no more", async () => {
    useViewer.setState({ editToken: "t" });
    const city = { start: { kind: "city", name: "Poprad", latitude: 49.06, longitude: 20.3 }, title: "Poprad", detail: "Slovakia" };
    const fetcher = phoneSays((path) => path.endsWith("/search") ? new Response("", { status: 404 })
      : new Response(JSON.stringify([city])));
    render(<SearchResults />);
    await typeIn("rys");
    expect(useViewer.getState().nameHits?.map((hit) => hit.name)).toEqual(["Rysy", "Chata pod Rysmi"]);
    expect(useViewer.getState().foundPlaces).toEqual([city]);
    expect(asked(fetcher, "/riki/v1/start-places")).toHaveLength(1);
    await typeIn("rysy");
    expect(asked(fetcher, "/riki/v1/maps/a/search")).toHaveLength(1);
    expect(asked(fetcher, "/riki/v1/start-places")).toHaveLength(2);
  });

  // 129 a browser that only looks gets the names of the map from an older phone and no cities
  it("asks a browser that cannot edit nothing more once an older phone says no", async () => {
    const fetcher = phoneSays(() => new Response("", { status: 404 }));
    await typeIn("rys");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(useViewer.getState().nameHits).toHaveLength(2);
    expect(useViewer.getState().foundPlaces).toBeNull();
  });

  // 129 as the phone's own field: under three letters nothing is asked, nor of typed coordinates
  it("asks nothing for two letters or for coordinates, and keeps the names on a failed ask", async () => {
    const fetcher = phoneSays(() => new Response("Busy", { status: 503 }));
    await typeIn("ry");
    await typeIn("49.18, 20.08");
    expect(fetcher).not.toHaveBeenCalled();
    await typeIn("rys");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(useViewer.getState().nameHits?.map((hit) => hit.name)).toEqual(["Rysy", "Chata pod Rysmi"]);
  });

  // 129 an answer for words no longer typed is not shown
  it("drops an answer that arrives after the words changed", async () => {
    let answer: (response: Response) => void = () => {};
    phoneSays(() => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { answer = resolve; })));
    await typeIn("rys");
    act(() => search("zbojn"));
    await act(async () => { answer(places([hut])); await vi.advanceTimersByTimeAsync(10); });
    expect(useViewer.getState().nameHits?.some((hit) => hit.layerID)).toBe(false);
    expect(useViewer.getState().foundPlaces).toBeNull();
  });
});
