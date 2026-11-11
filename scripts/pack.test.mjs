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
});
