import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OptionSection, ServerLookAsk } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { OptionsPanel } from "./OptionsPanel";

const tint: OptionSection = { kind: "text", title: "Address", footnote: "", key: "address", layerScoped: true, value: "" };
const look: ServerLookAsk = { server: "Coffee", version: 5, parts: [
  { id: "markers", title: "Map markers", changed: "Colour" },
  { id: "details", title: "Details", changed: "2 rows", changedHere: true }] };

const asked = () => {
  const ask = vi.fn((input: RequestInfo | URL) => (void input, new Promise<Response>(() => {})));
  vi.stubGlobal("fetch", ask);
  return () => new URLSearchParams(String(ask.mock.calls[0]?.[0]).split("?")[1]);
};

const show = (ask?: ServerLookAsk) => {
  useViewer.setState({ mapID: "a", editToken: "t" });
  render(<OptionsPanel id="L" sections={[tint]} serverLook={ask} />);
};

describe("a layer's server update", () => {
  beforeEach(resetViewer);
  afterEach(() => vi.unstubAllGlobals());

  // 172: the banner names the parts and the options stay below it.
  // 182: as the app's card, the title over the changed parts.
  it("says which parts the server changed and keeps the options", () => {
    show(look);
    expect(screen.getByRole("status").querySelector("b")?.textContent).toBe("Server update");
    expect(screen.getByRole("status").querySelector("small")?.textContent).toBe("Map markers and Details changed");
    expect(screen.getByRole("button", { name: "Review" })).toBeTruthy();
    expect(screen.getByLabelText("Address")).toBeTruthy();
  });

  // 172: a layer the phone has no update for shows no banner.
  it("shows no banner when the phone sent no update", () => {
    show();
    expect(screen.queryByRole("status")).toBeNull();
  });

  // 172: Review replaces the options; a part changed here too starts on Keep mine.
  it("opens Review with a picker per part, Keep mine where changed here", () => {
    show(look);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.queryByLabelText("Address")).toBeNull();
    const group = (name: string) => screen.getByRole("radiogroup", { name });
    const checked = (name: string) => within(group(name)).getAllByRole("radio").find((one) =>
      one.getAttribute("aria-checked") === "true")?.textContent;
    expect(checked("Map markers")).toBe("Server's");
    expect(checked("Details")).toBe("Keep mine");
    expect(screen.getByText("Changed here too")).toBeTruthy();
  });

  // 172: taking sends the parts picked as the server's, with the version asked about.
  it("takes only the parts picked as the server's", () => {
    const sent = asked();
    show(look);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Take version 5" }));
    expect(Object.fromEntries(sent())).toMatchObject({ layer: "L", serverTake: "markers", serverVersion: "5" });
  });

  // 172: with every part on Keep mine there is nothing to take.
  it("cannot take version N when every part is kept", () => {
    show(look);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    const [mine] = screen.getAllByRole("radio", { name: "Keep mine" });
    fireEvent.click(mine as HTMLElement);
    expect((screen.getByRole("button", { name: "Take version 5" }) as HTMLButtonElement).disabled).toBe(true);
  });

  // 172: Keep mine for now remembers the version, not the parts.
  it("keeps the layer's own look for the version", () => {
    const sent = asked();
    show(look);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep mine for now" }));
    expect(Object.fromEntries(sent())).toMatchObject({ layer: "L", serverKeep: "5" });
  });

  // 172: Back leaves Review without sending anything.
  it("goes back to the layer without answering", async () => {
    const sent = asked();
    show(look);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to the layer" }));
    await waitFor(() => expect(screen.getByLabelText("Address")).toBeTruthy());
    expect(sent().toString()).toBe("");
  });
});
