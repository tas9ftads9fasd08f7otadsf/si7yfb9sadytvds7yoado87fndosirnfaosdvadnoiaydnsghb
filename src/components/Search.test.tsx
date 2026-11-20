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
