import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { SharedMap } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { HeldPill, OfflinePill, StyleChips } from "./MapPills";

const map = (fields: Partial<SharedMap> = {}): SharedMap => ({ id: "a", name: "Tatras", layers: [], ...fields });

describe("MapPills", () => {
  beforeEach(resetViewer);

  // 128 the offline state is coloured by what it means, and drawn only when it came
  it("draws the offline state and the size when the phone sent them", () => {
    const { container } = render(<><OfflinePill shared={map({ offline: "partly", bytes: 96_000_000 })} />
      <HeldPill shared={map({ offline: "partly", bytes: 96_000_000 })} /></>);
    expect(container.querySelector("[data-offline=partly]")!.textContent).toBe("Partly offline");
    expect(container.querySelector("[data-offline=partly]")!.className).toContain("busy");
    expect(container.querySelector("[data-held]")!.textContent).toBe("96 MB");
  });

  it("draws nothing for a map from an older phone", () => {
    const { container } = render(<><OfflinePill shared={map()} /><HeldPill shared={map()} /></>);
    expect(container.textContent).toBe("");
  });

  // 128 a style's chip is a link to its own address, a plain click moves without asking for a page
  it("links each style chip to its address when the ids came", () => {
    useViewer.setState({ route: { screen: "data", tab: "layers" } });
    render(<StyleChips shared={map({ styles: ["Summer", "Winter"], styleIDs: ["s1", "s2"] })} />);
    const winter = screen.getByRole("link", { name: "Winter" });
    expect(winter.getAttribute("href")).toBe("/maps/a/style/s2");
    act(() => { fireEvent.click(winter); });
    expect(useViewer.getState().route).toEqual({ screen: "map", map: "a", style: "s2" });
  });

  it("opens the map from a chip when no ids came", () => {
    render(<StyleChips shared={map({ styles: ["Summer"] })} />);
    expect(screen.getByRole("link", { name: "Summer" }).getAttribute("href")).toBe("/maps/a");
  });

  it("draws no chips for a map without style names", () => {
    const { container } = render(<StyleChips shared={map()} />);
    expect(container.textContent).toBe("");
  });
});
