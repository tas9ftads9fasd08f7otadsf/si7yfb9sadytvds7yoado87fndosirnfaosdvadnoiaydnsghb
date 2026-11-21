import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedMap } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { MapTile } from "./MapTile";

const full: SharedMap = { id: "d", name: "Doprava", layers: Array.from({ length: 7 }, (_, place) => ({ id: `l${place}`, name: "L", kind: "Vector" })),
  styles: ["Day", "Night", "Print", "Map"], styleIDs: ["s1", "s2", "s3", "s4"], note: "Trains and buses\nmore", role: "own", people: 3,
  offline: "ready", bytes: 1_200_000_000, changedAt: 1_700_000_000, category: "Transit", minimumVersion: { app: "0.18.0" } };
const bare: SharedMap = { id: "o", name: "Old phone's map", layers: [] };

const show = (shared: SharedMap, more: Record<string, unknown> = {}) => {
  useViewer.setState({ editToken: "t", mapID: null, ...more });
  return render(<MapTile shared={shared} />);
};

describe("a map's card", () => {
  beforeEach(() => resetViewer());

  // 148 a card draws each pill only where its field came: sharing, offline, size, category, the version line
  it("draws the counts, the note's first line and every pill the phone sent", () => {
    show(full);
    expect(screen.getByText("4 styles · 7")).toBeTruthy();
    expect(screen.getByText("Trains and buses")).toBeTruthy();
    expect(screen.queryByText(/more$/)).toBeNull();
    expect(document.querySelector("[data-sharing]")?.textContent).toBe("Shared with 3 · Owner");
    expect(document.querySelector("[data-offline=ready]")?.textContent).toBe("Ready offline");
    expect(document.querySelector("[data-held]")?.textContent).toBe("1.2 GB");
    expect(document.querySelector("[data-category]")?.textContent).toBe("Transit");
    expect(screen.getByText("Needs Riki Maps 0.18.0 or later")).toBeTruthy();
  });

  // 148 a map from an older phone has none of them
  it("draws no pill for a map the phone sent no new fields for", () => {
    show(bare);
    expect(document.querySelector(".pill-tag")).toBeNull();
    expect(document.querySelector("[data-needs]")).toBeNull();
    expect(document.querySelector(".chip-row .style-chip")).toBeNull();
    expect(screen.queryByText("On map now")).toBeNull();
  });

  // 148 the card is a link to the map, a style chip a link to its style; three chips and then "+1"
  it("links the map and each style, three chips and then +1", () => {
    show(full);
    const hrefs = screen.getAllByRole("link").map((each) => each.getAttribute("href"));
    expect(hrefs).toContain("/maps/d");
    expect(screen.getByRole("link", { name: "Night" }).getAttribute("href")).toBe("/maps/d/style/s2");
    expect(screen.queryByRole("link", { name: "Map" })).toBeNull();
    expect(screen.getByText("+1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe("/maps/d");
  });

  // 148 a plain click moves with the address; a modified click is left to the browser, for a new tab
  it("opens the map on a click and leaves a ⌘-click to the browser", () => {
    show(full);
    const open = screen.getByRole("link", { name: "Open" });
    fireEvent.click(open, { metaKey: true });
    expect(useViewer.getState().route).toEqual({ screen: "home" });
    fireEvent.click(open);
    expect(useViewer.getState().route).toEqual({ screen: "map", map: "d" });
  });

  // 148 the one on screen says so
  it("marks the map on screen", () => {
    show(full, { mapID: "d" });
    expect(within(document.querySelector("[data-map]") as HTMLElement).getByText("On map now")).toBeTruthy();
  });

  // 148 Edit is for a map this phone may change: not for one shared to look at, nor for a browser that only looks
  it("offers Edit to an editor and not for a view-only map", () => {
    const { unmount } = show(full);
    expect(screen.getByRole("link", { name: "Edit map" }).getAttribute("href")).toBe("/maps/d/edit/layers");
    unmount();
    const view = show({ ...full, role: "view" });
    expect(screen.queryByRole("link", { name: "Edit map" })).toBeNull();
    view.unmount();
    resetViewer();
    render(<MapTile shared={full} />);
    expect(screen.queryByRole("link", { name: "Edit map" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  });

  // 148 More: Duplicate through Edit map's call, Delete where the phone says it offers one, the name typed
  it("duplicates and deletes through the calls Edit map makes", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      asked.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/switches")) return new Response(JSON.stringify({ deletion: "everyone" }));
      if (url.includes("/delete?")) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ id: "n", name: "Copy", maps: [] }));
    }));
    show(full);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete map" }));
    expect(screen.getByText("Everyone you shared it with loses access to it.")).toBeTruthy();
    const yes = document.querySelector("[data-delete-yes]") as HTMLButtonElement;
    expect(yes.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type the map’s name to delete it."), { target: { value: "Doprava" } });
    expect(yes.disabled).toBe(false);
    fireEvent.click(yes);
    await vi.waitFor(() => expect(asked.some((each) => each.includes("/maps/d/delete?name=Doprava"))).toBe(true));
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate map" }));
    await vi.waitFor(() => expect(asked.some((each) => each.includes("/maps/d/duplicate"))).toBe(true));
    vi.unstubAllGlobals();
  });
});
