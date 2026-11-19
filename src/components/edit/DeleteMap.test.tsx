import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapSwitches } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { DeleteMap } from "./DeleteMap";

const switches: MapSwitches = { picker: true, carPlay: true, legend: true, world: true, legendEverywhere: true,
  worldEverywhere: true, hasNothingToDraw: false, ownsSettings: true, groupsByOrigin: false, groupingOffered: false,
  groupingReorders: false, stylesDisagree: false, differsFromDefault: false, layersWithoutStyle: 0, removedStyles: 0,
  deletion: "onlyYou" };

const seed = (deletion: MapSwitches["deletion"], token: string | null = "t") => useViewer.setState({
  mapID: "M", editToken: token, portable: { id: "M", name: "High Tatras" }, switches: { ...switches, deletion } });

describe("DeleteMap", () => {
  beforeEach(() => resetViewer());
  afterEach(() => vi.unstubAllGlobals());

  // 62 offered only where the phone's Maps sheet offers Delete, and never to a guest
  it("is offered only where the phone offers it, to an editing browser", () => {
    seed(undefined);
    const { container, rerender } = render(<DeleteMap place="edit" />);
    expect(container.innerHTML).toBe("");
    seed("onlyYou", null);
    rerender(<DeleteMap place="edit" />);
    expect(container.innerHTML).toBe("");
    seed("onlyYou");
    rerender(<DeleteMap place="edit" />);
    expect(screen.getByRole("button", { name: "Delete map" })).toBeTruthy();
  });

  // 62 the Delete stays off until the exact name is typed, as skifahrer decided
  it("deletes only once the map's exact name is typed", async () => {
    const asked = vi.fn(async (input: RequestInfo | URL) => (String(input).includes("/delete")
      ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ name: "iPad", maps: [] }))));
    vi.stubGlobal("fetch", asked);
    seed("onlyYou");
    render(<DeleteMap place="edit" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete map" }));
    const yes = screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
    const field = screen.getByLabelText("Type the map’s name to delete it.");
    fireEvent.change(field, { target: { value: "high tatras" } });
    expect(yes.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "High Tatras" } });
    expect(yes.disabled).toBe(false);
    fireEvent.click(yes);
    await waitFor(() => expect(useViewer.getState().mapID).toBeNull());
    expect(String(asked.mock.calls[0]?.[0])).toBe("/riki/v1/maps/M/delete?name=High+Tatras");
    expect(useViewer.getState().route).toEqual({ screen: "maps" });
  });

  // 62 the Maps sheet's words on who loses the map
  it("says who loses a shared map", () => {
    seed("yourList");
    render(<DeleteMap place="card" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete map" }));
    expect(screen.getByText(/Others keep it/)).toBeTruthy();
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();
  });

  // 62 a refusal keeps the map and shows the phone's words
  it("keeps the map when the phone refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("This map is locked on the phone", { status: 403 })));
    seed("onlyYou");
    render(<DeleteMap place="edit" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete map" }));
    fireEvent.change(screen.getByLabelText("Type the map’s name to delete it."), { target: { value: "High Tatras" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(useViewer.getState().notice).toBe("This map is locked on the phone"));
    expect(useViewer.getState().mapID).toBe("M");
  });
});
