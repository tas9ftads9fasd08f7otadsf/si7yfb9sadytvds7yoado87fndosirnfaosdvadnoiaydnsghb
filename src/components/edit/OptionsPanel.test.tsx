import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OptionSection } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { OptionsPanel } from "./OptionsPanel";

const asked = () => {
  const ask = vi.fn((input: RequestInfo | URL) => new Promise<Response>(() => void input));
  vi.stubGlobal("fetch", ask);
  return () => Object.fromEntries(new URLSearchParams(String(ask.mock.calls[0]?.[0]).split("?")[1]));
};

const label: OptionSection = { kind: "text", title: "Text above points", footnote: "A {key} becomes its value.",
  key: "pointLabel", layerScoped: true, value: "", keys: ["line", "status"] };
const mode: OptionSection = { kind: "choice", title: "Colour", footnote: "", key: "colourMode", layerScoped: true,
  value: "fixed", options: [{ id: "fixed", title: "Static" }, { id: "fromKey", title: "From key" }] };

const show = (sections: OptionSection[]) => {
  useViewer.setState({ mapID: "a", editToken: "t" });
  render(<OptionsPanel id="L" sections={sections} />);
};

describe("OptionsPanel", () => {
  beforeEach(resetViewer);
  afterEach(() => vi.unstubAllGlobals());

  // 70: a template field offers the layer's keys in braces and sends what was typed.
  it("sends the text above points with the layer", () => {
    const query = asked();
    show([label]);
    const field = screen.getByRole("combobox", { name: "Text above points" }) as HTMLInputElement;
    expect(field.type).toBe("text");
    const offered = Array.from(document.querySelectorAll("datalist option")).map((one) => one.getAttribute("value"));
    expect(offered).toEqual(["{line}", "{status}"]);
    fireEvent.change(field, { target: { value: "{line}" } });
    expect(query()).toMatchObject({ layer: "L", pointLabel: "{line}" });
  });

  // 70: a text option with no keys is still an address.
  it("keeps an address field without keys", () => {
    show([{ ...label, keys: undefined, key: "identifyRequest", title: "Tap address" }]);
    expect((screen.getByRole("textbox", { name: "Tap address" }) as HTMLInputElement).type).toBe("url");
  });

  // 70: an API's colour mode is a choice sent with the layer.
  it("sends the colour mode", () => {
    const query = asked();
    show([mode]);
    fireEvent.change(screen.getByRole("combobox", { name: "Colour" }), { target: { value: "fromKey" } });
    expect(query()).toMatchObject({ layer: "L", colourMode: "fromKey" });
  });
});
