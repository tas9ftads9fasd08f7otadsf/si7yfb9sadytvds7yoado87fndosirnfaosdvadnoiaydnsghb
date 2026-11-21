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

  // 128 the Maps tab draws a map's offline state, size and style chips where the phone sent them
  it("draws the pills and style chips beside a map that sent them", () => {
    useViewer.setState({ device: { name: "iPad", maps: [
      { id: "a", name: "Tatras", layers: [], offline: "ready", bytes: 1_200_000_000, styles: ["Summer"], styleIDs: ["s1"] },
      { id: "b", name: "Fatra", layers: [] }] } });
    render(<DataPage />);
    const tatras = screen.getByText("Tatras").closest("[role=row]") as HTMLElement;
    expect(within(tatras).getByText("Ready offline")).toBeTruthy();
    expect(within(tatras).getByText("1.2 GB")).toBeTruthy();
    expect(within(tatras).getByRole("link", { name: "Summer" }).getAttribute("href")).toBe("/maps/a/style/s1");
    const fatra = screen.getByText("Fatra").closest("[role=row]") as HTMLElement;
    expect(within(fatra).queryByRole("link")).toBeNull();
    expect(fatra.querySelector(".pill-tag")).toBeNull();
  });

  // 141 W4's Layers table has a Size column when some layer carries bytes: a layer held by two maps shows the largest
  it("adds a Size column to Layers when the phone sent sizes, and leaves it out otherwise", () => {
    useViewer.setState({ route: { screen: "data", tab: "layers" }, device: { name: "iPad", maps: [
      { id: "a", name: "Tatras", layers: [{ id: "t", name: "Trails", kind: "Vector", bytes: 263_000_000 },
        { id: "h", name: "Huts", kind: "Points" }] },
      { id: "b", name: "Fatra", layers: [{ id: "t2", name: "Trails", kind: "Vector", bytes: 41_000_000 }] }] } });
    const { unmount } = render(<DataPage />);
    expect(screen.getAllByRole("columnheader").map((head) => head.textContent)).toEqual(["Layers", "Kind", "Used in", "Size", ""]);
    const trails = screen.getByText("Trails").closest("[role=row]") as HTMLElement;
    expect(within(trails).getAllByRole("cell")[3]?.textContent).toBe("263 MB");
    const huts = screen.getByText("Huts").closest("[role=row]") as HTMLElement;
    expect(within(huts).getAllByRole("cell")[3]?.textContent).toBe("");
    unmount();
    useViewer.setState({ device });
    render(<DataPage />);
    expect(screen.getAllByRole("columnheader").map((head) => head.textContent)).toEqual(["Layers", "Kind", "Used in", ""]);
    expect(screen.queryByText("Size")).toBeNull();
  });

  // 141 W4's Regions table: a drawn region's size beside "On the phone"; a region still to download has none
  it("adds a Size column to Regions for a drawn region and keeps On the phone", () => {
    useViewer.setState({ route: { screen: "data", tab: "regions" }, regionList: {
      drawn: [{ id: "r1", name: "Bratislavský kraj", box: [0, 0, 1, 1], bytes: 412_000_000 }],
      downloadable: [{ id: "r2", name: "Trnavský kraj", box: [0, 0, 1, 1] }] } });
    render(<DataPage />);
    expect(screen.getByRole("columnheader", { name: "Size" })).toBeTruthy();
    const drawn = screen.getByText("Bratislavský kraj").closest("[role=row]") as HTMLElement;
    expect(drawn.textContent).toContain("412 MB");
    expect(drawn.textContent).toContain("On the phone");
    const trnava = screen.getByText("Trnavský kraj").closest("[role=row]") as HTMLElement;
    expect(within(trnava).getAllByRole("cell")[3]?.textContent).toBe("");
  });

  // 141 from an older phone the column reads "On the phone", with no size and no Size column
  it("keeps On the phone and no size for an older phone's regions", () => {
    useViewer.setState({ route: { screen: "data", tab: "regions" } });
    render(<DataPage />);
    expect(screen.queryByRole("columnheader", { name: "Size" })).toBeNull();
    expect(screen.getByText("Bratislavský kraj").closest("[role=row]")?.textContent).toContain("On the phone");
    expect(screen.getByText("Bratislavský kraj").closest("[role=row]")?.textContent).not.toMatch(/\d (MB|GB|KB)/);
  });
});
