import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegionFailed, type Feature, type RegionPackages } from "@/backend/types";
import type { RegionRow } from "@/lib/types";
import { fetchRegion, loadRegionRows, removeRegion, resetRegions, setNeeds, useRegions } from "@/store/regions";
import { resetViewer, useViewer } from "@/store/viewer";
import { RegionNeedsNote, RegionPackagesCard } from "./RegionPackages";

const fake = vi.hoisted(() => ({ offered: new Set<string>(), packages: undefined as unknown }));
vi.mock("@backend", async (original) => {
  const phone = await original<typeof import("@/targets/phone/backend")>();
  return { backend: { ...phone.backend, offers: (feature: Feature) => fake.offered.has(feature),
    get regionPackages() { return fake.packages as RegionPackages | undefined; } } };
});

const row = (over: Partial<RegionRow> = {}): RegionRow => ({ region: "tatry", name: "Vysoké Tatry", held: [],
  fetch: [{ piece: "base", bytes: 263_000_000, update: false }], ...over });

/** The packages as a target answers them, with what each call was asked kept. */
function packages(rows: RegionRow[], download: RegionPackages["download"] = async () => {}) {
  const made = { rows: vi.fn(async () => rows), download: vi.fn(download), remove: vi.fn(async () => {}) };
  fake.packages = made;
  return made;
}

// 112 the map says which region data it lacks and offers it; Edit map lists, updates and removes it
describe("region data", () => {
  beforeEach(() => {
    resetViewer();
    resetRegions();
    fake.offered = new Set(["regionPackages"]);
    fake.packages = undefined;
    useViewer.setState({ editToken: "t", mapID: "a" });
  });

  it("is told on the map: Download <region> (<size>) to see it on this map, once, with one button", async () => {
    packages([row()]);
    render(<RegionNeedsNote />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => setNeeds([{ region: "tatry", piece: "base" }]));
    const button = await screen.findByRole("button", { name: "Download Vysoké Tatry (263 MB) to see it on this map" });
    expect(button).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("says nothing for a region the map does not need, or where the target keeps no packages", async () => {
    packages([row({ region: "other", name: "Other" })]);
    render(<RegionNeedsNote />);
    act(() => setNeeds([{ region: "tatry", piece: "base" }]));
    await vi.waitFor(() => expect(useRegions.getState().rows).toHaveLength(1));
    expect(screen.queryByRole("status")).toBeNull();
    act(() => { fake.offered = new Set(); });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("downloads on a tap, shows how far it is, and is gone once the map has what it lacked", async () => {
    let finish: () => void = () => {};
    const made = packages([row()], (_region, _needs, progress) => new Promise<void>((resolve) => {
      progress(131_500_000, 263_000_000);
      finish = resolve;
    }));
    render(<RegionNeedsNote />);
    act(() => setNeeds([{ region: "tatry", piece: "base" }]));
    fireEvent.click(await screen.findByRole("button", { name: /Download Vysoké Tatry/ }));
    expect(await screen.findByText("Downloading Vysoké Tatry: 50 %")).toBeTruthy();
    expect(made.download).toHaveBeenCalledWith("tatry", [{ region: "tatry", piece: "base" }], expect.any(Function), expect.any(AbortSignal));
    made.rows.mockResolvedValue([row({ fetch: [], held: [{ piece: "base", bytes: 263_000_000 }] })]);
    await act(async () => { finish(); });
    await vi.waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  // 112 each way a download fails is said in words, and the button comes back to try again
  it.each([
    ["full", "", "This browser has no room for Vysoké Tatry. Free some space and try again."],
    ["host", "HTTP 429", "The region host did not give the package (HTTP 429). Try again later."],
    ["network", "", "The download of Vysoké Tatry was interrupted. Try again."],
    ["size", "", "What came for Vysoké Tatry is not a region package. Try again later."]
  ] as const)("says why a download failed: %s", async (why, detail, said) => {
    packages([row()], async () => { throw new RegionFailed(why, detail); });
    render(<RegionNeedsNote />);
    act(() => setNeeds([{ region: "tatry", piece: "base" }]));
    fireEvent.click(await screen.findByRole("button", { name: /Download Vysoké Tatry/ }));
    expect((await screen.findByRole("alert")).textContent).toBe(said);
    expect(screen.getByRole("button", { name: /Download Vysoké Tatry/ })).toBeTruthy();
  });

  it("lists in Edit map what is held with its size and a Remove, and an update where the catalog has a newer build", async () => {
    const made = packages([row({ fetch: [], held: [{ piece: "base", bytes: 5_000_000 }] }),
      row({ region: "nizke", name: "Nízke Tatry", held: [{ piece: "base", bytes: 1_500_000_000 }],
        fetch: [{ piece: "base", bytes: 1_600_000_000, update: true }] })]);
    render(<RegionPackagesCard />);
    expect(await screen.findByText("Stored in this browser · 5.0 MB")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove Vysoké Tatry" }));
    await vi.waitFor(() => expect(made.remove).toHaveBeenCalledWith("tatry"));
  });

  it("is not in Edit map where the target has no region data", () => {
    fake.offered = new Set();
    packages([row()]);
    render(<RegionPackagesCard />);
    expect(screen.queryByText("Region data")).toBeNull();
  });
});

describe("the region store", () => {
  beforeEach(() => {
    resetViewer();
    resetRegions();
    fake.offered = new Set(["regionPackages"]);
  });

  it("reads the rows again only when the needs change", async () => {
    const made = packages([row()]);
    setNeeds([{ region: "tatry", piece: "base" }]);
    setNeeds([{ region: "tatry", piece: "base" }]);
    await vi.waitFor(() => expect(useRegions.getState().rows).toHaveLength(1));
    expect(made.rows).toHaveBeenCalledTimes(1);
    setNeeds([]);
    await vi.waitFor(() => expect(made.rows).toHaveBeenCalledTimes(2));
  });

  it("does not start a second download of a region on its way", async () => {
    let finish: () => void = () => {};
    const made = packages([row()], () => new Promise<void>((resolve) => { finish = resolve; }));
    const first = fetchRegion("tatry");
    void fetchRegion("tatry");
    expect(made.download).toHaveBeenCalledTimes(1);
    finish();
    await first;
  });

  it("does nothing without a target that keeps packages", async () => {
    fake.packages = undefined;
    await fetchRegion("tatry");
    await removeRegion("tatry");
    await loadRegionRows();
    expect(useRegions.getState().rows).toEqual([]);
  });
});
