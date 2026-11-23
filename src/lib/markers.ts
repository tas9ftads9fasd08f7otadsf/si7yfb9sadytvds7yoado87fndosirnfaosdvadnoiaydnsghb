import type { OptionSection } from "./types";

export type Aspect = "colour" | "mark" | "text" | "stacking" | "linesAndAreas";
export type MarkKind = "dot" | "circled" | "alone";

export const ASPECT_WORDS = { colour: "apiColour", mark: "markAspect", text: "textAspect", stacking: "stackingAspect",
  linesAndAreas: "linesAndAreas" } as const;

const isAPI = (kind: string) => kind.trim().toLowerCase() === "api";

/** A layer draws points where the phone offers a mark for them. */
export const drawsPoints = (sections: OptionSection[]) => sections.some((one) => one.aspect === "mark");

/** As the app's `FeatureStyleAspect.offered`: only an API stacks; lines and areas where the phone sends them. */
export function aspectsOffered(kind: string, sections: OptionSection[]): Aspect[] {
  if (!drawsPoints(sections)) return ["colour"];
  if (isAPI(kind)) return ["colour", "mark", "text", "stacking"];
  // 173: a track file's lines are drawn as it says, so the phone sends no width for them.
  const lines = sections.some((one) => one.aspect === "linesAndAreas");
  return lines ? ["colour", "mark", "text", "linesAndAreas"] : ["colour", "mark", "text"];
}

export const markOf = (sections: OptionSection[]): MarkKind => {
  const value = sections.find((one) => one.key === "pointMark")?.value;
  return value === "circled" || value === "alone" ? value : "dot";
};

export const colourTitleKey = (mark: MarkKind) =>
  mark === "dot" ? "dotColour" : mark === "circled" ? "circleColour" : "iconColour";

/** What the phone sent, held to what the layer's kind is offered. */
export const offeredSections = (kind: string, sections: OptionSection[]) => {
  const offered = aspectsOffered(kind, sections);
  return sections.filter((one) => !one.aspect || offered.includes(one.aspect));
};
