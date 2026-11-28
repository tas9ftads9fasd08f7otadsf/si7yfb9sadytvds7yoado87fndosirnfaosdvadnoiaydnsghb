// Builds riki-core.wasm, the module the site loads, from the rikimaps commit package.json pins (rikiCore.ref):
// the documented swift build, wasm-opt -Oz, a load as the site does it, and dist/riki-core/ with the module, its
// .sha256 and its size. The contract is tools/linux-core/wasm/README.md in rikimaps.
//
//     RIKIMAPS_DIR=/path/to/rikimaps npm run build:core     # a checkout at rikiCore.ref; nothing is written in it
//     RIKI_CORE_REF=<sha> npm run build:core               # try a commit before it is pinned
//     SWIFT=/path/to/swift                                  # else swift on PATH, else the cache this script fills
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";
import { WASI } from "@bjorn3/browser_wasi_shim";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** What rikimaps' tools/linux-core/wasm/README.md says to build with and to expect. */
export const CONTRACT = {
  package: "tools/linux-core/wasm",
  product: "riki-core",
  toolchain: {
    release: "swift-6.2-RELEASE",
    url: "https://download.swift.org/swift-6.2-release/ubuntu2404/swift-6.2-RELEASE/swift-6.2-RELEASE-ubuntu24.04.tar.gz",
    sha256: "8e3d63a3371caad495e694414b9b9a22c5f68c6473077406c7296472a41bc077",
  },
  sdk: {
    id: "swift-6.2-RELEASE_wasm",
    url: "https://download.swift.org/swift-6.2-release/wasm-sdk/swift-6.2-RELEASE/swift-6.2-RELEASE_wasm.artifactbundle.tar.gz",
    sha256: "fe4e8648309fce86ea522e9e0d1dc48e82df6ba6e5743dbf0c53db8429fb5224",
  },
  calls: [
    "riki_maps",
    "riki_map",
    "riki_apply",
    "riki_style",
    "riki_changes",
    "riki_read_address",
    "riki_add_layer",
    "riki_people",
    "riki_switches",
    "riki_export",
    "riki_duplicate",
    "riki_shelve",
    "riki_delete",
    "riki_new_map",
    "riki_import",
    "riki_packages",
    "riki_copies",
    "riki_esri_services",
    "riki_road_signs",
    "riki_read_tiles",
    "riki_layer_options",
  ],
  exports: ["memory", "riki_alloc", "riki_free", "riki_version"],
};

const SEMVER = /^\d+\.\d+\.\d+$/;

// swiftc hashes each object's IR, which names the object's path, into the module: the scratch is never moved.
export const SCRATCH = "/tmp/riki-core-build";

/** The arguments of the documented swift build, plus what makes its bytes the same at any checkout path. */
export function swiftBuildArgs(dir, scratch = SCRATCH) {
  return [
    "build",
    "--swift-sdk",
    CONTRACT.sdk.id,
    "-c",
    "release",
    "--product",
    CONTRACT.product,
    "--scratch-path",
    path.join(scratch, "build"),
    "-debug-info-format",
    "none",
    "-Xswiftc",
    "-file-prefix-map",
    "-Xswiftc",
    `${dir}=/rikimaps`,
    // 178 each object kept its IR's hash, which came out two ways, in the module's data
    "-Xswiftc",
    "-Xfrontend",
    "-Xswiftc",
    "-disable-incremental-llvm-codegen",
  ];
}

export const sha256Of = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** 156 Brotli bytes the module may weigh: 3.5 MB without ICU's data, 12.2 MB with it. */
export const SIZE_BUDGET = 5_000_000;

/** 156 Fails a module heavier than the budget, as one that links ICU's language data again is. */
export function verifySize(size, budget = SIZE_BUDGET) {
  if (size.brotli > budget) {
    throw new Error(
      `riki-core.wasm is ${size.brotli} bytes brotli, over the budget of ${budget}: ` +
        "rikimaps' tools/linux-core/wasm/README.md says what the module may not carry, ICU's data first",
    );
  }
}

/** Raw and brotli sizes, the second as a server sends the module. */
export function sizes(bytes) {
  const brotli = brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  return { raw: bytes.length, brotli };
}

/** The pin from package.json: the rikimaps commit to build, and the checksum its module is expected to have. */
export function readPin(pin) {
  return { ref: pin?.ref || null, sha256: pin?.sha256 || null };
}

/** The pin to build: package.json's, or another commit, which has no sum to be held to. */
export function pinFor(pinned, asked) {
  const pin = readPin(pinned);
  if (!asked || (pin.ref && (pin.ref.startsWith(asked) || asked.startsWith(pin.ref)))) return pin;
  return { ref: asked, sha256: null };
}

/** Whether the rikimaps checkout is at the pinned commit; an export without git cannot say. */
export function checkoutProblem(
  dir,
  ref,
  git = (args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim(),
) {
  if (!existsSync(path.join(dir, CONTRACT.package, "Package.swift"))) {
    return `${dir} has no ${CONTRACT.package}/Package.swift: it is not a rikimaps checkout with the core`;
  }
  if (!existsSync(path.join(dir, ".git"))) return null;
  const head = git(["rev-parse", "HEAD"]);
  return head.startsWith(ref) || ref.startsWith(head) ? null : `${dir} is at ${head}, but rikiCore.ref pins ${ref}`;
}

/** A downloaded file's checksum against the contract's; the failure names both. */
export function verifySum(bytes, wanted, what) {
  const got = sha256Of(bytes);
  if (got !== wanted) throw new Error(`${what} is ${got}, but its pinned sha256 is ${wanted}`);
}

/** The module's own checksum against the pin: a build that is not the pinned one is not shipped. */
export function verifyPinned(got, pinned) {
  if (pinned && got !== pinned) {
    throw new Error(
      `riki-core.wasm built to ${got}, but rikiCore.sha256 in package.json is ${pinned}: bump the pin if the commit changed`,
    );
  }
}

/**
 * Loads the module as the site's core.ts does and calls it. Throws what is wrong; answers what `riki_version` says.
 * A call whose rules are not in yet must answer coreNotReady, not nothing.
 * A ready `riki_maps` must answer a maps list.
 */
export async function smoke(bytes) {
  // 155 its name as argv[0], as core.ts gives it
  const wasi = new WASI(["riki-core"], [], []);
  const { instance } = await WebAssembly.instantiate(bytes, { wasi_snapshot_preview1: wasi.wasiImport });
  const e = instance.exports;
  if (e._initialize) wasi.initialize(instance);
  for (const name of [...CONTRACT.exports, ...CONTRACT.calls]) {
    if (!(name in e)) throw new Error(`the module does not export ${name}`);
  }
  const decoder = new TextDecoder();
  const read = (pointer) => {
    const length = new DataView(e.memory.buffer).getUint32(pointer, true);
    const text = decoder.decode(new Uint8Array(e.memory.buffer, pointer + 4, length));
    e.riki_free(pointer, length + 4);
    return JSON.parse(text);
  };
  const call = (name, request) => {
    const given = new TextEncoder().encode(JSON.stringify(request));
    const input = e.riki_alloc(given.length);
    new Uint8Array(e.memory.buffer, input, given.length).set(given);
    const answer = read(e[name](input, given.length));
    e.riki_free(input, given.length);
    return answer;
  };
  const version = read(e.riki_version());
  if (!SEMVER.test(String(version.version))) throw new Error(`riki_version says ${JSON.stringify(version)}`);
  if (JSON.stringify(version.calls) !== JSON.stringify(CONTRACT.calls))
    throw new Error(`it lists the calls ${version.calls}`);
  // 155 a call said to be ready answers for real
  if ((version.ready ?? []).includes("riki_maps") && !Array.isArray(call("riki_maps", { rows: [] }).maps)) {
    throw new Error("riki_maps is listed as ready but lists no maps");
  }
  for (const name of CONTRACT.calls) {
    if ((version.ready ?? []).includes(name)) continue;
    const answer = call(name, { rows: [], id: "m" });
    if (answer.refused !== "coreNotReady")
      throw new Error(`${name} answered ${JSON.stringify(answer)} where its rules are not in yet`);
  }
  return version;
}

function find(command, args = ["--version"]) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return command;
  } catch {
    return null;
  }
}

/** Swift 6.2's own `swift`: SWIFT, else the cache, which a missing toolchain is downloaded into. */
async function toolchain(download) {
  if (process.env.SWIFT) return process.env.SWIFT;
  const cache = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "riki-swift");
  const swift = path.join(cache, `${CONTRACT.toolchain.release}-ubuntu24.04`, "usr", "bin", "swift");
  if (existsSync(swift)) return swift;
  console.log(`fetching ${CONTRACT.toolchain.release} into ${cache}`);
  await mkdir(cache, { recursive: true });
  const file = path.join(cache, "toolchain.tar.gz");
  await download(CONTRACT.toolchain.url, file, CONTRACT.toolchain.sha256);
  execFileSync("tar", ["xzf", file, "-C", cache]);
  await rm(file);
  return swift;
}

async function download(url, file, wanted) {
  const answer = await fetch(url);
  if (!answer.ok) throw new Error(`${url} answered ${answer.status}`);
  const bytes = Buffer.from(await answer.arrayBuffer());
  verifySum(bytes, wanted, url);
  await writeFile(file, bytes);
}

async function installSdk(swift, scratch) {
  const listed = execFileSync(swift, ["sdk", "list"], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim());
  if (listed.includes(CONTRACT.sdk.id)) return;
  console.log(`installing ${CONTRACT.sdk.id}`);
  const file = path.join(scratch, "sdk.tar.gz");
  await mkdir(scratch, { recursive: true });
  await download(CONTRACT.sdk.url, file, CONTRACT.sdk.sha256);
  execFileSync(swift, ["sdk", "install", file, "--checksum", CONTRACT.sdk.sha256], { stdio: "inherit" });
  await rm(file);
}

/** The objects the link took, in its order. */
async function linked(release) {
  return (await readFile(path.join(release, `${CONTRACT.product}.product`, "Objects.LinkFileList"), "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((file) => file.replace(/^'|'$/g, ""));
}

/** 178 Each object the link took, in its order, with its sum: two builds that differ say where. */
async function objectSums(release) {
  const lines = await Promise.all(
    (await linked(release)).map(async (file) => `${sha256Of(await readFile(file))}  ${path.relative(release, file)}`),
  );
  return `${lines.join("\n")}\n`;
}

/** 178 The objects themselves, for two builds' differing one to be compared byte by byte. */
async function keepObjects(release, into) {
  for (const file of await linked(release)) {
    const kept = path.join(into, path.relative(release, file));
    await mkdir(path.dirname(kept), { recursive: true });
    await writeFile(kept, await readFile(file));
  }
}

export async function build({ dir, pin, out, env = process.env }) {
  const problem = checkoutProblem(dir, pin.ref);
  if (problem) throw new Error(problem);
  const scratch = SCRATCH;
  await rm(scratch, { recursive: true, force: true });
  const swift = await toolchain(download);
  await installSdk(swift, scratch);
  const cwd = path.join(dir, CONTRACT.package);
  // Nothing is written in the checkout: SwiftPM's scratch is ours.
  execFileSync(swift, swiftBuildArgs(dir, scratch), {
    cwd,
    stdio: "inherit",
    env: { ...env, PATH: `${path.dirname(swift)}:${env.PATH}` },
  });
  const built = path.join(scratch, "build", "wasm32-unknown-wasip1", "release", `${CONTRACT.product}.wasm`);
  const opt = path.join(ROOT, "node_modules", ".bin", "wasm-opt");
  if (!existsSync(opt)) throw new Error("wasm-opt is not installed: run npm ci");
  const wasm = path.join(out, "riki-core.wasm");
  execFileSync(opt, ["-Oz", "--strip-debug", "--strip-producers", "--all-features", built, "-o", wasm], {
    stdio: "inherit",
  });
  await writeFile(path.join(out, "objects.sha256"), await objectSums(path.dirname(built)));
  if (env.RIKI_CORE_OBJECTS) await keepObjects(path.dirname(built), env.RIKI_CORE_OBJECTS);
  const bytes = await readFile(wasm);
  const sum = sha256Of(bytes);
  console.log(`${os.cpus().length} cores; before wasm-opt sha256 ${sha256Of(await readFile(built))}, after ${sum}`);
  const version = await smoke(bytes);
  verifyPinned(sum, pin.sha256);
  const size = { ...sizes(bytes), unoptimised: (await readFile(built)).length };
  verifySize(size);
  await writeFile(`${wasm}.sha256`, `${sum}  riki-core.wasm\n`);
  await writeFile(
    path.join(out, "riki-core.size.json"),
    `${JSON.stringify({ version: version.version, ready: version.ready ?? [], ...size }, null, 2)}\n`,
  );
  await rm(scratch, { recursive: true, force: true });
  return { sum, size, version };
}

async function main() {
  const own = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const pin = pinFor(own.rikiCore, process.env.RIKI_CORE_REF);
  if (!pin.ref) {
    console.warn("riki-core.wasm is not built: rikiCore.ref in package.json pins no rikimaps commit yet");
    return;
  }
  const dir = process.env.RIKIMAPS_DIR;
  if (!dir)
    throw new Error(
      "RIKIMAPS_DIR is not set: point it at a rikimaps checkout at rikiCore.ref (read only; nothing is written in it)",
    );
  if (!find("tar")) throw new Error("tar is not installed");
  const out = process.env.RIKI_CORE_DIR || path.join(ROOT, "dist", "riki-core");
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const { sum, size, version } = await build({ dir, pin, out });
  console.log(
    `riki-core.wasm ${version.version} (rikimaps ${pin.ref.slice(0, 10)}): ${size.raw} bytes, ${size.brotli} brotli, ` +
      `${size.unoptimised} before wasm-opt; sha256 ${sum}`,
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(
      process.env.GITHUB_STEP_SUMMARY,
      `### riki-core.wasm ${version.version}\n\n| raw | brotli |\n|---|---|\n| ${size.raw} bytes | ${size.brotli} bytes |\n\nsha256: \`${sum}\`\n`,
      { flag: "a" },
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
