import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appName, build, write, contentHash, dumps, englishFormat, fill, fromCheckout, languagesOf, parseStrings, pluralKeys, slots, wordOf, wordsIn }
  from "./build-words.mjs";

// 91 the site's words are made from rikimaps' tables, as its generator did: the same bytes
const ENTRIES = {
  maps: { en: "Maps", tr: "maps-shared-words", table: "Shared" },
  app: { en: "{app}" },
  changedBy: { en: "{map} was changed by {author}", tr: "map-changed-by" },
  needsApp: { en: "Needs {app} {version} or later", tr: "needs-later-viewer" },
  groupLayersOn: { en: "{on} of {count} on", tr: "edit-layer-screen", numbers: ["on", "count"] },
  "serverKind.wms": { en: "WMS" },
  half: { en: "50% of {name}", tr: "half-name-test" }
};

const table = (byLang) => Object.fromEntries(Object.entries(byLang).map(([lang, strings]) => [lang, { strings, plurals: new Set() }]));
const TABLES = {
  Localizable: table({
    en: { "map-changed-by": "%1$@ was changed by %2$@", "needs-later-viewer": "Needs %1$@ %2$@ or later", "edit-layer-screen": "%1$lld of %2$lld on", "half-name-test": "50%% of %@" },
    cs: { "map-changed-by": "%2$@ změnil(a) %1$@", "needs-later-viewer": "Vyžaduje %1$@ %2$@ nebo novější", "edit-layer-screen": "%1$lld z %2$lld zapnutých" }
  }),
  Shared: table({ en: { "maps-shared-words": "Maps" }, cs: { "maps-shared-words": "Mapy" } })
};

describe("words in one language", () => {
  const said = (lang) => wordsIn(ENTRIES, TABLES, lang, "Riki Maps");

  it("uses the translation and leaves the slots for the page", () => {
    expect(said("cs")).toMatchObject({ maps: "Mapy", changedBy: "{author} změnil(a) {map}", needsApp: "Vyžaduje Riki Maps {version} nebo novější",
      groupLayersOn: "{on} z {count} zapnutých" });
  });

  it("falls back to English where a language has no translation", () => {
    expect(said("de")).toMatchObject({ maps: "Maps", changedBy: "{map} was changed by {author}", needsApp: "Needs Riki Maps {version} or later" });
  });

  it("makes English from the English table, and reads a percent as the table writes it", () => {
    expect(said("en").changedBy).toBe("{map} was changed by {author}");
    expect(said("en").half).toBe("50% of {name}");
  });

  it("says a word with no table key as it is, the app's name put in", () => {
    expect(said("cs")).toMatchObject({ app: "Riki Maps", "serverKind.wms": "WMS" });
  });

  it("does not take an empty translation or a plural for a word", () => {
    const tables = { Localizable: table({ cs: { "map-changed-by": "" } }), Shared: { cs: { strings: { "maps-shared-words": "Mapa" }, plurals: new Set(["maps-shared-words"]) } } };
    expect(wordsIn({ maps: ENTRIES.maps, changedBy: ENTRIES.changedBy }, tables, "cs", "X")).toEqual({ changedBy: "{map} was changed by {author}", maps: "Maps" });
  });
});

describe("the files", () => {
  const files = () => build(ENTRIES, TABLES, ["cs", "de"], "Riki Maps");

  it("is one file per language, English among them, and a list", () => {
    expect(Object.keys(files()).sort()).toEqual(["words/cs.json", "words/de.json", "words/en.json", "words/languages.json"]);
    expect(JSON.parse(files()["words/languages.json"])).toEqual(["cs", "de", "en"]);
  });

  it("is the shape the phone answers, with every key in every language", () => {
    const said = JSON.parse(files()["words/cs.json"]);
    expect(Object.keys(said).sort()).toEqual(["language", "words"]);
    expect(said.language).toBe("cs");
    expect(Object.keys(said.words).sort()).toEqual(Object.keys(ENTRIES).sort());
  });

  it("writes the same bytes and the same hash for the same words, with sorted keys and one-space indent", () => {
    expect(contentHash(files())).toBe(contentHash(files()));
    expect(contentHash(files())).not.toBe(contentHash(build({ ...ENTRIES, maps: { en: "Maps" } }, TABLES, ["cs", "de"], "Riki Maps")));
    expect(dumps({ b: 1, a: ["é"] })).toBe('{\n "a": [\n  "é"\n ],\n "b": 1\n}\n');
  });
});

describe("a table's format", () => {
  it("is a string argument for a slot unless it is a number, and a percent twice", () => {
    expect(englishFormat(ENTRIES.changedBy)).toBe("%@ was changed by %@");
    expect(englishFormat(ENTRIES.groupLayersOn)).toBe("%lld of %lld on");
    expect(englishFormat(ENTRIES.half)).toBe("50%% of %@");
    expect(slots("{a} of {b} on {a}")).toEqual(["a", "b", "a"]);
  });

  it("is filled by position, and a percent twice is one", () => {
    expect(fill("%2$@ / %1$@", ["a", "b"])).toBe("b / a");
    expect(fill("100%% %@", ["x"])).toBe("100% x");
    expect(wordOf({ en: "x", tr: "k" }, "plain %@ stays", "A")).toBe("plain %@ stays");
  });
});

describe("a .strings file", () => {
  it("reads escapes, unicode, comments and an unquoted key as Apple does", () => {
    const text = '/* a */ "a" = "x\\ny\\"z\\u00e9";\n// b\nplain = "v";\n"nokey";\n';
    expect(parseStrings(text)).toEqual({ a: 'x\ny"zé', plain: "v", nokey: "nokey" });
  });

  it("refuses a pair without its semicolon", () => {
    expect(() => parseStrings('"a" = "b"')).toThrow("expected ;");
  });

  it("lists a .stringsdict's plurals, which are not words", () => {
    const plist = "<plist><dict><key>one-key</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@v@</string><key>v</key><dict><key>one</key><string>x</string></dict></dict><key>two &amp; key</key><dict/></dict></plist>";
    expect(pluralKeys(plist)).toEqual(["one-key", "two & key"]);
  });
});

describe("the output", () => {
  it("holds a file for each language and the list, where pack:web takes them", async () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), "out-")), "words");
    await write(build(ENTRIES, TABLES, ["cs"], "Riki Maps"), out);
    expect(existsSync(path.join(out, "cs.json"))).toBe(true);
    expect(existsSync(path.join(out, "words"))).toBe(false);
    expect(JSON.parse(readFileSync(path.join(out, "languages.json"), "utf8"))).toEqual(["cs", "en"]);
  });
});

describe("a rikimaps checkout", () => {
  function checkout() {
    const dir = mkdtempSync(path.join(tmpdir(), "words-"));
    const app = path.join(dir, "Riki Maps", "Riki Maps");
    const shared = path.join(dir, "Riki Maps", "Riki Maps Shared");
    for (const lang of ["en", "cs", "Base", "zh-Hans"]) mkdirSync(path.join(app, `${lang}.lproj`), { recursive: true });
    for (const lang of ["en", "cs"]) mkdirSync(path.join(shared, `${lang}.lproj`), { recursive: true });
    mkdirSync(path.join(app, "Resources"), { recursive: true });
    mkdirSync(path.join(dir, "Riki Maps", "Riki Maps.xcodeproj"), { recursive: true });
    writeFileSync(path.join(app, "Resources", "web-words.json"), JSON.stringify({ maps: ENTRIES.maps, app: ENTRIES.app, half: ENTRIES.half }));
    writeFileSync(path.join(app, "en.lproj", "Localizable.strings"), '"half-name-test" = "50%% of %@";\n');
    writeFileSync(path.join(shared, "cs.lproj", "Shared.strings"), '"maps-shared-words" = "Mapy";\n');
    writeFileSync(path.join(dir, "Riki Maps", "Riki Maps.xcodeproj", "project.pbxproj"), '\t\t\t\tAPP_NAME = "Test Maps";\n');
    return dir;
  }

  it("takes the app's name from the project, and the languages from the app's folders without Base and English", async () => {
    expect(appName('x\n\t\tAPP_NAME = "Riki Maps";\n')).toBe("Riki Maps");
    expect(appName("APP_NAME = Plain;")).toBe("Plain");
    expect(await languagesOf(path.join(checkout(), "Riki Maps", "Riki Maps"))).toEqual(["cs", "zh-Hans"]);
  });

  it("makes every language's file from the list and the tables at their places", async () => {
    const files = await fromCheckout(checkout());
    expect(Object.keys(files).sort()).toEqual(["words/cs.json", "words/en.json", "words/languages.json", "words/zh-Hans.json"]);
    expect(JSON.parse(files["words/cs.json"]).words).toEqual({ app: "Test Maps", half: "50% of {name}", maps: "Mapy" });
    expect(JSON.parse(files["words/zh-Hans.json"]).words.maps).toBe("Maps");
  });
});

// When RIKIMAPS_DIR is a checkout of the real tables, the list and every table are whole.
describe.skipIf(!process.env.RIKIMAPS_DIR)("the real tables", () => {
  it("make a file for every language, with English wherever one has no translation", async () => {
    const files = await fromCheckout(process.env.RIKIMAPS_DIR);
    const languages = JSON.parse(files["words/languages.json"]);
    expect(languages).toContain("en");
    expect(languages.length).toBeGreaterThan(50);
    const czech = JSON.parse(files["words/cs.json"]).words;
    const english = JSON.parse(files["words/en.json"]).words;
    expect(Object.keys(czech)).toEqual(Object.keys(english));
    expect(czech.maps).not.toBe(english.maps);
    expect(english.app).toBe("Riki Maps");
    expect(Object.values(english).join("").replace("50%", "")).not.toContain("%");
  });
});

// 91 the generator this replaces, tools/site-words.py at rikimaps 5a7200c4fb, made files that hash to c80d8253675b
describe.skipIf(!process.env.RIKIMAPS_WORDS_CHECK_DIR)("the generator it replaces", () => {
  it("makes, at rikimaps 5a7200c4fb, the files the contract's check hashes to c80d8253675b", async () => {
    const files = await fromCheckout(process.env.RIKIMAPS_WORDS_CHECK_DIR);
    expect(Object.keys(files)).toHaveLength(60);
    expect(contentHash(files).startsWith("c80d8253675b")).toBe(true);
  });
});
