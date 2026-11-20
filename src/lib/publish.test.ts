import { describe, expect, it } from "vitest";
import { type PublishForm, formOf, hasPlaces, isWebAddress, languagesOf, publishNeeds, refusalOf, requestOf }
  from "./publish";
import type { PublishOffer } from "./types";

const offer: PublishOffer = { language: "en", isUpdate: false, texts: { en: { title: "High Tatras", body: "Hiking maps" } },
  categories: [{ id: "hiking", name: "Hiking", symbol: "figure.hiking" }], coverage: { countries: ["SK"] },
  coverageLine: "Slovakia", places: ["Slovakia"], leftOut: [], keysNote: "", manualURL: "", hasPreview: true, publicName: "",
  needsPublicName: false };

const ready = (): PublishForm => ({ ...formOf(offer), category: "hiking", replaces: true });

describe("publishNeeds", () => {
  // 136 a card as the phone offers it lacks a category first, then the agreement
  it("names the first thing missing, in the order the sheet's Send says them", () => {
    expect(publishNeeds(formOf(offer), offer)).toBe("category");
    expect(publishNeeds({ ...formOf(offer), category: "hiking" }, offer)).toBe("replaces");
    expect(publishNeeds(ready(), offer)).toBeNull();
    const nameless = { ...ready(), texts: { en: { title: " ", body: "" } } };
    expect(publishNeeds(nameless, offer)).toBe("name");
    expect(publishNeeds({ ...nameless, texts: { en: { title: "Tatras", body: "" } } }, offer)).toBe("summary");
  });

  // 136 a map with no categories asked needs none; one with no found coverage needs it chosen
  it("asks for a category only where the phone lists some, and for the coverage", () => {
    expect(publishNeeds({ ...ready(), category: null }, { ...offer, categories: [] })).toBeNull();
    expect(publishNeeds(ready(), { ...offer, coverage: null })).toBe("coverage");
    expect(publishNeeds(ready(), { ...offer, coverage: { countries: [] } })).toBe("coverage");
    expect(hasPlaces({ exclude: { countries: ["CZ"] } })).toBe(true);
    expect(hasPlaces({ world: true })).toBe(true);
  });

  // 136 an update says what it changed and needs no agreement
  it("asks an update what changed, and not for the agreement", () => {
    const update = { ...offer, isUpdate: true };
    const form = { ...ready(), replaces: false };
    expect(publishNeeds(form, update)).toBe("changes");
    expect(publishNeeds({ ...form, changes: "New huts" }, update)).toBeNull();
  });

  // 136 keys taken out need a note; a manual must be a web address when written
  it("asks how to get keys that were left out, and a web address for the manual", () => {
    const keyed = { ...offer, leftOut: ["Mapy.cz key"] };
    expect(publishNeeds(ready(), keyed)).toBe("keysNote");
    expect(publishNeeds({ ...ready(), keysNote: "Ask the city" }, keyed)).toBeNull();
    expect(publishNeeds({ ...ready(), manualURL: "not a page" }, offer)).toBe("manual");
    expect(publishNeeds({ ...ready(), manualURL: "https://example.com/help" }, offer)).toBeNull();
  });

  // 136 a first publish with no name on the account takes one before it is asked of the phone
  it("asks for a public name only while the phone has none", () => {
    const naming = { ...offer, needsPublicName: true };
    expect(publishNeeds(ready(), naming)).toBe("publicName");
    expect(publishNeeds({ ...ready(), publicName: "Riki" }, naming)).toBeNull();
  });

  it("reads only http and https addresses as web pages", () => {
    expect(isWebAddress("https://riki.maps/a")).toBe(true);
    expect(isWebAddress("ftp://riki.maps/a")).toBe(false);
    expect(isWebAddress("riki.maps")).toBe(false);
  });
});

describe("requestOf", () => {
  // 136 the request carries what is written, the coverage as offered, and the agreement of a first publish
  it("sends the written texts, the coverage as offered and the agreement", () => {
    const form: PublishForm = { ...ready(), keysNote: " Ask the city ", manualURL: "https://example.com ",
      texts: { en: { title: "High Tatras", body: "Hiking maps" }, sk: { title: "Vysoké Tatry", body: "" },
        de: { title: " ", body: "" } } };
    expect(requestOf(form, offer)).toEqual({ texts: { en: form.texts.en, sk: form.texts.sk }, category: "hiking",
      coverage: { countries: ["SK"] }, keysNote: "Ask the city", manualURL: "https://example.com", replaces: true });
  });

  // 136 an update sends what changed and no agreement; a public name goes only while one is asked
  it("sends the changes of an update, and a public name only when asked", () => {
    const update = { ...offer, isUpdate: true, needsPublicName: true };
    const sent = requestOf({ ...ready(), changes: " New huts ", publicName: " Riki " }, update);
    expect(sent.changes).toBe("New huts");
    expect(sent.replaces).toBeUndefined();
    expect(sent.publicName).toBe("Riki");
    expect(requestOf(ready(), offer).publicName).toBeUndefined();
  });
});

describe("the languages and the phone's refusals", () => {
  // 136 the phone's language first, the rest by the name they are shown under
  it("lists the phone's language first and the rest by name", () => {
    const form = { ...ready(), texts: { sk: { title: "a", body: "" }, de: { title: "b", body: "" }, en: offer.texts.en! } };
    const names: Record<string, string> = { en: "English", sk: "Slovenčina", de: "Deutsch" };
    expect(languagesOf(form, offer, (code) => names[code]!)).toEqual(["en", "de", "sk"]);
  });

  // 136 the phone answers a refusal as JSON with its code; other words are shown as they came
  it("reads a refusal's code and message, and plain words as they are", () => {
    expect(refusalOf(JSON.stringify({ refusal: "busy", message: "Too many" }))).toEqual({ refusal: "busy", message: "Too many" });
    expect(refusalOf("Type the edit password again")).toEqual({ refusal: null, message: "Type the edit password again" });
    expect(refusalOf("")).toEqual({ refusal: null, message: "" });
  });
});
