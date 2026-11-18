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

  // 53 the style on screen, edited, goes back to published, unless removed styles come first
  it("resets the edited style on screen to published", () => {
    useViewer.setState({ styleID: "W", switches: { ...quiet, editedStyles: ["W"] } });
    const url = asking();
    const { unmount } = render(<Styles portable={portable} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset this style to published" }));
    expect(url()).toContain("resetStyle=W");
    unmount();
    useViewer.setState({ switches: { ...quiet, editedStyles: ["W"], removedStyles: 1 } });
    render(<Styles portable={portable} />);
    expect(screen.queryByText("Reset this style to published")).toBeNull();
  });

  // 53 a style nobody edited, or a phone too old to say, offers no reset
  it("offers no reset for an unedited style", () => {
    useViewer.setState({ styleID: "S", switches: { ...quiet, editedStyles: ["W"] } });
    const { unmount } = render(<Styles portable={portable} />);
    expect(screen.queryByText("Reset this style to published")).toBeNull();
    unmount();
    useViewer.setState({ styleID: "W", switches: quiet });
    render(<Styles portable={portable} />);
    expect(screen.queryByText("Reset this style to published")).toBeNull();
  });

  // 65 a style's own picture goes to the phone for that style, and its Remove sends none
  it("sends a style's picture from its options and takes it away", async () => {
    const asked = vi.fn((input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>(() => void [input, init]));
    vi.stubGlobal("fetch", asked);
    const { unmount } = render(<Styles portable={portable} />);
    fireEvent.click(screen.getByRole("button", { name: "Options Winter" }));
    expect(screen.queryByRole("button", { name: "Remove the picture · Winter" })).toBeNull();
    const file = new File([new Uint8Array([0x89, 0x50])], "snow.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Choose a picture for this icon · Winter"), { target: { files: [file] } });
    await vi.waitFor(() => expect(asked).toHaveBeenCalled());
    expect(String(asked.mock.calls[0]?.[0])).toContain("/picture?kind=styleIcon&style=W");
    unmount();
    const pictured: Portable = { ...portable, styles: [{ id: "W", name: "Winter", symbol: "map", iconPicture: "AAAA" }] };
    useViewer.setState({ portable: pictured });
    render(<Styles portable={pictured} />);
    fireEvent.click(screen.getByRole("button", { name: "Options Winter" }));
    expect(screen.getByRole("button", { name: "map" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Remove the picture · Winter" }));
    await vi.waitFor(() => expect(asked).toHaveBeenCalledTimes(2));
    const init = asked.mock.calls[1]?.[1];
    expect((init?.body as ArrayBuffer | undefined)?.byteLength).toBe(0);
  });

  // 51 a style's own icon, its ground and its note go to that style alone
  it("sends a style's icon, colour and note from its options", () => {
    useViewer.setState({ words: { ...useViewer.getState().words, styleSymbols: "map,snowflake",
      iconTints: "#FF0000" } });
    const url = asking();
    render(<Styles portable={portable} />);
    fireEvent.click(screen.getByRole("button", { name: "Options Winter" }));
    fireEvent.click(screen.getByRole("button", { name: "snowflake" }));
    expect(url()).toContain("style=W");
    expect(url()).toContain("symbol=snowflake");
  });

  it("sends a style's colour", () => {
    useViewer.setState({ words: { ...useViewer.getState().words, iconTints: "#FF0000" } });
    const url = asking();
    render(<Styles portable={portable} />);
    fireEvent.click(screen.getByRole("button", { name: "Options Summer" }));
    fireEvent.click(screen.getByRole("button", { name: "#FF0000" }));
    expect(url()).toContain("style=S");
    expect(url()).toContain("iconTint=#FF0000");
  });

  it("sends a style's note", () => {
    const url = asking();
    render(<Styles portable={portable} />);
    fireEvent.click(screen.getByRole("button", { name: "Options Summer" }));
    const note = screen.getByRole("textbox", { name: "Note Summer" });
    fireEvent.change(note, { target: { value: "For the long days" } });
    fireEvent.blur(note);
    expect(url()).toContain("style=S");
    expect(url().replaceAll("+", " ")).toContain("note=For the long days");
  });

  // 51 a language picked for a style takes a name sent for that style alone
  it("sends a style's name in another language", () => {
    useViewer.setState({ words: { ...useViewer.getState().words, languages: "de,sk", "language.sk": "Slovak" } });
    const url = asking();
    render(<Styles portable={portable} />);
    fireEvent.click(screen.getByRole("button", { name: "Options Winter" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Add a language · Winter" }), { target: { value: "sk" } });
    const field = screen.getByRole("textbox", { name: "Name · Slovak · Winter" });
    fireEvent.change(field, { target: { value: "Zima" } });
    field.dispatchEvent(new Event("change"));
    expect(url()).toContain("style=W");
    expect(url()).toContain("language=sk");
    expect(url()).toContain("name=Zima");
  });
});
