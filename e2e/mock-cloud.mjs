// CloudKit's web services as a browser test sees them: Playwright routes api.apple-cloudkit.com here and
// serves cloudkit.js from a stand-in. It holds a fixture account with its own and a shared map, and
// change tags a zone's token counts.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fakeCoreWasm } from "./fake-core.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CLOUDKIT_JS = "https://cdn.apple-cloudkit.com/ck/2/cloudkit.js";
export const API = "https://api.apple-cloudkit.com/";
export const CONTAINER = "iCloud.com.rikimaps.rikimaps.maps";
const ASSETS = "https://cvws.icloud-content.com/";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS" };
const reply = (route, status, body) => route.fulfill({ status, headers: CORS, contentType: "application/json",
  body: JSON.stringify(body) });

/** One account: each zone keeps a version, each record the version it last changed at. */
export async function loadAccount() {
  const fixture = JSON.parse(await readFile(path.join(HERE, "fixtures", "cloud-account.json"), "utf8"));
  const zones = [];
  for (const database of ["private", "shared"]) {
    for (const zone of fixture.zones[database]) {
      zones.push({ database, zoneID: zone.zoneID, version: 1,
        records: zone.records.map((record) => ({ ...structuredClone(record), changedAt: 1 })) });
    }
  }
  return { ...fixture, zones };
}

/**
 * Installs the mock on a page. `signedIn` starts the person signed in; the returned control changes what
 * the account holds and has the page told, as Apple's push would.
 */
export async function mockCloud(page, { signedIn = false, answers } = {}) {
  const account = await loadAccount();
  const asked = [];
  const wasm = fakeCoreWasm(answers ?? account.core);
  const standin = await readFile(path.join(HERE, "cloudkit-standin.js"), "utf8");

  if (signedIn) await page.addInitScript(() => { try { localStorage.setItem("mock-cloud-signed-in", "1"); } catch { /* */ } });

  await page.route(CLOUDKIT_JS, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: standin }));
  await page.route("**/riki-core.wasm", (route) => route.fulfill({ status: 200, contentType: "application/wasm",
    body: Buffer.from(wasm) }));
  await page.route(`${ASSETS}**`, (route) => {
    const text = account.assets[route.request().url()];
    return text === undefined ? route.fulfill({ status: 404, headers: CORS }) : route.fulfill({ status: 200, headers: CORS, body: text });
  });
  await page.route(`${API}**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    const [, , , , , database, ...rest] = url.pathname.split("/");
    const endpoint = rest.join("/");
    const body = request.postData() ? JSON.parse(request.postData()) : {};
    asked.push({ database, endpoint, body, token: url.searchParams.get("ckAPIToken") });
    if (request.headers()["x-mock-signed-in"] !== "1") {
      return reply(route, 421, { serverErrorCode: "AUTHENTICATION_REQUIRED", reason: "Sign in" });
    }
    if (endpoint === "users/caller") return reply(route, 200, account.person);
    if (endpoint === "zones/list") {
      return reply(route, 200, { zones: account.zones.filter((zone) => zone.database === "shared" && database === "shared")
        .map(({ zoneID }) => ({ zoneID })) });
    }
    if (endpoint === "changes/zone") {
      const answered = body.zones.map(({ zoneID, syncToken }) => {
        const zone = account.zones.find((each) => each.database === database && each.zoneID.zoneName === zoneID.zoneName);
        if (!zone) return { zoneID, serverErrorCode: "ZONE_NOT_FOUND", reason: "no such zone" };
        const since = Number(String(syncToken ?? "").split("-").pop()) || 0;
        const records = zone.records.filter((record) => record.changedAt > since)
          .map((record) => ({ ...record, changedAt: undefined, zoneID }));
        return { zoneID, records, syncToken: `${database}-${zone.version}`, moreComing: false };
      });
      return reply(route, 200, { zones: answered });
    }
    return reply(route, 404, { serverErrorCode: "NOT_FOUND", reason: endpoint });
  });

  const find = (name) => account.zones.flatMap((zone) => zone.records.map((record) => ({ zone, record })))
    .find(({ record }) => record.recordName === name);
  return {
    asked,
    /** The record changes as another device would write it, under a new change tag. */
    change(recordName, fields) {
      const { zone, record } = find(recordName);
      zone.version += 1;
      record.changedAt = zone.version;
      record.recordChangeTag = `${record.recordChangeTag}x${zone.version}`;
      Object.assign(record.fields, fields);
    },
    /** What Apple's push does: the page is told, and reads again. */
    push: () => page.evaluate(() => window.__mockCloudPush()),
    tag: (recordName) => find(recordName).record.recordChangeTag
  };
}
