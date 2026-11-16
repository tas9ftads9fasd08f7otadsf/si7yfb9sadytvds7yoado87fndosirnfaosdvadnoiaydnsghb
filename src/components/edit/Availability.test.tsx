import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapSwitches } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { Availability } from "./Availability";

const shown: MapSwitches = { picker: true, carPlay: false, legend: true, world: true, legendEverywhere: true,
  worldEverywhere: true, hasNothingToDraw: false, ownsSettings: true, groupsByOrigin: false, groupingOffered: false,
  groupingReorders: false, stylesDisagree: false, differsFromDefault: false, layersWithoutStyle: 0, removedStyles: 0 };

const toggle = (name: string) => screen.getByRole("switch", { name }) as HTMLInputElement;

describe("Availability", () => {
  beforeEach(() => {
    resetViewer();
    useViewer.setState({ mapID: "a", editToken: "t" });
  });
  afterEach(() => vi.unstubAllGlobals());

  // 50 each switch as the phone said it
  it("shows each switch as the phone read it", () => {
    render(<Availability switches={shown} />);
    expect(toggle("In the map switcher").checked).toBe(true);
    expect(toggle("In the CarPlay switcher").checked).toBe(false);
    expect(toggle("Show legend").disabled).toBe(false);
  });

  // 50 a map with nothing to draw is offered nowhere, as Edit map says
  it("locks the switchers of a map with nothing to draw", () => {
    render(<Availability switches={{ ...shown, hasNothingToDraw: true }} />);
    expect(toggle("In the map switcher").disabled).toBe(true);
    expect(toggle("In the map switcher").checked).toBe(false);
    expect(screen.getByText("This map has no layers to draw")).toBeTruthy();
  });

  // 50 the owner's legend and world, and Settings › Map's, lock the map's own
  it("locks the legend and the world for an editor who is not the owner", () => {
    render(<Availability switches={{ ...shown, ownsSettings: false, worldEverywhere: false }} />);
    expect(toggle("Show legend").disabled).toBe(true);
    expect(toggle("Show the world around").disabled).toBe(true);
    expect(toggle("Show the world around").checked).toBe(false);
    expect(toggle("In the CarPlay switcher").disabled).toBe(false);
    expect(screen.getByText("Hidden on every map under Settings › Map")).toBeTruthy();
  });

  // 50 a switch sends its own key
  it("asks the phone by the switch's key", () => {
    const asked = vi.fn((input: RequestInfo | URL) => new Promise<Response>(() => void input));
    vi.stubGlobal("fetch", asked);
    render(<Availability switches={shown} />);
    fireEvent.click(toggle("In the CarPlay switcher"));
    const url = String(asked.mock.calls[0]?.[0]);
    expect(url).toContain("/edit?");
    expect(url).toContain("carPlay=1");
  });
});
