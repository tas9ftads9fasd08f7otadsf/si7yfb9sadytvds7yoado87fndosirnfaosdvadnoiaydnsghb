import { describe, expect, it } from "vitest";
import type { OptionSection } from "./types";
import { aspectsOffered, colourTitleKey, drawsPoints, markOf, offeredSections } from "./markers";

const mark: OptionSection = { kind: "choice", key: "pointMark", aspect: "mark", value: "dot" };
const colour: OptionSection = { kind: "colour", key: "tint", aspect: "colour" };
const stack: OptionSection = { kind: "switch", key: "stacking", aspect: "stacking" };
const lines: OptionSection = { kind: "slider", key: "lineWidth", aspect: "linesAndAreas" };

describe("map markers", () => {
  // 168: a layer the app draws no points for has its colours alone.
  it("offers only colour where no points are drawn", () => {
    expect(drawsPoints([colour])).toBe(false);
    expect(aspectsOffered("Tiles", [colour])).toEqual(["colour"]);
  });

  // 168: only an API stacks.
  it("offers Stacking on an API layer and not Lines and areas", () => {
    expect(aspectsOffered("API", [mark])).toEqual(["colour", "mark", "text", "stacking"]);
  });

  // 168: Esri and file layers may hold lines or areas, and never stack.
  it("offers Lines and areas on Esri and file layers", () => {
    for (const kind of ["Esri", "GeoJSON"]) {
      expect(aspectsOffered(kind, [mark])).toEqual(["colour", "mark", "text", "linesAndAreas"]);
    }
  });

  // 168: a phone that sends too much is held to what the kind is offered.
  it("drops sections of an aspect the layer is not offered", () => {
    expect(offeredSections("GeoJSON", [mark, colour, stack, lines])).toEqual([mark, colour, lines]);
    expect(offeredSections("API", [mark, colour, stack, lines])).toEqual([mark, colour, stack]);
  });

  // 168: the Colour title follows the mark.
  it("names the colour for the mark", () => {
    expect(markOf([mark])).toBe("dot");
    expect(markOf([{ ...mark, value: "circled" }])).toBe("circled");
    expect(["dot", "circled", "alone"].map((one) => colourTitleKey(one as "dot"))).toEqual(
      ["dotColour", "circleColour", "iconColour"]);
  });
});
