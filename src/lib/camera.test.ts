import { describe, expect, it } from "vitest";
import { leftOpening, OPENING } from "./camera";

// 24: framing once undid a move made while the first map loaded.
describe("leftOpening", () => {
  it("stays put where the map opened", () => {
    expect(leftOpening({ lng: OPENING.center[0], lat: OPENING.center[1] }, OPENING.zoom)).toBe(false);
  });
  it("sees a pan", () => {
    expect(leftOpening({ lng: 21.5, lat: 49 }, OPENING.zoom)).toBe(true);
  });
  it("sees a zoom", () => {
    expect(leftOpening({ lng: OPENING.center[0], lat: OPENING.center[1] }, 10)).toBe(true);
  });
});
