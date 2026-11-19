import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DetailsLayout } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { DetailsLayoutPanel } from "./DetailsLayoutPanel";

const words = { addContent: "Add content", addSection: "Add section", removeSection: "Remove section",
  sectionTitle: "Title", fromTheApp: "From the app", name: "Name", value: "Value", label: "Label",
  link: "Link", heading: "Title", plain: "Plain", box: "Box", warning: "Warning",
  used: "2 of 10 content blocks used", full: "This layout holds 10 content blocks" };

const layout = (used = 2): DetailsLayout => ({
  sections: [
    { name: "Section 1", blocks: [
      { handle: "r1", kind: "rows", name: "Info rows", counts: true },
      { handle: "t1", kind: "text", name: "Text", value: "{note}", style: "box", counts: true }] },
    { title: "Source", name: "Source", blocks: [
      { handle: "a1", kind: "app", name: "Source and every tag", part: "allTags", counts: false }] }],
  used, limit: 10,
  parts: [{ handle: "p1", kind: "app", name: "Get in touch", part: "contact", counts: false }],
  keys: ["note", "speed"],
  offers: [{ id: "rows", title: "Info rows" }, { id: "text", title: "Text" }],
  words,
});

const asked = () => {
  const ask = vi.fn((input: RequestInfo | URL) => new Promise<Response>(() => void input));
  vi.stubGlobal("fetch", ask);
  return () => new URLSearchParams(String(ask.mock.calls[0]?.[0]).split("?")[1]);
};

const show = (shown = layout()) => {
  useViewer.setState({ mapID: "a", editToken: "t" });
  render(<DetailsLayoutPanel layout={shown} scoped={(query) => ({ layer: "L", ...query })} />);
};

describe("DetailsLayoutPanel", () => {
  beforeEach(resetViewer);
  afterEach(() => vi.unstubAllGlobals());

  // 29: a block is moved by its place and its handle, so a stale page is refused.
  it("moves the last block of a section into the next one", () => {
    const query = asked();
    show();
    // 95 a block's moves are in its settings, once its card is picked
    fireEvent.click(screen.getByRole("button", { name: /^Text/ }));
    fireEvent.click(screen.getByRole("button", { name: "Move down Text" }));
    const sent = query();
    expect(sent.get("details")).toBe("move");
    expect(sent.get("layer")).toBe("L");
    expect([sent.get("section"), sent.get("block"), sent.get("was")]).toEqual(["0", "1", "t1"]);
    expect([sent.get("toSection"), sent.get("toPlace")]).toEqual(["1", "0"]);
  });

  // 29: the first block of the first section has nowhere to go up to.
  it("offers no move up for the very first block", () => {
    show();
    expect((screen.getByRole("button", { name: "Move up Info rows" }) as HTMLButtonElement).disabled).toBe(true);
  });

  // 29
  it("removes a block by its handle", () => {
    const query = asked();
    show();
    fireEvent.click(screen.getByRole("button", { name: "Remove Source and every tag" }));
    expect([query().get("details"), query().get("section"), query().get("was")]).toEqual(["remove", "1", "a1"]);
  });

  // 29: a new block goes at the foot of its section, with the fields its kind needs.
  it("adds a text block at the foot of the section", () => {
    const query = asked();
    show();
    // 95 the section's dashed Add content opens the picker under it
    fireEvent.click(screen.getAllByRole("button", { name: "Add content" })[0]!);
    const [first] = screen.getAllByRole("combobox", { name: "Add content" });
    fireEvent.change(first!, { target: { value: "text" } });
    const button = screen.getAllByRole("button", { name: "Add content" })
      .find((each) => !each.classList.contains("add-content-toggle")) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    // The new block's value offers the layer's keys, which makes it a combobox.
    fireEvent.change(screen.getByRole("combobox", { name: "Value" }), { target: { value: "{speed}" } });
    fireEvent.click(button);
    const sent = query();
    expect([sent.get("details"), sent.get("kind"), sent.get("value")]).toEqual(["add", "text", "{speed}"]);
    expect([sent.get("section"), sent.get("place")]).toEqual(["0", "2"]);
  });

  // 29: a full layout offers only the app's parts, which do not count.
  it("offers only the app's parts once the layout is full", () => {
    show(layout(10));
    fireEvent.click(screen.getAllByRole("button", { name: "Add content" })[0]!);
    const [first] = screen.getAllByRole("combobox", { name: "Add content" });
    const offered = Array.from((first as HTMLSelectElement).options).map((option) => option.value);
    expect(offered).toEqual(["", "app:contact"]);
    expect(screen.getByText("This layout holds 10 content blocks")).toBeTruthy();
  });

  // 79: the preview of a sample point; 95 in W16's third pane, beside the layout and its settings.
  it("puts the preview of a sample point in its own pane", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    show({ ...layout(), samples: [{ caption: "Hut · Feature 1 of 1", properties: { note: "Open" } }] });
    const preview = screen.getByRole("group", { name: "Preview" });
    expect(preview.textContent).toContain("Hut · Feature 1 of 1");
    expect(preview.closest(".preview-pane")).toBeTruthy();
  });

  // 95 with no point to fill it, the sheet says so in the phone's words
  it("says so when the layer has no point to preview", () => {
    show({ ...layout(), sampleNote: "No point yet" });
    expect(screen.getByText("No point yet").closest(".preview-pane")).toBeTruthy();
  });

  // 95 a picked card is pressed, and its settings take the middle pane
  it("shows the picked block's settings beside the layout", () => {
    show();
    const text = screen.getByRole("button", { name: /^Text/ });
    expect(text.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(text);
    expect(text.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".settings-pane")?.textContent).toContain("Text");
    expect(screen.getByRole("combobox", { name: "Text" })).toBeTruthy();
  });
});
