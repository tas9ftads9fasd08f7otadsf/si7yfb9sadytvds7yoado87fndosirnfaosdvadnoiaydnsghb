import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DetailsConnection, DetailsLive } from "@/lib/types";
import { ConnectionCard, LivePill } from "./Connection";

const labels = { delay: "Verspätung", planned: "Geplant", actual: "Tatsächlich", updated: "Aktualisiert", note: "Hinweis" };
const card: DetailsConnection = {
  delay: { minutes: 3, sentence: "3 Min. zu spät", short: "+3 Min.", tone: "late" },
  station: "Hlavná stanica", route: "Lamač → Petržalka", operatorLine: "Betrieben von DPB",
  planned: "09:31", actual: "09:34", updated: "09:35", note: "Umleitung", labels };

describe("ConnectionCard", () => {
  // 130 every sentence is the phone's, in its language: the page adds none
  it("draws the delay in its tone, the route, the times, the operator and the note as the phone worded them", () => {
    const { container } = render(<ConnectionCard connection={card} />);
    expect(screen.getByText("3 Min. zu spät").className).toContain("tone-late");
    expect(screen.getByText("+3 Min.").className).toContain("tone-late");
    expect(screen.getByText("Hlavná stanica")).toBeTruthy();
    expect(screen.getByText("Lamač → Petržalka")).toBeTruthy();
    expect(screen.getByText("Betrieben von DPB")).toBeTruthy();
    for (const word of ["Verspätung", "Geplant", "Tatsächlich", "Aktualisiert"]) expect(screen.getByText(word)).toBeTruthy();
    expect(screen.getByText("09:35")).toBeTruthy();
    expect(container.querySelector(".feature-note")?.textContent).toBe("HinweisUmleitung");
  });

  // 130 the planned time is struck through when the actual one differs
  it("strikes the planned time through only when the actual one differs", () => {
    const { container, rerender } = render(<ConnectionCard connection={card} />);
    expect(container.querySelector("s")?.textContent).toBe("09:31");
    rerender(<ConnectionCard connection={{ ...card, actual: "09:31" }} />);
    expect(container.querySelector("s")).toBeNull();
    rerender(<ConnectionCard connection={{ ...card, actual: null }} />);
    expect(container.querySelector("s")).toBeNull();
    expect(screen.getByText("09:31")).toBeTruthy();
  });

  // 130 green for on time, orange late, red from ten minutes; a tone the page does not know wears none
  it("wears the phone's three tones", () => {
    const toned = (tone: string) => render(<ConnectionCard connection={{ ...card, delay: { ...card.delay!, tone } }} />)
      .container.querySelector(".delay")?.className;
    expect(toned("good")).toContain("tone-good");
    expect(toned("veryLate")).toContain("tone-veryLate");
    expect(toned("purple")).not.toContain("tone-");
  });

  // 130 a card of a destination alone has nothing to draw but the route
  it("draws only what the card carries", () => {
    const { container } = render(<ConnectionCard connection={{ route: "Petržalka", labels }} />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("Petržalka")).toBeTruthy();
    expect(container.querySelector(".connection-times")).toBeNull();
    expect(container.querySelector(".feature-note")).toBeNull();
    expect(screen.queryByText("Aktualisiert")).toBeNull();
  });

  // 130 as the phone's card: with no stamp of the point's own, the time of the layer's answer
  it("says when the layer answered where the point has no stamp of its own", () => {
    render(<ConnectionCard connection={{ ...card, updated: null }} answeredAt={new Date(2026, 0, 5, 9, 36)} />);
    expect(screen.getByText("Aktualisiert")).toBeTruthy();
    expect(screen.getByText(/9:36|09:36/)).toBeTruthy();
  });
});

describe("LivePill", () => {
  const live: DetailsLive = { isLive: true, ageSeconds: 100, windowSeconds: 120, label: "LIVE", notLiveLabel: "Not live" };
  beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => vi.useRealTimers());

  // 130 LIVE counts the age on from when the page asked, then turns to the phone's other words
  it("says LIVE while the age counted on stays in the window, then Not live", () => {
    render(<LivePill live={live} asked={1_000_000} />);
    expect(screen.getByText("LIVE").getAttribute("data-live")).toBe("true");
    act(() => vi.advanceTimersByTime(19_000));
    expect(screen.getByText("LIVE")).toBeTruthy();
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByText("Not live").getAttribute("data-live")).toBe("false");
  });

  // 130 a layer that never answered, or answers too late, is Not live from the start
  it("is Not live from the start when the phone says so", () => {
    render(<LivePill live={{ ...live, isLive: false, ageSeconds: null }} asked={1_000_000} />);
    expect(screen.getByText("Not live")).toBeTruthy();
  });
});
