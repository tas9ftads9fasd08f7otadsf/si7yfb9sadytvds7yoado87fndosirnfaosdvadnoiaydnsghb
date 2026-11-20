import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPT = path.join(process.cwd(), "scripts", "check-server.sh");
const PORT = 4121 + (process.pid % 200) * 25;
const STRANGER = PORT + 500;
const CLOSED = PORT + 900;
const SITE = PORT + 950;
const siteURL = `http://127.0.0.1:${SITE}`;
let work, root, servers = [];

/** A self-signed certificate for these subject names, good for so many days. */
function certificate(name, subject, days) {
  const cert = path.join(work, `${name}.pem`);
  const key = path.join(work, `${name}.key`);
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", String(days),
    "-subj", `/CN=${subject.split(",")[0].split(":")[1]}`, "-addext", `subjectAltName=${subject}`,
    "-keyout", key, "-out", cert], { stdio: "ignore" });
  return { cert, key };
}

/** A server in a process of its own: spawnSync holds this one's event loop while a check runs. */
async function serve(args, ready) {
  const server = spawn("python3", args, { stdio: ["ignore", "pipe", "pipe"] });
  servers.push(server);
  await new Promise((resolve, reject) => {
    const seen = (data) => { if (String(data).includes(ready)) resolve(); };
    server.stdout.on("data", seen);
    server.stderr.on("data", seen);
    server.on("exit", (code) => reject(new Error(`${args[0]} stopped: ${code}`)));
  });
}

const ftps = (port, { cert, key }) =>
  serve([path.join(process.cwd(), "e2e", "ftps-server.py"), root, String(port), cert, key], "ready");

let trusted;
function check(env = {}) {
  const run = spawnSync("bash", [SCRIPT], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "",
    FTPS_HOST: "127.0.0.1", FTPS_PORT: String(PORT), FTPS_USER: "deploy", FTPS_PASSWORD: "s3cret",
    FTPS_DIR: "/editor", FTPS_CA_FILE: trusted.cert, FTPS_CERT_NAME: "", SITE_URL: "", NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1",
    ...env } });
  return { ...run, lines: run.stdout.trim().split("\n") };
}

beforeAll(async () => {
  work = mkdtempSync(path.join(tmpdir(), "check-server-"));
  root = path.join(work, "server");
  mkdirSync(path.join(root, "editor"), { recursive: true });
  trusted = certificate("trusted", "IP:127.0.0.1", 365);
  await ftps(PORT, trusted);
  await ftps(STRANGER, certificate("stranger", "DNS:ftp.other.example,DNS:*.other.example", 365));
  const pages = path.join(work, "pages");
  mkdirSync(path.join(pages, "editor"), { recursive: true });
  writeFileSync(path.join(pages, "editor", "site.json"), JSON.stringify({ version: "0.1.5", commit: "abc123" }));
  mkdirSync(path.join(pages, "other"));
  writeFileSync(path.join(pages, "other", "site.json"), JSON.stringify({ name: "another app" }));
  await serve(["-u", "-m", "http.server", String(SITE), "--bind", "127.0.0.1", "--directory", pages], "Serving");
}, 30000);

afterAll(() => {
  for (const server of servers) server.kill();
  rmSync(work, { recursive: true, force: true });
});

// 120 the server's connection is checked layer by layer, as the deploy connects
describe("checking the site's server", () => {
  it("passes every layer of a server the deploy can reach, and leaves nothing behind", () => {
    const run = check({ SITE_URL: `${siteURL}/editor/` });
    expect(run.status).toBe(0);
    expect(run.lines).toEqual([
      "ok    name: FTPS_HOST is an address, nothing to look up",
      `ok    port: ${PORT} answers`,
      "ok    certificate: issued for FTPS_HOST (127.0.0.1)",
      "ok    certificate: signed by a trusted authority",
      expect.stringMatching(/^ok {4}certificate: valid until /),
      "ok    login: FTPS_USER logs in, and writes and removes a file in /editor",
      `ok    site: ${siteURL}/editor serves 0.1.5 (abc123)`,
    ]);
    expect(existsSync(path.join(root, "editor", ".riki-connection-check"))).toBe(false);
  });

  // 121 bug: the host's shared certificate for *.r5.websupport.sk failed the check and the deploy
  it("accepts a trusted certificate issued for FTPS_CERT_NAME, and logs in", () => {
    const run = check({ FTPS_PORT: String(STRANGER), FTPS_CA_FILE: path.join(work, "stranger.pem"),
      FTPS_CERT_NAME: "*.other.example" });
    expect(run.status).toBe(0);
    expect(run.lines).toContain("ok    certificate: issued for FTPS_CERT_NAME (ftp.other.example *.other.example)");
    expect(run.lines).toContain("ok    login: FTPS_USER logs in, and writes and removes a file in /editor");
  });

  // 121: a certificate for neither FTPS_HOST nor FTPS_CERT_NAME fails, named, and skips the login
  it("names the certificate's own names when neither name is among them, and skips the login", () => {
    const run = check({ FTPS_PORT: String(STRANGER), FTPS_CA_FILE: path.join(work, "stranger.pem"),
      FTPS_CERT_NAME: "*.r5.websupport.sk" });
    expect(run.status).toBe(1);
    expect(run.lines).toContain("FAIL  certificate: issued for ftp.other.example *.other.example, not for "
      + "FTPS_HOST or FTPS_CERT_NAME; set one to one of those names");
    expect(run.lines).toContain(
      "skip  login: the deploy verifies the certificate, so it cannot log in until that is fixed");
  });

  // 120: a certificate no authority vouches for fails as the deploy's verification would
  it("refuses a certificate it cannot trust", () => {
    const run = check({ FTPS_CA_FILE: "", SSL_CERT_FILE: path.join(work, "stranger.pem") });
    expect(run.status).toBe(1);
    expect(run.lines.some((line) => line.startsWith("FAIL  certificate: not trusted ("))).toBe(true);
  });

  // 120: a certificate close to its end warns without failing
  it("warns of a certificate expiring within 14 days", async () => {
    const port = PORT + 700;
    const soon = certificate("soon", "IP:127.0.0.1", 3);
    await ftps(port, soon);
    const run = check({ FTPS_PORT: String(port), FTPS_CA_FILE: soon.cert });
    expect(run.status).toBe(0);
    expect(run.lines.some((line) => /^warn {2}certificate: expires within 14 days, on /.test(line))).toBe(true);
  });

  // 126: a refused login says the server refused the account, not that a folder may be missing
  it("fails the login with a wrong password, saying the server refused it", () => {
    const run = check({ FTPS_PASSWORD: "wrong-pass" });
    expect(run.status).toBe(1);
    const login = run.lines.find((line) => line.startsWith("FAIL  login: "));
    expect(login).toMatch(/^FAIL {2}login: the server refused FTPS_USER and FTPS_PASSWORD \(.*530.*\); set both as/);
    expect(run.stdout).not.toContain("wrong-pass");
  });

  // 126: a folder that is not there fails after a login that worked
  it("fails when FTPS_DIR does not exist, after logging in", () => {
    const run = check({ FTPS_DIR: "/missing" });
    expect(run.status).toBe(1);
    expect(run.lines).toContain("ok    login: FTPS_USER logs in");
    expect(run.lines.some((line) => /^FAIL {2}folder: \/missing cannot be opened \(.*550/.test(line))).toBe(true);
  });

  // 126: an account that may not write fails at the write, after the login and the folder
  it("fails when FTPS_USER may not write in FTPS_DIR", () => {
    const run = check({ FTPS_USER: "reader" });
    expect(run.status).toBe(1);
    expect(run.lines).toContain("ok    login: FTPS_USER logs in, and opens /editor");
    expect(run.lines.some((line) => /^FAIL {2}write: .*; FTPS_USER may not write in \/editor$/.test(line))).toBe(true);
  });

  // 120: a closed port and an unknown name stop the check where they are found
  it("stops at a port nothing answers on", () => {
    const run = check({ FTPS_PORT: String(CLOSED) });
    expect(run.status).toBe(1);
    expect(run.lines.at(-1)).toBe(
      `FAIL  port: nothing answers on ${CLOSED} within 10 s; check FTPS_PORT, or the host's firewall`);
  });

  it("stops at a host name that does not resolve", () => {
    const run = check({ FTPS_HOST: "no-such-host.invalid" });
    expect(run.status).toBe(1);
    expect(run.lines).toEqual(["FAIL  name: FTPS_HOST does not resolve; check the secret for a typo"]);
  });

  // 126: a site that does not serve its site.json yet warns, its status said, and the check passes
  it("warns of a site address that does not serve site.json, with its status", () => {
    const run = check({ SITE_URL: `${siteURL}/elsewhere` });
    expect(run.status).toBe(0);
    expect(run.lines.at(-1)).toBe(`warn  site: ${siteURL}/elsewhere/site.json answers 404; `
      + "no release is deployed there, or SITE_URL is not the site");
  });

  // 126 bug: SITE_URL set to maps.example without its scheme failed as "not the site's"
  it("warns of a site address without its scheme", () => {
    const run = check({ SITE_URL: "maps.example" });
    expect(run.status).toBe(0);
    expect(run.lines.at(-1)).toBe("warn  site: SITE_URL (maps.example) has no scheme; set it to https://maps.example");
  });

  // 126: a page that is not the site's site.json says what it is instead
  it("warns of what answers in place of the site's site.json", () => {
    const run = check({ SITE_URL: `${siteURL}/other` });
    expect(run.status).toBe(0);
    expect(run.lines.at(-1)).toBe(`warn  site: ${siteURL}/other/site.json answers 200 application/json, `
      + "not the site's site.json; is SITE_URL the site's address?");
  });

  // 120: GitHub's annotations carry the failures, so a run's summary names them
  it("annotates a failure for GitHub Actions", () => {
    const run = check({ FTPS_PASSWORD: "wrong-pass", GITHUB_ACTIONS: "true" });
    expect(run.lines.some((line) => line.startsWith("::error::login: "))).toBe(true);
  });
});
