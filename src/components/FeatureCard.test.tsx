import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DetailsSheet } from "@/lib/types";
import { FeatureCard } from "./FeatureCard";

const sheet: DetailsSheet = {
  title: "Line 4",
  keys: ["line", "speed", "note"],
  sections: [
    { title: "About", blocks: [
      { kind: "rows", rows: [{ title: "Speed", value: "30 km/h" }] },
      { kind: "text", title: "Note", text: "Detour", warning: true },
      { kind: "chart" }] },
    { title: "Source", blocks: [{ kind: "allTags" }] }],
};

describe("FeatureCard", () => {
  // 21
  it("lists every value when the layer laid nothing out", () => {
    render(<FeatureCard properties={{ name: "Hut", ele: "1840" }} layer="Huts" />);
    expect(screen.getByText("Hut", { selector: "b" })).toBeTruthy();
    expect(screen.getByText("ele")).toBeTruthy();
  });

  // 21
  it("draws the layout's sections, and leaves what they read out of the tags", () => {
    const { container } = render(
      <FeatureCard properties={{ line: "4", speed: "30", note: "Detour", operator: "DPB" }} layer="Trams"
        details={sheet} />);
    expect(screen.getByText("Line 4")).toBeTruthy();
    expect(screen.getByText("About")).toBeTruthy();
    expect(screen.getByText("30 km/h")).toBeTruthy();
    expect(container.querySelector(".feature-note.warning")?.textContent).toContain("Detour");
    expect(screen.getByText("operator")).toBeTruthy();
    expect(screen.queryByText("speed")).toBeNull();
  });
});
