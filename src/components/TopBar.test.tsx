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

  // 44 the map picker: the other maps as links, the shown one left out, All maps at its foot
  it("lists the other maps and All maps, not the one on screen", () => {
    render(<TopBar />);
    expect(screen.getByText("Riki's iPad")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Maps" }));
    const items = screen.getAllByRole("menuitem");
    expect(items.map((each) => each.textContent)).toEqual(["Bratislava", "All maps"]);
    expect(items.map((each) => each.getAttribute("href"))).toEqual(["/maps/b", "/maps"]);
    expect(screen.getByRole("button", { name: "Maps" }).textContent).toBe("High Tatras");
  });

  // 44 a phone sharing one map still offers All maps
  it("offers All maps alone when no other map is shared", () => {
    useViewer.setState({ device: { ...device, maps: device.maps.slice(0, 1) } });
    render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "Maps" }));
    expect(screen.getAllByRole("menuitem").map((each) => each.textContent)).toEqual(["All maps"]);
  });

  // 31 picking a map moves to its address and closes the menu
  it("opens the picked map and closes", () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "Maps" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Bratislava" }));
    expect(location.pathname).toBe("/maps/b");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  // 31 Escape closes the menu and is marked, so Edit map under it stays open
  it("closes on Escape, marking the key as taken", () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "Maps" }));
    const taken = !fireEvent.keyDown(document, { key: "Escape" });
    expect(taken).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
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
