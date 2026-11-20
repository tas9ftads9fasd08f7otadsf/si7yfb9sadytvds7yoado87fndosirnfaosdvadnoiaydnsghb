import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { DataPage } from "./DataPage";

const device: Device = { name: "iPad", maps: [
  { id: "a", name: "Tatras", layers: [{ id: "t", name: "Trails", kind: "Vector" }, { id: "h", name: "Huts", kind: "Points" }] },
  { id: "b", name: "Fatra", layers: [{ id: "t2", name: "Trails", kind: "Vector" }] }] };

describe("Data", () => {
  beforeEach(() => {
    resetViewer();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    history.replaceState(null, "", "/data/maps");
    useViewer.setState({ device, mapID: "a", route: { screen: "data", tab: "maps" },
      regionList: { drawn: [{ id: "r1", name: "Bratislavský kraj", box: [0, 0, 1, 1] }],
        downloadable: [{ id: "r2", name: "Trnavský kraj", box: [0, 0, 1, 1] }] } });
  });
  afterEach(() => vi.unstubAllGlobals());

  // 101 W4: the maps listed, the one on screen marked, the counts in the tabs and cards
  it("lists the maps and counts each tab", () => {
    render(<DataPage />);
    expect(screen.getByRole("heading", { name: "Data" })).toBeTruthy();
    const table = screen.getByRole("table", { name: "Maps" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("On map now").closest("[role=row]")?.textContent).toContain("Tatras");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Maps2", "Layers2", "Regions2"]);
  });

  // 101 one layer however many maps hold it; the tab is an address
  it("lists each layer once with the maps that hold it", () => {
    render(<DataPage />);
    act(() => fireEvent.click(screen.getByRole("tab", { name: /Layers/ })));
    expect(location.pathname).toBe("/data/layers");
    const trails = screen.getByText("Trails").closest("[role=row]")!;
    // 113 how many maps hold it, as a number under "Used in"
    expect(within(trails as HTMLElement).getAllByRole("cell")[2]?.textContent).toBe("2");
    expect(trails.textContent).toContain("Tatras, Fatra");
  });

  // 101 the map's regions: on the phone, and a Download for an editing browser
  it("lists the map's regions and offers to download one", () => {
    useViewer.setState({ route: { screen: "data", tab: "regions" }, editToken: "t" });
    render(<DataPage />);
    expect(screen.getByText("Bratislavský kraj").closest("[role=row]")?.textContent).toContain("On the phone");
    const trnava = screen.getByText("Trnavský kraj").closest("[role=row]") as HTMLElement;
    expect(within(trnava).getByRole("button", { name: "Download" })).toBeTruthy();
  });

  // 101 a map's name opens it on the map
  it("opens a map from its row", () => {
    render(<DataPage />);
    act(() => fireEvent.click(screen.getByRole("button", { name: "Fatra" })));
    expect(useViewer.getState().route).toEqual({ screen: "map", map: "b" });
  });
});
