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
    history.replaceState(null, "", "/data/layers");
    useViewer.setState({ device, mapID: "a", route: { screen: "data", tab: "layers" },
      regionList: { drawn: [{ id: "r1", name: "Bratislavský kraj", box: [0, 0, 1, 1] }],
        downloadable: [{ id: "r2", name: "Trnavský kraj", box: [0, 0, 1, 1] }] } });
  });
  afterEach(() => vi.unstubAllGlobals());

  // 101 W4: the counts in the tabs and cards; 148 the maps are the Maps screen's, so the tabs are Layers, Regions
  it("counts each tab, and has no Maps tab", () => {
    render(<DataPage />);
    expect(screen.getByRole("heading", { name: "Data" })).toBeTruthy();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Layers2", "Regions2"]);
    expect(screen.queryByRole("tab", { name: /Maps/ })).toBeNull();
    expect(screen.getByRole("table", { name: "Layers" })).toBeTruthy();
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
