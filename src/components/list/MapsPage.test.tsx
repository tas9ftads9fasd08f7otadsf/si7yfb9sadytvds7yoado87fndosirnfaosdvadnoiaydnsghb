import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Device } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { MapsScreen } from "./MapsPage";

const device: Device = { name: "iPad", maps: [
  { id: "1", name: "Doprava", layers: [], role: "own", changedAt: 1_700_300_000, bytes: 1_200_000_000, category: "Transit" },
  { id: "2", name: "Riki Maps", layers: [], role: "own", changedAt: 1_700_200_000, bytes: 854_000_000, category: "Reference" },
  { id: "3", name: "Historická 2", layers: [], role: "view", changedAt: 1_700_100_000 },
  { id: "4", name: "Fitness", layers: [], role: "edit", bytes: 182_000_000 }] };

const names = () => [...document.querySelectorAll("#mapsCards .map-tile .tile-name")].map((each) => each.textContent);

describe("the Maps screen", () => {
  beforeEach(() => {
    resetViewer();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    history.replaceState(null, "", "/maps");
    useViewer.setState({ device, route: { screen: "maps" }, editToken: "t" });
  });

  // 148 only at /maps; the header says how many maps the phone shares
  it("draws at /maps with a count, and nowhere else", () => {
    const { container, unmount } = render(<MapsScreen />);
    expect(screen.getByRole("heading", { name: "Maps" })).toBeTruthy();
    expect(screen.getByText("4 maps shared by this phone")).toBeTruthy();
    expect(names()).toEqual(["Doprava", "Fitness", "Historická 2", "Riki Maps"]);
    unmount();
    useViewer.setState({ route: { screen: "data", tab: "layers" } });
    const other = render(<MapsScreen />);
    expect(other.container.innerHTML).toBe("");
    expect(container).toBeTruthy();
  });

  // 148 the field narrows the cards by name or category
  it("narrows the cards by the field", () => {
    render(<MapsScreen />);
    fireEvent.change(screen.getByLabelText("Find a map"), { target: { value: "riki" } });
    expect(names()).toEqual(["Riki Maps"]);
    fireEvent.change(screen.getByLabelText("Find a map"), { target: { value: "transit" } });
    expect(names()).toEqual(["Doprava"]);
  });

  // 148 All, Mine and Shared with me, each with its count, from the roles the phone sent
  it("filters All, Mine and Shared with me, with counts", () => {
    render(<MapsScreen />);
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual(["All4", "Mine2", "Shared with me2"]);
    fireEvent.click(screen.getByRole("tab", { name: /Mine/ }));
    expect(names()).toEqual(["Doprava", "Riki Maps"]);
    fireEvent.click(screen.getByRole("tab", { name: /Shared with me/ }));
    expect(names()).toEqual(["Fitness", "Historická 2"]);
  });

  // 148 an older phone sends no roles, so there is nothing to filter by
  it("leaves out the filters when the phone sent no roles", () => {
    useViewer.setState({ device: { name: "iPad", maps: [{ id: "a", name: "A", layers: [] }, { id: "b", name: "B", layers: [] }] } });
    render(<MapsScreen />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(names()).toEqual(["A", "B"]);
  });

  // 148 Sort is a button that opens a listbox: Name, Last changed, Size; a missing field sorts last
  it("sorts by name, last changed or size from a listbox", () => {
    render(<MapsScreen />);
    fireEvent.click(screen.getByRole("button", { name: /Sort/ }));
    expect(within(screen.getByRole("listbox")).getAllByRole("option").map((each) => each.textContent)).toEqual(["Name", "Last changed", "Size"]);
    fireEvent.click(screen.getByRole("option", { name: "Last changed" }));
    expect(names()).toEqual(["Doprava", "Riki Maps", "Historická 2", "Fitness"]);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Sort/ }));
    fireEvent.click(screen.getByRole("option", { name: "Size" }));
    expect(names()).toEqual(["Doprava", "Riki Maps", "Fitness", "Historická 2"]);
  });

  // 148 a Category filter once two or more categories exist
  it("offers a Category filter once two categories exist", () => {
    const { unmount } = render(<MapsScreen />);
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Reference" } });
    expect(names()).toEqual(["Riki Maps"]);
    unmount();
    useViewer.setState({ device: { name: "iPad", maps: device.maps.map((each) => ({ ...each, category: undefined, role: each.role })).map(
      (each, place) => (place === 0 ? { ...each, category: "Transit" } : each)) } });
    render(<MapsScreen />);
    expect(screen.queryByLabelText("Category")).toBeNull();
  });

  // 148 a filter with no map says so with Clear
  it("says No map named and clears the filter", () => {
    render(<MapsScreen />);
    fireEvent.change(screen.getByLabelText("Find a map"), { target: { value: "volcano" } });
    expect(screen.getByText("No map named “volcano”")).toBeTruthy();
    expect(names()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(names()).toHaveLength(4);
    expect((screen.getByLabelText("Find a map") as HTMLInputElement).value).toBe("");
  });

  // 148 nothing shared: the page's words, with New map and Import for an editor
  it("says nothing is shared, with New map and Import for an editing browser", () => {
    useViewer.setState({ device: { name: "iPad", maps: [] } });
    const { unmount } = render(<MapsScreen />);
    expect(screen.getByText("No map here can be shared.")).toBeTruthy();
    expect(document.getElementById("mapsNew")).toBeTruthy();
    expect(document.getElementById("mapsImport")).toBeTruthy();
    expect(screen.queryByLabelText("Find a map")).toBeNull();
    unmount();
    useViewer.setState({ editToken: null });
    render(<MapsScreen />);
    expect(document.getElementById("mapsNew")).toBeNull();
    expect(document.getElementById("mapsImport")).toBeNull();
  });

  // 148 New map opens its window
  it("opens New map's window", () => {
    render(<MapsScreen />);
    fireEvent.click(document.getElementById("mapsNew")!);
    expect(useViewer.getState().route).toEqual({ screen: "maps", modal: { kind: "new" } });
  });
});
