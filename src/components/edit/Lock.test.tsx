import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LockOffer, MapSwitches } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { Lock } from "./Lock";

const offer: LockOffer = { isOn: false, mayChange: true, brand: "Face ID",
  note: "Asks for Face ID or the passcode before it is shown or edited" };

const switches = (lock: LockOffer): MapSwitches => ({ picker: true, carPlay: true, legend: true, world: true,
  legendEverywhere: true, worldEverywhere: true, hasNothingToDraw: false, ownsSettings: true, groupsByOrigin: false,
  groupingOffered: false, groupingReorders: false, stylesDisagree: false, differsFromDefault: false,
  layersWithoutStyle: 0, removedStyles: 0, lock });

const seed = (lock: LockOffer) => useViewer.setState({ mapID: "M", editToken: "t",
  portable: { id: "M", name: "High Tatras" }, switches: switches(lock) });

describe("Edit map's lock", () => {
  beforeEach(() => resetViewer());
  afterEach(() => vi.unstubAllGlobals());

  // 118 named as Edit map names it: by Apple's word for how the phone asks, else plainly
  it("is named by how the phone asks, and says the phone's own line under it", () => {
    seed(offer);
    const { rerender } = render(<Lock lock={offer} />);
    expect(screen.getByRole("switch", { name: "Lock with Face ID" })).toBeTruthy();
    expect(screen.getByText(offer.note)).toBeTruthy();
    const passcode = { ...offer, brand: null };
    rerender(<Lock lock={passcode} />);
    expect(screen.getByRole("switch", { name: "Lock this map" })).toBeTruthy();
  });

  // 118 the phone asks Face ID while the request waits; the row says so and cannot be pressed twice
  it("says the phone is asking while it waits, then shows what the phone settled on", async () => {
    let answer: (response: Response) => void = () => {};
    const waiting = new Promise<Response>((resolve) => { answer = resolve; });
    const asked = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/switches")) {
        return new Response(JSON.stringify(switches({ ...offer, isOn: true })));
      }
      if (String(input).includes("/edit?")) return waiting;
      return new Response(JSON.stringify({ name: "iPad", maps: [] }));
    });
    vi.stubGlobal("fetch", asked);
    seed(offer);
    render(<Lock lock={offer} />);
    const row = screen.getByRole("switch", { name: "Lock with Face ID" }) as HTMLInputElement;
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText("Confirm it is you")).toBeTruthy());
    expect(row.disabled).toBe(true);
    expect(String(asked.mock.calls[0]?.[0])).toBe("/riki/v1/maps/M/edit?lock=1");
    answer(new Response(JSON.stringify({ id: "M", name: "High Tatras" })));
    await waitFor(() => expect(useViewer.getState().switches?.lock?.isOn).toBe(true));
    await waitFor(() => expect(screen.queryByText("Confirm it is you")).toBeNull());
  });

  // 118 nobody confirmed on the phone: the phone's words are shown and the lock stays as it was
  it("shows the phone's words when nobody confirms, and the lock stays off", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      "Not confirmed on the phone: answer Face ID or the passcode there", { status: 403 })));
    seed(offer);
    render(<Lock lock={offer} />);
    fireEvent.click(screen.getByRole("switch", { name: "Lock with Face ID" }));
    await waitFor(() => expect(useViewer.getState().notice)
      .toBe("Not confirmed on the phone: answer Face ID or the passcode there"));
    expect(useViewer.getState().switches?.lock?.isOn).toBe(false);
    expect(useViewer.getState().editEpoch).toBe(1);
  });

  // 118 a shared map's editor sees the owner's lock but cannot move it
  it("cannot be moved by someone the owner's lock is not for, and says whose it is", () => {
    const theirs = { ...offer, isOn: true, mayChange: false,
      sharedNote: "The map's owner locked it for everyone it is shared with." };
    seed(theirs);
    render(<Lock lock={theirs} />);
    expect((screen.getByRole("switch") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(theirs.sharedNote)).toBeTruthy();
  });
});
