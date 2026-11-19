import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OptionSection, RoadSigns } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { OptionsPanel } from "./OptionsPanel";

const signKey: OptionSection = { kind: "signKey", title: "Country", footnote: "", label: "Search countries" };

const countries = [{ id: "at", title: "Austria" }, { id: "sk", title: "Slovakia" }];

/** As `PeerWebRoadSigns` answers: the country asked, else the first, filtered by `q`. */
function phoneKey(url: string): RoadSigns {
  const query = new URLSearchParams(url.split("?")[1]);
  const country = query.get("country") ?? "sk";
  const typed = (query.get("q") ?? "").toLowerCase();
  return { country, countryName: country === "sk" ? "Slovakia" : "Austria",
    countries: countries.filter((one) => one.title.toLowerCase().includes(typed)),
    signs: country === "sk" ? [{ id: "sk.ts.202", title: "Stop" }] : [{ id: "at.ts.1", title: "Vorrang geben" }] };
}

const asked = () => {
  const ask = vi.fn((input: RequestInfo | URL) => String(input).includes("/road-signs")
    ? Promise.resolve(new Response(JSON.stringify(phoneKey(String(input)))))
    : new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", ask);
  return () => ask.mock.calls.map((call) => String(call[0]));
};

const show = async (sections: OptionSection[]) => {
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
    const urls = asked();
    await show([signKey]);
    expect(urls()[0]).toContain("/maps/a/road-signs");
    expect(await screen.findByText("Stop")).toBeTruthy();
    const picture = document.querySelector("[data-sign='sk.ts.202'] img") as HTMLImageElement;
    expect(picture.getAttribute("src")).toBe("/web/icons/sk.ts.202");
    expect(screen.getByRole("button", { name: "Slovakia" }).getAttribute("aria-pressed")).toBe("true");
  });

  // 69: a country is picked from the list, and the search asks the phone for the names that fit.
  it("picks another country and searches by name", async () => {
    const urls = asked();
    await show([signKey]);
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
    const urls = asked();
    await show([{ kind: "choice", title: "Road numbers", footnote: "Every map follows this.", key: "roadShields",
      value: "country", options: [{ id: "country", title: "Country shields" }, { id: "classic", title: "One per road class" }] }]);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Road numbers"), { target: { value: "classic" } });
    });
    const edit = urls().find((url) => url.includes("/edit?")) ?? "";
    expect(edit).toContain("roadShields=classic");
    expect(edit).not.toContain("layer=");
  });
});
