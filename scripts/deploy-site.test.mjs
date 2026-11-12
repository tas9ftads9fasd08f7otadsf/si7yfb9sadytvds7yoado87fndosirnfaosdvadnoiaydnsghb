import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPT = path.join(process.cwd(), "scripts", "deploy-site.sh");
const PORT = 2121 + (process.pid % 200) * 25;
let work, root, server, ca;

/** A release's zip as pack-web lays it out, with the files named. */
function release(name, version, commit, assets, extra = {}) {
  const folder = path.join(work, name);
  mkdirSync(path.join(folder, "out", "_next", "static"), { recursive: true });
  writeFileSync(path.join(folder, "out", "index.html"), `<html>${version}</html>`);
  for (const asset of assets) writeFileSync(path.join(folder, "out", "_next", "static", asset), asset);
  writeFileSync(path.join(folder, "index.php"), "<?php // page");
  writeFileSync(path.join(folder, "Site.php"), "<?php // site");
  writeFileSync(path.join(folder, "config.example.php"), "<?php return [];");
  writeFileSync(path.join(folder, "site.json"), JSON.stringify({ version, commit }));
  for (const [file, text] of Object.entries(extra)) writeFileSync(path.join(folder, file), text);
  const zip = path.join(work, `${name}.zip`);
  execFileSync("zip", ["-qrX", zip, "."], { cwd: folder });
  const sum = execFileSync("sha256sum", [zip], { encoding: "utf8" }).split(" ")[0];
  writeFileSync(`${zip}.sha256`, `${sum}  ${name}.zip\n`);
  return zip;
}

function deploy(zip, env = {}) {
  return spawnSync("bash", [SCRIPT, zip], { encoding: "utf8", env: { ...process.env, FTPS_HOST: "127.0.0.1",
    FTPS_PORT: String(PORT), FTPS_USER: "deploy", FTPS_PASSWORD: "s3cret", FTPS_DIR: "/editor", FTPS_CA_FILE: ca, ...env } });
}

const onServer = (file) => readFileSync(path.join(root, "editor", file), "utf8");
const assetsOnServer = () => readdirSync(path.join(root, "editor", "out", "_next", "static")).sort();

beforeAll(async () => {
  work = mkdtempSync(path.join(tmpdir(), "deploy-"));
  root = path.join(work, "server");
  mkdirSync(path.join(root, "editor"), { recursive: true });
  writeFileSync(path.join(root, "editor", "config.php"), "<?php return ['apiToken' => 'kept'];");
  ca = path.join(work, "cert.pem");
  const key = path.join(work, "key.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
    "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", key, "-out", ca], { stdio: "ignore" });
  server = spawn("python3", [path.join(process.cwd(), "e2e", "ftps-server.py"), root, String(PORT), ca, key]);
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (data) => { if (String(data).includes("ready")) resolve(); });
    server.on("exit", (code) => reject(new Error(`the FTPS server stopped: ${code}`)));
  });
}, 30000);

afterAll(() => {
  server?.kill();
  rmSync(work, { recursive: true, force: true });
});

// 49 the deploy: what a release's zip holds lands on the server over FTPS, and config.php stays
describe("deploying the site over FTPS", () => {
  it("puts the release on the server and keeps the server's config.php", () => {
    const run = deploy(release("one", "0.1.1", "aaa111", ["a.js", "b.css"]));
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("deployed 0.1.1 (aaa111) to 127.0.0.1/editor");
    expect(JSON.parse(onServer("site.json"))).toEqual({ version: "0.1.1", commit: "aaa111" });
    expect(onServer("out/index.html")).toBe("<html>0.1.1</html>");
    expect(onServer("index.php")).toBe("<?php // page");
    expect(assetsOnServer()).toEqual(["a.js", "b.css"]);
    expect(onServer("config.php")).toBe("<?php return ['apiToken' => 'kept'];");
  }, 60000);

  it("replaces the page and clears assets the new release no longer names", () => {
    const run = deploy(release("two", "0.1.2", "bbb222", ["b.css", "c.js"]));
    expect(run.status).toBe(0);
    expect(JSON.parse(onServer("site.json")).commit).toBe("bbb222");
    expect(onServer("out/index.html")).toBe("<html>0.1.2</html>");
    expect(assetsOnServer()).toEqual(["b.css", "c.js"]);
    expect(onServer("config.php")).toBe("<?php return ['apiToken' => 'kept'];");
  }, 60000);

  it("refuses a server whose certificate it cannot trust, and changes nothing", () => {
    const run = deploy(release("three", "0.1.3", "ccc333", ["d.js"]), { FTPS_CA_FILE: "" });
    expect(run.status).not.toBe(0);
    expect(JSON.parse(onServer("site.json")).commit).toBe("bbb222");
  }, 60000);

  it("refuses a wrong password, and never shows it", () => {
    const run = deploy(release("four", "0.1.4", "ddd444", ["e.js"]), { FTPS_PASSWORD: "wrong-pass-77" });
    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).not.toContain("wrong-pass-77");
    expect(JSON.parse(onServer("site.json")).commit).toBe("bbb222");
  }, 60000);

  it("refuses a zip that does not match its checksum", () => {
    const zip = release("five", "0.1.5", "eee555", ["f.js"]);
    writeFileSync(`${zip}.sha256`, `${"0".repeat(64)}  five.zip\n`);
    const run = deploy(zip);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("does not match");
    expect(JSON.parse(onServer("site.json")).commit).toBe("bbb222");
  }, 60000);

  it("refuses a zip that carries a config.php of its own", () => {
    const run = deploy(release("six", "0.1.6", "fff666", ["g.js"], { "config.php": "<?php return [];" }));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("config.php");
    expect(onServer("config.php")).toBe("<?php return ['apiToken' => 'kept'];");
  }, 60000);

  it("says which setting is missing", () => {
    const run = deploy(release("seven", "0.1.7", "ggg777", ["h.js"]), { FTPS_HOST: "" });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("FTPS_HOST");
    expect(existsSync(path.join(root, "editor", "out", "_next", "static", "h.js"))).toBe(false);
  }, 60000);
});
