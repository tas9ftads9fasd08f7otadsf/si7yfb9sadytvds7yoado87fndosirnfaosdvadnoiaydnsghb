// Turns `out/` into what the app ships: dist/WebEditor.bundle, zipped with its checksum.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expressions, latest } from "@maplibre/maplibre-gl-style-spec";
import { DRAWN_TYPES, FORK_ONLY } from "../src/lib/drawable.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The page and its assets; Next's route payloads serve navigation it never does. */
export const ships = (file) => file === "index.html" || file.startsWith("_next/static/") || file.startsWith("licenses/");

/** Every file the page asks for by its prefix. */
export function asked(html) {
  return [...html.matchAll(/\/web\/app\/([^"'\s\\)]+)/g)].map((match) => match[1]);
}

/** What the app's BrowserStyleTests reads, which a minified bundle hides. */
export function styleFacts(spec, expressionNames) {
  const sections = Object.keys(spec).filter((key) => /^(layout|paint)_/.test(key));
  return {
    properties: [...new Set(sections.flatMap((key) => Object.keys(spec[key])))].sort(),
    operators: [...new Set([...expressionNames, ...Object.keys(spec.filter_operator.values)])].sort(),
    terrainKeys: Object.keys(spec.terrain).sort()
  };
}

/** A resource bundle's plist, with no executable: App Store uploads look inside every bundle. */
export const infoPlist = (version) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.rikimaps.rikimaps.web-editor</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>WebEditor</string>
  <key>CFBundlePackageType</key><string>BNDL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${version}</string>
</dict>
</plist>
`;

async function main() {
  const out = path.join(ROOT, "out");
  const dist = path.join(ROOT, "dist");
  const bundle = path.join(dist, "WebEditor.bundle");
  await rm(dist, { recursive: true, force: true });
  await mkdir(bundle, { recursive: true });

  const files = (await readdir(out, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(out, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .filter(ships);
  for (const file of files) await cp(path.join(out, file), path.join(bundle, file));

  const missing = asked(await readFile(path.join(out, "index.html"), "utf8")).filter((file) => !files.includes(file));
  if (missing.length) throw new Error(`The page asks for files the bundle lacks: ${missing.join(", ")}`);

  const own = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const library = JSON.parse(await readFile(path.join(ROOT, "node_modules/maplibre-gl/package.json"), "utf8"));
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const manifest = { version: process.env.WEB_EDITOR_VERSION || own.version, commit, drawnTypes: DRAWN_TYPES,
    forkOnly: FORK_ONLY, mapLibre: { version: library.version, ...styleFacts(latest, Object.keys(expressions)) } };
  await writeFile(path.join(bundle, "web-editor.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(bundle, "Info.plist"), infoPlist(manifest.version));

  const zip = path.join(dist, "web-editor.zip");
  execFileSync("zip", ["-qrX", zip, "WebEditor.bundle"], { cwd: dist });
  const sum = createHash("sha256").update(await readFile(zip)).digest("hex");
  await writeFile(`${zip}.sha256`, `${sum}  web-editor.zip\n`);
  console.log(`${manifest.version} (${commit}): ${files.length} files, sha256 ${sum}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
