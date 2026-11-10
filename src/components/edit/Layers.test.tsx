import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device, Portable } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { Layers } from "./Layers";

// 3083 TestFlight AJNX: the list's own switch.
const portable: Portable = { id: "a", name: "Tatras", stack: [
  { id: "B", name: "Base", isEnabled: true }, { id: "T", name: "Trails", isEnabled: true },
  { id: "H", name: "Huts", isEnabled: true }] };
const device: Device = { name: "iPad", maps: [{ id: "a", name: "Tatras", layers: [
  { id: "B", name: "Base", kind: "Tiles" }, { id: "T", name: "Trails", kind: "Vector" },
  { id: "H", name: "Huts", kind: "Vector" }] }] };

const show = (hidden: string[]) =>
  useViewer.setState({ mapID: "a", device, portable, editToken: "t", hidden: new Set(hidden) });

describe("Layers", () => {
  beforeEach(resetViewer);
  afterEach(() => vi.unstubAllGlobals());

  it("offers All off while every layer is drawn, and All on once one is hidden", () => {
    show([]);
    const { unmount } = render(<Layers portable={portable} />);
    expect(screen.getByRole("button", { name: "All off" })).toBeTruthy();
    unmount();
    show(["H"]);
    render(<Layers portable={portable} />);
    expect(screen.getByRole("button", { name: "All on" })).toBeTruthy();
  });

  it("asks the phone for every layer at once", () => {
    // Never answered: what follows an answer is the map's redraw, not this test's.
    const asked = vi.fn((input: RequestInfo | URL) => new Promise<Response>(() => void input));
    vi.stubGlobal("fetch", asked);
    show(["H"]);
    render(<Layers portable={portable} />);
    fireEvent.click(screen.getByRole("button", { name: "All on" }));
    const url = String(asked.mock.calls[0]?.[0]);
    expect(url).toContain("/edit?");
    expect(url).toContain("shownAll=1");
  });
});
