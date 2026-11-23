import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPT = path.join(process.cwd(), "scripts", "deploy-site.sh");
const PORT = 2121 + (process.pid % 200) * 25;
let work, root, server, ca;

/** A release's zip as pack-web lays it out, with the files named. */
function release(name, version, commit, assets, extra = {}, { core = true, glyphs = true } = {}) {
  const folder = path.join(work, name);
  mkdirSync(path.join(folder, "out", "_next", "static"), { recursive: true });
  writeFileSync(path.join(folder, "out", "index.html"), `<html>${version}</html>`);
  if (core) writeFileSync(path.join(folder, "out", "riki-core.wasm"), "\0asm");
  if (glyphs) {
    mkdirSync(path.join(folder, "out", "glyphs", "Noto Sans Regular"), { recursive: true });
    mkdirSync(path.join(folder, "out", "sprites"), { recursive: true });
    writeFileSync(path.join(folder, "out", "glyphs", "Noto Sans Regular", "0-255.pbf"), "pbf");
    writeFileSync(path.join(folder, "out", "sprites", "temaki-sprite.json"), "{}");
  }
  for (const asset of assets) writeFileSync(path.join(folder, "out", "_next", "static", asset), asset);
  writeFileSync(path.join(folder, "index.php"), "<?php // page");
  writeFileSync(path.join(folder, "Site.php"), "<?php // site");
  writeFileSync(path.join(folder, "Regions.php"), "<?php // regions");
  writeFileSync(path.join(folder, "config.example.php"), "<?php return [];");
  writeFileSync(path.join(folder, ".htaccess"), "RewriteEngine On\n");
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
    FTPS_PORT: String(PORT), FTPS_USER: "deploy", FTPS_PASSWORD: "s3cret", FTPS_DIR: "/editor", FTPS_CA_FILE: ca, FTPS_CERT_NAME: "",
    ICLOUD_API_TOKEN: "tok-123", ICLOUD_CONTAINER: "", REGIONS_CATALOG: "", ...env } });
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
  // 98 an unread stderr fills up and stops the server mid-deploy, which then hangs for minutes
  server = spawn("python3", [path.join(process.cwd(), "e2e", "ftps-server.py"), root, String(PORT), ca, key],
    { stdio: ["ignore", "pipe", "ignore"] });
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (data) => { if (String(data).includes("ready")) resolve(); });
    server.on("exit", (code) => reject(new Error(`the FTPS server stopped: ${code}`)));
  });
}, 30000);

afterAll(() => {
  server?.kill();
  rmSync(work, { recursive: true, force: true });
});

/** The config.php on the server, as PHP reads it. */
const configOnServer = () => JSON.parse(execFileSync("php", ["-r", "echo json_encode(require $argv[1]);",
  path.join(root, "editor", "config.php")], { encoding: "utf8" }));

// 49 the deploy: what a release's zip holds lands on the server over FTPS
describe("deploying the site over FTPS", () => {
  it("puts the release on the server", () => {
    const run = deploy(release("one", "0.1.1", "aaa111", ["a.js", "b.css"]));
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("deployed 0.1.1 (aaa111) to 127.0.0.1/editor");
    expect(JSON.parse(onServer("site.json"))).toEqual({ version: "0.1.1", commit: "aaa111" });
    expect(onServer("out/index.html")).toBe("<html>0.1.1</html>");
    expect(onServer("index.php")).toBe("<?php // page");
    expect(assetsOnServer()).toEqual(["a.js", "b.css"]);
  }, 60000);

  it("replaces the page and clears assets the new release no longer names", () => {
    const run = deploy(release("two", "0.1.2", "bbb222", ["b.css", "c.js"]));
    expect(run.status).toBe(0);
    expect(JSON.parse(onServer("site.json")).commit).toBe("bbb222");
    expect(onServer("out/index.html")).toBe("<html>0.1.2</html>");
    expect(assetsOnServer()).toEqual(["b.css", "c.js"]);
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
    expect(onServer("config.php")).toContain("tok-123");
    expect(JSON.parse(onServer("site.json")).commit).toBe("bbb222");
  }, 60000);

  // 110 a site without its glyphs and sprite draws no labels or icons, so a real deploy is refused too
  it("refuses a zip without the glyphs and the sprite, unless a test address says so", () => {
    const zip = release("glyphless", "0.1.10", "jjj000", ["k.js"], {}, { glyphs: false });
    const run = deploy(zip);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("no out/glyphs or out/sprites");
    expect(JSON.parse(onServer("site.json")).commit).toBe("bbb222");
    expect(deploy(zip, { RIKI_ALLOW_NO_CORE: "1" }).stderr).not.toContain("out/glyphs");
  }, 60000);

  it("puts the glyphs, a font stack's spaces kept, and the sprite on the server", () => {
    const run = deploy(release("glyphed", "0.1.11", "kkk111", ["l.js"]));
    expect(run.status).toBe(0);
    expect(onServer("out/glyphs/Noto Sans Regular/0-255.pbf")).toBe("pbf");
    expect(onServer("out/sprites/temaki-sprite.json")).toBe("{}");
  }, 60000);

  // 88 a site without the core cannot read maps, so a real deploy is refused before anything is sent
  it("refuses a zip without riki-core.wasm, and changes nothing", () => {
    const run = deploy(release("eight", "0.1.8", "hhh888", ["i.js"], {}, { core: false }));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("no out/riki-core.wasm");
    expect(existsSync(path.join(root, "editor", "out", "_next", "static", "i.js"))).toBe(false);
  }, 60000);

  it("lets a test address go without the core, when it says so", () => {
    const run = deploy(release("nine", "0.1.9", "iii999", ["j.js"], {}, { core: false }), { RIKI_ALLOW_NO_CORE: "1" });
    expect(run.stderr).not.toContain("riki-core.wasm");
  }, 60000);

  it("says which setting is missing", () => {
    const run = deploy(release("seven", "0.1.7", "ggg777", ["h.js"]), { FTPS_HOST: "" });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("FTPS_HOST");
    expect(existsSync(path.join(root, "editor", "out", "_next", "static", "h.js"))).toBe(false);
  }, 60000);
});

// 98 the deploy writes config.php from the repository's settings, so no step is left to do on the server
describe("the config.php the deploy writes", () => {
  const settingsTree = () => {
    expect(existsSync(path.join(root, "editor", "config.php.new"))).toBe(false);
  };

  // 147 a TILES_BASE left on the environment is not read: packages come from the catalog's addresses
  it("carries the token, the default container and production, and no tiles host", () => {
    const run = deploy(release("c1", "0.2.1", "c11111", ["k.js"]), { TILES_BASE: "https://tiles.example.com" });
    expect(run.stderr).toBe("");
    expect(configOnServer()).toEqual({ container: "iCloud.com.rikimaps.rikimaps.maps", apiToken: "tok-123",
      environment: "production" });
    expect(run.stdout + run.stderr).not.toContain("tok-123");
    settingsTree();
  }, 60000);

  it("replaces the one the server held, on every deploy", () => {
    const run = deploy(release("c2", "0.2.2", "c22222", ["k.js"]), { ICLOUD_API_TOKEN: "other-token", ICLOUD_CONTAINER: "iCloud.com.test.maps" });
    expect(run.status).toBe(0);
    expect(configOnServer()).toMatchObject({ apiToken: "other-token", container: "iCloud.com.test.maps" });
  }, 60000);

  // 112 the region catalog's address is written into config.php when set, and only as an https address
  it("writes the region catalog into the config when set, and leaves it out when not", () => {
    const run = deploy(release("r1", "0.2.20", "r11111", ["k.js"]), { REGIONS_CATALOG: "https://raw.example.com/x/maps.json" });
    expect(run.stderr).toBe("");
    expect(configOnServer()).toMatchObject({ regionsCatalog: "https://raw.example.com/x/maps.json" });
    expect(onServer("Regions.php")).toBe("<?php // regions");
    expect(deploy(release("r2", "0.2.21", "r22222", ["k.js"])).status).toBe(0);
    expect(configOnServer()).not.toHaveProperty("regionsCatalog");
  }, 120000);

  it("refuses a region catalog that is not an https address, before anything is sent", () => {
    for (const REGIONS_CATALOG of ["http://raw.example.com/maps.json", "raw.example.com/maps.json", "https://", "https://a.example/m.json?x=1", "https://a b.example"]) {
      const run = deploy(release("r3", "0.2.22", "r33333", ["never.js"]), { REGIONS_CATALOG });
      expect(run.status, REGIONS_CATALOG).not.toBe(0);
      expect(run.stderr).toContain("REGIONS_CATALOG");
    }
    expect(existsSync(path.join(root, "editor", "out", "_next", "static", "never.js"))).toBe(false);
  }, 120000);

  it("keeps a token with quotes, dollars, backslashes and a newline a plain string", () => {
    const token = "a'b\"c$d${e}\\f\\'g?>\n<?php die(); //";
    expect(deploy(release("c4", "0.2.4", "c44444", ["k.js"]), { ICLOUD_API_TOKEN: `  ${token}  ` }).status).toBe(0);
    const file = path.join(root, "editor", "config.php");
    expect(execFileSync("php", ["-l", file], { encoding: "utf8" })).toContain("No syntax errors");
    expect(configOnServer().apiToken).toBe(token);
    expect(execFileSync("php", ["-r", "var_dump(require $argv[1]);", file], { encoding: "utf8" })).toContain("array(3)");
    const served = execFileSync("php", ["-r", `require $argv[1]; echo Site::inFolder($argv[2])->answer("GET", "/config.json", "/index.php")->body;`,
      path.join(process.cwd(), "server", "Site.php"), path.join(root, "editor")], { encoding: "utf8" });
    expect(JSON.parse(served)).toMatchObject({ apiToken: token, environment: "production" });
  }, 60000);

  it("refuses an empty token, naming the variable, before anything is sent", () => {
    for (const ICLOUD_API_TOKEN of ["", "  \n"]) {
      const run = deploy(release("c5", "0.2.5", "c55555", ["never.js"]), { ICLOUD_API_TOKEN });
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain("ICLOUD_API_TOKEN");
    }
    expect(existsSync(path.join(root, "editor", "out", "_next", "static", "never.js"))).toBe(false);
    expect(configOnServer().apiToken).not.toBe("");
  }, 60000);

  it("refuses a container that is not one", () => {
    const run = deploy(release("c7", "0.2.7", "c77777", ["never.js"]), { ICLOUD_CONTAINER: "x'];//" });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("ICLOUD_CONTAINER");
    expect(existsSync(path.join(root, "editor", "out", "_next", "static", "never.js"))).toBe(false);
  }, 120000);

  it("sends the .htaccess too", () => {
    expect(deploy(release("c8", "0.2.8", "c88888", ["k.js"], { ".htaccess": "RewriteEngine On\n# 98\n" })).status).toBe(0);
    expect(onServer(".htaccess")).toContain("# 98");
  }, 60000);

  it("refuses a zip without the .htaccess", () => {
    const zip = release("c9", "0.2.9", "c99999", ["never.js"]);
    execFileSync("zip", ["-qd", zip, ".htaccess"]);
    writeFileSync(`${zip}.sha256`, `${execFileSync("sha256sum", [zip], { encoding: "utf8" }).split(" ")[0]}  c9.zip\n`);
    const run = deploy(zip);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(".htaccess");
  }, 60000);
});

// 121 bug: the host's shared certificate for *.r5.websupport.sk stopped every deploy
describe("deploying to a server whose certificate names other hosts", () => {
  let shared, sharedRoot;
  const SHARED = PORT + 13;

  beforeAll(async () => {
    sharedRoot = path.join(work, "shared-server");
    mkdirSync(path.join(sharedRoot, "editor"), { recursive: true });
    const cert = path.join(work, "shared.pem");
    const key = path.join(work, "shared.key");
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj",
      "/CN=*.r5.websupport.sk", "-addext", "subjectAltName=DNS:*.r5.websupport.sk", "-keyout", key, "-out", cert],
      { stdio: "ignore" });
    shared = spawn("python3", [path.join(process.cwd(), "e2e", "ftps-server.py"), sharedRoot, String(SHARED), cert,
      key], { stdio: ["ignore", "pipe", "ignore"] });
    await new Promise((resolve, reject) => {
      shared.stdout.on("data", (data) => { if (String(data).includes("ready")) resolve(); });
      shared.on("exit", (code) => reject(new Error(`the FTPS server stopped: ${code}`)));
    });
  }, 30000);

  afterAll(() => shared?.kill());

  const onShared = () => JSON.parse(readFileSync(path.join(sharedRoot, "editor", "site.json"), "utf8")).commit;
  const toShared = (env) => ({ FTPS_PORT: String(SHARED), FTPS_CA_FILE: path.join(work, "shared.pem"), ...env });

  // 121: lftp alone checks the certificate against FTPS_HOST, and refuses it
  it("refuses the certificate without FTPS_CERT_NAME", () => {
    const run = deploy(release("shared-a", "0.1.20", "sss120", ["s.js"]), toShared());
    expect(run.status).not.toBe(0);
    expect(existsSync(path.join(sharedRoot, "editor", "site.json"))).toBe(false);
  }, 60000);

  // 121: only the certificate's own name is accepted, not any trusted one
  it("refuses a certificate not issued for FTPS_CERT_NAME, and changes nothing", () => {
    const run = deploy(release("shared-b", "0.1.20", "sss120", ["s.js"]), toShared({ FTPS_CERT_NAME: "*.example" }));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("issued for *.r5.websupport.sk, not for FTPS_HOST or FTPS_CERT_NAME");
    expect(existsSync(path.join(sharedRoot, "editor", "site.json"))).toBe(false);
  }, 60000);

  // 121: a trusted certificate issued for FTPS_CERT_NAME takes the deploy
  it("deploys when the certificate is trusted and issued for FTPS_CERT_NAME", () => {
    const run = deploy(release("shared", "0.1.21", "sss121", ["s.js"]), toShared({ FTPS_CERT_NAME: "*.r5.websupport.sk" }));
    expect(run.status).toBe(0);
    expect(onShared()).toBe("sss121");
  }, 60000);
});
