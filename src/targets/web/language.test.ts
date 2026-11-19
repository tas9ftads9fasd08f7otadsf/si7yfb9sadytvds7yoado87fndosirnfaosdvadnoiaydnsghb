import { describe, expect, it } from "vitest";
import { ENGLISH } from "@/lib/words";
import { chooseLanguage, codesOf, computedWords } from "./language";

// 91 the browser's languages choose a language of the site's words
const AVAILABLE = ["ar", "cs", "de", "en", "es", "es-419", "pt-BR", "pt-PT", "sr", "sr-Latn", "zh-Hans", "zh-Hant", "fr", "fr-CA"];

describe("the language of the words", () => {
  it("takes the exact language first, whatever the case", () => {
    expect(chooseLanguage(AVAILABLE, ["fr-CA", "fr"])).toBe("fr-CA");
    expect(chooseLanguage(AVAILABLE, ["pt-pt"])).toBe("pt-PT");
    expect(chooseLanguage(AVAILABLE, ["cs"])).toBe("cs");
  });

  it("takes the language of a region it has no words for", () => {
    expect(chooseLanguage(AVAILABLE, ["de-AT"])).toBe("de");
    expect(chooseLanguage(AVAILABLE, ["es-MX"])).toBe("es");
    expect(chooseLanguage(AVAILABLE, ["en-GB"])).toBe("en");
  });

  it("writes Chinese in the script its region does", () => {
    expect(chooseLanguage(AVAILABLE, ["zh-TW"])).toBe("zh-Hant");
    expect(chooseLanguage(AVAILABLE, ["zh-HK"])).toBe("zh-Hant");
    expect(chooseLanguage(AVAILABLE, ["zh-Hant-TW"])).toBe("zh-Hant");
    expect(chooseLanguage(AVAILABLE, ["zh-CN"])).toBe("zh-Hans");
    expect(chooseLanguage(AVAILABLE, ["zh"])).toBe("zh-Hans");
    expect(chooseLanguage(AVAILABLE, ["zh-SG"])).toBe("zh-Hans");
  });

  it("takes Serbian in Latin script as its own, and Serbian otherwise as it is", () => {
    expect(chooseLanguage(AVAILABLE, ["sr-Latn-RS"])).toBe("sr-Latn");
    expect(chooseLanguage(AVAILABLE, ["sr-RS"])).toBe("sr");
  });

  it("takes a regional form for the language alone, and English where nothing fits", () => {
    expect(chooseLanguage(AVAILABLE, ["pt"])).toBe("pt-BR");
    expect(chooseLanguage(AVAILABLE, ["xx", "ja"])).toBe("en");
    expect(chooseLanguage(AVAILABLE, [])).toBe("en");
    expect(chooseLanguage([], ["cs"])).toBe("en");
  });

  it("goes down the browser's list until one fits", () => {
    expect(chooseLanguage(AVAILABLE, ["ja", "ko-KR", "cs-CZ", "de"])).toBe("cs");
    expect(chooseLanguage(AVAILABLE, ["", " ", "de_AT"])).toBe("de");
  });

  it("reads a list of languages, and nothing from what is not one", () => {
    expect(codesOf(["cs", 3, "en"])).toEqual(["cs", "en"]);
    expect(codesOf({ cs: 1 })).toEqual([]);
  });
});

describe("what the phone made up, made here", () => {
  it("lists the languages in order of their names in this language, each named, English counted as English", () => {
    const words = computedWords("cs", ["en", "cs", "de"], { ...ENGLISH, layers: "Vrstvy" });
    expect((words.languages ?? "").split(",")).toEqual(["en", "cs", "de"]);
    expect(words["language.en"]).toBe("Angličtina");
    expect(words["language.cs"]).toBe("Čeština");
    expect(words["layers.5"]).toBe("5 vrstvy");
    expect(words["layers.0"]).toBe("0 vrstvy");
    expect(Object.keys(words).filter((key) => key.startsWith("layers."))).toHaveLength(100);
  });

  it("counts layers in English as English does", () => {
    const words = computedWords("en", ["en"], ENGLISH);
    expect([words["layers.0"], words["layers.1"], words["layers.2"], words["layers.99"]]).toEqual(["0 layers", "1 layer", "2 layers", "99 layers"]);
    expect(words["language.en"]).toBe("English");
  });

  it("falls back to the code itself for one it cannot name", () => {
    expect(computedWords("en", ["not a code!"], ENGLISH)["language.not a code!"]).toBe("Not a code!");
  });
});
