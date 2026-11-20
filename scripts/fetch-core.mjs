// Takes riki-core.wasm that .github/workflows/core-on-demand.yml built into dist/riki-core/, checked as a build is.
//
//     npm run fetch:core                         # the commit package.json pins
//     RIKI_CORE_REF=<40-char sha> npm run fetch:core
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPin, smoke, verifyPinned, verifySum } from "./build-core.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WORKFLOW = "core-on-demand.yml";
const COMMIT = /^[0-9a-f]{40}$/;

export const artifactName = (ref) => `riki-core-${ref}`;

/** The newest of the commit's artifacts that has not expired, else null. */
export function newestArtifact(artifacts) {
  return artifacts.filter((one) => !one.expired)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

/** The commit to fetch: one asked for, else the pin; the artifact is named by the full sha. */
export function refToFetch(pinned, asked) {
  const ref = asked || readPin(pinned).ref;
  if (!ref) throw new Error("rikiCore.ref in package.json pins no rikimaps commit and RIKI_CORE_REF is not set");
  if (!COMMIT.test(ref)) throw new Error(`${ref} is not a full commit sha: the artifact is named by all 40 characters`);
  return ref;
}

/** The module against its .sha256, against rikiCore.sha256 when it is the pinned commit, then loaded. */
export async function checkFetched(bytes, sumFile, pinned, ref) {
  const sum = sumFile.trim().split(/\s+/)[0];
  verifySum(bytes, sum, "the downloaded riki-core.wasm");
  const pin = readPin(pinned);
  if (pin.ref === ref) verifyPinned(sum, pin.sha256);
  return smoke(bytes);
}

async function main() {
  const own = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const ref = refToFetch(own.rikiCore, process.env.RIKI_CORE_REF);
  const name = artifactName(ref);
  const gh = (args) => execFileSync("gh", args, { cwd: ROOT, encoding: "utf8" });
  const listed = JSON.parse(gh(["api", `repos/{owner}/{repo}/actions/artifacts?name=${name}&per_page=100`]));
  const artifact = newestArtifact(listed.artifacts ?? []);
  if (!artifact) {
    throw new Error(`no unexpired ${name}: run gh workflow run ${WORKFLOW} -f ref=${ref}, then fetch again`);
  }
  const out = process.env.RIKI_CORE_DIR || path.join(ROOT, "dist", "riki-core");
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  gh(["run", "download", String(artifact.workflow_run.id), "-n", name, "-D", out]);
  const wasm = path.join(out, "riki-core.wasm");
  const version = await checkFetched(await readFile(wasm), await readFile(`${wasm}.sha256`, "utf8"), own.rikiCore, ref);
  console.log(`riki-core.wasm ${version.version} (rikimaps ${ref.slice(0, 10)}) fetched into ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
