import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device, MapSwitches, Portable } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { Layers } from "./Layers";

// 3083 TestFlight AJNX: the list's own switch.
const portable: Portable = { id: "a", name: "Tatras", stack: [
  { id: "B", name: "Base", isEnabled: true }, { id: "T", name: "Trails", isEnabled: true },
  { id: "H", name: "Huts", isEnabled: true }] };
const device: Device = { name: "iPad", maps: [{ id: "a", name: "Tatras", layers: [
  { id: "B", name: "Base", kind: "Tiles" }, { id: "T", name: "Trails", kind: "Vector" },
  { id: "H", name: "Huts", kind: "Vector" }] }] };

const show = (hidden: string[]) =>
  useViewer.setState({ mapID: "a", device, portable, editToken: "t", hidden: new Set(hidden) });

const grouped: MapSwitches = { picker: true, carPlay: true, legend: true, world: true, legendEverywhere: true,
  worldEverywhere: true, hasNothingToDraw: false, ownsSettings: true, groupsByOrigin: true, groupingOffered: true,
  groupingReorders: false, stylesDisagree: false, differsFromDefault: false, layersWithoutStyle: 0, removedStyles: 0 };
const trailsServer = { key: "host:trails", title: "Trails server", symbol: "map" };

const showGrouped = () => useViewer.setState({ mapID: "a", portable, editToken: "t", hidden: new Set(["H"]),
  switches: grouped, device: { name: "iPad", maps: [{ id: "a", name: "Tatras", layers: [
    { id: "B", name: "Base", kind: "Tiles" }, { id: "T", name: "Trails", kind: "Vector", origin: trailsServer },
    { id: "H", name: "Huts", kind: "Vector", origin: trailsServer }] }] } });

describe("Layers", () => {
  beforeEach(resetViewer);
  afterEach(() => vi.unstubAllGlobals());

  it("offers All off while every layer is drawn, and All on once one is hidden", () => {
    show([]);
    const { unmount } = render(<Layers portable={portable} />);
    expect(screen.getByRole("button", { name: "All off" })).toBeTruthy();
    unmount();
    show(["H"]);
    render(<Layers portable={portable} />);
    expect(screen.getByRole("button", { name: "All on" })).toBeTruthy();
  });

  // 141 W5 words a layer's size beside its kind where the phone sent one, and the kind alone where it did not
  it("shows the size the phone holds beside a layer's kind", () => {
    useViewer.setState({ mapID: "a", portable, editToken: "t", hidden: new Set<string>(), device: { name: "iPad", maps: [
      { id: "a", name: "Tatras", layers: [{ id: "B", name: "Base", kind: "Tiles" },
        { id: "T", name: "Trails", kind: "Vector", bytes: 263_000_000 }, { id: "H", name: "Huts", kind: "Vector" }] }] } });
    render(<Layers portable={portable} />);
    const row = (name: string) => screen.getByLabelText("Rename", { selector: `[value="${name}"]` }).closest(".words") as HTMLElement;
    expect(row("Trails").querySelector("small")?.textContent).toBe("Vector \u00B7 263 MB");
    expect(row("Huts").querySelector("small")?.textContent).toBe("Vector");
  });

  // 115 W5's heading in place of the style's name, counting the layers the list switches
  it("heads the list with how it is ordered and how many layers it holds", () => {
    show([]);
    render(<Layers portable={portable} />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Layers · drag to change the order3");
    expect(heading.querySelector(".count")!.textContent).toBe("3");
  });

  // 85 a row says so when its service does not answer browsers; the layer stays editable
  it("says on a layer's row that its service does not answer browsers, and keeps its fields", () => {
    show([]);
    useViewer.setState({ undrawn: new Set(["t"]) });
    render(<Layers portable={portable} />);
    const row = document.querySelector('[data-layer="T"]')!;
    expect(row.textContent).toContain("This service doesn't answer browsers. The app draws it.");
    expect(row.querySelector("input")).toBeTruthy();
    expect(document.querySelector('[data-layer="H"]')!.textContent).not.toContain("answer browsers");
  });

  it("asks the phone for every layer at once", () => {
    // Never answered: what follows an answer is the map's redraw, not this test's.
    const asked = vi.fn((input: RequestInfo | URL) => new Promise<Response>(() => void input));
    vi.stubGlobal("fetch", asked);
    show(["H"]);
    render(<Layers portable={portable} />);
    fireEvent.click(screen.getByRole("button", { name: "All on" }));
    const url = String(asked.mock.calls[0]?.[0]);
    expect(url).toContain("/edit?");
    expect(url).toContain("shownAll=1");
  });

  // 58 grouped, the list folds under its sources, each header closed until opened, as Edit map's
  it("folds the layers under their sources and opens one group at a time", () => {
    showGrouped();
    render(<Layers portable={portable} />);
    const trails = screen.getByRole("button", { name: /^Trails server/ });
    expect(trails.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("1 of 2 on")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Rename" })).toBeNull();
    fireEvent.click(trails);
    expect(screen.getAllByRole("textbox", { name: "Rename" }).map((field) => (field as HTMLInputElement).value))
      .toEqual(["Trails", "Huts"]);
    expect((screen.getByRole("switch", { name: "Huts" }) as HTMLInputElement).checked).toBe(false);
  });

  // 58 a row moves among its group's rows only, landing past its neighbour in the whole order
  it("moves a layer within its group", () => {
    const asked = vi.fn((input: RequestInfo | URL) => new Promise<Response>(() => void input));
    vi.stubGlobal("fetch", asked);
    showGrouped();
    render(<Layers portable={portable} />);
    fireEvent.click(screen.getByRole("button", { name: /^Trails server/ }));
    // 94 a row's moves are in its settings, under the › at its end
    fireEvent.click(screen.getByRole("button", { name: "Options Trails" }));
    fireEvent.click(screen.getByRole("button", { name: "Options Huts" }));
    const ups = screen.getAllByRole("button", { name: "Move up" });
    const downs = screen.getAllByRole("button", { name: "Move down" });
    expect(ups.map((button) => (button as HTMLButtonElement).disabled)).toEqual([true, false]);
    expect(downs.map((button) => (button as HTMLButtonElement).disabled)).toEqual([false, true]);
    fireEvent.click(downs[0] as HTMLElement);
    expect(decodeURIComponent(String(asked.mock.calls[0]?.[0]))).toContain("order=B,H,T");
  });

  // 94 the row keeps the layer and its switch; opacity, moves and Delete fold out under its ›
  it("folds a layer's settings out under its row", () => {
    show([]);
    render(<Layers portable={portable} />);
    expect(screen.queryByRole("slider", { name: "Opacity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete layer" })).toBeNull();
    const open = screen.getByRole("button", { name: "Options Trails" });
    fireEvent.click(open);
    expect(open.getAttribute("aria-expanded")).toBe("true");
    const item = document.querySelector('[data-layer="T"]')!;
    expect(item.querySelector('input[type="range"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete layer" })).toBeTruthy();
  });

  // 94 a row dragged by its handle onto another takes that row's place
  it("moves a layer dropped on another row", () => {
    const asked = vi.fn((input: RequestInfo | URL) => new Promise<Response>(() => void input));
    vi.stubGlobal("fetch", asked);
    show([]);
    render(<Layers portable={portable} />);
    const data = new Map<string, string>();
    const dataTransfer = { setData: (kind: string, value: string) => data.set(kind, value),
      getData: (kind: string) => data.get(kind) ?? "", get types() { return [...data.keys()]; }, effectAllowed: "" };
    fireEvent.dragStart(document.querySelector('[data-layer="H"] .handle')!, { dataTransfer });
    fireEvent.drop(document.querySelector('[data-layer="B"]')!, { dataTransfer });
    expect(decodeURIComponent(String(asked.mock.calls[0]?.[0]))).toContain("order=H,B,T");
  });
});
