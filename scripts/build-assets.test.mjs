import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SPRITE_FILES, fromCheckout, glyphPlacement, write } from "./build-assets.mjs";

// 110 the site serves the glyphs and the base sprite of the pinned rikimaps checkout
describe("where a glyph file goes", () => {
  // the app's GlyphStore places Noto_Sans_Bold-0-255.pbf under "Noto Sans Bold" for MapLibre's {fontstack}/{range}
  it("puts a font stack's file in a folder of the stack's name, spaces for underscores", () => {
    expect(glyphPlacement("Noto_Sans_Bold-0-255.pbf")).toBe("glyphs/Noto Sans Bold/0-255.pbf");
    expect(glyphPlacement("Noto_Sans_Regular-64768-65023.pbf")).toBe("glyphs/Noto Sans Regular/64768-65023.pbf");
    expect(glyphPlacement("Open_Sans-Semi-Bold-256-511.pbf")).toBe("glyphs/Open Sans-Semi-Bold/256-511.pbf");
  });

  it("leaves out what is not a glyph file", () => {
    for (const name of ["README.md", "Noto_Sans-Bold.pbf", "Noto_Sans_Bold-a-b.pbf", ".DS_Store", "-0-255.pbf"]) {
      expect(glyphPlacement(name)).toBeNull();
    }
  });
});

describe("the files made from a checkout", () => {
  function checkout({ glyphs = ["Noto_Sans_Regular-0-255.pbf", "Noto_Sans_Bold-0-255.pbf", "notes.txt"], sprite = SPRITE_FILES } = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), "rikimaps-"));
    const resources = path.join(dir, "Riki Maps", "Riki Maps", "Resources");
    mkdirSync(path.join(resources, "Glyphs"), { recursive: true });
    for (const name of glyphs) writeFileSync(path.join(resources, "Glyphs", name), `glyph ${name}`);
    for (const name of sprite) writeFileSync(path.join(resources, name), `sprite ${name}`);
    return dir;
  }

  it("takes the glyph files and the sprite's four, nothing else", async () => {
    const files = await fromCheckout(checkout());
    expect(Object.keys(files).sort()).toEqual(["glyphs/Noto Sans Bold/0-255.pbf", "glyphs/Noto Sans Regular/0-255.pbf",
      ...SPRITE_FILES.map((name) => `sprites/${name}`)].sort());
  });

  it("copies them under the folder it is given, which it empties first", async () => {
    const out = mkdtempSync(path.join(tmpdir(), "assets-"));
    writeFileSync(path.join(out, "old.txt"), "old");
    await write(await fromCheckout(checkout()), out);
    expect(readFileSync(path.join(out, "glyphs", "Noto Sans Bold", "0-255.pbf"), "utf8")).toBe("glyph Noto_Sans_Bold-0-255.pbf");
    expect(readFileSync(path.join(out, "sprites", "temaki-sprite@2x.png"), "utf8")).toBe("sprite temaki-sprite@2x.png");
    expect(() => readFileSync(path.join(out, "old.txt"))).toThrow();
  });

  it("fails on what is not a checkout with them, or lacks a part", async () => {
    await expect(fromCheckout(mkdtempSync(path.join(tmpdir(), "nothing-")))).rejects.toThrow("not a rikimaps checkout");
    await expect(fromCheckout(checkout({ glyphs: ["notes.txt"] }))).rejects.toThrow("no glyph files");
    await expect(fromCheckout(checkout({ sprite: ["temaki-sprite.json"] }))).rejects.toThrow("has no temaki-sprite.png");
  });
});
