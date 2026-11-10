import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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
    expect(railItemOf({ screen: "settings" })).toBeNull();
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
});
