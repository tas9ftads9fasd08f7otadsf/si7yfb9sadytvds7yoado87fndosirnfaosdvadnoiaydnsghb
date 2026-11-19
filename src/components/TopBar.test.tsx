import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Device } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { TopBar } from "./TopBar";

const device = { name: "Riki's iPad", maps: [{ id: "a", name: "High Tatras", layers: [] },
  { id: "b", name: "Bratislava", layers: [] }] } as unknown as Device;

describe("TopBar", () => {
  beforeEach(() => {
    resetViewer();
    history.replaceState(null, "", "/maps/a");
    useViewer.setState({ device, mapID: "a", route: { screen: "map", map: "a" } });
  });

  // 47 the map is named with no menu; 90 the style moved to the side bar and the map's switcher
  it("names the map on screen and offers no menu of maps", () => {
    const { container } = render(<TopBar />);
    expect(screen.getByText("Riki's iPad")).toBeTruthy();
    expect(screen.getByText("High Tatras")).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(screen.queryByRole("button", { name: "Maps" })).toBeNull();
    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector("[aria-haspopup]")).toBeNull();
  });

  // 90 the map's name opens the maps to pick another
  it("opens the maps from the map's name", () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: /High Tatras/ }));
    expect(useViewer.getState().route).toEqual({ screen: "maps" });
    expect(useViewer.getState().sideShown).toBe(true);
  });

  // 90 New map is offered only to a browser that may edit, and opens its name field
  it("offers New map to an editing browser and opens its name", () => {
    const { rerender } = render(<TopBar />);
    expect(screen.queryByRole("button", { name: "New map" })).toBeNull();
    act(() => useViewer.setState({ editToken: "t" }));
    rerender(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "New map" }));
    expect(useViewer.getState().namingMap).toBe(true);
    expect(useViewer.getState().route).toEqual({ screen: "maps" });
  });

  // 40 no dot until the phone has been asked, green once it answers, red when it does not
  it("marks the phone connected or not by its name", () => {
    render(<TopBar />);
    expect(screen.queryByRole("img")).toBeNull();
    act(() => useViewer.setState({ connected: true }));
    expect(screen.getByRole("img", { name: "Connected" }).className).toBe("dot on");
    act(() => useViewer.setState({ connected: false }));
    expect(screen.getByRole("img", { name: "Not connected" }).className).toBe("dot off");
  });

  // 31 Share copies the address and says so
  it("copies the address on Share", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<TopBar />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Share" })); });
    expect(writeText).toHaveBeenCalledWith(location.href);
    expect(useViewer.getState().notice).toBe("Link copied");
    vi.unstubAllGlobals();
  });
});
