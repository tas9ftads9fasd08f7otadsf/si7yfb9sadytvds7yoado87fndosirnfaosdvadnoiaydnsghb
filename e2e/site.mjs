// The site as a deploy serves it: dist/web-site.zip unpacked, under `php -S`, at the root or a path.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startRegionHost } from "./regions-host.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const [, , port = "8801", under = ""] = process.argv;
const served = path.join(ROOT, "dist", `site-${port}`);
const folder = path.join(served, under);

rmSync(served, { recursive: true, force: true });
mkdirSync(folder, { recursive: true });
execFileSync("unzip", ["-q", path.join(ROOT, "dist", "web-site.zip"), "-d", folder]);
// The deploy's own file, with a token the mock CloudKit takes.
// 112 The site's server fetches region packages from a stand-in host beside it, which the specs read through its port + 10.
const hostPort = Number(port) + 10;
startRegionHost(hostPort);
const config = { container: "iCloud.com.rikimaps.rikimaps.maps", apiToken: "test-token", environment: "development",
  tilesBase: "https://tiles.example", regionsCatalog: `http://127.0.0.1:${hostPort}/maps.json`,
  regionsFiles: `http://127.0.0.1:${hostPort}/download?id={id}` };
writeFileSync(path.join(folder, "config.php"), `<?php return json_decode('${JSON.stringify(config)}', true);\n`);
const php = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", served, path.join(folder, "index.php")], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => php.kill(signal));
php.on("exit", (code) => process.exit(code ?? 0));
