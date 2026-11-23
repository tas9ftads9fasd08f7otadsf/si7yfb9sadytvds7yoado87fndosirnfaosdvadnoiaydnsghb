import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OptionSection, RoadSigns } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { OptionsPanel } from "./OptionsPanel";

const headers: OptionSection = { kind: "headers", title: "Headers", footnote: "Values stay on the phone.",
  key: "header", label: "Add header", layerScoped: true,
  options: [{ id: "Authorization", title: "Authorization", detail: "Bearer or Basic" }],
  items: [{ id: "X-API-Key", title: "X-API-Key", light: "", dark: "", isOn: true, detail: "Saved on this device" }] };

const probe: OptionSection = { kind: "probe", title: "", footnote: "", key: "test", label: "Test", layerScoped: true };

const label: OptionSection = { kind: "text", title: "Text above points", footnote: "A {key} becomes its value.",
  key: "pointLabel", layerScoped: true, value: "", keys: ["line", "status"] };
const mode: OptionSection = { kind: "choice", title: "Colour", footnote: "", key: "colourMode", layerScoped: true,
  value: "fixed", options: [{ id: "fixed", title: "Static" }, { id: "fromKey", title: "From key" }] };

const asked = (answer: () => Promise<Response> = () => new Promise<Response>(() => {})) => {
  const ask = vi.fn((input: RequestInfo | URL) => (void input, answer()));
  vi.stubGlobal("fetch", ask);
  return () => String(ask.mock.calls[0]?.[0]);
};

const show = (sections: OptionSection[]) => {
  useViewer.setState({ mapID: "a", editToken: "t" });
  render(<OptionsPanel id="L" sections={sections} />);
};

describe("OptionsPanel", () => {
  beforeEach(resetViewer);
  afterEach(() => vi.unstubAllGlobals());

  // 60: a set header says so and shows no value; typing one sends it, never reading it back.
  it("sets a header's value without showing the one kept", () => {
    const sent = asked();
    show([headers]);
    expect(screen.getByText("Saved on this device")).toBeTruthy();
    const field = screen.getByLabelText("X-API-Key Value") as HTMLInputElement;
    expect(field.value).toBe("");
    expect(field.type).toBe("password");
    field.value = "sk_new";
    fireEvent.change(field);
    const query = new URLSearchParams(sent().split("?")[1]);
    expect(Object.fromEntries(query)).toMatchObject({ layer: "L", header: "X-API-Key", headerValue: "sk_new" });
  });

  // 60: a header is removed by its name.
  it("removes a header", () => {
    const sent = asked();
    show([headers]);
    fireEvent.click(screen.getByRole("button", { name: "Remove X-API-Key" }));
    expect(sent()).toContain("removeHeader=X-API-Key");
  });

  // 60: a new header goes with its name and value at once; no name, nothing to add.
  it("adds a named header with its value", () => {
    const sent = asked();
    show([headers]);
    const add = screen.getByRole("button", { name: "Add header" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Header"), { target: { value: "Authorization" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "Bearer abc" } });
    fireEvent.click(add);
    const query = new URLSearchParams(sent().split("?")[1]);
    expect(Object.fromEntries(query)).toMatchObject({ header: "Authorization", headerValue: "Bearer abc" });
  });

  // 60: Test asks the phone and says what it answered.
  it("tests the address on the phone", async () => {
    const sent = asked(() => Promise.resolve(new Response(JSON.stringify({ reachable: false, said: "Server replied 404" }))));
    show([probe]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Test" }));
    });
    expect(sent()).toContain("/maps/a/layer-test?layer=L");
    expect(await screen.findByText("Server replied 404")).toBeTruthy();
  });

  // 70: a template field offers the layer's keys in braces and sends what was typed.
  it("sends the text above points with the layer", () => {
    const sent = asked();
    show([label]);
    const field = screen.getByRole("combobox", { name: "Text above points" }) as HTMLInputElement;
    expect(field.type).toBe("text");
    const offered = Array.from(document.querySelectorAll("datalist option")).map((one) => one.getAttribute("value"));
    expect(offered).toEqual(["{line}", "{status}"]);
    fireEvent.change(field, { target: { value: "{line}" } });
    const query = new URLSearchParams(sent().split("?")[1]);
    expect(Object.fromEntries(query)).toMatchObject({ layer: "L", pointLabel: "{line}" });
  });

  // 70: a text option with no keys is still an address.
  it("keeps an address field without keys", () => {
    show([{ ...label, keys: undefined, key: "identifyRequest", title: "Tap address" }]);
    expect((screen.getByRole("textbox", { name: "Tap address" }) as HTMLInputElement).type).toBe("url");
  });

  // 70: an API's colour mode is a choice sent with the layer.
  it("sends the colour mode", () => {
    const sent = asked();
    show([mode]);
    fireEvent.change(screen.getByRole("combobox", { name: "Colour" }), { target: { value: "fromKey" } });
    const query = new URLSearchParams(sent().split("?")[1]);
    expect(Object.fromEntries(query)).toMatchObject({ layer: "L", colourMode: "fromKey" });
  });
});

const signKey: OptionSection = { kind: "signKey", title: "Country", footnote: "", label: "Search countries" };

const countries = [{ id: "at", title: "Austria" }, { id: "sk", title: "Slovakia" }];

/** As `PeerWebRoadSigns` answers: the country askedSigns, else the first, filtered by `q`. */
function phoneKey(url: string): RoadSigns {
  const query = new URLSearchParams(url.split("?")[1]);
  const country = query.get("country") ?? "sk";
  const typed = (query.get("q") ?? "").toLowerCase();
  return { country, countryName: country === "sk" ? "Slovakia" : "Austria",
    countries: countries.filter((one) => one.title.toLowerCase().includes(typed)),
    signs: country === "sk" ? [{ id: "sk.ts.202", title: "Stop" }] : [{ id: "at.ts.1", title: "Vorrang geben" }] };
}

const askedSigns = () => {
  const ask = vi.fn((input: RequestInfo | URL) => String(input).includes("/road-signs")
    ? Promise.resolve(new Response(JSON.stringify(phoneKey(String(input)))))
    : new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", ask);
  return () => ask.mock.calls.map((call) => String(call[0]));
};

const showSigns = async (sections: OptionSection[]) => {
  useViewer.setState({ mapID: "a", editToken: "t" });
  await act(async () => {
    render(<OptionsPanel id="L" sections={sections} />);
  });
};

describe("OptionsPanel's signs key", () => {
  beforeEach(resetViewer);
  afterEach(() => vi.unstubAllGlobals());

  // 69: one country's signs, each drawn by the phone, the country listed among the rest.
  it("lists one country's signs with the phone's pictures", async () => {
    const urls = askedSigns();
    await showSigns([signKey]);
    expect(urls()[0]).toContain("/maps/a/road-signs");
    expect(await screen.findByText("Stop")).toBeTruthy();
    const picture = document.querySelector("[data-sign='sk.ts.202'] .sign") as HTMLElement;
    expect(picture.style.backgroundImage).toContain("/web/icons/sk.ts.202");
    expect(screen.getByRole("button", { name: "Slovakia" }).getAttribute("aria-pressed")).toBe("true");
  });

  // 69: a country is picked from the list, and the search asks the phone for the names that fit.
  it("picks another country and searches by name", async () => {
    const urls = askedSigns();
    await showSigns([signKey]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Austria" }));
    });
    expect(urls().at(-1)).toContain("country=at");
    expect(await screen.findByText("Vorrang geben")).toBeTruthy();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Search countries"), { target: { value: "slo" } });
    });
    expect(urls().at(-1)).toContain("q=slo");
    expect(screen.queryByRole("button", { name: "Austria" })).toBeNull();
  });

  // 69: road numbers are a choice of the phone's, sent without a layer.
  it("sets road numbers for the phone", async () => {
    const urls = askedSigns();
    await showSigns([{ kind: "choice", title: "Road numbers", footnote: "Every map follows this.", key: "roadShields",
      value: "country", options: [{ id: "country", title: "Country shields" }, { id: "classic", title: "One per road class" }] }]);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Road numbers"), { target: { value: "classic" } });
    });
    const edit = urls().find((url) => url.includes("/edit?")) ?? "";
    expect(edit).toContain("roadShields=classic");
    expect(edit).not.toContain("layer=");
  });

  // 168: a point layer's panel is Map markers, its colour titled for the mark.
  it("titles a point layer's panel Map markers and its colour for the mark", () => {
    const sections: OptionSection[] = [
      { kind: "choice", title: "Mark", key: "pointMark", aspect: "mark", value: "circled",
        options: [{ id: "dot", title: "Dot" }, { id: "circled", title: "Icon in circle" }] },
      { ...mode, aspect: "colour" },
      // 173: the phone sends a GeoJSON layer's line width on Lines and areas.
      { kind: "slider", title: "Line width", key: "lineWidth", aspect: "linesAndAreas", value: "1" }];
    useViewer.setState({ mapID: "a", editToken: "t" });
    render(<OptionsPanel id="L" kind="GeoJSON" sections={sections} />);
    expect(screen.getByRole("heading", { name: "Map markers" })).toBeTruthy();
    expect(screen.getByText("Circle colour")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Lines and areas" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Stacking" })).toBeNull();
  });

  // 168: an API layer offers Stacking; a layer with no marks keeps its panel plain.
  it("offers Stacking on an API layer and no tabs where no points are drawn", () => {
    const stacked: OptionSection = { kind: "switch", key: "stacking", aspect: "stacking", label: "Stack" };
    useViewer.setState({ mapID: "a", editToken: "t" });
    const { unmount } = render(<OptionsPanel id="L" kind="API" sections={[
      { kind: "choice", key: "pointMark", aspect: "mark", value: "dot", options: [] }, stacked]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Stacking" }));
    expect(screen.getByRole("switch", { name: "Stack" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Lines and areas" })).toBeNull();
    unmount();
    render(<OptionsPanel id="L" kind="Tiles" sections={[probe]} />);
    expect(screen.queryByRole("heading", { name: "Map markers" })).toBeNull();
  });
});
