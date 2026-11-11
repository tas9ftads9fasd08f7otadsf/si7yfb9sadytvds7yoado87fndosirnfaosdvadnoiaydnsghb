// The site as a deploy serves it: dist/web-site.zip unpacked, under `php -S`, at the root or a path.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const [, , port = "8801", under = ""] = process.argv;
const served = path.join(ROOT, "dist", `site-${port}`);
const folder = path.join(served, under);

rmSync(served, { recursive: true, force: true });
mkdirSync(folder, { recursive: true });
execFileSync("unzip", ["-q", path.join(ROOT, "dist", "web-site.zip"), "-d", folder]);
const php = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", served, path.join(folder, "index.php")], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => php.kill(signal));
php.on("exit", (code) => process.exit(code ?? 0));
