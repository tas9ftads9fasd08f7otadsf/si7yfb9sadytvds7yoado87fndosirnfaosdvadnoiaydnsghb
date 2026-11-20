import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedListing, SavedRow } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { PlacePanel } from "./PlacePanel";
import { SavedPage } from "./SavedPage";

vi.mock("@backend", async (original) => {
  const phone = await original<typeof import("@/targets/phone/backend")>();
  return { backend: { ...phone.backend, offers: () => true, saved: vi.fn(async () => ({ ok: false, status: 500, said: "" })),
    savedFeature: vi.fn(async () => ({ ok: false, status: 500, said: "" })) } };
});

const row = (id: string, more: Partial<SavedRow> = {}): SavedRow => ({ id, name: id, kind: "point", latitude: 48.1,
  longitude: 17.1, savedAt: "2026-03-01T10:00:00Z", isComplete: true, ...more });

const listing: SavedListing = { total: 3, folders: [{ id: "F1", name: "Tatras", symbol: "folder", isShared: false, isSharedWithMe: false }],
  features: [row("Hut", { category: "Shelter", folderID: "F1", note: "Water nearby", mapName: "High Tatras", layerName: "Huts" }),
    row("Ridge", { kind: "line", savedAt: "2026-05-01T10:00:00Z" }), row("Lake", { kind: "area", savedAt: "2026-04-01T10:00:00Z" })] };

const seed = (saved: SavedListing | null = listing) => {
  history.replaceState(null, "", "/saved");
  useViewer.setState({ editToken: "t", route: { screen: "saved" }, saved });
};

describe("the Saved screen", () => {
  beforeEach(() => resetViewer());

  // 135 the rows newest first, each with its category and folder and its date
  it("lists the rows newest first with the category, the folder and the count", () => {
    seed();
    render(<SavedPage />);
    const rows = screen.getAllByRole("button").filter((each) => each.hasAttribute("data-saved"));
    expect(rows.map((each) => each.getAttribute("data-saved"))).toEqual(["Ridge", "Lake", "Hut"]);
    expect(within(rows[2]!).getByText("Shelter, Tatras")).toBeTruthy();
    expect(screen.getByText("3 saved")).toBeTruthy();
  });

  // 135 the field, the kind chips and the folder picker narrow the same list
  it("narrows by the field, the chips and the folder", () => {
    seed();
    render(<SavedPage />);
    fireEvent.change(screen.getByLabelText("Search saved"), { target: { value: "water" } });
    expect(document.querySelectorAll("[data-saved]")).toHaveLength(1);
    expect(screen.getByText("1 saved")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search saved"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Areas" }));
    expect([...document.querySelectorAll("[data-saved]")].map((each) => each.getAttribute("data-saved"))).toEqual(["Lake"]);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByLabelText("Folder"), { target: { value: "unfiled" } });
    expect(document.querySelectorAll("[data-saved]")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Search saved"), { target: { value: "volcano" } });
    expect(screen.getByText("Nothing here matches.")).toBeTruthy();
  });

  // 135 a listing the phone cut says how many it shows of how many it holds
  it("says Showing N of M when the phone cut the list", () => {
    seed({ ...listing, total: 5200 });
    render(<SavedPage />);
    expect(screen.getByText("Showing 3 of 5200")).toBeTruthy();
  });

  // 135 nothing saved: the phone's two lines, and no field to type in
  it("says nothing is saved yet, with how to save", () => {
    seed({ folders: [], features: [], total: 0 });
    render(<SavedPage />);
    expect(screen.getByText("Nothing saved yet")).toBeTruthy();
    expect(screen.getByText(/Tap ☆ on any place, line or area\./)).toBeTruthy();
    expect(screen.queryByLabelText("Search saved")).toBeNull();
  });

  // 135 a row is read only: picking it names it in the address, and nothing offers to change it
  it("opens a row by its address and offers no Save, Delete or Move", () => {
    seed();
    render(<SavedPage />);
    fireEvent.click(document.querySelector("[data-saved=Hut]")!);
    expect(location.pathname).toBe("/saved/Hut");
    for (const name of ["Save", "Delete", "Move"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });
});

describe("the place panel on a saved place", () => {
  beforeEach(() => resetViewer());

  // 135 name, category and folder, note, the map and layer it came from, the date and the coordinates
  it("words the saved place as the phone's Saved sheet does", () => {
    seed();
    useViewer.setState({ place: { found: [], lng: 17.1, lat: 48.1, saved: listing.features[0] } });
    render(<PlacePanel />);
    expect(screen.getByRole("heading", { name: "Hut" })).toBeTruthy();
    expect(screen.getByText("Shelter, Tatras")).toBeTruthy();
    expect(screen.getByText("Water nearby")).toBeTruthy();
    expect(screen.getByText("High Tatras")).toBeTruthy();
    expect(screen.getByText("Huts")).toBeTruthy();
    expect(screen.getByText(/2026/)).toBeTruthy();
    expect(screen.getByText("48.10000 N, 17.10000 E")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });
});
