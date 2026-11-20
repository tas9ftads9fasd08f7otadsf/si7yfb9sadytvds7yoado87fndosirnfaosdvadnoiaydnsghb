// Makes the site's glyphs and base sprite from the rikimaps checkout at the pinned commit (rikiCore.ref), read only:
// dist/assets/glyphs/<font stack>/<range>.pbf and dist/assets/sprites/temaki-sprite{,@2x}.{json,png}, which
// pack:web puts under out/.
//
//     RIKIMAPS_DIR=/path/to/rikimaps npm run build:assets      # a checkout at rikiCore.ref
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where the app keeps them: its resources folder, the glyphs in a folder of their own. */
export const PLACES = { resources: ["Riki Maps", "Riki Maps", "Resources"], glyphs: "Glyphs" };

/** The base sprite's four files, as MapLibre asks for them beside the name the style gives. */
export const SPRITE_FILES = ["temaki-sprite.json", "temaki-sprite.png", "temaki-sprite@2x.json", "temaki-sprite@2x.png"];

/** Where `GlyphStore` places a glyph file for MapLibre's `{fontstack}/{range}.pbf`, or null for any other file. */
export function glyphPlacement(file) {
  const parts = path.basename(file, ".pbf").split("-");
  if (!file.endsWith(".pbf") || parts.length < 3) return null;
  const stack = parts.slice(0, -2).join("-").replaceAll("_", " ");
  if (!stack || !/^\d+$/.test(parts[parts.length - 2])) return null;
  return `glyphs/${stack}/${parts.slice(-2).join("-")}.pbf`;
}

/** {site path: source file} of a rikimaps checkout's glyphs and sprite; a missing part fails. */
export async function fromCheckout(dir) {
  const resources = path.join(dir, ...PLACES.resources);
  const glyphs = path.join(resources, PLACES.glyphs);
  if (!existsSync(glyphs)) throw new Error(`${dir} has no ${[...PLACES.resources, PLACES.glyphs].join("/")}: not a rikimaps checkout`);
  const files = {};
  for (const file of (await readdir(glyphs)).sort()) {
    const placed = glyphPlacement(file);
    if (placed) files[placed] = path.join(glyphs, file);
  }
  if (Object.keys(files).length === 0) throw new Error(`${glyphs} holds no glyph files`);
  for (const file of SPRITE_FILES) {
    if (!existsSync(path.join(resources, file))) throw new Error(`${resources} has no ${file}`);
    files[`sprites/${file}`] = path.join(resources, file);
  }
  return files;
}

/** The files copied under `out`, which is emptied first. */
export async function write(files, out) {
  await rm(out, { recursive: true, force: true });
  for (const [site, source] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(out, site)), { recursive: true });
    await cp(source, path.join(out, site));
  }
}

async function main() {
  const own = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  if (!(process.env.RIKI_CORE_REF || own.rikiCore?.ref)) {
    console.warn("the site's glyphs and sprite are not made: rikiCore.ref in package.json pins no rikimaps commit yet");
    return;
  }
  const dir = process.env.RIKIMAPS_DIR;
  if (!dir) throw new Error("RIKIMAPS_DIR is not set: point it at a rikimaps checkout at rikiCore.ref (read only)");
  const files = await fromCheckout(dir);
  const out = process.env.RIKI_ASSETS_DIR || path.join(ROOT, "dist", "assets");
  await write(files, out);
  console.log(`${Object.keys(files).length} glyph and sprite files under ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
