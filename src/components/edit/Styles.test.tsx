import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapSwitches, Portable } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { Styles } from "./Styles";

const portable: Portable = { id: "a", name: "Tatras", styles: [{ id: "S", name: "Summer" }, { id: "W", name: "Winter" }] };
const quiet: MapSwitches = { picker: true, carPlay: true, legend: true, world: true, legendEverywhere: true,
  worldEverywhere: true, hasNothingToDraw: false, ownsSettings: true, groupsByOrigin: false, groupingOffered: false,
  groupingReorders: false, stylesDisagree: false, differsFromDefault: false, layersWithoutStyle: 0, removedStyles: 0 };

const asking = () => {
  const asked = vi.fn((input: RequestInfo | URL) => new Promise<Response>(() => void input));
  vi.stubGlobal("fetch", asked);
  return () => decodeURIComponent(String(asked.mock.calls[0]?.[0]));
};

describe("Styles", () => {
  beforeEach(() => {
    resetViewer();
    useViewer.setState({ mapID: "a", editToken: "t", portable });
  });
  afterEach(() => vi.unstubAllGlobals());

  // 50 the rows that would change nothing are not offered
  it("offers no arranging row when nothing would change", () => {
    useViewer.setState({ switches: quiet });
    render(<Styles portable={portable} />);
    for (const name of ["A style for each layer", "Unite", "Restore the styles this map shipped with",
      "Reset the layers to the default draw order"]) {
      expect(screen.queryByText(name)).toBeNull();
    }
    expect((screen.getByRole("button", { name: "Move up Summer" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move down Winter" }) as HTMLButtonElement).disabled).toBe(true);
  });

  // 50 every style, in the order the list then shows them
  it("sends every style's id in the new order", () => {
    const url = asking();
    render(<Styles portable={portable} />);
    fireEvent.click(screen.getByRole("button", { name: "Move down Summer" }));
    expect(url()).toContain("styleOrder=W,S");
  });

  // 50 each row sends its own action
  it("sends the arranging rows' actions", () => {
    useViewer.setState({ switches: { ...quiet, stylesDisagree: true, differsFromDefault: true, removedStyles: 1,
      layersWithoutStyle: 2 } });
    const url = asking();
    render(<Styles portable={portable} />);
    fireEvent.click(screen.getByRole("button", { name: "Unite" }));
    expect(url()).toContain("arrange=unite");
    expect(screen.getByText("Reset the layers to the default draw order")).toBeTruthy();
    expect(screen.getByText("Restore the styles this map shipped with")).toBeTruthy();
    expect(screen.getByText("A style for each layer")).toBeTruthy();
  });
});
