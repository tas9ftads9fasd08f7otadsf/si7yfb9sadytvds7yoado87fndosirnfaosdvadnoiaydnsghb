// CloudKit's web services as a browser test sees them: Playwright routes api.apple-cloudkit.com here and
// serves cloudkit.js from a stand-in. It holds a fixture account with its own and a shared map, and
// change tags a zone's token counts; it answers record modifies with conflicts.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { schemaRefusal } from "./deployed-schema.mjs";
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
export async function mockCloud(page, { signedIn = false, answers, refusesToken = false } = {}) {
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
  let conflicts = 0;
  let expired = 0;
  const subscriptions = new Set();
  const gone = new Set();
  const badRequest = (reason) => Object.assign(new Error(reason), { serverErrorCode: "BAD_REQUEST", reason });

  /** One atomic modify: a stale change tag is a CONFLICT, and then nothing is applied. */
  function modify(database, { zoneID, operations }) {
    // The library puts the zone at the top of the request only.
    if (operations.some(({ record }) => record.zoneID)) throw badRequest("A record carries its own zoneID");
    const zone = account.zones.find((each) => each.database === database && each.zoneID.zoneName === zoneID.zoneName);
    const bump = (record) => { zone.version += 1; record.changedAt = zone.version; };
    if (conflicts > 0) {
      conflicts -= 1;
      // Another device wrote first: the row the page holds is now an older version.
      const target = zone.records.find((each) => each.recordName === operations[0]?.record.recordName);
      if (target) { bump(target); target.recordChangeTag = `${target.recordChangeTag}x${zone.version}`; }
    }
    const errors = operations.map(({ operationType, record }) => {
      const held = zone.records.find((each) => each.recordName === record.recordName);
      if (operationType !== "delete" && operationType !== "forceDelete" && schemaRefusal(record)) return "BAD_REQUEST";
      if (operationType === "create") return held ? "EXISTS" : null;
      if (!held) return "NOT_FOUND";
      // delete checks the tag as update does; forceDelete, which deleteRecords sends, does not.
      if (operationType === "forceDelete") return null;
      return record.recordChangeTag && record.recordChangeTag !== held.recordChangeTag ? "CONFLICT" : null;
    });
    if (errors.some(Boolean)) {
      // An atomic batch names the cause, and each record that was only caught in it is ATOMIC_ERROR.
      return operations.map(({ record }, index) => ({ recordName: record.recordName,
        serverErrorCode: errors[index] ?? "ATOMIC_ERROR",
        reason: (errors[index] === "BAD_REQUEST" && schemaRefusal(record)) || errors[index] || "atomic batch failed" }));
    }
    return operations.map(({ operationType, record }) => {
      let held = zone.records.find((each) => each.recordName === record.recordName);
      if (operationType === "delete" || operationType === "forceDelete") {
        zone.records.splice(zone.records.indexOf(held), 1);
        zone.version += 1;
        // 200 the zone's changes report a deleted record, so a reader's kept copy is dropped
        (zone.deleted ??= []).push({ recordName: record.recordName, changedAt: zone.version });
        return { recordName: record.recordName, deleted: true };
      }
      if (!held) {
        held = { recordName: record.recordName, recordType: record.recordType, fields: {} };
        zone.records.push(held);
      }
      for (const [name, field] of Object.entries(record.fields ?? {})) {
        if (field.value === null) delete held.fields[name];
        else held.fields[name] = field;
      }
      bump(held);
      held.recordChangeTag = `w${zone.version}`;
      return { recordName: held.recordName, recordType: held.recordType, recordChangeTag: held.recordChangeTag, fields: held.fields };
    });
  }

  await page.route(`${API}**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    const [, , , , , database, ...rest] = url.pathname.split("/");
    const endpoint = rest.join("/");
    const body = request.postData() ? JSON.parse(request.postData()) : {};
    asked.push({ database, endpoint, body, token: url.searchParams.get("ckAPIToken") });
    if (refusesToken) {
      return reply(route, 401, { serverErrorCode: "AUTHENTICATION_FAILED", reason: "check the API Token" });
    }
    if (request.headers()["x-mock-signed-in"] !== "1") {
      return reply(route, 421, { serverErrorCode: "AUTHENTICATION_REQUIRED", reason: "Sign in" });
    }
    // The caller is a record name only; the name is found by asking for the person.
    if (endpoint === "users/caller") return reply(route, 200, account.person);
    if (endpoint === "users/discover") {
      return reply(route, 200, { users: body.lookupInfos.map(({ userRecordName }) => account.identities[userRecordName]
        ?? { serverErrorCode: "NOT_FOUND", reason: "no such user" }) });
    }
    if (endpoint === "zones/list") {
      // 116 The private database lists its zones too: the mirror's and one for each map the person shares.
      return reply(route, 200, { zones: account.zones.filter((zone) => zone.database === database
        && !gone.has(`${database}/${zone.zoneID.zoneName}`)).map(({ zoneID }) => ({ zoneID })) });
    }
    if (endpoint === "changes/zone") {
      // What the library builds from a zone's options; a zone without its id is a bad request as a whole.
      if (!Array.isArray(body.zones) || body.zones.some((each) => !each.zoneID)) {
        return reply(route, 400, { serverErrorCode: "BAD_REQUEST", reason: "zoneID is required" });
      }
      const answered = body.zones.map(({ zoneID, syncToken }) => {
        const zone = account.zones.find((each) => each.database === database && each.zoneID.zoneName === zoneID.zoneName);
        if (!zone || gone.has(`${database}/${zoneID.zoneName}`)) return { zoneID, serverErrorCode: "ZONE_NOT_FOUND", reason: "no such zone" };
        if (syncToken && expired > 0) {
          expired -= 1;
          return { zoneID, serverErrorCode: "BAD_REQUEST", reason: "Invalid sync token" };
        }
        const since = Number(String(syncToken ?? "").split("-").pop()) || 0;
        const records = [...zone.records.filter((record) => record.changedAt > since)
          .map((record) => ({ ...record, changedAt: undefined, zoneID })),
          ...(zone.deleted ?? []).filter((each) => each.changedAt > since)
            .map(({ recordName }) => ({ recordName, deleted: true, zoneID }))];
        return { zoneID, records, syncToken: `${database}-${zone.version}`, moreComing: false };
      });
      return reply(route, 200, { zones: answered });
    }
    if (endpoint === "changes/database") {
      const since = Number(String(body.syncToken ?? "").split("-").pop()) || 0;
      const changed = account.zones.filter((zone) => zone.database === database && zone.version > since);
      const version = Math.max(0, ...account.zones.filter((zone) => zone.database === database).map((zone) => zone.version));
      return reply(route, 200, { zones: changed.map(({ zoneID }) => ({ zoneID })), syncToken: `${database}-${version}`, moreComing: false });
    }
    if (endpoint === "subscriptions/modify") {
      return reply(route, 200, { subscriptions: body.operations.map(({ subscription }) => {
        const key = `${database}/${subscription.subscriptionID}`;
        if (subscriptions.has(key)) return { subscriptionID: subscription.subscriptionID, serverErrorCode: "EXISTS", reason: "EXISTS" };
        if (subscription.subscriptionType !== "database") return { serverErrorCode: "BAD_REQUEST", reason: "unsupported type" };
        subscriptions.add(key);
        return subscription;
      }) });
    }
    if (endpoint === "zones/modify") {
      return reply(route, 200, { zones: body.operations.map(({ operationType, zone: { zoneID } }) => {
        const held = account.zones.find((each) => each.database === database && each.zoneID.zoneName === zoneID.zoneName);
        if (operationType !== "delete") return { zoneID, serverErrorCode: "BAD_REQUEST", reason: "unsupported operation" };
        if (!held || gone.has(`${database}/${zoneID.zoneName}`)) {
          return { zoneID, serverErrorCode: "ZONE_NOT_FOUND", reason: "no such zone" };
        }
        gone.add(`${database}/${zoneID.zoneName}`);
        return { zoneID, deleted: true };
      }) });
    }
    if (endpoint === "records/modify") {
      try {
        return reply(route, 200, { records: modify(database, body) });
      } catch (error) {
        return reply(route, 400, { serverErrorCode: error.serverErrorCode, reason: error.reason });
      }
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
    /** A record another device creates, as its change would arrive. */
    add(database, zoneName, record) {
      const zone = account.zones.find((each) => each.database === database && each.zoneID.zoneName === zoneName);
      zone.version += 1;
      zone.records.push({ recordChangeTag: `n${zone.version}`, ...structuredClone(record), changedAt: zone.version });
    },
    /** The next `count` modifies find their first row already changed by another device. */
    conflictNext(count) { conflicts = count; },
    /** The record as the account holds it now. */
    record: (recordName) => find(recordName)?.record,
    /** What Apple's push does: the page is told, and reads again, but only where a subscription was saved. */
    push: async () => {
      // The page saves them just after it signs in; Apple sends nothing before.
      for (let waited = 0; subscriptions.size < 2 && waited < 3000; waited += 50) await new Promise((resolve) => setTimeout(resolve, 50));
      if (subscriptions.size === 0) return false;
      await page.evaluate(() => window.__mockCloudPush());
      return true;
    },
    /** The subscriptions the page saved, as `database/id`. */
    subscriptions: () => [...subscriptions],
    /** The mirror zone is not there yet, as in an account that never ran the app. */
    removeZone: (database, zoneName) => { gone.add(`${database}/${zoneName}`); },
    /** The next `count` reads that carry a sync token are told the token is no longer good. */
    expireTokenNext(count) { expired = count; },
    tag: (recordName) => find(recordName).record.recordChangeTag
  };
}

/** Notes what the page asks of riki_apply; `asks()` answers those requests as the core received them. */
export async function recordCoreAsks(page) {
  await page.addInitScript(() => {
    window.__coreAsks = [];
    const instantiate = WebAssembly.instantiate.bind(WebAssembly);
    WebAssembly.instantiate = async (...given) => {
      const made = await instantiate(...given);
      const instance = made.instance ?? made;
      const apply = instance.exports.riki_apply;
      const exports = { ...instance.exports, riki_apply: (pointer, length) => {
        const bytes = new Uint8Array(instance.exports.memory.buffer, pointer, length);
        window.__coreAsks.push(JSON.parse(new TextDecoder().decode(bytes)));
        return apply(pointer, length);
      } };
      return made.instance ? { ...made, instance: { exports } } : { exports };
    };
  });
  return () => page.evaluate(() => window.__coreAsks);
}

/** A 1 px PNG, what a tile host answers. */
export const TILE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

export const CORS_HOST = "https://cors.example";
export const CLOSED_HOST = "https://closed.example";

/**
 * Two service hosts, as a browser meets them: one allows CORS, the other answers without the header, which
 * a browser reports as a network error, so the route fails the request. `asked(host)` lists the paths each was asked for.
 */
export async function mockServiceHosts(page, { cors = {} } = {}) {
  const seen = { cors: [], closed: [] };
  await page.route(`${CORS_HOST}/**`, (route) => {
    const url = new URL(route.request().url());
    seen.cors.push(url.pathname + url.search);
    const body = cors[url.pathname];
    return body === undefined
      ? route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "image/png", body: TILE })
      : route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json",
        body: JSON.stringify(body) });
  });
  await page.route(`${CLOSED_HOST}/**`, (route) => {
    const url = new URL(route.request().url());
    seen.closed.push(url.pathname + url.search);
    // The page's fetch fails as a browser's does when a host did not allow it.
    return route.abort("failed");
  });
  return { asked: (host) => seen[host] };
}

/** The requests the page makes of the named core functions, in order, as the core received them. */
export async function recordCoreCalls(page, names) {
  await page.addInitScript((recorded) => {
    window.__coreCalls = [];
    const instantiate = WebAssembly.instantiate.bind(WebAssembly);
    WebAssembly.instantiate = async (...given) => {
      const made = await instantiate(...given);
      const instance = made.instance ?? made;
      const exports = { ...instance.exports };
      for (const name of recorded) {
        const call = instance.exports[name];
        exports[name] = (pointer, length) => {
          const bytes = new Uint8Array(instance.exports.memory.buffer, pointer, length);
          window.__coreCalls.push({ call: name, request: JSON.parse(new TextDecoder().decode(bytes)) });
          return call(pointer, length);
        };
      }
      return made.instance ? { ...made, instance: { exports } } : { exports };
    };
  }, names);
  return () => page.evaluate(() => window.__coreCalls);
}

/**
 * Has the page's core answer `call` by running `source`, the text of a function of the request, in the page: for what a
 * recorded answer cannot do, such as a style that depends on the catalog it was asked with. Install before the page loads.
 */
export async function answerCoreWith(page, call, source) {
  await page.addInitScript(({ name, text }) => {
    const instantiate = WebAssembly.instantiate.bind(WebAssembly);
    WebAssembly.instantiate = async (...given) => {
      const made = await instantiate(...given);
      const instance = made.instance ?? made;
      const memory = instance.exports.memory;
      const answer = (pointer, length) => {
        const request = JSON.parse(new TextDecoder().decode(new Uint8Array(memory.buffer, pointer, length)));
        const bytes = new TextEncoder().encode(JSON.stringify(new Function("request", `return (${text})(request)`)(request)));
        const out = instance.exports.riki_alloc(4 + bytes.length);
        new DataView(memory.buffer).setUint32(out, bytes.length, true);
        new Uint8Array(memory.buffer, out + 4, bytes.length).set(bytes);
        return out;
      };
      const exports = { ...instance.exports, [name]: answer };
      return made.instance ? { ...made, instance: { exports } } : { exports };
    };
  }, { name: call, text: source });
}
