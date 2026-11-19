import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OptionSection } from "@/lib/types";
import { MarkSymbols } from "./MarkSymbols";

const section: OptionSection = {
  kind: "symbols", title: "Icon", key: "pointIcon", layerScoped: true, value: "tree", palette: ["mappin", "tent"],
  options: [{ id: "mappin", title: "mappin", detail: "Places" }, { id: "tent", title: "tent", detail: "Outdoors" },
    { id: "tree", title: "tree", detail: "Outdoors" }],
};

describe("MarkSymbols", () => {
  // 64 the worn icon leads the phone's suggestions, then every icon in the picker's groups
  it("lists the worn icon first, then each group", () => {
    render(<MarkSymbols section={section} pick={() => {}} />);
    const first = screen.getByRole("group", { name: "Icon" });
    expect([...first.querySelectorAll("button")].map((each) => each.dataset.symbol)).toEqual(["tree", "mappin", "tent"]);
    const outdoors = screen.getByRole("group", { name: "Icon · Outdoors" });
    expect([...outdoors.querySelectorAll("button")].map((each) => each.dataset.symbol)).toEqual(["tent", "tree"]);
    expect(within(outdoors).getByLabelText("tree").getAttribute("aria-pressed")).toBe("true");
  });

  // 64 a tap sends the icon; the one worn sends nothing
  it("picks another icon, never the worn one again", () => {
    const pick = vi.fn();
    render(<MarkSymbols section={section} pick={pick} />);
    const places = screen.getByRole("group", { name: "Icon · Places" });
    fireEvent.click(within(places).getByLabelText("mappin"));
    fireEvent.click(within(screen.getByRole("group", { name: "Icon" })).getByLabelText("tree"));
    expect(pick.mock.calls).toEqual([["mappin"]]);
  });
});
