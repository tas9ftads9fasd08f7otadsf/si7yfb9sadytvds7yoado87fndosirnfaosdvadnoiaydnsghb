// Downloads a region's packages as maptiles publishes them, for the stand-in phone's real map.
//   node scripts/real-region.mjs slovensko/bratislavsky
import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export const CATALOG = "https://raw.githubusercontent.com/tas9ftads9fasd08f7otadsf/"
  + "sad7tfs9fnnsdfhdnsf8aosdnfladhsgfia76w4fhasdf/master/maps.json";
export const REAL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "e2e", "real");
const LEFT_OUT = new Set(["wikipedia"]);

/** The packages of `country/region` in the catalogue, each with where it downloads from. */
export function packagesOf(catalog, name) {
  const [country, region] = name.split("/");
  const found = catalog[country]?.regions?.[region];
  if (!found) throw new Error(`No region ${name} in the catalogue`);
  return Object.entries(found.maps).filter(([key]) => !LEFT_OUT.has(key))
    .map(([key, map]) => ({ key, file: map.file, size: map.size,
      address: map.download.replace("drive.google.com/uc?", "drive.usercontent.google.com/download?") + "&confirm=t" }));
}

async function download(address, into) {
  const answer = await fetch(address);
  if (!answer.ok || !answer.body) throw new Error(`${address} answered ${answer.status}`);
  await pipeline(Readable.fromWeb(answer.body), createWriteStream(into));
}

async function main(name) {
  const catalog = await (await fetch(CATALOG)).json();
  const folder = path.join(REAL, name.split("/")[1]);
  mkdirSync(path.join(folder, "zips"), { recursive: true });
  for (const each of packagesOf(catalog, name)) {
    const zip = path.join(folder, "zips", each.file);
    if (!existsSync(zip) || statSync(zip).size !== each.size) await download(each.address, zip);
    if (statSync(zip).size !== each.size) throw new Error(`${each.file} arrived cut short`);
    rmSync(path.join(folder, each.file.replace(/\.zip$/, "")), { recursive: true, force: true });
    execFileSync("unzip", ["-q", "-o", zip, "-d", folder]);
    console.log(`${each.key}: ${each.file}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv[2] || "slovensko/bratislavsky");
