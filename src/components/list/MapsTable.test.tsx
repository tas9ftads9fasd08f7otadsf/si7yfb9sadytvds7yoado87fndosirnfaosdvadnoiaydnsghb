import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { SharedMap } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { MapsScreen } from "./MapsPage";
import { MapsTable } from "./MapsTable";

const sent: SharedMap[] = [
  { id: "d", name: "Doprava", layers: [], styles: ["Day", "Night"], styleIDs: ["s1", "s2"], note: "Trains\nmore", role: "own", people: 3,
    offline: "ready", bytes: 1_200_000_000, changedAt: Math.floor(Date.now() / 1000) - 60 },
  { id: "h", name: "Historická 2", layers: [], styles: ["Old"], role: "view", people: 0, offline: "online" }];
const older: SharedMap[] = [{ id: "o", name: "Old phone's map", layers: [] }];

const heads = () => screen.getAllByRole("columnheader").map((each) => each.textContent);

describe("the Maps screen's list", () => {
  beforeEach(() => {
    resetViewer();
    localStorage.clear();
    history.replaceState(null, "", "/maps");
  });

  // 149 W4's table: Map, Styles, Layers, Shared, On the phone, Size, Changed; a missing field is a blank cell
  it("has a column for each field the phone sent and a blank cell where a map has none", () => {
    render(<MapsTable maps={sent} />);
    expect(heads()).toEqual(["Map", "Styles", "Layers", "Shared", "On the phone", "Size", "Changed"]);
    const doprava = screen.getByText("Doprava").closest("[role=row]") as HTMLElement;
    expect(within(doprava).getByText("Trains")).toBeTruthy();
    expect(within(doprava).queryByText("more")).toBeNull();
    expect(within(doprava).getByText("Shared with 3 · Owner")).toBeTruthy();
    expect(within(doprava).getByText("Ready offline")).toBeTruthy();
    expect(within(doprava).getByText("1.2 GB")).toBeTruthy();
    expect(within(doprava).getByText("Today")).toBeTruthy();
    const historicka = screen.getByText("Historická 2").closest("[role=row]") as HTMLElement;
    expect(within(historicka).getByText("Online only")).toBeTruthy();
    expect(historicka.querySelector("[data-column=size]")?.textContent).toBe("");
    expect(historicka.querySelector("[data-column=changed]")?.textContent).toBe("");
  });

  // 149 from an older phone the list drops the columns the new fields feed
  it("drops the columns an older phone feeds nothing", () => {
    render(<MapsTable maps={older} />);
    expect(heads()).toEqual(["Map", "Layers"]);
  });

  // 149 a row opens its map; the name is a link, so ⌘-click is the browser's
  it("opens the map from a row, and leaves a modified click to the browser", () => {
    render(<MapsTable maps={sent} />);
    const row = screen.getByText("Historická 2").closest("[role=row]") as HTMLElement;
    fireEvent.click(row, { metaKey: true });
    expect(useViewer.getState().route).toEqual({ screen: "home" });
    expect(screen.getByRole("link", { name: "Historická 2" }).getAttribute("href")).toBe("/maps/h");
    fireEvent.click(row);
    expect(useViewer.getState().route).toEqual({ screen: "map", map: "h" });
  });

  // 149 Cards or List are two icon buttons; the choice is kept in the browser and read again
  it("switches between Cards and List and keeps the choice", () => {
    useViewer.setState({ device: { name: "iPad", maps: sent }, route: { screen: "maps" }, editToken: "t" });
    const { unmount } = render(<MapsScreen />);
    expect(document.getElementById("mapsCards")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cards" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(document.getElementById("mapsCards")).toBeNull();
    expect(screen.getByRole("table", { name: "Maps" })).toBeTruthy();
    expect(localStorage.getItem("riki-maps-view")).toBe("list");
    unmount();
    render(<MapsScreen />);
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("table", { name: "Maps" })).toBeTruthy();
  });

  // 149 the field, filters and sort narrow the list as they narrow the cards
  it("narrows the list as it narrows the cards", () => {
    localStorage.setItem("riki-maps-view", "list");
    useViewer.setState({ device: { name: "iPad", maps: sent }, route: { screen: "maps" } });
    render(<MapsScreen />);
    fireEvent.change(screen.getByLabelText("Find a map"), { target: { value: "histor" } });
    expect(within(screen.getByRole("table", { name: "Maps" })).getAllByRole("row")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Find a map"), { target: { value: "volcano" } });
    expect(screen.getByText("No map named “volcano”")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Maps" })).toBeNull();
  });
});
