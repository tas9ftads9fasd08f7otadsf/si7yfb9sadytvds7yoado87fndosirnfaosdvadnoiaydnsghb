// Turns the site's build (`npm run build:web`) into dist/web-site.zip, all a server's deploy takes.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_SEGMENTS } from "../src/lib/segments.ts";
import { ENGLISH } from "../src/lib/words.ts";
import { dumps } from "./build-words.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The server's files at the zip's root; config.php is the deploy's, never shipped. */
export const SERVER_FILES = ["index.php", "Site.php", "config.example.php"];

/** What of the phone's page would ship on the site: its API, its bundle or its asset prefix. */
export function siteLeaks(files) {
  return files.filter(({ name, text }) => /Info\.plist$|WebEditor\.bundle/.test(name)
    || /\/riki\/v1|\/web\/app\//.test(text ?? "")).map(({ name }) => name);
}

/**
 * The riki-core.wasm `npm run build:core` made, checked against its .sha256 and the pin's; null with a message while
 * no rikimaps commit is pinned, and a failure once one is pinned but the module is missing or altered.
 */
export async function pinnedCore(pin, dir, { optional = false } = {}) {
  if (!pin?.ref) return { wasm: null, said: "riki-core.wasm is not pinned in package.json (rikiCore.ref): the site is packed without it and cannot read maps yet" };
  const wasm = path.join(dir, "riki-core.wasm");
  let bytes;
  let sums;
  try {
    [bytes, sums] = await Promise.all([readFile(wasm), readFile(`${wasm}.sha256`, "utf8")]);
  } catch {
    // CI packs the site for its browser specs, which stand in for the core; a release never does.
    if (optional) return { wasm: null, said: `riki-core.wasm is pinned to rikimaps ${pin.ref.slice(0, 10)} but was not built: the site is packed without it` };
    throw new Error(`riki-core.wasm is pinned to rikimaps ${pin.ref} but ${wasm} and its .sha256 are not there: run npm run build:core first`);
  }
  const wanted = sums.trim().split(/\s+/)[0];
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== wanted) throw new Error(`riki-core.wasm is ${got}, but its .sha256 says ${wanted}`);
  if (pin.sha256 && got !== pin.sha256) throw new Error(`riki-core.wasm is ${got}, but rikiCore.sha256 in package.json is ${pin.sha256}`);
  return { wasm, said: `riki-core.wasm from rikimaps ${pin.ref.slice(0, 10)}` };
}

/**
 * The site's words: what `npm run build:words` made in dist/words, or English alone, from the page's own sentences,
 * while no rikimaps commit is pinned. A pinned set that is missing fails, unless the pack says it is for the specs.
 */
export async function pinnedWords(pin, dir, { optional = false } = {}) {
  const english = { "words/en.json": dumps({ language: "en", words: ENGLISH }), "words/languages.json": dumps(["en"]) };
  if (!pin?.ref) return { files: english, said: "the site's words are not pinned in package.json (rikiCore.ref): the site is packed with English only", englishOnly: true };
  let names;
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".json"));
    if (!names.includes("languages.json") || !names.includes("en.json")) throw new Error("incomplete");
  } catch {
    if (optional) return { files: english, said: `the site's words are pinned to rikimaps ${pin.ref.slice(0, 10)} but were not built: the site is packed with English only`, englishOnly: true };
    throw new Error(`the site's words are pinned to rikimaps ${pin.ref} but ${dir} has no languages.json and en.json: run npm run build:words first`);
  }
  const files = {};
  for (const name of names) files[`words/${name}`] = await readFile(path.join(dir, name), "utf8");
  return { files, said: `${names.length - 1} languages of words from rikimaps ${pin.ref.slice(0, 10)}` };
}

async function main() {
  const out = path.join(ROOT, "out");
  const work = path.join(ROOT, "dist", "web-site");
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });

  const page = await readFile(path.join(out, "index.html"), "utf8");
  if (!page.includes("/__riki_base__/")) throw new Error("out/ is not the site's build: run npm run build:web first");

  const files = (await readdir(out, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(out, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .filter((file) => file === "index.html" || file.startsWith("_next/static/") || file.startsWith("licenses/"));
  const read = await Promise.all(files.map(async (name) =>
    ({ name, text: /\.(html|js|css|json|txt)$/.test(name) ? await readFile(path.join(out, name), "utf8") : null })));
  const leaked = siteLeaks(read);
  if (leaked.length) throw new Error(`The phone's page would ship on the site: ${leaked.join(", ")}`);

  for (const file of files) await cp(path.join(out, file), path.join(work, "out", file));
  for (const file of SERVER_FILES) await cp(path.join(ROOT, "server", file), path.join(work, file));

  const own = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const core = await pinnedCore(own.rikiCore, process.env.RIKI_CORE_DIR || path.join(ROOT, "dist", "riki-core"),
    { optional: process.env.RIKI_PACK_WITHOUT_CORE === "1" });
  if (core.wasm) await cp(core.wasm, path.join(work, "out", "riki-core.wasm"));
  else console.warn(`warning: ${core.said}`);
  const optional = process.env.RIKI_PACK_WITHOUT_CORE === "1";
  const words = await pinnedWords(own.rikiCore, process.env.RIKI_WORDS_DIR || path.join(ROOT, "dist", "words"), { optional });
  if (words.englishOnly) console.warn(`warning: ${words.said}`);
  for (const [file, text] of Object.entries(words.files)) {
    await mkdir(path.dirname(path.join(work, "out", file)), { recursive: true });
    await writeFile(path.join(work, "out", file), text);
  }
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const site = { version: process.env.WEB_EDITOR_VERSION || own.version, commit, pageSegments: PAGE_SEGMENTS };
  await writeFile(path.join(work, "site.json"), `${JSON.stringify(site, null, 2)}\n`);

  const zip = path.join(ROOT, "dist", "web-site.zip");
  await rm(zip, { force: true });
  execFileSync("zip", ["-qrX", zip, "."], { cwd: work });
  const sum = createHash("sha256").update(await readFile(zip)).digest("hex");
  await writeFile(`${zip}.sha256`, `${sum}  web-site.zip\n`);
  console.log(`site ${site.version} (${commit}): ${files.length} files, sha256 ${sum}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
