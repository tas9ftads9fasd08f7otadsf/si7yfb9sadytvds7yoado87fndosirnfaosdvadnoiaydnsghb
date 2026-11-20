import { describe, expect, it } from "vitest";
import { sameFeature, stillLive } from "./live";
import type { DetailsLive } from "./types";

const live = (more: Partial<DetailsLive> = {}): DetailsLive =>
  ({ isLive: true, ageSeconds: 30, windowSeconds: 120, label: "LIVE", notLiveLabel: "Not live", ...more });

describe("stillLive", () => {
  // 130 the pill counts the age on from when the page asked, and goes grey once the window has passed
  it("counts the age on from when the page asked", () => {
    expect(stillLive(live(), 1_000_000, 1_000_000)).toBe(true);
    expect(stillLive(live(), 1_000_000, 1_000_000 + 90_000)).toBe(true);
    expect(stillLive(live(), 1_000_000, 1_000_000 + 91_000)).toBe(false);
  });

  // 130
  it("is not live when the phone said so, or when the layer never answered", () => {
    expect(stillLive(live({ isLive: false }), 1_000_000, 1_000_000)).toBe(false);
    expect(stillLive(live({ ageSeconds: null }), 1_000_000, 1_000_000)).toBe(false);
    expect(stillLive(live({ ageSeconds: undefined }), undefined, 1_000_000)).toBe(false);
  });

  // 130 with no time of asking the age stands as the phone gave it; a clock behind never ages it backwards
  it("takes the phone's age when the time asked is unknown, and never counts back", () => {
    expect(stillLive(live({ ageSeconds: 120 }), undefined, 5_000_000)).toBe(true);
    expect(stillLive(live({ ageSeconds: 121 }), undefined, 5_000_000)).toBe(false);
    expect(stillLive(live({ ageSeconds: 120 }), 2_000_000, 1_000_000)).toBe(true);
  });
});

describe("sameFeature", () => {
  const point = (properties: Record<string, unknown>, at: [number, number]) =>
    ({ properties, geometry: { type: "Point", coordinates: at } });

  // 130 a vehicle is found again by what does not change, whatever its delay is now
  it("finds the vehicle again by the values it still shares", () => {
    const answer = { features: [point({ line: "9", id: "b7", delay: "0" }, [17, 48]),
      point({ line: "4", id: "a1", delay: "12" }, [17.2, 48.2])] };
    const found = sameFeature({ line: "4", id: "a1", delay: "3" }, answer, [17.1, 48.1]);
    expect(found?.properties).toEqual({ line: "4", id: "a1", delay: "12" });
  });

  // 130 two vehicles of one line: the one with more in common, then the nearest
  it("prefers the most values in common, then the nearest", () => {
    const answer = { features: [point({ line: "4", id: "far" }, [18, 49]), point({ line: "4", id: "near" }, [17.11, 48.11]),
      point({ line: "4", id: "a1" }, [20, 50])] };
    expect(sameFeature({ line: "4", id: "a1" }, answer, [17.1, 48.1])?.properties?.id).toBe("a1");
    expect(sameFeature({ line: "4" }, answer, [17.1, 48.1])?.properties?.id).toBe("near");
  });

  // 130 nothing shared is no match, and an answer that is no collection is none
  it("finds nothing when no value is shared or the answer is no feature collection", () => {
    const answer = { features: [point({ line: "9", note: "" }, [17, 48])] };
    expect(sameFeature({ line: "4", note: "" }, answer, [17, 48])).toBeNull();
    expect(sameFeature({ line: "4" }, { type: "Nope" }, [17, 48])).toBeNull();
    expect(sameFeature({ line: "4" }, null, [17, 48])).toBeNull();
  });
});
