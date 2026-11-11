// Turns the site's build (`npm run build:web`) into dist/web-site.zip, all a server's deploy takes.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_SEGMENTS } from "../src/lib/segments.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The server's files at the zip's root; config.php is the deploy's, never shipped. */
export const SERVER_FILES = ["index.php", "Site.php", "config.example.php"];

/** What of the phone's page would ship on the site: its API, its bundle or its asset prefix. */
export function siteLeaks(files) {
  return files.filter(({ name, text }) => /Info\.plist$|WebEditor\.bundle/.test(name)
    || /\/riki\/v1|\/web\/app\//.test(text ?? "")).map(({ name }) => name);
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
