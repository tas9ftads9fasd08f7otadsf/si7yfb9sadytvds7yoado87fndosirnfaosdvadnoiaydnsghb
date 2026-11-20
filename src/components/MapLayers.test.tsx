import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Device, Portable } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { MapsPage } from "./MapsPage";
import { LayerSwitcher } from "./MapLayers";

const device = { name: "iPad", maps: [{ id: "a", name: "Tatras", layers: [
  { id: "t", name: "Trails", kind: "Vector" }, { id: "h", name: "Huts", kind: "Points" }] }] } as unknown as Device;
const portable = { name: "Tatras", styles: [{ id: "s", name: "Summer", arrangement: { hidden: [] } },
  { id: "w", name: "Winter", arrangement: { hidden: ["h"] } }] } as unknown as Portable;

const show = (state: object = {}) => useViewer.setState({ device, portable, mapID: "a", styleID: "s",
  route: { screen: "map", map: "a" }, ...state });

describe("map layers", () => {
  beforeEach(resetViewer);

  // 90 the side bar's style is a drop-down whose list picks the style on the map
  it("picks a style from the side bar's drop-down", () => {
    show();
    render(<MapsPage />);
    const picker = screen.getByRole("button", { name: "Style Summer" });
    expect(picker.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(picker);
    expect(screen.getByRole("option", { name: "Summer" }).getAttribute("aria-selected")).toBe("true");
    act(() => fireEvent.click(screen.getByRole("option", { name: "Winter" })));
    expect(useViewer.getState().styleID).toBe("w");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  // 90 the layers are headed by the style and count those it draws
  it("counts the layers the style draws", () => {
    show({ editToken: "t" });
    render(<MapsPage />);
    expect(screen.getByText("Layers in Summer")).toBeTruthy();
    expect(screen.getByText("2 of 2 on")).toBeTruthy();
    act(() => fireEvent.click(screen.getByRole("switch", { name: "Huts" })));
    expect(screen.getByText("1 of 2 on")).toBeTruthy();
  });

  // 90 the map's card folds its style and layers away
  it("folds the map's card", () => {
    show({ editToken: "t" });
    render(<MapsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: "Style Summer" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByRole("switch", { name: "Trails" })).toBeTruthy();
  });

  // 90 the map's switcher names the style and opens its layers for an editing browser
  it("opens the switcher over the map", () => {
    show({ editToken: "t" });
    render(<LayerSwitcher />);
    const button = screen.getByRole("button", { name: /Summer/ });
    fireEvent.click(button);
    expect(screen.getByRole("dialog", { name: "Layers" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Trails" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    expect(useViewer.getState().switcherOpen).toBe(false);
    expect(useViewer.getState().editing).toBe(true);
  });

  // 90 a browser that may only look gets the style alone, and none for a map of one style
  it("gives a looking browser the style and no switches", () => {
    show();
    const { unmount } = render(<LayerSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /Summer/ }));
    expect(screen.getByRole("button", { name: "Style Summer" })).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    unmount();
    act(() => useViewer.setState({ portable: { ...portable, styles: portable.styles?.slice(0, 1) } }));
    const { container } = render(<LayerSwitcher />);
    expect(container.innerHTML).toBe("");
  });

  // 107 the card counts the styles; All styles lists them as cards, one picked by its card
  it("counts the styles and lists them as cards", () => {
    show({ editToken: "t", portable: { ...portable, stack: [{ id: "t", name: "Trails" }, { id: "h", name: "Huts" }] } });
    render(<MapsPage />);
    expect(screen.getByText("2 styles · 2")).toBeTruthy();
    act(() => fireEvent.click(screen.getByRole("button", { name: "All styles" })));
    expect(screen.queryByRole("switch")).toBeNull();
    const winter = screen.getByRole("button", { name: /^Winter/ });
    expect(winter.textContent).toContain("1 of 2 on");
    act(() => fireEvent.click(winter));
    expect(useViewer.getState().styleID).toBe("w");
    expect(winter.getAttribute("aria-pressed")).toBe("true");
    act(() => fireEvent.click(screen.getByRole("button", { name: "Layers" })));
    expect(screen.getByRole("switch", { name: "Trails" })).toBeTruthy();
  });
});

