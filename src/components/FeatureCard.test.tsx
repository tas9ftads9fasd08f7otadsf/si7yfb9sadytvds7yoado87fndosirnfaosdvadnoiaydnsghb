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

  // 28
  it("draws a button's link and a picture, but only from a web address", () => {
    const { container } = render(
      <FeatureCard properties={{ name: "Hut" }} layer="Huts" details={{ keys: [], sections: [{ blocks: [
        { kind: "link", title: "Timetable", text: "https://mapa.example/trip/4" },
        { kind: "link", title: "Run", text: "javascript:alert(1)" },
        { kind: "image", text: "https://img.example/hut.jpg" },
        { kind: "image", text: "data:image/png;base64,AAAA" }] }] }} />);
    expect(screen.getByText("Timetable").getAttribute("href")).toBe("https://mapa.example/trip/4");
    expect(screen.queryByText("Run")).toBeNull();
    const pictures = container.querySelectorAll<HTMLElement>(".feature-image");
    expect(pictures.length).toBe(1);
    expect(pictures[0]?.style.backgroundImage).toContain("https://img.example/hut.jpg");
  });
});

// 130 the phone's connection card and LIVE pill in the panel's card
describe("FeatureCard's live connection", () => {
  const connection = { delay: { minutes: 3, sentence: "3 min late", short: "+3 min", tone: "late" },
    route: "Lamač → Petržalka", planned: "09:31", actual: "09:34",
    labels: { delay: "Delay", planned: "Planned", actual: "Actual", updated: "Updated", note: "Note" } };
  const rows = [{ title: "Delay", value: "3 min late" }, { title: "", value: "From Lamač to Petržalka" }];
  const live = { isLive: true, ageSeconds: 10, windowSeconds: 120, label: "LIVE", notLiveLabel: "Not live" };
  const sheet = (more: Partial<DetailsSheet> = {}, block: object = { kind: "rows", rows, connection }): DetailsSheet =>
    ({ title: "Os 4314", keys: [], sections: [{ blocks: [block as never] }], ...more });

  // 130
  it("draws a card block's connection in place of its rows, and the LIVE pill from live", () => {
    const { container } = render(
      <FeatureCard properties={{}} layer="Trains" details={sheet({ live })} asked={Date.now()} />);
    expect(container.querySelector(".connection")?.textContent).toContain("Lamač → Petržalka");
    expect(screen.queryByText("From Lamač to Petržalka")).toBeNull();
    expect(screen.getByText("LIVE")).toBeTruthy();
  });

  // 130 a phone from before 3493 sends only rows, which are drawn as they were, with no pill
  it("draws the rows when the block has no connection, and no pill when the sheet has no live", () => {
    const { container } = render(<FeatureCard properties={{}} layer="Trains"
      details={sheet({}, { kind: "rows", rows })} />);
    expect(screen.getByText("From Lamač to Petržalka")).toBeTruthy();
    expect(container.querySelector(".connection")).toBeNull();
    expect(container.querySelector(".live-pill")).toBeNull();
  });

  // 130 the pill says the phone's Not live when the layer's answers stopped
  it("says the phone's Not live for a layer that has not answered in time", () => {
    render(<FeatureCard properties={{}} layer="Trains"
      details={sheet({ live: { ...live, isLive: false, ageSeconds: 500 } })} asked={Date.now()} />);
    expect(screen.getByText("Not live")).toBeTruthy();
  });
});
