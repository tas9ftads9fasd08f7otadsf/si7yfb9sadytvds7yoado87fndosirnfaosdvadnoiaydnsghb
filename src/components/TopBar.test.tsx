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

  // 31 the map picker: every map as a link, the shown one current, All maps at its foot
  it("lists every map and All maps, the shown one current", () => {
    render(<TopBar />);
    expect(screen.getByText("Riki's iPad")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Maps" }));
    const items = screen.getAllByRole("menuitem");
    expect(items.map((each) => each.textContent)).toEqual(["High Tatras", "Bratislava", "All maps"]);
    expect(items.map((each) => each.getAttribute("href"))).toEqual(["/maps/a", "/maps/b", "/maps"]);
    expect(items[0]!.getAttribute("aria-current")).toBe("page");
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
