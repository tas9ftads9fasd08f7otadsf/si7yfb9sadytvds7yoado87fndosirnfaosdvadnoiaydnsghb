import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetViewer, useViewer } from "@/store/viewer";
import { NavRail, railItemOf } from "./NavRail";

const link = (name: string) => screen.getByRole("link", { name });

describe("NavRail", () => {
  beforeEach(() => {
    resetViewer();
    history.replaceState(null, "", "/");
  });

  // 30 each screen lights its own item, and only that one
  it("marks the screen shown as current", () => {
    useViewer.setState({ mapID: "M1", route: { screen: "edit", map: "M1", tab: "general" }, editToken: "t" });
    render(<NavRail />);
    expect(link("Map").getAttribute("aria-current")).toBe("page");
    expect(link("Maps").getAttribute("aria-current")).toBeNull();
    expect(link("Servers").getAttribute("aria-current")).toBeNull();
    expect(link("Map").getAttribute("href")).toBe("/maps/M1");
    expect(railItemOf({ screen: "maps" })).toBe("maps");
    expect(railItemOf({ screen: "servers", server: "S1" })).toBe("servers");
    // 107 the rail's Search is lit for a search and a place
    expect(railItemOf({ screen: "search", map: "M1", text: "rys" })).toBe("search");
    // 103 the gear at the rail's foot is Settings
    expect(railItemOf({ screen: "settings" })).toBe("settings");
  });

  // 92 Settings opens from the rail's foot; 103 as the gear, in place of the theme button
  it("offers Settings, which opens the Settings page", () => {
    render(<NavRail />);
    fireEvent.click(link("Settings"));
    expect(location.pathname).toBe("/settings");
    expect(useViewer.getState().route).toEqual({ screen: "settings" });
    expect(link("Settings").getAttribute("aria-current")).toBe("page");
  });

  // 30 decision 6: a rail item with nothing behind it is left out
  it("offers Servers only to a browser that may edit", () => {
    render(<NavRail />);
    expect(screen.queryByRole("link", { name: "Servers" })).toBeNull();
  });

  // 30 the Map item folds the side bar on the map, as `[` does, and leaves the address alone
  it("folds the side bar on the map and goes to the map elsewhere", () => {
    useViewer.setState({ mapID: "M1", route: { screen: "map", map: "M1" } });
    history.replaceState(null, "", "/maps/M1");
    render(<NavRail />);
    fireEvent.click(link("Map"));
    expect(useViewer.getState().sideShown).toBe(false);
    expect(location.pathname).toBe("/maps/M1");
    fireEvent.click(link("Maps"));
    expect(location.pathname).toBe("/maps");
    expect(useViewer.getState().sideShown).toBe(true);
    fireEvent.click(link("Map"));
    expect(location.pathname).toBe("/maps/M1");
    expect(useViewer.getState().route).toEqual({ screen: "map", map: "M1" });
  });

  // 30 a ⌘-click is the browser's, for a new tab
  it("leaves a modified click to the browser", () => {
    useViewer.setState({ mapID: "M1", route: { screen: "map", map: "M1" } });
    render(<NavRail />);
    fireEvent.click(link("Maps"), { metaKey: true });
    expect(useViewer.getState().route).toEqual({ screen: "map", map: "M1" });
  });

  // 107 the rail's Search puts the cursor in the top bar's field, back on the map from a page
  it("takes Search to the top bar's field", () => {
    useViewer.setState({ mapID: "M1", route: { screen: "data", tab: "maps" } });
    const field = document.createElement("input");
    field.id = "search";
    document.body.append(field);
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((run) => { run(0); return 0; });
    render(<NavRail />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(useViewer.getState().route).toEqual({ screen: "map", map: "M1" });
    expect(document.activeElement).toBe(field);
    frame.mockRestore();
    field.remove();
  });
});

