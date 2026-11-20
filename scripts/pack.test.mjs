import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { asked, infoPlist, phoneLeaks, ships, styleFacts } from "./pack.mjs";

describe("what the bundle carries", () => {
  it("takes the page and its assets, not Next's route payloads", () => {
    expect(ships("index.html")).toBe(true);
    expect(ships("_next/static/chunks/a.js")).toBe(true);
    expect(ships("licenses/pmtiles.txt")).toBe(true);
    expect(ships("index.txt")).toBe(false);
    expect(ships("__next._tree.txt")).toBe(false);
    expect(ships("404.html")).toBe(false);
  });

  // 30 the catch-all page still builds one index.html; its own payload stays behind.
  it("takes one page for every address", () => {
    expect(ships("__next.$oc$slug.__PAGE__.txt")).toBe(false);
    expect(ships("maps/index.html")).toBe(false);
  });

  // 36 the app's bundle holds nothing of the site
  it("finds the site's parts in what the app would ship", () => {
    expect(phoneLeaks([{ name: "index.html", text: "<script src=\"/web/app/a.js\">" },
      { name: "_next/static/a.js", text: "fetch(\"/riki/v1/device\")" }])).toEqual([]);
    expect(phoneLeaks([{ name: "server/index.php", text: null }, { name: "riki-core.wasm", text: null },
      { name: "_next/static/b.js", text: "CloudKit.configure({})" },
      { name: "index.html", text: "<link href=\"/__riki_base__/a.css\">" }]))
      .toEqual(["server/index.php", "riki-core.wasm", "_next/static/b.js", "index.html"]);
  });

  it("reads what the page asks for", () => {
    expect(asked(`<script src="/web/app/_next/static/a.js"></script><link href='/web/app/b.css'>`))
      .toEqual(["_next/static/a.js", "b.css"]);
  });

  it("describes a resource bundle, with no executable", () => {
    const plist = infoPlist("0.1.7");
    expect(plist).toContain("<string>BNDL</string>");
    expect(plist).toContain("<string>0.1.7</string>");
    expect(plist).not.toContain("CFBundleExecutable");
  });

  it("gathers the style facts from every layer's layout and paint", () => {
    const facts = styleFacts({ layout_line: { "line-cap": {} }, paint_fill: { "fill-color": {} }, other: { nope: {} },
      filter_operator: { values: { "!in": {} } }, terrain: { source: {} } }, ["get"]);
    expect(facts).toEqual({ properties: ["fill-color", "line-cap"], operators: ["!in", "get"], terrainKeys: ["source"] });
  });
});

// 37 the site's zip holds nothing of the phone's page
describe("what the site's zip carries", () => {
  it("finds the phone's parts in what the site would ship", async () => {
    const { siteLeaks, SERVER_FILES } = await import("./pack-web.mjs");
    expect(siteLeaks([{ name: "out/index.html", text: "<script src=\"/__riki_base__/_next/a.js\">" },
      { name: "out/_next/static/a.js", text: "CloudKit.configure({})" }])).toEqual([]);
    expect(siteLeaks([{ name: "out/_next/static/a.js", text: "fetch(\"/riki/v1/device\")" },
      { name: "out/index.html", text: "<script src=\"/web/app/_next/a.js\">" },
      { name: "WebEditor.bundle/Info.plist", text: null }]))
      .toEqual(["out/_next/static/a.js", "out/index.html", "WebEditor.bundle/Info.plist"]);
    expect(SERVER_FILES).not.toContain("config.php");
  });

  // 98 on Apache nothing else sends a request to index.php
  it("ships the .htaccess that sends every request to index.php", async () => {
    const { SERVER_FILES } = await import("./pack-web.mjs");
    expect(SERVER_FILES).toContain(".htaccess");
    const text = readFileSync(path.join(process.cwd(), "server", ".htaccess"), "utf8");
    expect(text).toMatch(/^RewriteEngine On$/m);
    expect(text).toMatch(/^RewriteRule \^index\\\.php\$ - \[L\]$/m);
    expect(text).toMatch(/^RewriteRule \^ index\.php \[L\]$/m);
    expect(text).toMatch(/^Options -Indexes$/m);
    expect(text).not.toMatch(/RewriteBase/);
    for (const file of SERVER_FILES) expect(existsSync(path.join(process.cwd(), "server", file)), file).toBe(true);
  });
});

// 76 the pinned core is taken whole, or the pack says why it is not
describe("the site's core", async () => {
  const { mkdtemp, writeFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { pinnedCore } = await import("./pack-web.mjs");
  const folder = async (bytes, sum) => {
    const dir = await mkdtemp(path.join(tmpdir(), "core-"));
    if (bytes) await writeFile(path.join(dir, "riki-core.wasm"), bytes);
    if (sum) await writeFile(path.join(dir, "riki-core.wasm.sha256"), `${sum}  riki-core.wasm\n`);
    return dir;
  };

  it("is skipped, with its words, while no rikimaps commit is pinned", async () => {
    const answer = await pinnedCore({ ref: null, sha256: null }, await folder());
    expect(answer.wasm).toBeNull();
    expect(answer.said).toContain("not pinned");
  });

  it("is taken when its sha256 matches", async () => {
    const bytes = Buffer.from("\0asm");
    const dir = await folder(bytes, createHash("sha256").update(bytes).digest("hex"));
    expect(await pinnedCore({ ref: "0123456789abcdef", sha256: null }, dir))
      .toEqual({ wasm: path.join(dir, "riki-core.wasm"), said: "riki-core.wasm from rikimaps 0123456789" });
  });

  // 88 the pin's own checksum is the one a build has to reproduce
  // 88 CI packs the site for the browser specs with no core built; a release has to fail without one
  it("may be packed without when the pack says it is for the specs", async () => {
    const answer = await pinnedCore({ ref: "0123456789abcdef" }, await folder(), { optional: true });
    expect(answer.wasm).toBeNull();
    expect(answer.said).toContain("packed without it");
  });

  it("fails when the pin's sha256 is not the module's", async () => {
    const bytes = Buffer.from("\0asm");
    const dir = await folder(bytes, createHash("sha256").update(bytes).digest("hex"));
    await expect(pinnedCore({ ref: "0123456789abcdef", sha256: "0".repeat(64) }, dir)).rejects.toThrow("rikiCore.sha256");
  });

  it("fails when a pinned release is not there, and when it was altered", async () => {
    await expect(pinnedCore({ ref: "0123456789abcdef" }, await folder())).rejects.toThrow("npm run build:core");
    await expect(pinnedCore({ ref: "0123456789abcdef" }, await folder(Buffer.from("x"), "0".repeat(64)))).rejects.toThrow("its .sha256 says");
  });
});

// 91 the site's words are the made files, or English alone while none are pinned
describe("the site's words", async () => {
  const { mkdtemp, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { pinnedWords } = await import("./pack-web.mjs");
  const made = async (languages) => {
    const dir = await mkdtemp(path.join(tmpdir(), "words-"));
    for (const lang of languages) await writeFile(path.join(dir, `${lang}.json`), JSON.stringify({ language: lang, words: { maps: lang } }));
    await writeFile(path.join(dir, "languages.json"), JSON.stringify(languages));
    return dir;
  };

  it("is English alone, from the page's own sentences, while no commit is pinned", async () => {
    const answer = await pinnedWords({ ref: null }, await made([]));
    expect(Object.keys(answer.files).sort()).toEqual(["words/en.json", "words/languages.json"]);
    expect(JSON.parse(answer.files["words/en.json"])).toMatchObject({ language: "en", words: { maps: "Maps" } });
    expect(JSON.parse(answer.files["words/languages.json"])).toEqual(["en"]);
    expect(answer.englishOnly).toBe(true);
  });

  it("is the made files, English, the list and a language that is not English", async () => {
    const answer = await pinnedWords({ ref: "0123456789abcdef" }, await made(["en", "cs"]));
    expect(Object.keys(answer.files).sort()).toEqual(["words/cs.json", "words/en.json", "words/languages.json"]);
    expect(JSON.parse(answer.files["words/cs.json"]).language).toBe("cs");
    expect(answer.englishOnly).toBeUndefined();
  });

  it("fails when a pinned set was not made, unless the pack is for the specs", async () => {
    const empty = await made([]);
    await expect(pinnedWords({ ref: "0123456789abcdef" }, empty)).rejects.toThrow("npm run build:words");
    expect((await pinnedWords({ ref: "0123456789abcdef" }, empty, { optional: true })).englishOnly).toBe(true);
  });
});
