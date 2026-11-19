import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DetailsLayout, DetailsSheet } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { DetailsPreview } from "./DetailsPreview";

const layout = (more: Partial<DetailsLayout> = {}): DetailsLayout => ({
  sections: [{ name: "Section 1", blocks: [{ handle: "t1", kind: "text", name: "Text", value: "{note}", counts: true }] }],
  used: 1, limit: 10, parts: [], keys: ["note"], offers: [], words: {},
  samples: [
    { caption: "Line 4 · Feature 1 of 2", properties: { line: "4", note: "Detour" } },
    { caption: "Line 9 · Feature 2 of 2", properties: { line: "9" } }],
  ...more,
});

const sheetFor = (values: Record<string, string>): DetailsSheet => ({
  title: `Line ${values.line}`, keys: ["line", "note"],
  sections: [{ title: "About", blocks: values.note ? [{ kind: "text", title: "Note", text: values.note }] : [] }],
});

const asked: URLSearchParams[] = [];

beforeEach(() => {
  resetViewer();
  asked.length = 0;
  useViewer.setState({ mapID: "a" });
  // 79: the stand-in answers as the phone does, the values it was given filled in.
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const query = new URLSearchParams(String(input).split("?")[1]);
    asked.push(query);
    const values = JSON.parse(query.get("values") ?? "{}") as Record<string, string>;
    return new Response(JSON.stringify(sheetFor(values)), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DetailsPreview", () => {
  // 79: the page asks the phone to fill the layout, and draws what comes back.
  it("draws the layout the phone filled from the first sample point", async () => {
    render(<DetailsPreview layout={layout()} layer="L" />);
    expect(await screen.findByText("Detour")).toBeTruthy();
    expect(screen.getByText("Line 4 · Feature 1 of 2")).toBeTruthy();
    expect(screen.getByText("About")).toBeTruthy();
    expect(asked[0]?.get("layer")).toBe("L");
    expect(JSON.parse(asked[0]?.get("values") ?? "{}")).toEqual({ line: "4", note: "Detour" });
  });

  // 79: Another moves on to the next point, and round again at the last.
  it("switches to another sample point and wraps around", async () => {
    render(<DetailsPreview layout={layout()} layer="L" />);
    await screen.findByText("Detour");
    fireEvent.click(screen.getByRole("button", { name: "Another" }));
    expect(await screen.findByText("Line 9 · Feature 2 of 2")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Detour")).toBeNull());
    expect(screen.getByText("Line 9", { selector: "b" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Another" }));
    expect(await screen.findByText("Detour")).toBeTruthy();
  });

  // 79: a change to the layout is a new fill from the same point.
  it("asks again when the layout changes", async () => {
    const { rerender } = render(<DetailsPreview layout={layout()} layer="L" />);
    await screen.findByText("Detour");
    const before = asked.length;
    rerender(<DetailsPreview layout={layout({ sections: [{ title: "Other", name: "Other", blocks: [] }] })} layer="L" />);
    await waitFor(() => expect(asked.length).toBe(before + 1));
  });

  // 79: one point has nothing to switch to.
  it("offers no Another for a single point", async () => {
    const [first] = layout().samples ?? [];
    render(<DetailsPreview layout={layout({ samples: first ? [first] : [] })} layer="L" />);
    await screen.findByText("Detour");
    expect(screen.queryByRole("button", { name: "Another" })).toBeNull();
  });

  // 79: a phone with no point yet says so in its own words and draws no card.
  it("shows the phone's note when the layer has no point", () => {
    const { container } = render(
      <DetailsPreview layout={layout({ samples: [], sampleNote: "Tap a point on the map first" })} layer="L" />);
    expect(screen.getByText("Tap a point on the map first")).toBeTruthy();
    expect(container.querySelector(".feature")).toBeNull();
    expect(asked).toHaveLength(0);
  });

  // 79: an older phone sends no samples, so the editor has no preview and asks for nothing.
  it("draws nothing when the phone sends no samples", () => {
    const { container } = render(<DetailsPreview layout={layout({ samples: undefined })} layer="L" />);
    expect(container.textContent).toBe("");
    expect(asked).toHaveLength(0);
  });

  // 79: a layout the phone laid out as the standard one answers nothing, so the plain card shows.
  it("falls back to the plain card when the phone answers no layout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    render(<DetailsPreview layout={layout()} layer="L" />);
    expect(await screen.findByText("note")).toBeTruthy();
    expect(screen.getByText("Detour")).toBeTruthy();
  });

  // 79: a failed ask leaves the plain card rather than a blank preview.
  it("keeps the plain card when the phone cannot be asked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<DetailsPreview layout={layout()} layer="L" />);
    expect(await screen.findByText("note")).toBeTruthy();
  });
});
