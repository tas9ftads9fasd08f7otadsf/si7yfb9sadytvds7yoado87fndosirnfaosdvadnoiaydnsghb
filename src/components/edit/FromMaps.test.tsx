import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OtherLayers } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { AddLayer, addSources, matchingLayers } from "./AddLayer";

const listing: OtherLayers = { groups: [
  { map: "W", name: "Winter", symbol: "snowflake", rows: [
    { layer: "W2", title: "Skiing", subtitle: "Tiles from a server", symbol: "map" },
    { layer: "W1", title: "Trails", subtitle: "Vector tiles", symbol: "figure.hiking", blocked: "Already in this map" }] },
  { map: "B", name: "Bratislava", symbol: "building.2", rows: [
    { layer: "B1", title: "Streets", subtitle: "Vector tiles", symbol: "road.lanes" }] }] };

const seed = (other: OtherLayers | null = listing) => useViewer.setState({ mapID: "M", editToken: "t",
  portable: { id: "M", name: "High Tatras" }, otherLayers: other });

describe("Add layer's From another map", () => {
  beforeEach(() => resetViewer());
  afterEach(() => vi.unstubAllGlobals());

  // 119 a map's name keeps all its layers, a layer's words keep that layer
  it("narrows by a map's name or a layer's words, as the phone's picker does", () => {
    expect(matchingLayers(listing.groups, "")).toEqual(listing.groups);
    expect(matchingLayers(listing.groups, "winter")[0]?.rows).toHaveLength(2);
    expect(matchingLayers(listing.groups, "SKI").map((group) => group.rows.map((row) => row.layer))).toEqual([["W2"]]);
    expect(matchingLayers(listing.groups, "vector").map((group) => group.map)).toEqual(["W", "B"]);
    expect(matchingLayers(listing.groups, "nothing")).toEqual([]);
  });

  // 119 a card for each other map; what the map draws already says so and cannot be ticked
  it("lists each map's layers, with the reason beside one that cannot be ticked", () => {
    seed();
    render(<AddLayer source="copy" />);
    expect(screen.getByText("Winter")).toBeTruthy();
    expect(screen.getByText("Bratislava")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Skiing/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Trails/ })).toBeNull();
    expect(screen.getByText("Already in this map")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Nothing selected")).toBeTruthy();
  });

  // 119 the search says what it found, and what it did not
  it("says when no layer matches the search", () => {
    seed();
    render(<AddLayer source="copy" />);
    fireEvent.change(screen.getByLabelText("Search maps and layers"), { target: { value: "volcano" } });
    expect(screen.getByText("No layer matches “volcano”.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search maps and layers"), { target: { value: "streets" } });
    expect(screen.queryByText("Winter")).toBeNull();
    expect(screen.getByRole("button", { name: /Streets/ })).toBeTruthy();
  });

  // 119 no other map has a layer to take: the phone's words, and nothing to tick
  it("says so when no other map has a layer to import", () => {
    seed({ groups: [] });
    render(<AddLayer source="copy" />);
    expect(screen.getByText("No other map on this device has a layer to import.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });

  // 119 the ticked layers go to the phone as ids, which copies them and answers with the map
  it("sends the ticked layers' ids and shows the map the phone answers with", async () => {
    const portable = { id: "M", name: "High Tatras", stack: [{ id: "N", name: "Skiing", symbol: "map", isEnabled: true, opacity: 1 }] };
    const answers = (input: RequestInfo | URL) => (String(input).includes("/add-copies") ? portable
      : String(input).includes("/other-layers") ? listing : { name: "iPad", maps: [] });
    const asked = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(answers(input))));
    vi.stubGlobal("fetch", asked);
    seed();
    render(<AddLayer source="copy" />);
    fireEvent.click(screen.getByRole("button", { name: /Skiing/ }));
    fireEvent.click(screen.getByRole("button", { name: /Streets/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add 2" }));
    await waitFor(() => expect(useViewer.getState().portable?.stack?.[0]?.name).toBe("Skiing"));
    expect(String(asked.mock.calls[0]?.[0])).toBe("/riki/v1/maps/M/add-copies?layers=W2%2CB1");
    expect(useViewer.getState().copyTicks.size).toBe(0);
    expect(useViewer.getState().addingPackages).toBe(false);
  });

  // 119 a layer the phone refuses stays ticked, with the phone's words shown
  it("shows the phone's words when it refuses a layer, and keeps the ticks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Already in this map", { status: 409 })));
    seed();
    render(<AddLayer source="copy" />);
    fireEvent.click(screen.getByRole("button", { name: /Skiing/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add 1" }));
    await waitFor(() => expect(useViewer.getState().notice).toBe("Already in this map"));
    expect(useViewer.getState().copyTicks.has("W2")).toBe(true);
  });

  // 119 asked of the phone when Add layer opens on it, and the ticks begin empty
  it("reads the other maps' layers from the phone when its part opens", async () => {
    const asked = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(
      String(input).includes("/other-layers") ? listing : { name: "iPad", maps: [] })));
    vi.stubGlobal("fetch", asked);
    seed(null);
    render(<AddLayer source="copy" />);
    await waitFor(() => expect(screen.getByText("Bratislava")).toBeTruthy());
    expect(String(asked.mock.calls[0]?.[0])).toBe("/riki/v1/maps/M/other-layers");
  });

  // 119 the phone offers it; the site does not answer it yet
  it("is a source of the phone's Add layer", () => {
    expect(addSources()).toContain("copy");
  });
});
