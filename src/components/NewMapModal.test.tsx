import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { AddLayerModal } from "./edit/AddLayerModal";
import { NewMapModal } from "./NewMapModal";

const device: Device = { name: "iPad", maps: [{ id: "a", name: "Tatras", layers: [] }] };

describe("the windows", () => {
  beforeEach(() => {
    resetViewer();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    history.replaceState(null, "", "/new");
    useViewer.setState({ device, mapID: "a", editToken: "t", route: { screen: "map", map: "a", modal: { kind: "new" } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  // 97 W10: a name, a colour, what it starts from; Create waits for a name
  it("asks New map's name before it creates an empty map", () => {
    render(<NewMapModal />);
    expect(screen.getByRole("dialog", { name: "New map" })).toBeTruthy();
    const create = screen.getByRole("button", { name: "Create and edit" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(screen.getByRole("button", { name: /^Empty map/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Low Tatras" } });
    expect(create.disabled).toBe(false);
  });

  // 97 Cancel and Escape take the window away and leave the map under it
  it("closes back to the map under it", () => {
    render(<NewMapModal />);
    act(() => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
    expect(useViewer.getState().route).toEqual({ screen: "map", map: "a" });
    expect(location.pathname).toBe("/maps/a");
  });

  // 97 W11: the sources on the left, the first one's part beside them, another picked by its button
  it("lists Add layer's sources and shows the picked one's part", () => {
    useViewer.setState({ addingPackages: true, portable: { id: "a", name: "Tatras" } });
    render(<AddLayerModal />);
    expect(screen.getByRole("dialog", { name: "Add layer" })).toBeTruthy();
    expect(screen.getByText("Tatras")).toBeTruthy();
    const tile = screen.getByRole("button", { name: /^Tile URL/ });
    act(() => fireEvent.click(tile));
    expect(tile.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("#tileAddress")).toBeTruthy();
    act(() => fireEvent.click(screen.getByRole("button", { name: "Close" })));
    expect(useViewer.getState().addingPackages).toBe(false);
  });
});
