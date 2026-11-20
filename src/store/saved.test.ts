import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapControl } from "@/map/control";
import { setMapControl } from "@/map/control";
import type { SavedListing, SavedRow, SavedShape } from "@/lib/types";
import { loadSaved, openSaved, readAddress, resetViewer, setSavedFilter, showPlace, useViewer } from "./viewer";

const fake = vi.hoisted(() => ({ saved: vi.fn(), savedFeature: vi.fn() }));
vi.mock("@backend", async (original) => {
  const phone = await original<typeof import("@/targets/phone/backend")>();
  return { backend: { ...phone.backend, offers: () => true, saved: fake.saved, savedFeature: fake.savedFeature } };
});

const get = useViewer.getState;

const row = (id: string, more: Partial<SavedRow> = {}): SavedRow => ({ id, name: id, kind: "point", latitude: 48.1,
  longitude: 17.1, savedAt: "2026-01-01T10:00:00Z", isComplete: true, ...more });
const ridge = row("Ridge", { kind: "line", latitude: 49, longitude: 20, bounds: { south: 48, west: 19, north: 50, east: 21 } });
const listing: SavedListing = { folders: [], total: 3, features: [row("Hut", { ink: "#336699" }), ridge, row("Spring")] };
const shape: SavedShape = { type: "Feature", id: "Ridge", properties: ridge,
  geometry: { type: "LineString", coordinates: [[19, 48], [21, 50]] } };

const control = () => ({ showSaved: vi.fn(), flyTo: vi.fn() }) as unknown as MapControl & { showSaved: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn> };

describe("the saved places", () => {
  beforeEach(() => {
    resetViewer();
    vi.clearAllMocks();
    fake.saved.mockResolvedValue({ ok: true, value: listing });
    fake.savedFeature.mockResolvedValue({ ok: true, value: shape });
    history.replaceState(null, "", "/saved");
    useViewer.setState({ editToken: "t", route: { screen: "saved" } });
  });

  // 135 the screen reads the phone's list, and its points are drawn as marks of their ink
  it("reads the list and draws the points the filters leave", async () => {
    const map = control();
    setMapControl(map);
    await loadSaved();
    expect(get().saved).toEqual(listing);
    const [marks] = map.showSaved.mock.calls.at(-1)!;
    expect(marks).toEqual([{ id: "Hut", lng: 17.1, lat: 48.1, ink: "#336699" }, { id: "Spring", lng: 17.1, lat: 48.1, ink: undefined }]);
    setSavedFilter({ text: "hut" });
    expect(map.showSaved.mock.calls.at(-1)![0]).toEqual([{ id: "Hut", lng: 17.1, lat: 48.1, ink: "#336699" }]);
    setMapControl(null);
  });

  // 135 a line is fetched whole, drawn, and the map fits its box before the panel opens on it
  it("opens a line: its shape is fetched, drawn and fitted, and the panel names it", async () => {
    const map = control();
    setMapControl(map);
    await loadSaved();
    openSaved(ridge);
    await vi.waitFor(() => expect(get().place?.saved?.id).toBe("Ridge"));
    expect(location.pathname).toBe("/saved/Ridge");
    expect(fake.savedFeature).toHaveBeenCalledWith("Ridge");
    expect(get().savedShape).toEqual(shape.geometry);
    expect(map.showSaved.mock.calls.at(-1)![1]).toEqual(shape.geometry);
    expect(map.flyTo).toHaveBeenCalledWith(20, 49, [19, 48, 21, 50]);
    setMapControl(null);
  });

  // 135 a point needs no shape: the map goes to the spot
  it("opens a point without asking for a shape", async () => {
    const map = control();
    setMapControl(map);
    await loadSaved();
    openSaved(listing.features[0]!);
    await vi.waitFor(() => expect(get().place?.saved?.id).toBe("Hut"));
    expect(fake.savedFeature).not.toHaveBeenCalled();
    expect(map.flyTo).toHaveBeenCalledWith(17.1, 48.1, undefined);
    setMapControl(null);
  });

  // 135 closing the panel takes the shape off the map and the row out of the address
  it("takes the shape and the address off when the panel closes", async () => {
    const map = control();
    setMapControl(map);
    await loadSaved();
    openSaved(ridge);
    await vi.waitFor(() => expect(get().savedShape).not.toBeNull());
    showPlace(null);
    expect(get().savedShape).toBeNull();
    expect(location.pathname).toBe("/saved");
    setMapControl(null);
  });

  // 135 an address with a row in it opens that row once the list is read
  it("opens the row an address names after the list is read", async () => {
    history.replaceState(null, "", "/saved/Spring");
    readAddress();
    await vi.waitFor(() => expect(get().place?.saved?.id).toBe("Spring"));
    expect(fake.saved).toHaveBeenCalledTimes(1);
  });

  // 135 an older phone answers 404: the rail leaves Saved out
  it("marks Saved unreadable when the phone answers 404", async () => {
    fake.saved.mockResolvedValue({ ok: false, status: 404, said: "" });
    await loadSaved();
    expect(get().savedReadable).toBe(false);
    expect(get().saved).toBeNull();
  });

  // 135 leaving the screen takes the marks and the open place off the map
  it("clears the marks and the place when the screen is left", async () => {
    const map = control();
    setMapControl(map);
    await loadSaved();
    openSaved(listing.features[0]!);
    await vi.waitFor(() => expect(get().place?.saved).toBeDefined());
    history.replaceState(null, "", "/maps");
    readAddress();
    expect(get().place).toBeNull();
    expect(map.showSaved.mock.calls.at(-1)).toEqual([null, null]);
    setMapControl(null);
  });

  // 135 no edit password, nothing is asked
  it("asks nothing of a browser that may not edit", async () => {
    useViewer.setState({ editToken: null });
    await loadSaved();
    expect(fake.saved).not.toHaveBeenCalled();
  });
});
