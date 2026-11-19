import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device, Portable } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { EditPage, EditTabs } from "./EditPage";

const portable: Portable = { id: "a", name: "Tatras", note: "Trails", stack: [{ id: "T", name: "Trails", isEnabled: true }],
  styles: [{ id: "s", name: "Summer" }] };
const device: Device = { name: "iPad", maps: [{ id: "a", name: "Tatras", layers: [{ id: "T", name: "Trails", kind: "Vector" }] }] };

describe("Edit map's tabs", () => {
  beforeEach(() => {
    resetViewer();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    history.replaceState(null, "", "/maps/a/edit/layers");
    useViewer.setState({ device, portable, mapID: "a", editToken: "t", editing: true,
      route: { screen: "edit", map: "a", tab: "layers" } });
  });
  afterEach(() => vi.unstubAllGlobals());

  // 94 the five tabs of W5–W9, the one in the address picked
  it("lists the five tabs and picks the address's", () => {
    render(<EditTabs />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent))
      .toEqual(["Layers", "General", "Styling", "Sharing", "Offline"]);
    expect(screen.getByRole("tab", { name: "Layers" }).getAttribute("aria-selected")).toBe("true");
  });

  // 94 a tab is an address of its own, and shows only its part of Edit map
  it("moves to a tab's address and shows its fields alone", () => {
    render(<><EditTabs /><EditPage /></>);
    expect(screen.getByRole("switch", { name: "Trails" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    act(() => fireEvent.click(screen.getByRole("tab", { name: "General" })));
    expect(location.pathname).toBe("/maps/a/edit/general");
    expect(useViewer.getState().route).toEqual({ screen: "edit", map: "a", tab: "general" });
    expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Trails" })).toBeNull();
    expect(screen.getByRole("tab", { name: "General" }).getAttribute("aria-selected")).toBe("true");
  });
});
