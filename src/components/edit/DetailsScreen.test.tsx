import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DetailsLayout, LayerOptions, Portable } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { DetailsScreen } from "./DetailsScreen";
import { OptionsPanel } from "./OptionsPanel";

const layout: DetailsLayout = { sections: [{ name: "Section 1", blocks: [
  { handle: "t1", kind: "text", name: "Text", value: "{note}", counts: true }] }],
  used: 1, limit: 10, parts: [], keys: [], offers: [], words: { header: "Header", used: "1 of 10 content blocks used" },
  header: { title: "{line}", symbol: null, layerSymbol: "tram" } };
const options = { layers: [{ id: "L1", sections: [{ kind: "details", layerScoped: true, layout }] }] } as unknown as LayerOptions;
const portable: Portable = { id: "a", name: "Trams", stack: [{ id: "L1", name: "Trams", isEnabled: true }] };

describe("Details editor", () => {
  beforeEach(() => {
    resetViewer();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    useViewer.setState({ mapID: "a", portable, layerOptions: options, editToken: "t" });
  });
  afterEach(() => vi.unstubAllGlobals());

  // 95 a layer's options open its Details at W16's address
  it("opens from the layer's options at its own address", () => {
    history.replaceState(null, "", "/maps/a/edit/layers");
    render(<OptionsPanel id="L1" sections={options.layers[0]!.sections} />);
    act(() => fireEvent.click(screen.getByRole("button", { name: /^Details/ })));
    expect(location.pathname).toBe("/maps/a/layers/L1/details");
    expect(useViewer.getState().route).toEqual({ screen: "details", map: "a", layer: "L1" });
  });

  // 95 the three panes, the header picked first; Done goes back to Edit map's layers
  it("shows the layout, the header's settings and the preview, and Done goes back", () => {
    useViewer.setState({ route: { screen: "details", map: "a", layer: "L1" } });
    render(<DetailsScreen />);
    expect(screen.getByRole("heading", { name: /Details/ }).textContent).toContain("Trams");
    expect(document.querySelector(".layout-pane [data-card=header]")?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".settings-pane [data-part=header]")).toBeTruthy();
    expect(document.querySelector(".preview-pane .sheet")).toBeTruthy();
    act(() => fireEvent.click(screen.getByRole("button", { name: "Done" })));
    expect(useViewer.getState().route).toEqual({ screen: "edit", map: "a", tab: "layers" });
  });
});
