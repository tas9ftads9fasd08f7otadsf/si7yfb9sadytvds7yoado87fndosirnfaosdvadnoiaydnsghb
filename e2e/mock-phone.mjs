// A stand-in for a sharing phone, so the page is tested in a browser on any machine.
// It serves the page's build and answers as the app's `PeerRouter` does, with the guest
// rules of `PeerWebGuestBook`; `/__test/*` is the phone's side, for the specs to press.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PAGE_SEGMENTS } from "../src/lib/segments.ts";
import { readRealMap, realStyle, serveReal } from "./real-map.mjs";


const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(HERE, "..", "out");
const FILES_PREFIX = "/web/app/";
const PORT = Number(process.env.PORT || 8765);
const GONE_AFTER = 20000;
const EDIT_KEY = "7Q4K29";
const COOKIE = "riki-guest";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json" };
// One transparent pixel: a symbol the page lays on as a mask.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

// 93 With REAL_MAP=1 the Riki Maps map comes first, over the regions scripts/real-region.mjs downloaded.
const REAL_ROOT = path.join(HERE, "real");
const realMaps = () => process.env.REAL_MAP ? [readRealMap(path.join(HERE, "fixtures", "riki-maps.mapson"))] : [];

function freshMaps() {
  const layer = (id, name, kind, symbol) => ({ id, name, kind, symbol, isEnabled: true });
  return [
    { id: "6F1E2A10-0000-4000-8000-000000000001", name: "High Tatras", symbol: "mountain.2", iconTintHex: "#3a7d44",
      revision: 1, note: "Summer trails", category: "Hiking", sendsNewFields: true, offlineState: "ready", bytes: 1_200_000_000,
      changedAt: 1_700_000_000, minimumVersion: { app: "0.18.0", browser: "0.30.0" }, drawsRelief: true,
      layers: [{ ...layer("6F1E2A10-0000-4000-8000-0000000000A1", "Trails", "Vector tiles", "figure.hiking"), bytes: 263_000_000 },
        layer("6F1E2A10-0000-4000-8000-0000000000A2", "Huts", "Points", "house")],
      styles: [{ id: "6F1E2A10-0000-4000-8000-0000000000B1", name: "Summer", arrangement: { hidden: [] } },
        { id: "6F1E2A10-0000-4000-8000-0000000000B2", name: "Winter",
          arrangement: { hidden: ["6F1E2A10-0000-4000-8000-0000000000A2"] } }],
      nameTranslations: { sk: "Vysoké Tatry" }, stylesDisagree: true, differsFromDefault: true, removedStyles: 1,
      mixedSources: true },
    { id: "6F1E2A10-0000-4000-8000-000000000002", name: "Bratislava", symbol: "building.2", iconTintHex: null,
      revision: 3, note: "",
      layers: [layer("6F1E2A10-0000-4000-8000-0000000000C1", "Streets", "Vector tiles", "road.lanes")],
      styles: [{ id: "6F1E2A10-0000-4000-8000-0000000000D1", name: "Day", arrangement: { hidden: [] } }],
      editedStyles: ["6F1E2A10-0000-4000-8000-0000000000D1"] }
  ];
}

let phone = { name: "Riki's iPad", asksFirst: false, guests: new Map(), removedAddresses: new Set(),
  maps: [...realMaps(), ...freshMaps()], served: true, liveAsks: [], regions: freshRegions(), location: null,
  tokens: new Set(), pairs: new Map(), placeAsks: [], addedServers: [], importedServers: [], serverEdits: new Map(), goneServers: new Set(), identified: [], answersServers: false, pictureKinds: [], dxfAdds: [], detailsAsked: [], laysOutDetails: false, trainDelay: 3, liveWindow: 120, liveAnsweredAt: null, rowsOnly: false, searchAsks: [], searchMissing: false, apiAdds: [], keptCookie: "", languages: ["de", "sk"], droppedSymbols: new Set(), listsRowIcons: true, takesTranslations: true,
    offlineAsks: [], discarded: [], esriAsks: [], serverLookAnswers: [],
    legendEverywhere: true, ownsSettings: true, shares: freshShares(), folderShares: {} };

// 59: the High Tatras shared with Rita, who joined; Bratislava with nobody yet.
function freshShares() {
  return { "6F1E2A10-0000-4000-8000-000000000001": { role: "owner", linkRole: null,
    link: "https://www.icloud.com/share/0mockTatras",
    people: [{ id: "you", name: "Riki (you)", role: "owner", hasAccepted: true, isYou: true },
      { id: "rita", name: "Rita", role: "reader", hasAccepted: true, isYou: false }] } };
}

const ROLE_DETAIL = { owner: "Owner", admin: "Edits the map, and says who else may", editor: "Edits the map",
  reader: "Sees the map as it is" };

// 59: as `PeerWebPeople.roster` writes the share, with what this phone's role may do.
function roster(id) {
  const share = phone.shares[id];
  const role = share?.role ?? "owner";
  const owns = role === "owner";
  const people = (share?.people ?? []).map((person) => ({ ...person,
    line: person.hasAccepted ? ROLE_DETAIL[person.role] : "Invited · hasn’t joined yet",
    mayChangeRole: (owns || role === "admin") && person.role !== "owner" && !person.isYou,
    mayRemove: owns && person.role !== "owner" }));
  const others = people.filter((person) => person.role !== "owner");
  return { isShared: share != null, role, mayInvite: owns || role === "admin", invitesDirectly: owns, people,
    tally: others.length ? `${others.filter((person) => person.hasAccepted).length} joined` : "",
    link: owns ? share?.link ?? null : null, linkRole: share?.linkRole ?? null, mayChangeLink: owns && share != null,
    heldBy: null, caveat: "Admin is a role this app keeps, not a lock iCloud enforces." };
}

// 59: as `PeerWebPeople.refusal` and `PeerWebSharing` carry out one ask; null when refused.
function askPeople(id, query) {
  const OFFERED = ["reader", "editor", "admin"];
  const role = phone.shares[id]?.role ?? "owner";
  const owns = role === "owner";
  const made = () => (phone.shares[id] ??= { role: "owner", linkRole: null,
    link: `https://www.icloud.com/share/0mock${id.slice(-4)}`,
    people: [{ id: "you", name: "Riki (you)", role: "owner", hasAccepted: true, isYou: true }] });
  const person = (wanted) => phone.shares[id]?.people.find((each) => each.id === wanted);
  if (query.get("share") === "1") return owns ? made() : null;
  if (query.has("invite")) {
    const address = (query.get("invite") || "").trim().toLowerCase();
    const asked = query.get("role") || "reader";
    if (!(owns || role === "admin") || !address.includes("@") || !OFFERED.includes(asked)) return null;
    made().people.push({ id: `invited-${address}`, name: address, role: asked, hasAccepted: false, isYou: false });
    return true;
  }
  if (query.has("person")) {
    const found = person(query.get("person"));
    if (!found || found.role === "owner" || !OFFERED.includes(query.get("role")) || !(owns || role === "admin")) return null;
    found.role = query.get("role");
    return true;
  }
  if (query.has("remove")) {
    const found = person(query.get("remove"));
    if (!owns || !found || found.role === "owner") return null;
    phone.shares[id].people = phone.shares[id].people.filter((each) => each !== found);
    return true;
  }
  if (query.has("link") && owns && phone.shares[id]) {
    const link = query.get("link");
    if (link !== "none" && !OFFERED.includes(link)) return null;
    phone.shares[id].linkRole = link === "none" ? null : link;
    return true;
  }
  return null;
}

// 68: as `PeerWebFolderSharing.roster`: no removal or link choice, and what travels in the share.
function folderRoster(id) {
  const share = phone.folderShares[id];
  const inside = phone.maps.filter((each) => each.stackID === id);
  const carried = inside.filter((each) => share?.carried.includes(each.id)).length;
  const saved = phone.shares;
  phone.shares = { [id]: share };
  const made = roster(id);
  phone.shares = saved;
  const owns = made.role === "owner";
  return { ...made, isShared: share != null, mayInvite: owns, mayChangeLink: false, linkRole: null,
    people: made.people.map((person) => ({ ...person, mayRemove: false })),
    folderLine: share ? `${carried} of ${inside.length} maps travel in this share`
      : `${inside.length} maps would travel in this share`,
    addsMore: owns && share != null && carried < inside.length };
}

// 68: as `PeerWebFolderSharing.carryOut`: the folder's maps move in, then the share is made or used.
function askFolderPeople(id, query) {
  const share = phone.folderShares[id];
  const owns = (share?.role ?? "owner") === "owner";
  const inside = phone.maps.filter((each) => each.stackID === id).map((each) => each.id);
  const made = () => {
    phone.folderShares[id] ??= { role: "owner", linkRole: null, link: `https://www.icloud.com/share/0folder${id.slice(-4)}`,
      people: [{ id: "you", name: "Riki (you)", role: "owner", hasAccepted: true, isYou: true }], carried: [] };
    phone.folderShares[id].carried = inside;
    return phone.folderShares[id];
  };
  if (query.has("remove") || query.has("link")) return null;
  if (query.get("share") === "1") return owns ? made() : null;
  if (query.has("invite")) {
    const address = (query.get("invite") || "").trim().toLowerCase();
    if (!owns || !address.includes("@")) return null;
    made().people.push({ id: `invited-${address}`, name: address, role: query.get("role") || "reader",
      hasAccepted: false, isYou: false });
    return true;
  }
  if (query.has("person")) {
    const found = share?.people.find((each) => each.id === query.get("person"));
    if (!found || found.role === "owner") return null;
    found.role = query.get("role");
    return true;
  }
  return null;
}

// 2802: the High Tatras on the phone, Prešov's region not yet.
function freshRegions() {
  return { drawn: [{ id: "vysoke_tatry", name: "Vysoké Tatry", box: [19.9, 49.09, 20.32, 49.32], bytes: 412_000_000 }],
    downloadable: [{ id: "presovsky", name: "Prešovský kraj", box: [20.4, 48.6, 22.6, 49.6] }], downloading: [] };
}

function reset() {
  phone = { name: "Riki's iPad", asksFirst: false, guests: new Map(), removedAddresses: new Set(),
    maps: [...realMaps(), ...freshMaps()], served: true, liveAsks: [], regions: freshRegions(), location: null,
    tokens: new Set(), pairs: new Map(), placeAsks: [], addedServers: [], importedServers: [], serverEdits: new Map(), goneServers: new Set(), identified: [], answersServers: false, pictureKinds: [], dxfAdds: [], detailsAsked: [], laysOutDetails: false, trainDelay: 3, liveWindow: 120, liveAnsweredAt: null, rowsOnly: false, searchAsks: [], searchMissing: false, apiAdds: [], keptCookie: "", languages: ["de", "sk"], droppedSymbols: new Set(), listsRowIcons: true, takesTranslations: true,
    offlineAsks: [], discarded: [], esriAsks: [], serverLookAnswers: [],
    legendEverywhere: true, ownsSettings: true, shares: freshShares(), folderShares: {} };
}

// MARK: - The guest book, as `PeerWebGuestBook` keeps it

function tokenOf(request) {
  for (const pair of (request.headers.cookie || "").split(";")) {
    const [name, value] = pair.split("=").map((part) => part?.trim());
    if (name === COOKIE && value) return value;
  }
  return null;
}

function addressOf(request) {
  return (request.headers["x-test-address"] || request.socket.remoteAddress || "?").replace(/^::ffff:/, "");
}

function arrive(request) {
  const token = tokenOf(request);
  const known = token && phone.guests.get(token);
  if (known) {
    known.lastSeen = Date.now();
    return { guest: known, isNew: false };
  }
  const address = addressOf(request);
  const id = token && /^[0-9a-f]{32}$/.test(token) ? token : randomUUID().replaceAll("-", "");
  const standing = phone.removedAddresses.has(address) ? "removed" : phone.asksFirst ? "waiting" : "admitted";
  const guest = { id, address, agent: request.headers["user-agent"] || "", standing, since: Date.now(),
    lastSeen: Date.now() };
  phone.guests.set(id, guest);
  return { guest, isNew: id !== token };
}

function present() {
  return [...phone.guests.values()]
    .filter((guest) => guest.standing !== "removed" && Date.now() - guest.lastSeen < GONE_AFTER)
    .sort((a, b) => a.since - b.since);
}

function viewers() { return present().filter((guest) => guest.standing === "admitted").length; }

function isBrowser(request) {
  return (request.headers["user-agent"] || "").startsWith("Mozilla/") || Boolean(request.headers["sec-fetch-mode"]);
}

function refuses(request) {
  const token = tokenOf(request);
  if (!token && !isBrowser(request)) return false;
  return phone.guests.get(token)?.standing !== "admitted";
}

// Item 2019: a password, typed with any case or gaps, as `PeerServerChoices.typed` reads it.
const typed = (key) => (key || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
// 2944: the password is traded once for a token; edits carry the token as a bearer.
const opensEditing = (request) => typed(request.headers["x-riki-edit"]) === EDIT_KEY;
const bearsToken = (request) => phone.tokens.has((request.headers.authorization || "").replace(/^Bearer /, ""));

// 136: Publish to the gallery as `PeerWebPublishRoute` answers: the offer, a request weighed in the sheet's order,
// one ask at a time waiting on the phone's person, and the answer it gives after a few polls.
const PUBLISH_CATEGORIES = [{ id: "hiking", name: "Hiking", symbol: "figure.hiking" },
  { id: "city", name: "City", symbol: "building.2" }, { id: "nature", name: "Nature", symbol: "leaf" }];
const PUBLISH_MESSAGES = {
  noSuchMap: "No such map", notYours: "This map is shared with this phone to look at, not to change",
  locked: "This map is locked on the phone", builtIn: "A map the app ships is not published",
  off: "Publishing is switched off in this app",
  unsigned: "It came from a file the app did not sign, so it can't go to the gallery",
  notSignedIn: "Not signed in to iCloud. Sign in in the Settings app.", name: "Add a name", category: "Choose a category",
  summary: "Say what it shows", coverage: "Choose where it covers", changes: "Say what changed",
  keysNote: "Say how to get the keys", manual: "Fix the web address",
  replaces: "Agree that the gallery's map takes this one's place", language: "The app has no such language",
  publicName: "Give the name shown beside what you publish", notConfirmed: "The phone's person did not publish it",
  busy: "Too many publications wait on the phone", expired: "The phone was not answered in time; ask again"
};
const PUBLISH_STATUS = { noSuchMap: 404, notYours: 403, locked: 403, notConfirmed: 403, busy: 429 };
const publishState = () => (phone.publishing ??= { leftOut: false, signedIn: true, update: false, needsName: false,
  noCoverage: false, answer: "sent", polls: 2, asks: new Map(), requests: [], sent: [] });

const publishRefused = (response, refusal) =>
  send(response, PUBLISH_STATUS[refusal] ?? 409, JSON.stringify({ refusal, message: PUBLISH_MESSAGES[refusal] }),
    "application/json");

// What stops the map going out whatever the page wrote, as `PeerWebPublish.refusal(of: standing)` weighs it.
function publishStops(each) {
  const state = publishState();
  if (each.locked) return "locked";
  if (!phone.ownsSettings) return "notYours";
  if (each.builtIn) return "builtIn";
  return state.signedIn ? null : "notSignedIn";
}

function publishOffer(each) {
  const state = publishState();
  const texts = { en: { title: each.name, body: each.note ?? "" } };
  for (const [code, title] of Object.entries(each.nameTranslations ?? {})) texts[code] = { title, body: "" };
  return { refusal: publishStops(each), language: "en", isUpdate: state.update, texts, categories: PUBLISH_CATEGORIES,
    coverage: state.noCoverage ? null : { countries: ["SK", "PL"] },
    coverageLine: state.noCoverage ? "The whole world, countries or regions where its tiles and features are."
      : "Slovakia, Poland", places: state.noCoverage ? [] : ["Slovakia", "Poland"],
    leftOut: state.leftOut ? ["Mapy.cz key"] : [], keysNote: "", manualURL: "", hasPreview: Boolean(each.previewPicture),
    publicName: state.needsName ? "" : "Riki", needsPublicName: state.needsName };
}

// The first thing the sheet's Send says is missing, then the agreement and the public name, as the phone orders them.
function publishMissing(each, body) {
  const state = publishState();
  const main = body.texts?.en;
  if (!Object.keys(body.texts ?? {}).every((code) => code === "en" || ["sk", "de", "cs", "pl"].includes(code))) return "language";
  if (!main?.title?.trim()) return "name";
  if (!PUBLISH_CATEGORIES.some((one) => one.id === body.category)) return "category";
  if (!main.body?.trim()) return "summary";
  if (!body.coverage || !(body.coverage.countries?.length || body.coverage.world)) return "coverage";
  if (state.update && !body.changes?.trim()) return "changes";
  if (state.leftOut && !body.keysNote?.trim()) return "keysNote";
  const manual = (body.manualURL ?? "").trim();
  if (manual && !/^https?:\/\/[^ ]+$/.test(manual)) return "manual";
  if (!state.update && body.replaces !== true) return "replaces";
  if (state.needsName && !(body.publicName ?? "").trim()) return "publicName";
  return null;
}

// How the phone's person has answered after `polls` polls: yes, no, an error, or never.
function publishPolled(ask) {
  const state = publishState();
  if (ask.answer.state === "waiting") {
    ask.polled += 1;
    if (state.answer !== "wait" && ask.polled > state.polls) {
      ask.answer = state.answer === "refused"
        ? { state: "refused", refusal: "notConfirmed", message: PUBLISH_MESSAGES.notConfirmed }
        : state.answer === "failed" ? { state: "failed", message: "iCloud could not be reached" }
          : { state: "sent", submission: `Submission-${state.sent.length + 1}` };
      if (ask.answer.state === "sent") state.sent.push(ask.request);
    }
  }
  return ask.answer;
}
// 135: the phone's saved places as `PeerWebSaved` lists them, newest first; Spring has no mark of its own.
const SAVED_FOLDERS = [
  { id: "5A1E0000-0000-4000-8000-000000000001", name: "Tatras", symbol: "mountain.2", colour: "#336699", isShared: false, isSharedWithMe: false },
  { id: "5A1E0000-0000-4000-8000-000000000002", name: "Hikes of Rita", symbol: "figure.hiking", isShared: true, isSharedWithMe: true }
];
const SAVED_ROWS = [
  { id: "5A1E1000-0000-4000-8000-000000000001", name: "Chata pri Zelenom plese", kind: "point", category: "Shelter",
    latitude: 49.2, longitude: 20.2, folderID: SAVED_FOLDERS[0].id, note: "Water at the back door", symbol: "house.fill", ink: "#B5651D",
    mapName: "High Tatras", layerName: "Huts", savedAt: "2026-05-04T08:30:00Z", isComplete: true },
  { id: "5A1E1000-0000-4000-8000-000000000002", name: "Tatranska magistrala", kind: "line", category: "Trail",
    latitude: 49.15, longitude: 20.1, bounds: { south: 49.1, west: 20.0, north: 49.2, east: 20.2 }, folderID: SAVED_FOLDERS[1].id,
    symbol: "figure.hiking", ink: "#2E8B57", mapName: "High Tatras", layerName: "Trails", savedAt: "2026-04-02T08:30:00Z", isComplete: false },
  { id: "5A1E1000-0000-4000-8000-000000000003", name: "Strbske pleso", kind: "area", category: "Lake",
    latitude: 49.12, longitude: 20.06, bounds: { south: 49.11, west: 20.05, north: 49.13, east: 20.07 }, note: "Swim in summer",
    symbol: "drop.fill", ink: "#1E90FF", savedAt: "2026-03-03T08:30:00Z", isComplete: true },
  { id: "5A1E1000-0000-4000-8000-000000000004", name: "Spring", kind: "point", latitude: 49.0, longitude: 20.0,
    savedAt: "2026-02-01T08:30:00Z", isComplete: true }
];

// 135: the whole shape a row leaves out, as GeoJSON; a point is its spot.
function savedShape(row) {
  const { south, west, north, east } = row.bounds ?? {};
  const geometry = row.kind === "line"
    ? { type: "LineString", coordinates: [[west, south], [(west + east) / 2, north], [east, south]] }
    : row.kind === "area"
      ? { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] }
      : { type: "Point", coordinates: [row.longitude, row.latitude] };
  return { type: "Feature", id: row.id, geometry, properties: row };
}

const savedState = () => (phone.saved ??= { empty: false, gone: false, total: null });

// MARK: - Answers

function send(response, status, body, type = "text/plain; charset=utf-8", headers = {}) {
  response.writeHead(status, { "Content-Type": type, ...headers });
  response.end(body);
}

const json = (response, value, headers = {}) =>
  send(response, 200, JSON.stringify(value), "application/json", { "Cache-Control": "no-store", ...headers });

const FOLDER_SYMBOLS = ["square.stack", "folder", "tray.full"];

function shelve(asked) {
  const byID = new Map(phone.maps.map((each) => [each.id, each]));
  const folderOf = (id) => phone.maps.filter((each) => each.stackID === id);
  if (asked.has("order")) {
    const order = asked.get("order").split(",");
    if (!order.every((id) => byID.has(id))) return false;
    const queue = order.map((id) => byID.get(id));
    phone.maps = phone.maps.map((each) => (order.includes(each.id) ? queue.shift() : each));
  } else if (asked.has("sort")) {
    const down = asked.get("sort") === "nameDescending";
    phone.maps.sort((one, other) => one.name.localeCompare(other.name) * (down ? -1 : 1));
  } else if (asked.has("folder")) {
    const stackID = randomUUID().toUpperCase();
    for (const id of asked.get("maps").split(",")) Object.assign(byID.get(id), { stackID, stackName: asked.get("folder") });
  } else if (asked.has("leave")) {
    Object.assign(byID.get(asked.get("leave")), { stackID: undefined, stackName: undefined });
  } else if (asked.has("map")) {
    const name = folderOf(asked.get("stack"))[0]?.stackName;
    Object.assign(byID.get(asked.get("map")), { stackID: asked.get("stack"), stackName: name });
  } else if (asked.has("name")) {
    for (const each of folderOf(asked.get("stack"))) each.stackName = asked.get("name");
  } else if (asked.has("symbol") || asked.has("iconTint")) {
    // 56: as `PeerWebShelf` dresses a folder: an offered mark, a colour or blank for automatic.
    const members = folderOf(asked.get("stack"));
    const symbol = asked.get("symbol");
    const tint = (asked.get("iconTint") ?? "").toUpperCase();
    if (!members.length) return false;
    if (symbol !== null && !FOLDER_SYMBOLS.includes(symbol)) return false;
    if (symbol === null && tint && !/^#[0-9A-F]{6}$/.test(tint)) return false;
    for (const each of members) {
      if (symbol !== null) each.stackSymbol = symbol;
      else each.stackIconTintHex = tint || undefined;
    }
  } else {
    return false;
  }
  return true;
}

function catalog() {
  return { deviceID: "mock", name: phone.name, model: "iPad", version: 1, appVersion: "0.20.0",
    sharesLocation: phone.location ? true : undefined,
    maps: phone.maps.map((each) => ({ id: each.id, name: each.name, symbol: each.symbol, category: each.category,
      iconTintHex: each.iconTintHex, revision: each.revision, minimumVersion: each.minimumVersion,
      stackID: each.stackID, stackName: each.stackName,
      stackSymbol: each.stackID ? each.stackSymbol ?? "square.stack" : undefined,
      stackIconTintHex: each.stackID ? each.stackIconTintHex : undefined,
      layers: each.layers.map(({ id, name, kind, symbol, isLive, bytes }) => ({ id, name, kind, symbol, isLive,
        // 141: as `PeerWebSizes` counts what the phone holds since 3491; an older phone sends none.
        bytes: phone.noSizes ? undefined : bytes,
        // 58: as `MapDefinition.origin(of:)` falls back to a layer's kind.
        origin: { key: `kind:${kind}`, title: kind, symbol } })),
      ...newFields(each) })) };
}

// 128: as `PeerSharedMap` carries them since 3490; a map without `sendsNewFields` answers as an older phone.
function newFields(each) {
  if (!each.sendsNewFields) return {};
  const share = phone.shares[each.id];
  const others = (share?.people ?? []).filter((person) => person.role !== "owner").length;
  return { styles: each.styles.map((style) => style.name), styleIDs: each.styles.map((style) => style.id),
    note: each.note || undefined,
    role: each.role ?? (share?.role === "reader" ? "view" : share?.role === "editor" ? "edit" : "own"),
    people: each.people ?? others, isLocked: each.isLocked ?? false, offline: each.offlineState, bytes: each.bytes,
    changedAt: each.changedAt };
}

// 148: W17's sample maps (web-redesign.md §1.2), each pill kind once: the sharing, offline, size and version lines.
function sampleMaps() {
  const at = (daysAgo, month, day) => {
    const when = new Date();
    if (daysAgo != null) when.setDate(when.getDate() - daysAgo);
    else when.setMonth(month, day);
    when.setHours(12, 0, 0, 0);
    return Math.floor(when.getTime() / 1000);
  };
  const made = (number, name, layers, styles, more) => ({ id: `6F1E2A10-0000-4000-8000-00000000F0${number}`, name,
    symbol: "map", iconTintHex: null, revision: 1, note: "", sendsNewFields: true,
    layers: Array.from({ length: layers }, (_, place) => ({ id: `6F1E2A10-0000-4000-8000-00000000F${number}${place.toString(16).padStart(2, "0")}`,
      name: `${name} ${place + 1}`, kind: "Vector tiles", symbol: "map", isEnabled: true })),
    styles: Array.from({ length: styles }, (_, place) => ({ id: `6F1E2A10-0000-4000-8000-00000000E${number}${place.toString(16).padStart(2, "0")}`,
      name: ["Day", "Night", "Print", "Relief"][place], arrangement: { hidden: [] } })), ...more });
  return [
    made(1, "Doprava", 7, 3, { symbol: "tram", iconTintHex: "#3a7d44", note: "Trains, trams and buses", role: "own", people: 3,
      offlineState: "ready", bytes: 1_200_000_000, changedAt: at(0), category: "Transit" }),
    made(2, "Riki Maps", 12, 4, { symbol: "map.fill", role: "own", people: 0, offlineState: "ready", bytes: 854_000_000,
      changedAt: at(1), category: "Reference" }),
    made(3, "Historická 2", 5, 2, { symbol: "clock", note: "Old maps of the region", role: "view", people: 0,
      offlineState: "online", changedAt: at(null, 9, 3), minimumVersion: { app: "0.18.0" } }),
    made(4, "Trains in Slovakia", 3, 1, { symbol: "tram.fill", role: "own", people: 0, offlineState: "partly",
      bytes: 96_000_000, changedAt: at(null, 8, 28) }),
    made(5, "Fitness", 8, 1, { symbol: "figure.run", role: "edit", people: 2, offlineState: "update", bytes: 182_000_000,
      changedAt: at(null, 8, 12) })];
}

// 2957: as `PeerWebCoverage` answers: the places to pick, and a map's choices said in a line.
const COVERAGE_PLACES = {
  continents: [{ id: "europe", name: "Europe" }, { id: "asia", name: "Asia" }],
  countries: [{ id: "AT", name: "Austria" }, { id: "CZ", name: "Czechia" }, { id: "SK", name: "Slovakia" }],
  regions: [{ id: "presovsky", name: "Prešovský kraj", country: "SK", isRange: false },
    { id: "kosicky", name: "Košický kraj", country: "SK", isRange: false },
    { id: "vysoke_tatry", name: "Vysoké Tatry", country: "SK", isRange: true }],
  mountains: "Mountains"
};

// 2959, 2953: Add layer's Riki packages, as `PeerWebPackages` lists them, on one level: two parts,
// contours not on the phone, a package that draws nothing, and Mountains.
const PACKAGES = [
  { overlay: "landscape", name: "Landscape", symbol: "leaf", detail: "Land cover, parks and peaks",
    exclusive: ["cartography"] },
  { overlay: "roads", name: "Roads", symbol: "road.lanes", detail: "Roads and their names",
    exclusive: ["cartography"] },
  { overlay: "contours", name: "Contours", symbol: "point.topleft.down.curvedto.point.bottomright.up",
    detail: "Contour lines", note: "Not downloaded yet — download it from Edit map", exclusive: [] },
  { overlay: null, name: "Navigation", symbol: "arrow.triangle.turn.up.right.diamond",
    detail: "The routing network — costed on this device" },
  { overlay: "mountains", name: "Mountains", symbol: "mountain.2", detail: "Every range", exclusive: [] }
];

function packages(each) {
  const drawn = new Set(each.layers.map((layer) => layer.overlay).filter(Boolean));
  return { rows: PACKAGES.map((row) => ({ isSubPackage: false, note: null, exclusive: [], ...row,
    isDrawn: drawn.has(row.overlay), ...(drawn.has(row.overlay) ? { note: "Already in this map" } : {}) })),
  ticked: drawn.size ? [] : ["landscape", "roads"] };
}

// 2960: Edit layer's panels, as `PeerWebLayerOptions` lists them, read off every style.
const SKI_KINDS = [["downhill", "Downhill pistes"], ["lift", "Lifts"]];
const RAIL_VARIANTS = [["standard", "Every railway", "Every line"], ["maxSpeed", "Maximum speed", "By speed"]];

// 2962: Edit layer's look, as `PeerWebLayerOptions+Look` lists it.
const LAYER_LOOKS = ["appearance", "tint", "routeIcons", "labelLanguage"];

function lookSections(layer) {
  return [{ kind: "choice", title: "Appearance", footnote: "Follows the map: light or dark as it is.",
    key: "appearance", layerScoped: true, value: layer.appearance || "automatic",
    options: [["automatic", "Like the map"], ["light", "Light"], ["dark", "Dark"]]
      .map(([id, title]) => ({ id, title, detail: "" })) },
  { kind: "colour", title: "Colour", footnote: "", key: "tint", layerScoped: true, value: layer.tintHex || null,
    automatic: "#5B8DEF", palette: ["#E5533D", "#2E9E5B"] },
  { kind: "switch", title: "", footnote: "Waymarks, one-way arrows and road shields", key: "routeIcons",
    label: "Icons along its roads and paths", isOn: layer.hidesRouteIcons !== true, layerScoped: true },
  { kind: "choice", title: "Labels", footnote: "A place with no name in the chosen language shows its local name.",
    key: "labelLanguage", layerScoped: true, value: layer.labelLanguage || "",
    options: [["", "The app's language"], ["local", "Local names"], ["sk", "Slovak"]]
      .map(([id, title]) => ({ id, title, detail: "" })) }];
}

// 2998: Edit layer's feature styling, as `PeerWebLayerOptions+Features` lists it for a drawn file.
const FEATURE_SWITCHES = ["distinctColours", "grouping"];
const FEATURE_KEYS = [...FEATURE_SWITCHES, "lineWidth", "valueShown", "allValuesShown", "valueTint",
  "pointLabel", "pointInnerText", "colourMode", "colourKey", "stacking"];
const API_KEYS = ["line", "status", "colour"];

// 70: an API layer's Colour and Text rows, as `PeerWebLayerOptions+Features` lists them.
function apiPointSections(layer) {
  const mode = layer.colourKey ? "fromKey" : layer.tintKey ? "byValue" : "fixed";
  const colour = { kind: "colour", title: mode === "byValue" ? "Otherwise" : "", footnote: "", key: "tint",
    layerScoped: true, value: layer.tint || null, automatic: "#0A84FF", palette: ["#E5533D", "#2E9E5B"] };
  const keyed = (title, held) => ({ kind: "text", title, footnote: "", key: "colourKey", layerScoped: true,
    value: `{${held}}`, keys: API_KEYS });
  const found = [{ kind: "choice", title: "Colour", footnote: "", key: "colourMode", layerScoped: true, value: mode,
    options: [["fixed", "Static"], ["fromKey", "From key"], ["byValue", "By value"]]
      .map(([id, title]) => ({ id, title, detail: "" })) },
  ...(mode === "fixed" ? [colour] : mode === "fromKey" ? [keyed("Colour key", layer.colourKey)]
    : [keyed("Value key", layer.tintKey), colour])]
    .map((one) => ({ ...one, aspect: "colour" }));
  return [...found, ...markSections(layer),
    { kind: "text", title: "Text above points", footnote: "A {key} becomes that feature's value.", key: "pointLabel",
      aspect: "text", layerScoped: true, value: layer.pointLabel || "", keys: API_KEYS },
    { kind: "text", title: "Text inside points", footnote: "Written in white on the dot.", key: "pointInnerText",
      aspect: "text", layerScoped: true, value: layer.pointInnerText || "", keys: API_KEYS },
    // 168: only an API layer stacks points that fall together.
    { kind: "switch", title: "", footnote: "Points that fall together become one", key: "stacking", aspect: "stacking",
      label: "Stack close points", isOn: layer.stacking === true, layerScoped: true }];
}

const bare = (written) => (written || "").trim().replace(/^\{/, "").replace(/\}$/, "").trim() || undefined;
const DRAWN_VALUES = ["Hiking", "Skiing"];

function featureSections(layer) {
  const shown = layer.shownValues || DRAWN_VALUES;
  const every = shown.length === DRAWN_VALUES.length;
  return [{ kind: "slider", title: "Line width", footnote: "", key: "lineWidth", layerScoped: true, aspect: "linesAndAreas",
    value: String(layer.lineWidthScale || 1), range: [0.5, 5, 0.25], ends: ["Hairline", "Bold"] },
  { kind: "colour", title: "", footnote: "", key: "tint", layerScoped: true, aspect: "colour",
    value: layer.tintHex || null, automatic: "#0A84FF", palette: ["#E5533D", "#2E9E5B"] },
  { kind: "switch", title: "", footnote: "Tell overlapping features apart", key: "distinctColours", aspect: "colour",
    label: "Distinct colours per feature", isOn: layer.distinctColours === true, layerScoped: true },
  { kind: "values", title: "Colour by Kind", footnote: "", key: "valueShown", layerScoped: true, aspect: "colour",
    label: every ? "None" : "All", value: every ? "0" : "1", palette: ["#E5533D", "#2E9E5B"],
    items: DRAWN_VALUES.map((value) => ({ id: value, title: value, light: layer.valueTints?.[value] || "",
      dark: layer.valueTints?.[value] || "", isOn: shown.includes(value) })) },
  { kind: "switch", title: "Grouping", footnote: "A tap gathers every part sharing that name.", key: "grouping", aspect: "colour",
    label: "Group features by name", isOn: layer.grouping === true, layerScoped: true }];
}

function editFeatures(layer, query, key) {
  const value = query.get(key);
  if (key === "pointLabel" || key === "pointInnerText") layer[key] = value.trim() || undefined;
  if (key === "colourMode") {
    const held = layer.colourKey || layer.tintKey || (value === "fromKey" ? "colour" : "line");
    layer.colourKey = value === "fromKey" ? held : undefined;
    layer.tintKey = value === "byValue" ? held : undefined;
  }
  if (key === "colourKey") {
    if (layer.tintKey) layer.tintKey = bare(value); else layer.colourKey = bare(value);
  }
  if (FEATURE_SWITCHES.includes(key)) layer[key] = value === "1";
  if (key === "stacking") layer.stacking = value === "1";
  if (key === "lineWidth") layer.lineWidthScale = Number(value);
  if (key === "valueTint") layer.valueTints = { ...layer.valueTints, [value]: query.get("ink") || undefined };
  const shown = new Set(layer.shownValues || DRAWN_VALUES);
  if (key === "valueShown") { if (query.get("valueOn") === "1") shown.add(value); else shown.delete(value); }
  if (key === "allValuesShown") { shown.clear(); if (value === "1") DRAWN_VALUES.forEach((one) => shown.add(one)); }
  const kept = DRAWN_VALUES.filter((one) => shown.has(one));
  layer.shownValues = kept.length === DRAWN_VALUES.length ? undefined : kept;
}

// 64: Edit layer's Mark rows, as `PeerWebLayerMarks` lists them for a layer whose points the app draws.
const MARK_KEYS = ["pointMark", "pointIcon", "pointSize", "circlePadding", "pointIconColour"];
const MARK_ICONS = [["mappin", "Places"], ["house.fill", "Places"], ["tent", "Outdoors"], ["tree", "Outdoors"]];

const markOf = (layer) => (!layer.pointIcon ? "dot" : layer.pointIconAlone ? "alone" : "circled");

function markSections(layer) {
  const kind = markOf(layer);
  const found = [{ kind: "choice", title: "Mark", footnote: "", key: "pointMark", layerScoped: true, value: kind,
    options: [["dot", "Dot"], ["circled", "Icon in circle"], ["alone", "Icon alone"]]
      .map(([id, title]) => ({ id, title, detail: "" })) }];
  if (kind !== "dot") {
    found.push({ kind: "symbols", title: "Icon", footnote: "", key: "pointIcon", layerScoped: true,
      value: layer.pointIcon, palette: ["mappin", "tent"],
      options: MARK_ICONS.map(([id, detail]) => ({ id, title: id, detail })) });
  }
  found.push({ kind: "slider", title: "Point size", footnote: "", key: "pointSize", layerScoped: true,
    value: String(layer.pointSizeScale || 1), range: [0.5, 4, 0.25], ends: ["Dot", "Large"] });
  if (kind !== "alone") {
    found.push({ kind: "slider", title: "Circle padding", footnote: "", key: "circlePadding", layerScoped: true,
      value: String(layer.pointCirclePadding || 0), range: [-4, 12, 1], ends: ["Tight", "Roomy"] });
  }
  if (kind === "circled") {
    found.push({ kind: "colour", title: "Icon colour", footnote: "", key: "pointIconColour", layerScoped: true,
      value: layer.pointIconColourHex || null, automatic: "#FFFFFF", palette: ["#E5533D", "#2E9E5B"] });
  }
  return found.map((one) => ({ ...one, aspect: "mark" }));
}

/** As `PeerWebLayerMarks.Marking.make`: false where the mark has no such row. */
function editMarks(layer, query, key) {
  const value = query.get(key);
  const kind = markOf(layer);
  if (key === "pointMark") {
    if (!["dot", "circled", "alone"].includes(value)) return false;
    layer.pointIcon = value === "dot" ? undefined : layer.pointIcon || "mappin";
    layer.pointIconAlone = value === "alone";
  } else if (key === "pointIcon") {
    if (kind === "dot" || !MARK_ICONS.some(([id]) => id === value)) return false;
    layer.pointIcon = value;
  } else if (key === "pointSize") {
    layer.pointSizeScale = Number(value);
  } else if (key === "circlePadding") {
    if (kind === "alone") return false;
    layer.pointCirclePadding = Math.round(Number(value));
  } else {
    if (kind !== "circled") return false;
    layer.pointIconColourHex = value.toUpperCase() || undefined;
  }
  if (layer.pointIconAlone) layer.pointCirclePadding = undefined;
  if (markOf(layer) !== "circled") layer.pointIconColourHex = undefined;
  return true;
}

// 2999: Edit layer's Connection, as `PeerWebLayerOptions+Network` lists it for a tile layer.
const NETWORK_KEYS = ["connectionOverride", "offlineDownload", "connection", "address", "header", "removeHeader",
  "proxy"];
const GROUPS = [["layerTiles", "Map tiles", "Tiles as you pan"], ["layerRefresh", "Refreshing", "Live answers"]];

// 60: Network settings' address, Test, headers and proxy, as `PeerWebLayerKeys` lists them; values stay here.
function keySections(layer) {
  const keys = layer.keys || {};
  return [{ kind: "text", title: "URL", footnote: "The URL needs {z}, {x} and {y}.", key: "address", layerScoped: true,
    value: layer.address || "https://tiles.example/{z}/{x}/{y}.png" },
  { kind: "probe", title: "", footnote: "", key: "test", label: "Test", layerScoped: true },
  { kind: "headers", title: "Headers", footnote: "Values stay on the phone's keychain.", key: "header",
    label: "Add header", layerScoped: true, options: [{ id: "X-API-Key", title: "X-API-Key", detail: "A key" }],
    items: Object.keys(keys).map((name) => ({ id: name, title: name, light: "", dark: "", isOn: keys[name] !== "",
      detail: keys[name] !== "" ? "Saved on this device" : "Not set on this device" })) },
  { kind: "text", title: "Proxy", footnote: "Straight to the address", key: "proxy", layerScoped: true,
    value: layer.proxy || "" }];
}

function editKeys(layer, query, key) {
  const value = query.get(key);
  if (key === "address") {
    if (!/\{z\}/.test(value) || !/\{x\}/.test(value) || !/\{y\}/.test(value)) return "Missing {x}, {y}";
    layer.address = value.trim();
  }
  if (key === "header") layer.keys = { ...layer.keys, [value]: query.get("headerValue") ?? layer.keys?.[value] ?? "" };
  if (key === "removeHeader") { layer.keys = { ...layer.keys }; delete layer.keys[value]; }
  if (key === "proxy") layer.proxy = value.trim();
  return null;
}

function networkSections(layer) {
  const blocked = layer.blocked || [];
  const over = layer.overrides === true;
  return [...keySections(layer), { kind: "switch", title: "Connection", footnote: over ? "On this map, these switches override Settings."
    : "The switches apply to this layer on this map only.", key: "connectionOverride", label: "Override Settings",
  isOn: over, layerScoped: true },
  ...[["wifi", "Wi-Fi"], ["cellular", "Mobile data"]].map(([family, title]) => ({ kind: "connection", title,
    footnote: "", family, layerScoped: true, items: GROUPS.map(([id, name, detail]) => {
      const locked = family === "cellular" && id === "layerRefresh" && !over;
      return { id, title: name, light: "", dark: "", isOn: !locked && !blocked.includes(family + "." + id),
        detail: locked ? "Off in Settings for Mobile data" : detail, isLocked: locked };
    }) })),
  { kind: "switch", title: "Offline", footnote: "Check the source's terms first", key: "offlineDownload",
    label: "Allow offline download", isOn: layer.allowsOffline !== false, layerScoped: true }];
}

function editNetwork(layer, query, key) {
  if (key === "connectionOverride") { layer.overrides = query.get(key) === "1"; if (!layer.overrides) layer.blocked = []; }
  if (key === "offlineDownload") layer.allowsOffline = query.get(key) === "1";
  if (key === "connection") {
    const named = query.get("connection") + "." + query.get("group");
    const blocked = new Set(layer.blocked || []);
    if (query.get("allowed") === "1") blocked.delete(named); else blocked.add(named);
    layer.blocked = [...blocked];
  }
}

// 3000: Edit layer's Questions, as `PeerWebLayerOptions+Questions` lists them for an Esri layer.
const QUESTION_KEYS = ["answersFromServer", "identifyRequest"];

function questionSections(layer) {
  return [{ kind: "switch", title: "Questions", footnote: "Ask the service what is there", key: "answersFromServer",
    label: "Answer taps from the server", isOn: layer.answersFromServer !== false, layerScoped: true },
  { kind: "text", title: "Identify request", footnote: "Asked when the map is tapped.", key: "identifyRequest",
    layerScoped: true, value: layer.identifyRequest || "" }];
}

// 3409: `CoordinateSystem.allCases`, titled as the phone titles them.
const DXF_SYSTEMS = [{ value: "wgs84", title: "WGS 84" }, { value: "sjtsk", title: "S-JTSK (Křovák)" },
  { value: "utm33", title: "UTM 33N" }, { value: "utm34", title: "UTM 34N" }, { value: "webMercator", title: "Web Mercator" }];

// 3397: the form's choices, titled as `PeerWebAPI.Choices` titles them.
const API_CHOICES = {
  spellings: [{ value: "decimal", title: "Decimal degrees" }, { value: "degreesMinutesSeconds", title: "Degrees, minutes, seconds" },
    { value: "position", title: "One key, both numbers" }],
  orders: [{ value: "latitudeFirst", title: "Latitude first" }, { value: "longitudeFirst", title: "Longitude first" }],
  refresh: [{ value: "0", title: "On the move" }, { value: "10", title: "10 sec" }, { value: "30", title: "30 sec" },
    { value: "60", title: "1 min" }, { value: "300", title: "5 min" }],
  cookieAges: [{ value: "0", title: "As they say" }, { value: "60", title: "1 min" }, { value: "300", title: "5 min" }]
};

// 3003: an API answering two vehicles, as `PeerWebAPI` reads one; 3397 a cookie is kept, never answered.
const BUS_ANSWER = { vehicles: [{ lat: 48.15, lon: 17.11, line: "N33" }, { lat: 48.16, lon: 17.12, line: "N34" }], stops: [] };

// 171: a trimmed coffee trip, whose answer nests its lists three ways; the phone sends the answer for the Points page.
const COFFEE_ANSWER = {
  cafes: [
    { id: 1, name: "Espresso Embassy", latLng: "47.49, 19.05", city: { id: 3, name: "Budapest" }, tags: ["roaster", "wifi"], note: "" },
    { id: 2, name: "Café Nové", latLng: "48.14, 17.10", city: { id: 4, name: "Bratislava" }, tags: ["wifi"], note: "closed on Sundays" },
    { id: 3, name: "Kávovar", latLng: "48.71, 21.26", city: { id: 5, name: "Košice" }, tags: [] }],
  cities: [{ id: 3, name: "Budapest", lat: 47.49, lon: 19.04 }, { id: 4, name: "Bratislava", lat: 48.14, lon: 17.1 }],
  giveaways: []
};

function dotted(item, key) {
  let here = item;
  for (const step of key.split(".").filter(Boolean)) here = here === null || typeof here !== "object" ? undefined : here[step];
  return here;
}

function asText(value) {
  if (Array.isArray(value)) return value.map(asText).join(", ");
  return value === undefined || value === null || typeof value === "object" ? "" : String(value);
}

const loosely = (text) => text.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// 171: as `APIPointRule.holds`: every rule must hold, a missing key reads as an empty one.
function passes(item, rules) {
  return (rules || []).every((rule) => {
    if (!rule.key?.trim()) return true;
    const found = dotted(item, rule.key.trim());
    if (rule.op === "notEmpty") {
      return Array.isArray(found) ? found.length > 0 : found !== null && typeof found === "object" ? true : asText(found).trim() !== "";
    }
    const have = loosely(asText(found));
    const wanted = loosely(rule.value || "");
    if (rule.op === "is") return have === wanted;
    if (rule.op === "isNot") return have !== wanted;
    return wanted === "" || have.includes(wanted);
  });
}

function scalarKeys(item, depth = 3, prefix = "") {
  if (depth <= 0 || item === null || typeof item !== "object" || Array.isArray(item)) return [];
  return Object.keys(item).sort().flatMap((key) => {
    const part = item[key];
    const path = prefix ? `${prefix}.${key}` : key;
    return part === null || typeof part !== "object" ? [path] : scalarKeys(part, depth - 1, path);
  });
}

function coffeeRead(query, cookie) {
  const reading = query.has("reading") ? JSON.parse(query.get("reading"))
    : { itemsPath: "cities", spelling: "decimal", latitudeKey: "lat", longitudeKey: "lon", positionKey: "", nameKey: "name", shownKeys: [] };
  reading.cookies = undefined;
  const items = COFFEE_ANSWER[reading.itemsPath] || [];
  const keys = [...new Set(items.flatMap((item) => scalarKeys(item)))].sort();
  const samples = Object.fromEntries(keys.map((key) => [key, asText(dotted(items.find((item) => asText(dotted(item, key))), key))]));
  const placed = (item) => reading.spelling === "position"
    ? /^-?\d+(\.\d+)?, ?-?\d+(\.\d+)?$/.test(asText(dotted(item, reading.positionKey)))
    : typeof dotted(item, reading.latitudeKey) === "number" && typeof dotted(item, reading.longitudeKey) === "number";
  const points = items.filter((item) => placed(item) && passes(item, reading.filter)).length;
  return { reading, paths: ["cafes", "cities"], keys, points, name: "coffee.example", said: `Answered · ${points} points`,
    samples, answer: COFFEE_ANSWER, keepsCookie: Boolean(cookie || phone.keptCookie), choices: API_CHOICES };
}

function apiRead(query, cookie) {
  if (!/^https:\/\//.test(query.get("address") || "")) return null;
  if (new URL(query.get("address")).host === "coffee.example") return coffeeRead(query, cookie);
  const reading = query.has("reading") ? JSON.parse(query.get("reading"))
    : { itemsPath: "vehicles", spelling: "decimal", latitudeKey: "lat", longitudeKey: "lon", positionKey: "", nameKey: "line",
      shownKeys: [] };
  const cookies = query.has("cookies") ? JSON.parse(query.get("cookies")) : null;
  reading.cookies = cookies?.isOn ? cookies : undefined;
  const keys = reading.itemsPath === "vehicles" ? ["lat", "lon", "line"] : [];
  const placed = keys.includes(reading.latitudeKey) && keys.includes(reading.longitudeKey);
  const points = placed ? (BUS_ANSWER.vehicles || []).filter((item) => passes(item, reading.filter)).length : 0;
  const samples = keys.length ? { lat: "48.15", lon: "17.11", line: "N33" } : {};
  return { reading, paths: ["vehicles", "stops"], keys, points, name: "buses.example", said: `Answered · ${points} points`,
    samples, answer: BUS_ANSWER, keepsCookie: Boolean(cookie || phone.keptCookie), choices: API_CHOICES };
}

// 29: a layer's Details layout as `PeerWebLayerOptions+Details` lists it, and its edits.
const LAYOUT_WORDS = { addContent: "Add content", addSection: "Add section", removeSection: "Remove section",
  sectionTitle: "Title", fromTheApp: "From the app", name: "Name", value: "Value", label: "Label", link: "Link",
  heading: "Title", plain: "Plain", box: "Box", warning: "Warning", full: "This layout holds 10 content blocks",
  header: "Header", icon: "Icon", layerIcon: "As the app shows it", headerTitleNote: "Left empty, the sheet keeps the name.",
  actions: "Action buttons", addActions: "Add action buttons", removeActions: "Remove from Details",
  addButton: "Add custom button", buttonsShow: "Buttons show", highlight: "Highlight the first one", look: "Look",
  whenTapped: "When tapped", subject: "Subject", body: "Message", hidesButton: "Hide when a key is empty",
  textIcon: "A note icon before the text", hidesText: "Hide when empty", nameAndValue: "Name and value",
  rowIcons: "A small icon before each row", hidesRows: "Hide empty rows", addRow: "Add a row", liveFor: "Live for",
  card: "What the card shows", place: "Place", withActions: "With action buttons", belowRows: "Below the rows",
  taps: "A tap opens Details on", tapsNote: "A tap on a shape that is off goes through to the map under it." };

function detailsSections(layer) {
  const used = layer.layout.flatMap((section) => section.blocks).filter((block) => block.counts).length;
  return [{ kind: "details", title: "Details", footnote: "What a tapped point's sheet shows.", layerScoped: true,
    layout: { sections: layer.layout.map((section, index) => ({ ...section, name: section.title || `Section ${index + 1}` })),
      used, limit: 10, parts: [], keys: ["line", "note"], offers: [{ id: "text", title: "Text" }],
      ...(phone.takesTranslations ? { takesTranslations: true } : {}),
      ...(layer.samples ? { samples: layer.samples, sampleNote: "Tap a point on the map first" } : {}),
      words: { ...LAYOUT_WORDS, used: `${used} of 10 content blocks used` },
      header: { title: layer.header?.title ?? null, symbol: layer.header?.symbol ?? null, layerSymbol: layer.symbol,
        ...(layer.header?.titleTranslations ? { titleTranslations: layer.header.titleTranslations } : {}) },
      actions: layer.actions ? { ...layer.actions, items: [...layer.actions.items,
        ...BUILT_INS.filter(([id]) => !layer.actions.items.some((item) => item.id === id))
          .map(([id, name]) => ({ id, name, note: "", isOn: false }))] } : null,
      taps: ["points", "paths", "areas"].map((kind) => ({ kind, name: kind[0].toUpperCase() + kind.slice(1),
        isOn: !(layer.tapsOff ?? []).includes(kind) })),
      symbols: ["tram.fill", "star.fill"], choices: LAYOUT_CHOICES,
      // 80: an older phone sends none of the groups, so the page offers no row icon.
      ...(phone.listsRowIcons === false ? {} : { symbolGroups: SYMBOL_GROUPS.map(({ title, symbols }) => ({ title,
        symbols: symbols.filter((symbol) => !phone.droppedSymbols.has(symbol)) })) }) } }];
}

// 80: the icon picker's groups and the marks a row may wear, as `PeerWebDetailsSettings` allows them.
const SYMBOL_GROUPS = [{ title: "Transport", symbols: ["tram.fill", "bus.fill", "car.fill"] },
  { title: "Nature", symbols: ["leaf.fill", "mountain.2.fill"] }];
const SUGGESTED_SYMBOLS = ["tram.fill", "star.fill"];
const FIRST_ROW_SYMBOL = "info.circle";

function allowsRowSymbol(symbol, worn) {
  if (!symbol) return false;
  if (symbol === worn) return true;
  return !phone.droppedSymbols.has(symbol)
    && [...SYMBOL_GROUPS.flatMap((group) => group.symbols), ...SUGGESTED_SYMBOLS].includes(symbol);
}

// 79: stands in for `LayerDetails.filled(from:)`: a `{key}` read from the point, empty ones dropped.
function filledSheet(layer, values) {
  const fill = (text) => (text || "").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "").trim();
  const filled = (block) => {
    const settings = block.settings || {};
    if (block.kind === "rows") {
      const rows = (settings.rows || []).map((row) => ({ title: row.title, value: fill(row.value) }))
        .filter((row) => row.value || !settings.hidesEmpty);
      return rows.length ? { kind: "rows", rows } : null;
    }
    if (block.kind === "text") {
      const text = fill(block.value);
      return text || !settings.hides ? { kind: "text", title: block.heading, text, warning: block.style === "warning" || undefined } : null;
    }
    return block.part === "allTags" ? { kind: "allTags" } : null;
  };
  const sections = layer.layout.map((section) => ({ title: section.title,
    blocks: section.blocks.map(filled).filter(Boolean) })).filter((section) => section.blocks.length);
  return { title: values.line ? `Line ${values.line}` : null, sections, keys: ["line", "speed", "note"] };
}

// 55: the settings `PeerWebDetailsListing` lists beside the blocks, and `PeerWebDetailsSettings` sets.
const BUILT_INS = [["directions", "Directions"], ["save", "Save"], ["share", "Share"], ["follow", "Follow"],
  ["copy", "Copy"]];
const LAYOUT_CHOICES = { labels: [{ id: "iconAndLabel", title: "Icon and label" }, { id: "iconOnly", title: "Icon only" }],
  buttonKinds: [{ id: "link", title: "Open link", detail: "Link" }, { id: "call", title: "Call", detail: "Number" },
    { id: "email", title: "Email", detail: "Address" }],
  buttonLooks: [{ id: "filled", title: "Filled" }, { id: "tinted", title: "Tinted" }, { id: "outline", title: "Outline" }],
  rowLooks: [{ id: "nameAboveValue", title: "Name above value" }, { id: "sideBySide", title: "Side by side" }],
  cardParts: [{ id: "delay", title: "Delay in minutes" }, { id: "station", title: "Station" }] };

function settleLayout(layer, query, held) {
  const op = query.get("details");
  const on = (key) => query.get(key) === "1";
  if (op === "header") {
    layer.header = { ...layer.header, title: query.get("title") || null, symbol: query.get("symbol") || null };
  } else if (op === "addActions") {
    layer.actions ??= { items: BUILT_INS.slice(0, 4).map(([id, name]) => ({ id, name, note: "", isOn: true })),
      labels: "iconAndLabel", highlightsFirst: false };
  } else if (op === "removeActions") {
    layer.actions = null;
  } else if (!layer.actions && ["action", "moveAction", "actionsLook", "addButton", "removeButton"].includes(op)) {
    return false;
  } else if (op === "action") {
    const items = layer.actions.items.filter((item) => item.id !== query.get("name"));
    const named = BUILT_INS.find(([id]) => id === query.get("name"));
    layer.actions.items = on("on") && named ? [...items, { id: named[0], name: named[1], note: "", isOn: true }] : items;
  } else if (op === "moveAction") {
    const items = layer.actions.items;
    const from = items.findIndex((item) => item.id === query.get("item"));
    if (from < 0) return false;
    const [item] = items.splice(from, 1);
    items.splice(Number(query.get("to")), 0, item);
  } else if (op === "taps") {
    const kind = query.get("kind");
    if (!["points", "paths", "areas"].includes(kind)) return false;
    layer.tapsOff = (layer.tapsOff ?? []).filter((one) => one !== kind).concat(on("on") ? [] : [kind]);
  } else if (op === "actionsLook") {
    Object.assign(layer.actions, { labels: query.get("labels"), highlightsFirst: on("highlight") });
  } else if (op === "addButton") {
    const id = `b${Date.now()}`;
    layer.actions.items.push({ id, name: "Custom button", note: "Open link", isOn: true,
      button: { id, label: "Custom button", look: "tinted", action: "link", template: null, hides: false } });
  } else if (op === "removeButton") {
    layer.actions.items = layer.actions.items.filter((item) => item.id !== query.get("button"));
  } else if (op === "buttonPlace") {
    // 55: as `movingActionButtonToRows` and `movingButtonToActions` move it.
    const item = layer.actions?.items.find((one) => one.id === query.get("button"));
    if (item) {
      layer.actions.items = layer.actions.items.filter((one) => one !== item);
      layer.layout[0].blocks.push({ handle: `h${item.id}`, kind: "button", name: item.name, counts: true,
        settings: { button: item.button } });
    } else if (held()?.kind === "button") {
      const [block] = layer.layout[Number(query.get("section"))].blocks.splice(Number(query.get("block")), 1);
      layer.actions ??= { items: [], labels: "iconAndLabel", highlightsFirst: false };
      layer.actions.items.push({ id: block.settings.button.id, name: block.name, note: "Open link", isOn: true,
        button: block.settings.button });
    } else {
      return false;
    }
  } else if (op === "button") {
    const item = layer.actions?.items.find((one) => one.id === query.get("button"));
    const button = item?.button ?? held()?.settings?.button;
    if (!button) return false;
    Object.assign(button, { label: query.get("label"), symbol: query.get("symbol") || null, look: query.get("look"),
      action: query.get("action"), template: query.get("template") || null, subject: query.get("subject") || null,
      body: query.get("body") || null, hides: on("hides") });
    if (item) Object.assign(item, { name: button.label });
  } else if (op === "blockSettings") {
    const settings = held()?.settings;
    if (!settings) return false;
    for (const key of ["icon", "hides", "icons", "hidesEmpty"]) if (query.has(key)) settings[key] = on(key);
    if (query.has("look")) settings.look = query.get("look");
    if (settings.card) for (const { id } of LAYOUT_CHOICES.cardParts) if (query.has(id)) settings.card[id] = query.get(id);
  } else if (op === "addRow") {
    const rows = held()?.settings?.rows;
    if (!rows) return false;
    rows.push({ index: rows.length, title: query.get("title"), value: query.get("value"),
      symbol: query.get("symbol") ?? FIRST_ROW_SYMBOL });
  } else if (op === "editRow") {
    const row = held()?.settings?.rows?.[Number(query.get("row"))];
    if (!row) return refusal(409, CANNOT_TAKE);
    Object.assign(row, { title: query.get("title"), value: query.get("value"), symbol: query.get("symbol") ?? row.symbol });
  } else if (op === "removeRow") {
    const rows = held()?.settings?.rows;
    if (!rows) return false;
    rows.splice(Number(query.get("row")), 1);
    rows.forEach((row, index) => { row.index = index; });
  } else {
    return false;
  }
  return true;
}

const CANNOT_TAKE = "This map cannot draw that layer beside what it draws";
const refusal = (status, text) => [status, text];

// 81: as `PeerWebDetailsTranslation` finds the title a translation belongs to.
function translated(layer, query, held) {
  const target = query.get("target");
  const number = (key) => Number(query.get(key));
  const moved = refusal(409, "The layout changed on the phone; it is shown again as it is now");
  const by = (owner, base, key) => ({ base: owner?.[base], held: owner?.[key],
    store: (kept) => { if (kept) owner[key] = kept; else delete owner[key]; } });
  if (target === "header") return layer.header ? by(layer.header, "title", "titleTranslations") : "untitled";
  if (target === "section") {
    const section = layer.layout[number("section")];
    return section ? by(section, "title", "titleTranslations") : moved;
  }
  if (target === "text" || (target === "button" && !query.has("button"))) {
    if (held()?.handle !== query.get("was")) return moved;
    const block = held();
    if (block.kind !== (target === "text" ? "text" : "button")) return refusal(409, CANNOT_TAKE);
    return target === "text" ? by(block, "heading", "headingTranslations")
      : by(block.settings.button, "label", "labelTranslations");
  }
  const item = layer.actions?.items.find((one) => one.id === query.get("button") && one.button);
  return item ? by(item.button, "label", "labelTranslations") : moved;
}

function translate(layer, query, held) {
  const language = query.get("language")?.trim();
  const text = query.get("text");
  if (!language || text === null || !["header", "section", "text", "button"].includes(query.get("target"))) {
    return refusal(409, "This change does not fit the map");
  }
  const title = translated(layer, query, held);
  if (Array.isArray(title)) return title;
  const removes = text.trim() === "";
  if (title === "untitled") {
    if (removes) return true;
    return phone.languages.includes(language) ? refusal(409, CANNOT_TAKE) : refusal(404, NO_LANGUAGE);
  }
  if (!phone.languages.includes(language) && !(removes && title.held?.[language] !== undefined)) {
    return refusal(404, NO_LANGUAGE);
  }
  if (!removes && !title.base?.trim()) return refusal(409, CANNOT_TAKE);
  const kept = { ...title.held };
  if (removes) delete kept[language]; else kept[language] = text.trim();
  title.store(Object.keys(kept).length ? kept : undefined);
  return true;
}

const NO_LANGUAGE = "The app has no such language";

// 80: the icon is judged before the handle, as the phone judges it.
function refusedSymbol(held, query) {
  const op = query.get("details");
  if (!["addRow", "editRow"].includes(op) || (op === "addRow" && !query.has("symbol"))) return null;
  const worn = op === "addRow" ? FIRST_ROW_SYMBOL : held?.settings?.rows?.[Number(query.get("row"))]?.symbol;
  if (op === "editRow" && !query.has("symbol")) return null;
  return allowsRowSymbol(query.get("symbol")?.trim(), worn) ? null : refusal(404, "Edit map offers no such icon");
}

function editLayout(layer, query) {
  const sections = layer.layout;
  const number = (key) => Number(query.get(key));
  const held = () => sections[number("section")]?.blocks[number("block")];
  const op = query.get("details");
  const byHandle = ["remove", "move", "edit", "blockSettings", "addRow", "editRow", "removeRow"].includes(op)
    || (op === "buttonPlace" && query.has("was"));
  if (op === "translation") return translate(layer, query, held);
  const refused = refusedSymbol(held(), query);
  if (refused) return refused;
  if (byHandle && held()?.handle !== query.get("was")) return false;
  if (op === "add") {
    sections[number("section")].blocks.splice(number("place"), 0, { handle: `n${Date.now()}`,
      kind: query.get("kind"), name: "Text", value: query.get("value"), style: "box", counts: true });
  } else if (op === "remove") {
    sections[number("section")].blocks.splice(number("block"), 1);
  } else if (op === "move") {
    const [block] = sections[number("section")].blocks.splice(number("block"), 1);
    sections[number("toSection")].blocks.splice(number("toPlace"), 0, block);
  } else if (op === "addSection") {
    sections.push({ title: null, blocks: [] });
  } else if (op === "sectionTitle") {
    sections[number("section")].title = query.get("title") || null;
  } else if (op === "removeSection") {
    // 50: as `LayerDetailsChange` takes a section away, its blocks with it.
    if (sections.length < 2) return false;
    sections.splice(number("section"), 1);
  } else if (op === "edit") {
    Object.assign(held(), { value: query.get("value"), heading: query.get("title") || undefined,
      style: query.get("style") || undefined });
  } else {
    return settleLayout(layer, query, held);
  }
  return true;
}

// 69: the signs' key as `PeerWebRoadSigns` answers: the country asked, else Slovakia, by its name.
const SIGN_COUNTRIES = [["at", "Austria", [["at.ts.1", "Vorrang geben"]]],
  ["sk", "Slovakia", [["sk.ts.201", "Give way"], ["sk.ts.202", "Stop"]]]];
const SIGN_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

function roadSigns(query) {
  const typed = (query.get("q") || "").trim().toLowerCase();
  const [code, name, signs] = SIGN_COUNTRIES.find(([id]) => id === query.get("country")) || SIGN_COUNTRIES[1];
  return { country: code, countryName: name,
    countries: SIGN_COUNTRIES.filter(([id, title]) => !typed || title.toLowerCase().includes(typed) || id === typed)
      .map(([id, title]) => ({ id, title, detail: "" })),
    signs: signs.map(([id, title]) => ({ id, title })) };
}

// 172: as `PeerWebLayerOptions` says a server's look is waiting: only above what the layer answered, only the parts behind.
function serverLookAsk(layer) {
  const look = layer.serverLook;
  const behind = (look?.parts || []).filter((part) => part.behind);
  if (!look || look.version <= look.answered || !behind.length) return undefined;
  return { server: look.server, version: look.version,
    parts: behind.map(({ id, title, changed, changedHere }) => ({ id, title, changed, changedHere })) };
}

// 172: Review's answer: the parts taken are copied, the version is asked about either way.
function answerServerLook(layer, query) {
  const look = layer.serverLook;
  if (!look) return false;
  const version = Number(query.get("serverVersion") || query.get("serverKeep"));
  if (query.has("serverTake")) {
    for (const id of query.get("serverTake").split(",").filter(Boolean)) {
      const part = look.parts.find((one) => one.id === id);
      if (!part?.behind) return false;
      part.behind = false;
      if (id === "markers") layer.tint = "#2E9E5B";
    }
  }
  look.answered = Math.max(look.answered, version);
  phone.serverLookAnswers.push(Object.fromEntries(query));
  return true;
}

function layerOptions(each) {
  const hidden = (style) => style.adjustments?.hiddenSkiKinds || [];
  const anyDraws = (key) => each.styles.some((style) => style.adjustments?.[key] !== true);
  const sections = (layer) => {
    if (layer.overlay === "ski") {
      return [...lookSections(layer), { kind: "kinds", title: "Pistes, lifts and trails", footnote: "Leave on only what you want to see.",
        family: "ski", items: SKI_KINDS.map(([id, title]) => ({ id, title, light: "#3366CC", dark: "#88AAFF",
          isOn: !hidden(each.styles[0]).includes(id) })) }];
    }
    if (layer.overlay === "railways") {
      return [{ kind: "railVariants", title: "Look in each style", footnote: "Each style keeps its own.",
        styles: each.styles.map((style) => ({ id: style.id, name: style.name,
          variant: style.adjustments?.railVariant || "standard" })),
        options: RAIL_VARIANTS.map(([id, title, detail]) => ({ id, title, detail })) },
      { kind: "switch", title: "Trackside marks", footnote: "In every style of this map.", key: "railMarks",
        label: "Marks on the track", isOn: anyDraws("hidesRailMarks") }];
    }
    if (layer.overlay === "roads") {
      // 69: as `PeerWebLayerOptions` lists Roads: the switch, the key while signs show, road numbers.
      const signs = anyDraws("hidesRoadSigns");
      return [{ kind: "switch", title: "Traffic signs", footnote: "Signs as OpenStreetMap maps them.", key: "roadSigns",
        label: "Signs by the road", isOn: signs },
      ...(signs ? [{ kind: "signKey", title: "Country", footnote: "", label: "Search countries" }] : []),
      { kind: "choice", title: "Road numbers", footnote: "Every map follows this.", key: "roadShields",
        value: phone.roadShields || "country",
        options: [["country", "Country shields"], ["classic", "One per road class"]]
          .map(([id, title]) => ({ id, title, detail: "" })) }];
    }
    if (layer.layout) return detailsSections(layer);
    if (layer.apiPoints) return apiPointSections(layer);
    return layer.drawn ? [...featureSections(layer), ...markSections(layer)] : layer.net ? networkSections(layer) : layer.esri ? [...questionSections(layer), ...markSections(layer), ...featureSections(layer).filter((one) => one.aspect === "linesAndAreas")] : [];
  };
  return { layers: each.layers.map((layer) => ({ id: layer.id, sections: sections(layer), serverLook: serverLookAsk(layer) }))
    .filter((layer) => layer.sections.length) };
}

// 2966: the phone's saved servers, as `PeerWebServers` walks them.
const OSM = "0D5E1F00-0000-4000-8000-000000000001";
const ZBGIS = "0D5E1F00-0000-4000-8000-000000000002";
// 183: as `PeerWebServerEdit` keeps them: the shipped list stays, edits and deletions lie over it.
const heldServers = () => [...SERVERS, ...phone.addedServers, ...phone.importedServers]
  .filter((server) => !phone.goneServers.has(server.id))
  .map((server) => ({ ...server, ...phone.serverEdits.get(server.id) }));

// 187: as `PeerWebServers.Listing` says them, with the login's Ask again rates.
const COOKIE_AGES = [{ value: "0", title: "As they say" }, { value: "600", title: "10 min" }];
const listedServers = () => ({ servers: heldServers(), cookieAges: COOKIE_AGES });
const SERVER_KIND_TITLES = { arcgis: "Esri / ArcGIS", tilejson: "TileJSON", tiles: "Tile server", wmts: "WMTS",
  wms: "WMS", mapproxy: "MapProxy", api: "API" };

const SERVERS = [
  { id: OSM, name: "OpenTopoMap", line: "Tiles", address: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
    kind: "Tile server", kindID: "tiles", takesLayers: true, symbol: "mountain.2",
    headers: [{ name: "X-Api-Key", isSet: true }], referrer: null, login: null, rows: [
    { kind: "layer", title: "OpenTopoMap", subtitle: "Raster", depth: 0, pick: { server: OSM, layer: "" } }] },
  { id: ZBGIS, name: "ZBGIS", line: "Esri / ArcGIS · 3 services", address: "https://zbgis.test/arcgis/rest/services",
    kind: "Esri / ArcGIS", kindID: "arcgis", facts: [{ name: "Version", value: "11.1" }], rows: [
    { kind: "heading", title: "Base", depth: 0 },
    { kind: "heading", title: "Parcels", subtitle: "MapServer", depth: 1 },
    { kind: "layer", title: "Parcels C", subtitle: "Areas", depth: 2,
      pick: { server: ZBGIS, service: "https://zbgis.test/Base/Parcels/MapServer", layer: "0" },
      takes: [{ id: "live", title: "Live", explains: "Fetched for the view as you pan; needs a signal." },
        { id: "features", title: "Features", explains: "Downloaded in full and drawn offline. Big layers take a while." },
        { id: "image", title: "Image", explains: "The service draws a picture; nothing in it can be tapped or searched." }] },
    { kind: "layer", title: "Parcels E", subtitle: "Areas", depth: 2,
      pick: { server: ZBGIS, service: "https://zbgis.test/Base/Parcels/MapServer", layer: "1" } },
    { kind: "layer", title: "Orthophoto", subtitle: "ImageServer", depth: 0,
      pick: { server: ZBGIS, service: "https://zbgis.test/Ortho/ImageServer", layer: "0" } },
    { kind: "heading", title: "Heights", subtitle: "MapServer", depth: 0 },
    { kind: "note", title: "Not read yet — open it under Servers.", depth: 1 }] }
];

// 2967: a WMS as `OGCFacadeReader` reads it, one layer in a projection the app cannot draw.
const WMS_READING = { kind: "layers", title: "Geology", footnote: "Each layer becomes its own row, drawn by the server as you pan.",
  rows: [{ id: "faults", title: "Faults", subtitle: "WMS · faults" },
    { id: "rocks", title: "Rocks", subtitle: "WMS · rocks" },
    { id: "boreholes", title: "Boreholes", subtitle: "boreholes", refusal: "Only in Web Mercator" }] };

function coverageSummary(each) {
  const coverage = each.coverage || null;
  const named = (side) => [side.world ? "Whole world" : null, side.mountains ? "Every mountain range" : null,
    ...(side.continents || []), ...(side.countries || []), ...(side.regions || [])].filter(Boolean);
  const taken = coverage ? named(coverage) : [];
  const left = coverage?.exclude ? named(coverage.exclude) : [];
  const except = left.length ? " · except " + left.join(", ") : "";
  const line = !coverage ? "Not limited" : (taken.join(", ") || "Whole world") + except;
  const warnings = [];
  if (coverage?.exclude?.world && !taken.length) {
    warnings.push("With these choices the map covers no place at all. Take something in, or leave less out.");
  }
  const requires = each.id.endsWith("1");
  if (requires && (coverage?.exclude?.regions || []).includes("vysoke_tatry")) {
    warnings.push("Left out here, yet a layer requires it: Vysoké Tatry");
  }
  return { coverage, line, required: requires ? "Its layers require Vysoké Tatry" : null, warnings };
}

// 129: as `PeerWebSearch.answer` reads an ask: no text is 400, under three letters only a number answers.
const SEARCHED_HUTS = "6F1E2A10-0000-4000-8000-0000000000A2";
const SEARCHED_TRAINS = "6F1E2A10-0000-4000-8000-0000000000E1";
const searchFolded = (text) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

function placesSearch(query) {
  if (!query.has("q")) return null;
  const text = searchFolded(query.get("q"));
  const isLine = /^\d+$/.test(text);
  if (!isLine && text.length < 3) return { places: [] };
  const own = [
    { title: "Chata pod Rysmi", layer: "Huts", layerID: SEARCHED_HUTS, lat: 49.1794, lon: 20.0881,
      properties: { Nazov: "Chata pod Rysmi", Elevation: "2250", Beds: "40" } },
    { title: "Zbojnícka chata", layer: "Huts", layerID: SEARCHED_HUTS, lat: 49.2005, lon: 20.1115,
      properties: { Nazov: "Zbojnícka chata", Elevation: "1960", Beds: "30" } },
    { title: "Os 4314", layer: "Trains", layerID: SEARCHED_TRAINS, lat: 49.06, lon: 20.29,
      properties: { Nazov: "Os 4314", Line: "4314" } }];
  const indexed = [
    { title: "Poprad", detail: "Prešov Region", kind: "city", lat: 49.06, lon: 20.3, box: [20.2, 49.0, 20.4, 49.1],
      properties: { name: "Poprad", population: "50000" } },
    { title: "Popradské pleso", detail: "High Tatras", kind: "lake", lat: 49.0675, lon: 20.0711,
      properties: { name: "Popradské pleso", ele: "1494" } }];
  const found = (each) => searchFolded(each.title).includes(text) || (isLine && searchFolded(each.title).endsWith(text));
  return { places: [...own.filter(found), ...isLine ? [] : indexed.filter(found)] };
}

// 2949: as `PeerWebStartPlaces` answers: the phone's regions and countries, its search's cities.
function startPlaces(kind, wanted) {
  if (kind === "region") {
    return [{ start: { kind, region: "vysoke_tatry" }, title: "Vysoké Tatry", detail: null },
      { start: { kind, region: "presovsky" }, title: "Prešovský kraj", detail: "Slovakia" }];
  }
  if (kind === "country") {
    return ["AT", "CZ", "SK"].map((country) => ({ start: { kind, country },
      title: { AT: "Austria", CZ: "Czechia", SK: "Slovakia" }[country], detail: null }));
  }
  if (!wanted.toLowerCase().startsWith("pop")) return [];
  return [{ start: { kind, latitude: 49.06, longitude: 20.3, country: "SK", name: "Poprad",
    box: { minLon: 20.2, minLat: 49.0, maxLon: 20.4, maxLat: 49.1 } }, title: "Poprad", detail: "Slovakia" }];
}

// As `PeerWebAddServer.kinds`.
const SERVER_KIND_LINES = { arcgis: "Esri / ArcGIS · 1 service", tilejson: "TileJSON · 1 layer",
  tiles: "Tile server · 1 layer", wmts: "WMTS · 1 layer", wms: "WMS · 1 layer", mapproxy: "MapProxy · 1 layer",
  api: "API" };

function portable(each) {
  return { id: each.id, name: each.name, note: each.note, category: each.category, nameTranslations: each.nameTranslations,
    noteTranslations: each.noteTranslations, symbol: each.symbol, iconTintHex: each.iconTintHex,
    selectedStyleID: each.styles[0].id, styles: each.styles, start: each.start, coverage: each.coverage,
    appearance: each.appearance, iconPicture: each.iconPicture, previewPicture: each.previewPicture,
    stack: each.layers.map((layer) => ({ id: layer.id, name: layer.name, symbol: layer.symbol,
      isEnabled: layer.isEnabled, opacity: layer.opacity ?? 1 })) };
}

function style(each, query) {
  const hidden = new Set((query.get("hide") || "").split(",").filter(Boolean));
  const colours = { light: "#dde8d4", dark: "#1d2a22" };
  const theme = each.appearance || query.get("theme");
  const shown = each.layers.filter((layer) => !hidden.has(layer.id));
  // A live layer is an empty GeoJSON source the page fills from `/live`, as `StyleBuilder` writes it.
  const sources = Object.fromEntries(shown.filter((layer) => layer.isLive).map((layer) => [
    "riki-custom-" + layer.id.toLowerCase(), { type: "geojson", data: { type: "FeatureCollection", features: [] } }]));
  // 2915: a Riki map's relief, with the hidden 3D colour layer `StyleBuilder` puts under each hillshade.
  const relief = each.drawsRelief ? [{ id: "relief", type: "hillshade", source: "dem" },
    { id: "riki-colour-relief-0", type: "color-relief", source: "dem", layout: { visibility: "none" },
      paint: { "color-relief-color": ["interpolate", ["linear"], ["elevation"], 0, "#000", 1000, "#fff"] } }] : [];
  // 2941: house numbers lifted onto their roofs, as `StyleBuilder` writes them where buildings rise.
  sources.numbers = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
  // 3176: as `PeerStyleRewriter` points a tile layer: its own address for a browser loading directly, else the relay.
  const direct = phone.direct === true && query.get("direct") === "1";
  for (const layer of shown.filter((each) => each.net)) {
    sources["riki-net-" + layer.id.toLowerCase()] = { type: "raster", tileSize: 256,
      tiles: [direct ? "https://tiles.test/{z}/{x}/{y}.png" : "/riki/v1/relay/mock/{z}/{x}/{y}.png"] };
  }
  if (relief.length) sources.dem = { type: "raster-dem", tiles: ["/__test/none/{z}/{x}/{y}.png"], bounds: [-179.9, -89, -179.8, -88.9] };
  return { version: 8, name: each.name, sources,
    layers: [{ id: "ground", type: "background", paint: { "background-color": colours[theme] || "#ddd" } },
      ...relief,
      { id: "numbers", type: "symbol", source: "numbers",
        layout: { "text-field": "1", "symbol-z-offset": ["coalesce", ["get", "render_height"], 0] } },
      ...shown.map((layer) => layer.isLive
        ? { id: "riki-custom-layer-" + layer.id.toLowerCase(), type: "circle",
          source: "riki-custom-" + layer.id.toLowerCase(), paint: { "circle-radius": 8 } }
        : layer.net
          ? { id: "riki-" + layer.id.toLowerCase(), type: "raster", source: "riki-net-" + layer.id.toLowerCase(),
            layout: {}, paint: {} }
          : { id: "riki-" + layer.id.toLowerCase(), type: "background", paint: { "background-opacity": 0 } })] };
}

function setShown(each, query, layers, isOn) {
  const style = each.styles.find((one) => one.id === query.get("styleID")) || each.styles[0];
  const hidden = new Set(style.arrangement?.hidden || []);
  layers.forEach((layer) => {
    layer.isEnabled = isOn;
    if (isOn) hidden.delete(layer.id); else hidden.add(layer.id);
  });
  style.arrangement = { ...style.arrangement, hidden: [...hidden] };
}

// 50: as `PeerWebMapSwitches.switches` reads the map and Settings › Map.
function switches(each) {
  const grouped = each.groupsLayersByOrigin === true;
  return { picker: each.hiddenFromPicker !== true, carPlay: !(each.hiddenFromCarPlay ?? each.hiddenFromPicker === true),
    legend: each.hidesLegend !== true, world: each.hidesWorldAround !== true, legendEverywhere: phone.legendEverywhere,
    worldEverywhere: true, hasNothingToDraw: each.layers.length === 0, ownsSettings: phone.ownsSettings,
    groupsByOrigin: grouped, groupingOffered: grouped || each.mixedSources === true,
    groupingReorders: each.mixedSources === true && !grouped, stylesDisagree: each.stylesDisagree === true,
    differsFromDefault: each.differsFromDefault === true,
    layersWithoutStyle: each.layers.filter((layer) => !each.styles.some((style) => style.name === layer.name)).length,
    removedStyles: each.removedStyles ?? 0, editedStyles: each.editedStyles ?? [], deletion: deletionOf(each),
    lock: lockOf(each) };
}

// 118: Face ID on the phone, as the test says it answers: yes or no, after a wait, or no passcode at all.
const face = () => (phone.face ??= { answers: true, asks: 0, wait: 0, hasPasscode: true });

// 118: as `PeerWebLock.offered` draws Edit map's row: only the owner of a shared map may move it.
function lockOf(each) {
  const mayChange = phone.ownsSettings && face().hasPasscode;
  return { isOn: each.locked === true, mayChange, brand: "Face ID",
    note: "Asks for Face ID or the passcode before it is shown or edited",
    sharedNote: phone.shares[each.id]
      ? (phone.ownsSettings ? "Everyone the map is shared with is asked too, on their own device."
        : "The map's owner locked it for everyone it is shared with.") : null };
}

// 118: as `PeerWebLock.refusal` weighs it: asked only when the lock would change, then written.
async function lockChange(each, query, response) {
  const on = query.get("lock");
  if (on !== "1" && on !== "0") return send(response, 400, "");
  if (!phone.ownsSettings) return send(response, 403, "This map is shared with this phone to look at, not to change");
  if ((on === "1") !== (each.locked === true)) {
    if (!face().hasPasscode) return send(response, 409, "Set a passcode in the phone's Settings first");
    face().asks += 1;
    if (face().wait) await new Promise((done) => setTimeout(done, face().wait));
    if (!face().answers) {
      return send(response, 403, "Not confirmed on the phone: answer Face ID or the passcode there");
    }
    each.locked = on === "1" ? true : undefined;
    each.revision += 1;
  }
  return json(response, portable(each));
}

// 62: as `PeerWebDeleteMap.offered`: the last map stays, a locked one waits for Face ID.
function deletionOf(each) {
  if (phone.maps.length < 2 || each.locked) return undefined;
  return phone.ownsSettings ? "onlyYou" : "yourList";
}

// 119: as `PeerWebFromMaps.listing`: unlocked maps only; what this map draws is blocked.
const ALREADY = "Already in this map";

function otherLayers(each) {
  const groups = phone.maps.filter((one) => one.id !== each.id && !one.locked).map((one) => ({
    map: one.id, name: one.name, symbol: one.symbol ?? "map", iconTintHex: one.iconTintHex ?? null,
    rows: [...one.layers].reverse().map((layer) => ({ layer: layer.id, title: layer.name, subtitle: layer.kind,
      symbol: layer.symbol, blocked: each.layers.some((mine) => mine.name === layer.name) ? ALREADY : null })) }));
  return { groups: groups.filter((group) => group.rows.some((row) => !row.blocked)) };
}

const AVAILABILITY = { picker: "hiddenFromPicker", carPlay: "hiddenFromCarPlay", legend: "hidesLegend",
  world: "hidesWorldAround" };

// 50: as `PeerWebEdit+Arrange` makes it; null for a query that is none of these.
function arranged(each, query) {
  if (query.has("layer")) return null;
  if (query.has("styleOrder")) {
    const asked = query.get("styleOrder").split(",");
    const placed = asked.map((id) => each.styles.find((one) => one.id === id));
    if (placed.includes(undefined) || new Set(asked).size !== each.styles.length) {
      return [404, "This change does not fit the map"];
    }
    each.styles = placed;
    return [];
  }
  if (query.has("resetStyle")) {
    // 53: as `PeerWebArrange` resets a style's adjustments.
    const style = query.get("resetStyle");
    if (!each.styles.some((one) => one.id === style)) return [404, "This change does not fit the map"];
    each.editedStyles = (each.editedStyles ?? []).filter((id) => id !== style);
    return [];
  }
  const action = query.get("arrange");
  if (action === "unite") each.stylesDisagree = false;
  else if (action === "reset") Object.assign(each, { differsFromDefault: false, stylesDisagree: false });
  else if (action === "restoreStyles") {
    if (each.removedStyles) each.styles.push({ id: randomUUID().toUpperCase(), name: "Classic", arrangement: { hidden: [] } });
    each.removedStyles = 0;
  } else if (action === "stylePerLayer") {
    const lacking = each.layers.filter((layer) => !each.styles.some((style) => style.name === layer.name));
    if (!lacking.length) return [409, "Every layer has a style of its own already"];
    each.styles.push(...lacking.map((layer) => ({ id: randomUUID().toUpperCase(), name: layer.name,
      arrangement: { hidden: each.layers.filter((other) => other !== layer).map((other) => other.id) } })));
    each.styles.sort((one, other) => one.name.localeCompare(other.name));
  } else if (action != null) return [400, ""];
  if (action != null) return [];
  if (query.has("groupByOrigin")) {
    each.groupsLayersByOrigin = query.get("groupByOrigin") === "1" ? true : undefined;
    if (each.groupsLayersByOrigin) each.layers.reverse();
    return [];
  }
  const key = Object.keys(AVAILABILITY).find((one) => query.has(one));
  if (!key) return null;
  if (["legend", "world"].includes(key) && !phone.ownsSettings) {
    return [403, "This map is shared with this phone to look at, not to change"];
  }
  const shown = query.get(key) === "1";
  each[AVAILABILITY[key]] = key === "carPlay" ? !shown : shown ? undefined : true;
  return [];
}

function edit(each, query, response) {
  const refused = arranged(each, query);
  if (refused?.length) return send(response, refused[0], refused[1]);
  if (refused) {
    each.revision += 1;
    return json(response, portable(each));
  }
  const adjust = (change) => each.styles.forEach((style) => { style.adjustments = change({ ...style.adjustments }); });
  const looked = query.has("layer") && LAYER_LOOKS.find((key) => query.has(key));
  const featured = query.has("layer") && FEATURE_KEYS.find((key) => query.has(key));
  const marked = query.has("layer") && MARK_KEYS.find((key) => query.has(key));
  const asking = query.has("layer") && QUESTION_KEYS.find((key) => query.has(key));
  const networked = query.has("layer") && NETWORK_KEYS.find((key) => query.has(key));
  if (query.has("layer") && query.has("details")) {
    const layer = each.layers.find((one) => one.id === query.get("layer"));
    if (!layer?.layout) return send(response, 409, "This change does not fit the map");
    const made = editLayout(layer, query);
    if (Array.isArray(made)) return send(response, made[0], made[1]);
    if (!made) return send(response, 409, "The layout changed on the phone; it is shown again as it is now");
  } else if (query.has("layer") && (query.has("serverTake") || query.has("serverKeep"))) {
    const layer = each.layers.find((one) => one.id === query.get("layer"));
    if (!answerServerLook(layer || {}, query)) return send(response, 409, "This change does not fit the map");
  } else if (marked) {
    const layer = each.layers.find((one) => one.id === query.get("layer"));
    if (!layer?.drawn && !layer?.esri) return send(response, 404, "This change does not fit the map");
    if (!editMarks(layer, query, marked)) return send(response, 409, "This change does not fit the map");
  } else if (featured) {
    const layer = each.layers.find((one) => one.id === query.get("layer"));
    if (!layer?.drawn && !layer?.esri) return send(response, 404, "This change does not fit the map");
    editFeatures(layer, query, featured);
  } else if (networked) {
    const layer = each.layers.find((one) => one.id === query.get("layer"));
    if (!layer?.net) return send(response, 404, "This change does not fit the map");
    const refused = editKeys(layer, query, networked);
    if (refused) return send(response, 409, refused);
    editNetwork(layer, query, networked);
  } else if (asking) {
    const layer = each.layers.find((one) => one.id === query.get("layer"));
    if (!layer?.esri) return send(response, 404, "This change does not fit the map");
    if (asking === "answersFromServer") layer.answersFromServer = query.get(asking) === "1";
    else layer.identifyRequest = query.get(asking).trim() || undefined;
  } else if (looked) {
    // 2962: as `PeerWebEdit.LayerLook` writes it onto the layer.
    const layer = each.layers.find((one) => one.id === query.get("layer"));
    if (!layer) return send(response, 404, "This change does not fit the map");
    const value = query.get(looked);
    if (looked === "appearance") layer.appearance = value === "automatic" ? undefined : value;
    if (looked === "tint") layer.tintHex = value ? value.toUpperCase() : undefined;
    if (looked === "routeIcons") layer.hidesRouteIcons = value === "1" ? undefined : true;
    if (looked === "labelLanguage") layer.labelLanguage = value || undefined;
  } else if (query.has("layer") && (query.has("name") || query.has("opacity"))) {
    const layer = each.layers.find((one) => one.id === query.get("layer"));
    if (!layer) return send(response, 404, "This change does not fit the map");
    if (query.has("name")) layer.name = query.get("name");
    else layer.opacity = Math.min(1, Math.max(0, Number(query.get("opacity"))));
  } else if (query.has("layer") && query.has("shown")) {
    const layer = each.layers.find((one) => one.id === query.get("layer"));
    if (!layer) return send(response, 404, "This change does not fit the map");
    setShown(each, query, [layer], query.get("shown") === "1");
  } else if (query.has("shownAll")) {
    // 3083: as `MapDefinition.setListedLayers` writes it, into the browser's style.
    setShown(each, query, each.layers, query.get("shownAll") === "1");
  } else if (query.has("order")) {
    const asked = query.get("order").split(",");
    const placed = asked.map((id) => each.layers.find((one) => one.id === id));
    if (placed.includes(undefined) || new Set(asked).size !== each.layers.length) {
      return send(response, 409, "These are not the map's layers");
    }
    each.layers = placed;
  } else if (query.has("removeStyle")) {
    if (!each.styles.some((one) => one.id === query.get("removeStyle"))) {
      return send(response, 404, "This change does not fit the map");
    }
    if (each.styles.length < 2) return send(response, 409, "A map keeps one style");
    each.styles = each.styles.filter((one) => one.id !== query.get("removeStyle"));
  } else if (query.has("kindFamily")) {
    // 2960: as `MapDefinition.show` writes it, into every style.
    if (query.get("kindFamily") !== "ski" || !SKI_KINDS.some(([id]) => id === query.get("kind"))) {
      return send(response, 400, "");
    }
    adjust((made) => {
      const hidden = new Set(made.hiddenSkiKinds || []);
      if (query.get("shown") === "1") hidden.delete(query.get("kind")); else hidden.add(query.get("kind"));
      return { ...made, hiddenSkiKinds: hidden.size ? [...hidden].sort() : undefined };
    });
  } else if (query.has("roadShields")) {
    if (!["country", "classic"].includes(query.get("roadShields"))) return send(response, 400, "");
    phone.roadShields = query.get("roadShields");
  } else if (query.has("roadSigns")) {
    adjust((made) => ({ ...made, hidesRoadSigns: query.get("roadSigns") === "1" ? undefined : true }));
  } else if (query.has("railMarks")) {
    adjust((made) => ({ ...made, hidesRailMarks: query.get("railMarks") === "1" ? undefined : true }));
  } else if (query.has("railVariant")) {
    const style = each.styles.find((one) => one.id === query.get("railStyle"));
    if (!style) return send(response, 404, "This change does not fit the map");
    style.adjustments = { ...style.adjustments,
      railVariant: query.get("railVariant") === "standard" ? undefined : query.get("railVariant") };
  } else if (query.has("addPackages")) {
    // 2959: as `PeerWebEdit` adds them: what the map draws already is not added twice.
    const drawn = new Set(each.layers.map((layer) => layer.overlay));
    const asked = query.get("addPackages").split(",");
    const known = PACKAGES.filter((row) => row.overlay);
    if (!asked.every((overlay) => known.some((row) => row.overlay === overlay))) return send(response, 400, "");
    const adding = known.filter((row) => asked.includes(row.overlay) && !drawn.has(row.overlay));
    if (!adding.length) return send(response, 409, "This map draws these packages already");
    each.layers.push(...adding.map((row) => ({ id: randomUUID().toUpperCase(), name: row.name, kind: "Riki Maps package",
      symbol: row.symbol, isEnabled: true, overlay: row.overlay })));
  } else if (query.has("removeLayer")) {
    const at = each.layers.findIndex((layer) => layer.id === query.get("removeLayer"));
    if (at < 0) return send(response, 404, "This change does not fit the map");
    each.layers.splice(at, 1);
  } else if (query.has("appearance")) {
    // 2958: as `PeerWebEdit` writes it: automatic is none.
    const picked = query.get("appearance");
    if (!["automatic", "light", "dark"].includes(picked)) return send(response, 400, "");
    each.appearance = picked === "automatic" ? undefined : picked;
  } else if (query.has("style") && query.has("language")) {
    // 51: a style's name in one language; blank takes the language away.
    const styled = each.styles.find((one) => one.id === query.get("style"));
    if (!styled) return send(response, 404, "No such style");
    const code = query.get("language");
    if (!["de", "sk"].includes(code)) return send(response, 404, "The app has no such language");
    const names = { ...(styled.nameTranslations || {}) };
    const text = (query.get("name") ?? "").trim();
    if (text) names[code] = text; else delete names[code];
    styled.nameTranslations = Object.keys(names).length ? names : undefined;
  } else if (query.has("style") && ["symbol", "iconTint", "note"].some((key) => query.has(key))) {
    // 51: as `PeerWebEdit` writes a style's own icon, its ground and its note.
    const styled = each.styles.find((one) => one.id === query.get("style"));
    if (!styled) return send(response, 404, "No such style");
    if (query.has("symbol")) {
      if (![styled.symbol, "map", "snowflake", "sun.max"].includes(query.get("symbol"))) {
        return send(response, 404, "The style page offers no such icon");
      }
      styled.symbol = query.get("symbol");
    } else if (query.has("iconTint")) {
      const hex = query.get("iconTint").trim().toUpperCase();
      if (hex && !/^#[0-9A-F]{6}$/.test(hex)) return send(response, 400, "");
      styled.iconTintHex = hex || null;
    } else {
      styled.notes = query.get("note").trim();
    }
  } else if (query.has("symbol")) {
    if (![each.symbol, "map", "mountain.2", "tent"].includes(query.get("symbol"))) {
      return send(response, 404, "Edit map offers no such icon");
    }
    each.symbol = query.get("symbol");
  } else if (query.has("iconTint")) {
    const hex = query.get("iconTint").trim().toUpperCase();
    if (hex && !/^#[0-9A-F]{6}$/.test(hex)) return send(response, 400, "");
    each.iconTintHex = hex || null;
  } else if (query.has("coverage")) {
    // 2957: as `PeerWebEdit` keeps it: the whole value, nothing said is not limited.
    const made = JSON.parse(query.get("coverage") || "null");
    const said = made && (["world", "continents", "mountains", "countries", "regions"].some((key) => made[key] != null)
      || made.exclude);
    each.coverage = said ? made : undefined;
  } else if (query.has("start")) {
    // 2947: as `PeerWebEdit` reads it: none, your location, or a point in range.
    const kind = query.get("start");
    const [lat, lon] = ["lat", "lon"].map((key) => Number(query.get(key)));
    const inRange = query.get("lat") && query.get("lon") && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    const named = { region: "region", country: "country" }[kind];
    if (named ? !query.get(named) : ["coordinates", "state", "city"].includes(kind) && !inRange) {
      return send(response, 409, "The map cannot open at that place");
    }
    if (!["none", "location", "coordinates", "region", "country", "state", "city"].includes(kind)) {
      return send(response, 400, "");
    }
    const zoom = query.get("zoom") ? Math.min(22, Math.max(0, Number(query.get("zoom")))) : undefined;
    const box = query.get("box") ? query.get("box").split(",").map(Number) : null;
    each.start = kind === "none" ? undefined
      : kind === "location" ? { kind }
        : named ? { kind, [named]: query.get(named) }
          : { kind, latitude: lat, longitude: lon, zoom, country: query.get("country") || undefined,
            name: query.get("name") || undefined,
            box: box && { minLon: box[0], minLat: box[1], maxLon: box[2], maxLat: box[3] } };
  } else if (query.has("minimumApp") || query.has("minimumBrowser")) {
    // 2946: as `PeerWebEdit` writes it: a typo refused, blanks dropped, nothing left is none.
    const typed = ["minimumApp", "minimumBrowser"].map((key) => (query.get(key) || "").trim());
    if (typed.some((text) => text && !/^\d+(\.\d+){0,2}$/.test(text))) {
      return send(response, 409, "Write up to three numbers joined by dots, like 0.18.0");
    }
    const kept = Object.fromEntries([["app", typed[0]], ["browser", typed[1]]].filter(([, text]) => text));
    each.minimumVersion = Object.keys(kept).length ? kept : undefined;
  } else if (query.has("language")) {
    // 2919: as `PeerWebEdit` writes a translation: blank takes the language away.
    const code = query.get("language");
    if (!["de", "sk"].includes(code)) return send(response, 404, "The app has no such language");
    const part = query.has("name") ? "nameTranslations" : "noteTranslations";
    const texts = { ...(each[part] || {}) };
    const text = (query.get("name") ?? query.get("note") ?? "").trim();
    if (text) texts[code] = text; else delete texts[code];
    each[part] = Object.keys(texts).length ? texts : undefined;
  } else if (query.has("name") && !query.has("layer") && !query.has("style")) {
    if (!query.get("name").trim()) return send(response, 400, "A name cannot be blank");
    each.name = query.get("name");
  } else if (query.has("category")) {
    // 142: as `PeerWebEdit.category` takes it: the owner's word only, cleaned as `MapCategoryName` does, blank clears.
    if (!phone.ownsSettings) return send(response, 403, "This map is shared with this phone to look at, not to change");
    const category = query.get("category").replace(/\s+/g, " ").trim();
    if (category.length > 40) return send(response, 409, "A category is at most 40 characters");
    each.category = category || undefined;
  } else if (query.has("note")) {
    each.note = query.get("note");
  } else if (query.has("addStyle")) {
    each.styles.push({ id: randomUUID().toUpperCase(), name: query.get("addStyle"), arrangement: { hidden: [] } });
  } else if (query.has("style") && query.has("name")) {
    const named = each.styles.find((one) => one.id === query.get("style"));
    if (named) named.name = query.get("name");
  }
  each.revision += 1;
  json(response, portable(each));
}

const WORDS = { language: "en", words: { "layers.1": "1 layer", "layers.2": "2 layers",
  languages: "de,sk", "language.de": "German", "language.sk": "Slovak",
  mapSymbols: "map,mountain.2,tent", serverSymbols: "server.rack,globe,map", styleSymbols: "map,snowflake,sun.max", iconTints: "#F2B8B5,#B5D8F2",
  folderSymbols: FOLDER_SYMBOLS.join(",") } };

// Read off `out/`, as the app reads its bundle; nothing outside it.
async function buildFile(name) {
  const file = path.normalize(path.join(BUILD, name));
  if (!file.startsWith(BUILD + path.sep)) return null;
  return readFile(file).catch(() => null);
}

// 30 every screen's address is the page, as `PeerWebViewer.isPage` answers it.
const isPage = (route) => route === "/" || route === "/index.html" || PAGE_SEGMENTS.includes(route.split("/")[1]);

async function answer(request, response) {
  const url = new URL(request.url, "http://localhost");
  const route = url.pathname;
  const method = request.method;

  if (route.startsWith("/__test/")) return testControl(route, url.searchParams, response);
  if (!phone.served) return send(response, 503, "This phone is not sharing maps");

  if (route === "/web/session" || route === "/web/session/ask") {
    const asking = route.endsWith("/ask");
    if (method !== (asking ? "POST" : "GET")) return send(response, 405, "");
    const { guest, isNew } = arrive(request);
    if (asking && guest.standing === "removed") guest.standing = "waiting";
    const headers = isNew ? { "Set-Cookie": COOKIE + "=" + guest.id + "; Path=/; HttpOnly; SameSite=Strict" } : {};
    return json(response, { standing: guest.standing, viewers: viewers(), device: phone.name, edits: true,
      direct: phone.direct === true },
      headers);
  }
  // 31 the edit link goes to the page's unlock address, as `editRedirect` does.
  const linked = route.startsWith("/e/") ? typed(decodeURIComponent(route.slice(3))) : "";
  if (method === "GET" && linked) {
    response.writeHead(302, { Location: "/unlock/" + linked, "Cache-Control": "no-store" });
    return response.end();
  }
  if (method === "GET" && isPage(route)) return send(response, 200, await buildFile("index.html"), TYPES[".html"]);
  if (route === "/favicon.ico") return send(response, 204, "");
  if (route.startsWith("/web/symbols/")) return send(response, 200, PIXEL, "image/png");
  if (route.startsWith("/riki/v1/relay/mock/")) return send(response, 200, PIXEL, "image/png");
  if (serveReal(route, request, response, REAL_ROOT)) return;
  if (route === "/web/edit-check") {
    if (method !== "POST") return send(response, 405, "");
    if (!opensEditing(request)) return send(response, 403, "This browser may not change maps");
    const token = "mock." + randomUUID();
    phone.tokens.add(token);
    return json(response, { token, expiresIn: 43200 });
  }
  if (route === "/web/words") {
    const spoken = { ...WORDS, words: { ...WORDS.words, languages: phone.languages.join(",") } };
    return send(response, 200, JSON.stringify(spoken), TYPES[".json"]);
  }
  if (route.startsWith(FILES_PREFIX)) {
    const file = await buildFile(decodeURIComponent(route.slice(FILES_PREFIX.length)));
    if (!file) return send(response, 404, "");
    return send(response, 200, file, TYPES[path.extname(route)] ?? "application/octet-stream");
  }
  if (refuses(request)) return send(response, 403, "This phone has not let this browser in");
  // 92: the QR code the phone scans to let this browser edit, as `PeerWebPairing` answers.
  if (route === "/web/pair" && method === "POST") {
    const id = randomBytes(16).toString("hex");
    phone.pairs.set(id, "waiting");
    return json(response, { id, code: id.slice(0, 4).toUpperCase(), expiresIn: 300 });
  }
  if (route.startsWith("/web/pair/")) {
    const id = route.slice("/web/pair/".length).replace(/\.png$/, "");
    const state = phone.pairs.get(id);
    if (!state) return send(response, 410, "This code ran out; ask for a new one");
    if (route.endsWith(".png")) return send(response, 200, PIXEL, "image/png");
    if (state === "waiting") return send(response, 202, JSON.stringify({ waiting: true }), TYPES[".json"]);
    phone.pairs.delete(id);
    if (state === "refused") return send(response, 403, "The phone did not let this browser edit");
    const token = "mock." + randomUUID();
    phone.tokens.add(token);
    return json(response, { token, expiresIn: 43200 });
  }
  if (route.startsWith("/web/icons/") && /^\/web\/icons\/[a-z]{2}\.ts\./.test(route)) {
    // 69: a road sign is cut from its sheet, as `PeerWebIcons` answers.
    response.writeHead(200, { "Content-Type": "image/png" });
    return response.end(Buffer.from(SIGN_PNG, "base64"));
  }
  if (route.startsWith("/web/icons/")) return send(response, 404, "");

  const parts = route.split("/").filter(Boolean);
  if (parts[0] !== "riki" || parts[1] !== "v1") return send(response, 404, "");
  if (parts[2] === "device" && parts.length === 3) return json(response, catalog());
  if (parts[2] === "new-map" && parts.length === 3) {
    // 2978: as `PeerWebNewMap` answers: a name makes a blank map, a body is read as a .mapson.
    if (method !== "POST") return send(response, 405, "");
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let name = (url.searchParams.get("name") || "").trim();
    if (chunks.length) {
      try {
        name = JSON.parse(Buffer.concat(chunks).toString()).name;
      } catch { name = ""; }
      if (!name) return send(response, 409, "That file is not a Riki Maps map.");
    }
    if (!name) return send(response, 400, "");
    const id = randomUUID().toUpperCase();
    phone.maps.push({ id, name, symbol: "map", iconTintHex: null, revision: 1, note: "", layers: [],
      styles: [{ id: randomUUID().toUpperCase(), name: "Style", arrangement: { hidden: [] } }] });
    return json(response, { id });
  }
  if (parts[2] === "shelf" && parts.length === 3) {
    // 52: as `PeerWebShelf` answers: the list arranged, then the listing again.
    if (method !== "POST") return send(response, 405, "");
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    if (!shelve(url.searchParams)) return send(response, 400, "");
    return json(response, catalog());
  }
  if (parts[2] === "coverage-places" && parts.length === 3) {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    return json(response, COVERAGE_PLACES);
  }
  if (parts[2] === "read-api" && parts.length === 3) {
    // 3003: as `PeerWebAPI.read` answers: the vehicles list guessed, or read as the page picked.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const read = apiRead(url.searchParams, request.headers["x-riki-cookie"]);
    return read ? json(response, read) : send(response, 409, "That is not an address this app can ask.");
  }
  if (parts[2] === "read-address" && parts.length === 3) {
    // 2967: as `PeerWebServices.reading`: an Esri WMS façade lists its layers; the rest is added as it is.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const address = url.searchParams.get("address") || "";
    if (!/\/WMSServer(\?|$)/i.test(address)) return json(response, { kind: "direct", rows: [] });
    if (address.includes("silent")) return send(response, 409, "That WMS did not say what it publishes.");
    return json(response, WMS_READING);
  }
  if (parts[2] === "servson" && parts.length === 3) {
    // 2997: as `PeerWebServson` writes them, keys left on the phone.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    // 27: a server's page asks for that server alone
    const one = url.searchParams.get("server");
    const servers = one ? SERVERS.filter((server) => server.id === one) : SERVERS;
    if (one && !servers.length) return send(response, 404, "");
    const name = one ? servers[0].name : "Servers";
    return send(response, 200, JSON.stringify({ _schemaVersion: 1, includesCredentials: false,
      servers: servers.map((server) => ({ name: server.name })) }), "application/json",
      { "Content-Disposition": `attachment; filename="${name}.servson"` });
  }
  if (parts[2] === "import-servers" && parts.length === 3) {
    // 2997: only servers the phone lacks join; a file of none is refused.
    if (method !== "POST") return send(response, 405, "");
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let servers;
    try {
      servers = JSON.parse(Buffer.concat(chunks).toString()).servers;
    } catch { servers = null; }
    if (!Array.isArray(servers)) return send(response, 409, "That file holds no Riki Maps servers.");
    for (const server of servers) {
      if (SERVERS.some((held) => held.name === server.name)) continue;
      phone.importedServers.push({ id: randomUUID().toUpperCase(), name: server.name, line: "Tiles", rows: [] });
    }
    return json(response, listedServers());
  }
  if (parts[2] === "add-server" && parts.length === 3) {
    // 2996: as `PeerWebAddServer` answers: read first, then saved and listed with the rest.
    if (method !== "POST") return send(response, 405, "");
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const address = url.searchParams.get("address") || "";
    if (address.includes("silent")) return send(response, 409, "Server replied 404");
    const kind = url.searchParams.get("kind");
    if (!SERVER_KIND_LINES[kind]) return send(response, 400, "");
    const id = randomUUID().toUpperCase();
    const name = url.searchParams.get("name") || new URL(address).host;
    const ogc = kind === "wmts" || kind === "wms";
    if (kind === "api") {
      // 188: one endpoint, the address itself, named by its path's last part.
      const named = new URL(address).pathname.split("/").filter(Boolean).pop()?.split(".")[0] || name;
      phone.addedServers.push({ id, name, line: `${new URL(address).host} · API`, kind: "API", kindID: "api", address,
        takesLayers: true, rows: [{ kind: "layer", title: named, subtitle: "Points", depth: 0, endpoint: address,
          pick: { server: id, layer: "" } }] });
      return json(response, listedServers());
    }
    phone.addedServers.push({ id, name, line: SERVER_KIND_LINES[kind], rows: [
      { kind: "layer", title: ogc ? "National map" : "Geology", subtitle: ogc ? kind.toUpperCase() : "Areas", depth: 0,
        pick: { server: id, layer: ogc ? "pixelkarte" : "0" } }] });
    return json(response, listedServers());
  }
  if (parts[2] === "servers" && parts.length === 5) {
    // 183: as `PeerWebServerEdit` answers: the servers as they now are, a duplicate naming its copy.
    if (method !== "POST") return send(response, 405, "");
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const server = heldServers().find((each) => each.id === parts[3]);
    if (!server) return send(response, 404, "");
    if (parts[4] === "edit") {
      const change = { ...phone.serverEdits.get(server.id) };
      const name = (url.searchParams.get("name") ?? "").trim();
      if (name) change.name = name;
      if (url.searchParams.get("symbol")) change.symbol = url.searchParams.get("symbol");
      if (url.searchParams.has("tint")) change.iconTintHex = url.searchParams.get("tint") || undefined;
      phone.serverEdits.set(server.id, change);
      return json(response, listedServers());
    }
    if (parts[4] === "duplicate") {
      const id = randomUUID().toUpperCase();
      phone.addedServers.push({ ...server, id, name: `${server.name} copy` });
      return json(response, { ...listedServers(), opened: id });
    }
    if (parts[4] === "delete") {
      phone.goneServers.add(server.id);
      return json(response, listedServers());
    }
    if (parts[4] === "form") {
      // 187: as `PeerWebServerForm`: a new address is read first; values stay here, the page hears isSet.
      const address = (url.searchParams.get("address") ?? "").trim();
      if (address.includes("silent")) return send(response, 409, "Server replied 404");
      const kindID = url.searchParams.get("kind");
      if (!SERVER_KIND_TITLES[kindID]) return send(response, 409, "This kind of server cannot be taken");
      const was = new Map((server.headers ?? []).map((header) => [header.name.toLowerCase(), header.isSet]));
      const headers = JSON.parse(url.searchParams.get("headers") || "[]").map((header) =>
        ({ name: header.name, isSet: Boolean(header.value) || Boolean(was.get(header.name.toLowerCase())) }));
      const login = JSON.parse(url.searchParams.get("login") || "null");
      phone.serverEdits.set(server.id, { ...phone.serverEdits.get(server.id), address, kindID,
        kind: SERVER_KIND_TITLES[kindID], referrer: url.searchParams.get("referrer") || null, headers, login });
      return json(response, listedServers());
    }
    if (parts[4] === "add-layer") {
      // 188: as `PeerWebServerEdit.typedLayer`: an address on the server's own host, or an Esri number.
      const typed = url.searchParams.get("address") ?? "";
      const number = url.searchParams.get("number");
      const host = (address) => { try { return new URL(address).host; } catch { return null; } };
      if (number == null && host(typed) !== host(server.address ?? "")) {
        return send(response, 409, `The address has to be on ${host(server.address ?? "")}, as the server's is.`);
      }
      const layer = `byhand-${randomUUID()}`;
      const title = url.searchParams.get("name") || (number ?? typed.split("/").pop().split(".")[0]);
      const row = { kind: "layer", title, depth: 0, byHand: true, pick: { server: server.id, layer },
        ...(server.kindID === "api" ? { endpoint: typed, subtitle: "Points" } : {}) };
      phone.serverEdits.set(server.id, { ...phone.serverEdits.get(server.id), rows: [...server.rows, row] });
      return json(response, listedServers());
    }
    if (parts[4] === "remove-layer") {
      const layer = url.searchParams.get("layer");
      const rows = server.rows.filter((row) => !(row.byHand && row.pick?.layer === layer));
      phone.serverEdits.set(server.id, { ...phone.serverEdits.get(server.id), rows });
      return json(response, listedServers());
    }
    return send(response, 405, "");
  }
  if (parts[2] === "server-layer" && parts.length === 3) {
    // 186: as `PeerWebServerLayer` answers: the phone's own page, an API layer's under its scope.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const server = heldServers().find((each) => each.id === url.searchParams.get("server"));
    const service = url.searchParams.get("service");
    const row = server?.rows.find((each) => each.pick && each.pick.layer === url.searchParams.get("layer")
      && (each.pick.service ?? null) === service);
    if (!row) return send(response, 404, "");
    const page = { name: row.title, serverName: server.name, look: [], maps: [],
      footnote: "The map keeps this layer's service, so its other layers can be ticked later." };
    if (server.kindID !== "api") return json(response, { ...page, zooms: "0–19", covers: "Slovakia" });
    return json(response, { ...page, address: row.endpoint,
      scope: { pill: `Server · ${server.name}`, banner: "You are editing the server's layer. No map of yours uses it yet." },
      look: [{ part: "markers", title: "Markers", detail: "Dot · One colour" }, { part: "details", title: "Details" },
        { part: "questions", title: "Questions" }],
      versionNote: "Saving makes version 1. Maps that use this layer are asked whether to take it.",
      footnote: "Add an API from Add layer › Servers, where its location key is picked." });
  }
  if (parts[2] === "servers" && parts.length === 3) {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    return json(response, listedServers());
  }
  if (parts[2] === "saved" && parts.length <= 4) {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const state = savedState();
    if (state.gone) return send(response, 404, "");
    const rows = state.empty ? [] : SAVED_ROWS;
    if (parts.length === 3) {
      return send(response, 200, JSON.stringify({ folders: state.empty ? [] : SAVED_FOLDERS, features: rows,
        total: state.total ?? rows.length }), "application/json", { "Cache-Control": "no-store" });
    }
    const found = rows.find((one) => one.id === parts[3]);
    if (!found) return send(response, 404, "");
    return send(response, 200, JSON.stringify(savedShape(found)), "application/geo+json", { "Cache-Control": "no-store" });
  }
  if (parts[2] === "start-places" && parts.length === 3) {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    phone.placeAsks.push(url.search);
    return json(response, startPlaces(url.searchParams.get("kind"), url.searchParams.get("q") || ""));
  }
  if (parts[2] === "location" && parts.length === 3) {
    return phone.location ? json(response, phone.location) : send(response, 404, "This phone does not share its location");
  }
  if (parts[2] === "folders" && parts[4] === "people" && parts.length === 5) {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    if (!phone.maps.some((each) => each.stackID === parts[3])) return send(response, 404, "No such folder");
    if (method === "POST" && !askFolderPeople(parts[3], url.searchParams)) {
      return send(response, 403, "Your role on this map does not allow that");
    }
    return json(response, folderRoster(parts[3]));
  }
  if (parts[2] !== "maps") return send(response, 404, "");
  const each = phone.maps.find((one) => one.id === parts[3]);
  if (!each) return send(response, 404, "");
  if (method === "POST" && parts[4] === "download") {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const asked = phone.regions.downloadable.find((one) => one.id === url.searchParams.get("region"));
    if (!asked) return send(response, 404, "This map offers no such region to download");
    phone.regions.downloadable = phone.regions.downloadable.filter((one) => one !== asked);
    phone.regions.downloading.push(asked);
    return send(response, 202, "");
  }
  if (parts[4] === "regions" && parts.length === 5) {
    // 141: a drawn region carries what the map's packages hold of it here; one still to download carries none.
    const sized = (list) => list.map(({ bytes, ...region }) => (phone.noSizes || bytes == null ? region : { ...region, bytes }));
    return json(response, { ...phone.regions, drawn: sized(phone.regions.drawn ?? []) });
  }
  if (parts[4] === "mapson" && parts.length === 5) {
    // 2961: as `PeerWebExport` answers: the file, named for any language, no keys.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const name = each.name + ".mapson";
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; `
        + `filename*=UTF-8''${encodeURIComponent(name)}` });
    return response.end(JSON.stringify({ $schema: "https://skifahrer.github.io/schemas/mapson.json",
      name: each.name, stack: portable(each).stack }));
  }
  if (method === "GET" && parts[4] === "search" && parts.length === 5) {
    // 129: any browser the phone let in, no edit password; a phone from before 3492 has no such answer.
    if (phone.searchMissing) return send(response, 404, "");
    phone.searchAsks.push({ ...Object.fromEntries(url.searchParams), bearer: Boolean(request.headers.authorization) });
    const answered = placesSearch(url.searchParams);
    return answered ? json(response, answered) : send(response, 400, "");
  }
  if (method === "GET" && parts[4] === "details" && parts.length === 5) {
    // 21: as `PeerWebDetails` answers: the layer's layout filled from the feature, or nothing.
    const values = JSON.parse(url.searchParams.get("values") || "{}");
    phone.detailsAsked.push({ layer: url.searchParams.get("layer"), values });
    if ((url.searchParams.get("layer") || "").toUpperCase() === "6F1E2A10-0000-4000-8000-0000000000E1") {
      return json(response, trainSheet(values));
    }
    const laidOut = each.layers.find((one) => one.id === url.searchParams.get("layer") && one.layout);
    if (laidOut) return json(response, filledSheet(laidOut, values));
    if (!phone.laysOutDetails) { response.writeHead(204); return response.end(); }
    return json(response, { title: `Hut ${values.Nazov}`, keys: ["Nazov", "Elevation"], sections: [
      { title: "About", blocks: [{ kind: "rows", rows: [{ title: "Height", value: `${values.Elevation} m` }] },
        { kind: "text", title: "Note", text: "Closed in winter", warning: true }] },
      { title: "Source", blocks: [{ kind: "allTags" }] }] });
  }
  if (method === "GET" && parts[4] === "identify" && parts.length === 5) {
    // 3001: as `PeerWebIdentify` answers: every feature of the first layer whose server knows one.
    phone.identified.push(Object.fromEntries(url.searchParams));
    return json(response, { answers: phone.answersServers ? [
      { layer: "Geology", properties: { name: "Granite", age: "300 Ma" } },
      { layer: "Geology", properties: { name: "Gneiss" } }] : [] });
  }
  if (parts[4] === "road-signs" && parts.length === 5) {
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    phone.signsAsked = [...(phone.signsAsked || []), Object.fromEntries(url.searchParams)];
    return json(response, roadSigns(url.searchParams));
  }
  if (parts[4] === "layer-test" && parts.length === 5) {
    // 60: as `PeerWebLayerKeys.test`: the address asked with the values the phone keeps.
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const layer = each.layers.find((one) => one.id === url.searchParams.get("layer"));
    if (!layer?.net) return send(response, 404, "");
    const keyed = Object.values(layer.keys || {}).some(Boolean);
    return json(response, keyed ? { reachable: true, said: "Tiles reachable · 256 px" }
      : { reachable: false, said: "Server replied 401" });
  }
  if (parts[4] === "layer-options" && parts.length === 5) {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    return json(response, layerOptions(each));
  }
  if (parts[4] === "packages" && parts.length === 5) {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    return json(response, packages(each));
  }
  if (parts[4] === "people" && parts.length === 5) {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    if (each.locked) return send(response, 403, "This map is locked on the phone");
    if (method === "POST" && !askPeople(each.id, url.searchParams)) {
      return send(response, 403, "Your role on this map does not allow that");
    }
    return json(response, roster(each.id));
  }
  if (parts[4] === "publish" && parts.length === 5 && (method === "GET" || method === "POST")) {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const state = publishState();
    const ask = url.searchParams.get("ask");
    const cancel = url.searchParams.get("cancel");
    if (method === "GET" && ask) {
      const held = state.asks.get(ask);
      if (!held || held.mapID !== each.id) return send(response, 410, "The phone no longer holds this ask; ask again");
      return json(response, publishPolled(held));
    }
    if (method === "GET") return json(response, publishOffer(each));
    if (cancel) {
      const held = state.asks.get(cancel);
      if (!held || held.mapID !== each.id || held.answer.state !== "waiting") return send(response, 410, "Nothing waits on that ask");
      state.asks.delete(cancel);
      return send(response, 204, "");
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(response, 400, "Send the publication as JSON"); }
    const stopped = publishStops(each) ?? publishMissing(each, body);
    if (stopped) return publishRefused(response, stopped);
    if ([...state.asks.values()].some((held) => held.answer.state === "waiting")) return publishRefused(response, "busy");
    const id = randomBytes(16).toString("hex");
    state.asks.set(id, { mapID: each.id, request: body, polled: 0, answer: { state: "waiting" } });
    state.requests.push({ map: each.id, body });
    return send(response, 202, JSON.stringify({ ask: id, code: id.slice(0, 4).toUpperCase(), expiresIn: 300 }),
      "application/json");
  }
  if (parts[4] === "other-layers" && parts.length === 5) {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    return json(response, otherLayers(each));
  }
  if (parts[4] === "switches" && parts.length === 5) {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    return json(response, switches(each));
  }
  if ((parts[4] === "esri-services" || parts[4] === "esri-service") && parts.length === 5) {
    // 67: as `PeerWebEsriServices` answers: the services still drawn on, one changed at a time.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    if (parts[4] === "esri-services") return json(response, esriListing(each));
    if (method !== "POST") return send(response, 405, "");
    const service = (each.esri ?? []).find((one) => one.id === url.searchParams.get("service"));
    if (!service) return send(response, 404, "This change does not fit the map");
    phone.esriAsks.push(Object.fromEntries(url.searchParams));
    const number = Number(url.searchParams.get("add") ?? url.searchParams.get("remove"));
    const published = service.published.find((one) => one.id === number);
    if (url.searchParams.has("add")) {
      if (!published || published.refusal || service.taken[number]) {
        return send(response, 409, "This map cannot draw that layer beside what it draws");
      }
      service.taken[number] = randomUUID().toUpperCase();
      each.layers.push(esriLayer(service.taken[number], published.name, "Esri features", "mappin"));
    } else if (url.searchParams.has("remove")) {
      const id = service.taken[number];
      if (!id) return send(response, 404, "This change does not fit the map");
      delete service.taken[number];
      each.layers = each.layers.filter((one) => one.id !== id);
    } else if (url.searchParams.get("forget") === "1") {
      each.esri = each.esri.filter((one) => one !== service);
    } else if (url.searchParams.get("read") === "1") {
      if (service.url.includes("silent")) return send(response, 502, "The service did not answer");
      service.readAt = "now";
    } else return send(response, 400, "");
    each.revision += 1;
    return json(response, portable(each));
  }
  if ((parts[4] === "tile-download" || parts[4] === "discard-stored") && parts.length === 5) {
    // 57: as `PeerWebOffline` answers: the plan for the area asked, the download queued or cancelled.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const held = offlineOf(each);
    if (parts[4] === "discard-stored") {
      if (method !== "POST") return send(response, 405, "");
      const layer = url.searchParams.get("layer");
      if (!each.layers.some((one) => one.id === layer)) return send(response, 404, "This map has no such layer");
      delete held.stored[layer];
      phone.discarded.push(layer);
      response.writeHead(204);
      return response.end();
    }
    const box = (url.searchParams.get("box") || "").split(",").map(Number);
    if (box.length !== 4 || box.some((one) => !Number.isFinite(one))) return send(response, 400, "Name the area to download");
    phone.offlineAsks.push({ method, ...Object.fromEntries(url.searchParams) });
    const plan = offlinePlan(each, url.searchParams);
    if (method === "POST") {
      if (url.searchParams.get("cancel") === "1") held.queued = [];
      else if (url.searchParams.get("start") === "1") held.queued = plan.rows.filter((row) => row.isIncluded).map((row) => row.id);
      else return send(response, 400, "");
      return json(response, offlinePlan(each, url.searchParams));
    }
    return json(response, plan);
  }
  if (method === "POST" && parts[4] === "duplicate" && parts.length === 5) {
    // 50: as `MapCatalogStore.duplicate`: a fresh id for the map and each style, named as a copy.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const id = randomUUID().toUpperCase();
    phone.maps.push({ ...structuredClone(each), id, name: `${each.name} copy`,
      styles: each.styles.map((style) => ({ ...structuredClone(style), id: randomUUID().toUpperCase() })) });
    return json(response, { id });
  }
  if (method === "POST" && parts[4] === "delete" && parts.length === 5) {
    // 62: as `PeerWebDeleteMap.answer`: refused where Delete is not offered or the name differs.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    if (each.locked) return send(response, 403, "This map is locked on the phone");
    if (phone.maps.length < 2) return send(response, 403, "The phone keeps at least one map");
    if ((url.searchParams.get("name") ?? "").trim() !== each.name) {
      return send(response, 409, "Type the map's name exactly to delete it");
    }
    phone.maps = phone.maps.filter((one) => one.id !== each.id);
    response.writeHead(204, { "Cache-Control": "no-store" });
    return response.end();
  }
  if (parts[4] === "coverage" && parts.length === 5) {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    return json(response, coverageSummary(each));
  }
  if (method === "POST" && parts[4] === "add-service-layers") {
    // 2967: as `PeerWebServices.edit`: read again, only the drawable ticked layers added.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const picks = JSON.parse(url.searchParams.get("picks") || "[]");
    const found = WMS_READING.rows.filter((row) => picks.includes(row.id) && !row.refusal);
    if (!found.length) return send(response, 409, "This change does not fit the map");
    each.layers.push(...found.map((row) => ({ id: randomUUID().toUpperCase(), name: row.title,
      kind: "WMS", symbol: "square.grid.3x3", isEnabled: true })));
    each.revision += 1;
    return json(response, portable(each));
  }
  if (method === "POST" && parts[4] === "add-copies") {
    // 119: as `PeerWebFromMaps.copies`: a layer the picker would not tick is refused.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    if (each.locked) return send(response, 403, "This map is locked on the phone");
    const asked = (url.searchParams.get("layers") || "").split(",").filter(Boolean);
    if (!asked.length) return send(response, 409, "Tick one or more layers of another map");
    const rows = otherLayers(each).groups.flatMap((group) => group.rows);
    const made = [];
    for (const id of new Set(asked)) {
      const row = rows.find((one) => one.layer === id);
      if (!row) return send(response, 409, "No other map this browser may see has that layer");
      if (row.blocked) return send(response, 409, row.blocked);
      const source = phone.maps.flatMap((one) => one.layers).find((layer) => layer.id === id);
      made.push({ ...structuredClone(source), id: randomUUID().toUpperCase() });
    }
    each.layers.push(...made);
    each.revision += 1;
    phone.copies = [...(phone.copies ?? []), ...made.map((layer) => layer.name)];
    return json(response, portable(each));
  }
  if (method === "POST" && parts[4] === "add-server-layers") {
    // 2966: as `PeerWebServers.add`: each pick in order, a pick naming nothing refused.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const picks = JSON.parse(url.searchParams.get("picks") || "[]");
    const rows = [...SERVERS, ...phone.addedServers].flatMap((server) => server.rows).filter((row) => row.pick);
    // 3683: a pick may carry the layer page's tuning, which lands on the made layer.
    const names = (pick) => JSON.stringify({ server: pick.server, service: pick.service, layer: pick.layer });
    const found = picks.map((pick) => ({ pick, row: rows.find((row) => names(row.pick) === names(pick)) }))
      .filter((each) => each.row);
    if (!found.length) return send(response, 404, "This change does not fit the map");
    each.layers.push(...found.map(({ pick, row }) => ({ id: randomUUID().toUpperCase(), name: pick.name || row.title,
      kind: "From a server", symbol: pick.symbol || "server.rack", isEnabled: true,
      ...pick.tintHex ? { tintHex: pick.tintHex } : {} })));
    each.revision += 1;
    return json(response, portable(each));
  }
  if (method === "POST" && parts[4] === "add-api") {
    // 3003: as `PeerWebAPI.edit`: nothing is added that would draw no point.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const cookie = request.headers["x-riki-cookie"] || "";
    const read = apiRead(url.searchParams, cookie);
    if (!read?.points) return send(response, 409, "None of those items had a coordinate this app could read.");
    if (cookie) phone.keptCookie = cookie;
    phone.apiAdds.push({ reading: read.reading, tint: url.searchParams.get("tint"), cookie, address: url.href });
    each.layers.push({ id: randomUUID().toUpperCase(), name: url.searchParams.get("name") || read.name,
      kind: "API", symbol: "antenna.radiowaves.left.and.right", isEnabled: true });
    each.revision += 1;
    return json(response, portable(each));
  }
  if (method === "POST" && parts[4] === "picture") {
    // 3002: as `PeerWebPicture` answers: the phone reads it into a JPEG; none takes it away.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const kind = url.searchParams.get("kind");
    if (!["icon", "preview", "styleIcon"].includes(kind)) return send(response, 409, "That picture could not be read");
    const isPicture = body.length === 0 || body[0] === 0xff || body[0] === 0x89;
    if (!isPicture) return send(response, 409, "That picture could not be read");
    const picture = body.length ? body.toString("base64") : undefined;
    if (kind === "styleIcon") {
      // 65: as `PeerWebPicture` reads a style's own, the style named or refused.
      const style = each.styles.find((one) => one.id === url.searchParams.get("style"));
      if (!url.searchParams.get("style")) return send(response, 409, "That picture could not be read");
      if (!style) return send(response, 404, "This change does not fit the map");
      style.iconPicture = picture;
    } else each[kind + "Picture"] = picture;
    phone.pictureKinds.push(kind + ":" + body.length);
    return json(response, portable(each));
  }
  if (method === "POST" && parts[4] === "read-dxf") {
    // 3409: as `PeerWebDXF` answers: the phone's systems, and S-JTSK guessed from negative numbers.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    const file = url.searchParams.get("file") || "";
    if (!body.includes("ENTITIES")) return send(response, 409, `${file}: That file could not be read.`);
    const guessed = body.includes("-568990");
    return json(response, { fileName: file, system: guessed ? "sjtsk" : null, systems: DXF_SYSTEMS, features: guessed ? 1 : 0,
      said: guessed ? "Guessed from its numbers. Check it on the map." : "The file does not say. Choose the system it was drawn in." });
  }
  if (method === "POST" && parts[4] === "add-file") {
    // 2995: as `PeerWebAddFile` answers: DXF stays on the phone, an unreadable file is refused.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const file = url.searchParams.get("file") || "";
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    if (/\.dxf$/i.test(file)) {
      // 3409: placed in the system the page picked, as Add layer's Coordinates menu places it.
      const system = DXF_SYSTEMS.find((each) => each.value === url.searchParams.get("system"));
      if (!system) return send(response, 409, "The file does not say. Choose the system it was drawn in.");
      if (system.value === "wgs84") return send(response, 409, `${file}: none of its points is anywhere in WGS 84.`);
      phone.dxfAdds.push(`${file}:${system.value}:${body.includes("ENTITIES")}`);
    } else if (!body.includes("Feature")) return send(response, 409, `${file} could not be read as a map layer.`);
    const stem = file.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    each.layers.push({ id: randomUUID().toUpperCase(), name: stem.charAt(0).toUpperCase() + stem.slice(1),
      kind: "Files on this device", symbol: "folder", isEnabled: true });
    each.revision += 1;
    return json(response, portable(each));
  }
  if (method === "POST" && parts[4] === "add-tiles") {
    // 2964: as `PeerWebAddTiles` answers: checked, then read, then added under its host's name.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const template = (url.searchParams.get("template") || "").trim();
    if (/\.json$/i.test(template.split("?")[0])) {
      // 2965: a TileJSON document, read and refused when it counts its rows the TMS way.
      if (template.includes("tms")) return send(response, 409, "Raster · z 0–30 · TMS scheme — not supported");
      each.layers.push({ id: randomUUID().toUpperCase(), name: "OpenMapTiles", kind: "Vector tiles from a server",
        symbol: "square.grid.2x2", isEnabled: true });
      each.revision += 1;
      return json(response, portable(each));
    }
    const missing = ["{z}", "{x}", "{y}"].filter((axis) => !template.includes(axis));
    if (missing.length) return send(response, 409, "Missing " + missing.join(", "));
    if (template.includes("unreachable")) return send(response, 409, "Server replied 404");
    each.layers.push({ id: randomUUID().toUpperCase(), name: new URL(template.replace(/[{}]/g, "")).host,
      kind: "Tiles from a server", symbol: "square.grid.2x2", isEnabled: true });
    each.revision += 1;
    return json(response, portable(each));
  }
  if (method === "POST" && parts[4] === "edit") {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    if (url.searchParams.has("lock")) return lockChange(each, url.searchParams, response);
    // 118: a locked map takes no other edit until it is unlocked on the phone.
    if (each.locked) return send(response, 403, "This map is locked on the phone");
    return edit(each, url.searchParams, response);
  }
  if (parts.length === 4) return json(response, portable(each));
  if (parts[4] === "style" && each.real) {
    const hidden = new Set((url.searchParams.get("hide") || "").split(",").filter(Boolean));
    return json(response, realStyle(each, hidden, url.searchParams.get("theme"), `http://${request.headers.host}`, REAL_ROOT));
  }
  if (parts[4] === "style") return json(response, style(each, url.searchParams));
  if (parts[4] === "live" && parts.length === 6) return live(each, parts[5], url.searchParams, response);
  return send(response, 404, "");
}

// An API's points near the middle of the box asked, as `PeerShares.liveAnswer` reads them.
function live(each, layerID, query, response) {
  const layer = each.layers.find((one) => one.id === layerID && one.isLive);
  const box = (query.get("bbox") || "").split(",").map(Number);
  if (!layer || box.length !== 4 || box.some(Number.isNaN)) return send(response, 404, "");
  phone.liveAsks.push(layerID);
  phone.liveAnsweredAt = Date.now();
  const point = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  json(response, { type: "FeatureCollection", features: [{ type: "Feature",
    properties: { Nazov: "Os 4314", Line: "4314", Delay: String(phone.trainDelay) },
    geometry: { type: "Point", coordinates: point } }] }, { "Content-Type": "application/geo+json" });
}

// 130: as `PeerWebDetails` words a vehicle's connection card (`connection`, `live`) and, for a page before 3493, its `rows`.
function trainSheet(values) {
  const minutes = Number(values.Delay ?? 0);
  const late = minutes > 0;
  const clock = (extra) => `09:${String(31 + extra).padStart(2, "0")}`;
  const delay = { minutes, sentence: late ? `${minutes} min late` : minutes < 0 ? `${-minutes} min early` : "On time",
    short: late ? `+${minutes} min` : minutes < 0 ? `−${-minutes} min` : "On time",
    tone: minutes >= 10 ? "veryLate" : late ? "late" : "good" };
  const connection = { delay, station: "Hlavná stanica", route: "Lamač → Petržalka", operatorLine: "Run by DPB",
    planned: clock(0), actual: clock(minutes), updated: "09:35", note: "Detour via Main St",
    labels: { delay: "Delay", planned: "Planned", actual: "Actual", updated: "Updated", note: "Note from the operator" } };
  const rows = [{ title: "Delay", value: delay.sentence }, { title: "", value: "From Lamač to Petržalka" },
    { title: "Planned", value: connection.planned }, { title: "Actual", value: connection.actual },
    { title: "", value: "Run by DPB" }, { title: "Note from the operator", value: connection.note }];
  const answeredAt = phone.liveAnsweredAt;
  const sheet = { title: values.Nazov, keys: ["Nazov", "Line", "Delay"],
    sections: [{ blocks: [phone.rowsOnly ? { kind: "rows", rows } : { kind: "rows", rows, connection }] }] };
  if (!phone.rowsOnly) {
    const age = answeredAt == null ? null : Math.floor((Date.now() - answeredAt) / 1000);
    sheet.live = { isLive: age != null && age <= phone.liveWindow, windowSeconds: phone.liveWindow, label: "LIVE",
      notLiveLabel: "Not live", ...age == null ? {} : { ageSeconds: age } };
  }
  return sheet;
}

// MARK: - The phone's side

// 67: Geology, taken as features, with its Rocks on the map and Faults not yet.
const ESRI_ROCKS = "6F1E2A10-0000-4000-8000-0000000000E5";

function esriLayer(id, name, kind, symbol) {
  return { id, name, kind, symbol, isEnabled: true };
}

function esriListing(each) {
  return { services: (each.esri ?? []).filter((service) => Object.keys(service.taken).length).map((service) => ({
    id: service.id, name: service.name, subtitle: "gis.example.org · 3 layers · Features",
    detail: `${Object.keys(service.taken).length} of ${service.published.length} in this map · Features`,
    url: service.url, take: "Features",
    readAgain: service.readAt ? "Read it again · last read now" : "Read what it publishes",
    footnote: "A layer ticked here is added and its features are downloaded in the queue.",
    style: service.style ?? null,
    layers: service.published.map((published) => ({ id: published.id, name: published.name, symbol: "mappin",
      subtitle: published.refusal ?? (service.taken[published.id] ? "Areas · 40" : "Areas · not in this map"),
      layer: service.taken[published.id] ?? null, refusal: published.refusal ?? null })) })) };
}

// 57: the Trails download tiles; the Huts were fetched whole, so only their store is deleted.
function offlineOf(each) {
  each.offline ??= { stored: { "6F1E2A10-0000-4000-8000-0000000000A2": 2000 }, queued: [] };
  return each.offline;
}

function offlinePlan(each, query) {
  const held = offlineOf(each);
  const zoom = Number(query.get("zoom") || 16);
  const asked = query.get("layers")?.split(",");
  const rows = each.layers.map((layer) => {
    const isDownloadable = layer.kind === "Vector tiles";
    const stored = held.stored[layer.id] ?? 0;
    const running = held.queued.includes(layer.id);
    return { id: layer.id, name: layer.name, isDownloadable,
      isIncluded: isDownloadable && (asked ? asked.includes(layer.id) : true),
      detail: isDownloadable ? "https://t.test/{z}/{x}/{y}.pbf" : "Uploaded files · nothing to download",
      bytes: isDownloadable ? zoom * 1_000_000 : 0, stored, storedLine: stored ? `${stored / 1000} KB stored` : null,
      job: running ? "0 of 120 tiles" : null, fraction: running ? 0 : null,
      discard: stored ? { ask: `Delete what ${layer.name} has stored?`,
        note: `This frees ${stored / 1000} KB. The layer stays on the map and can download again.` } : null };
  });
  const ticked = rows.filter((row) => row.isIncluded);
  const total = ticked.reduce((sum, row) => sum + row.bytes, 0);
  const queued = ticked.filter((row) => row.job);
  return { area: query.get("chosen") === "1" ? "120 km²" : "43 km²", box: (query.get("box") || "").split(",").map(Number),
    minZoom: 8, maxZoom: 19, zoom, zoomLabel: `z ${zoom}`, limits: "",
    rows, toFetch: `≈ ${ticked.length * 120 * zoom} tiles to fetch`, held: "None of it is here yet", free: "18 MB free",
    total: `≈ ${total / 1_000_000} MB`, exceedsSpace: total > 18_000_000, isQueued: queued.length > 0,
    cancel: queued.length ? "Cancel this download" : null };
}

function testControl(route, query, response) {
  const id = query.get("id");
  switch (route) {
  case "/__test/reset": reset(); break;
  case "/__test/asks-first": phone.asksFirst = query.get("on") === "1"; break;
  case "/__test/direct": phone.direct = query.get("on") === "1"; break;
  case "/__test/admit": {
    const guest = phone.guests.get(id);
    if (guest) { guest.standing = "admitted"; phone.removedAddresses.delete(guest.address); }
    break;
  }
  case "/__test/remove": {
    const guest = phone.guests.get(id);
    if (guest) { guest.standing = "removed"; phone.removedAddresses.add(guest.address); }
    break;
  }
  case "/__test/guests": break;
  case "/__test/new-key": phone.tokens.clear(); break;
  // 92: the phone scanned the newest code and said yes or no.
  case "/__test/pair": {
    const newest = [...phone.pairs.keys()].pop();
    if (newest) phone.pairs.set(newest, query.get("allow") === "1" ? "allowed" : "refused");
    return json(response, { id: newest ?? null });
  }
  case "/__test/start-city":
    phone.maps[0].start = { kind: "city", latitude: 49.06, longitude: 20.3, name: "Poprad" };
    break;
  case "/__test/one-map": phone.maps = phone.maps.slice(0, 1); break;
  case "/__test/esri-service":
    phone.maps[0].layers.push(esriLayer(ESRI_ROCKS, "Rocks", "Esri features", "square.on.square"));
    phone.maps[0].esri = [{ id: "6F1E2A10-0000-4000-8000-0000000000E6", name: "Geology",
      url: "https://gis.example.org/arcgis/rest/services/Geology/MapServer", taken: { 0: ESRI_ROCKS },
      style: "6F1E2A10-0000-4000-8000-0000000000B2",
      published: [{ id: 0, name: "Rocks" }, { id: 1, name: "Faults" },
        { id: 2, name: "Shading", refusal: "The service does not let this one be asked" }] }];
    break;
  case "/__test/esri-asks": return json(response, phone.esriAsks);
  case "/__test/lock": phone.maps[0].locked = true; break;
  case "/__test/ski-and-rail":
    phone.maps[0].layers.push(
      { id: "6F1E2A10-0000-4000-8000-0000000000F1", name: "Ski & winter", kind: "Riki Maps package",
        symbol: "figure.skiing.downhill", isEnabled: true, overlay: "ski" },
      { id: "6F1E2A10-0000-4000-8000-0000000000F2", name: "Railways", kind: "Riki Maps package",
        symbol: "tram", isEnabled: true, overlay: "railways" });
    break;
  case "/__test/api-points":
    phone.maps[0].layers.push({ id: "6F1E2A10-0000-4000-8000-0000000000B7", name: "Buses", kind: "API",
      symbol: "bus", isEnabled: true, drawn: true, apiPoints: true });
    break;
  // 172: the Buses layer's server (Coffee) saved version 5 over the 3 it took: Map markers and Details changed.
  case "/__test/server-look":
    phone.maps[0].layers.find((one) => one.apiPoints).serverLook = { server: "Coffee", version: 5, answered: 3,
      parts: [{ id: "markers", title: "Map markers", changed: "Colour", behind: true },
        { id: "details", title: "Details", changed: "2 rows", behind: true, changedHere: query.get("here") === "details" }] };
    break;
  case "/__test/server-look-answers": return json(response, phone.serverLookAnswers);
  case "/__test/drawn-file":
    phone.maps[0].layers.push({ id: "6F1E2A10-0000-4000-8000-0000000000D1", name: "Trails", kind: "GeoJSON",
      symbol: "figure.walk", isEnabled: true, drawn: true });
    break;
  case "/__test/network-tiles":
    phone.maps[0].layers.push({ id: "6F1E2A10-0000-4000-8000-0000000000C1", name: "Aerial", kind: "Tiles",
      symbol: "airplane", isEnabled: true, net: true });
    break;
  case "/__test/roads-layer":
    phone.maps[0].layers.push({ id: "6F1E2A10-0000-4000-8000-0000000000B7", name: "Roads", kind: "Riki Maps package",
      symbol: "road.lanes", isEnabled: true, overlay: "roads" });
    break;
  case "/__test/signs-asked": return json(response, phone.signsAsked || []);
  case "/__test/esri-layer":
    phone.maps[0].layers.push({ id: "6F1E2A10-0000-4000-8000-00000000009E", name: "Bedrock", kind: "Esri",
      symbol: "map", isEnabled: true, esri: true });
    break;
  // 141: the phone answers as an older one does, with no sizes.
  case "/__test/sizes": phone.noSizes = query.get("off") === "1"; break;
  case "/__test/legend-everywhere": phone.legendEverywhere = query.get("on") === "1"; break;
  case "/__test/reader": phone.ownsSettings = false; break;
  case "/__test/share-role": phone.shares[query.get("map")].role = query.get("role"); break;
  // 118: what the phone's person does when Face ID is asked: answer, wait, or have no passcode.
  case "/__test/face-id":
    Object.assign(face(), { answers: query.get("answer") !== "0", wait: Number(query.get("wait") || 0),
      hasPasscode: query.get("passcode") !== "0" });
    break;
  case "/__test/face-asks": return json(response, { asks: face().asks });
  // 136: how the phone answers the Gallery: signed out, keys left out, an update, no public name yet, no coverage found,
  // and what its person does (sent, refused, failed or never answers) after `polls` asks; `expire` forgets every ask.
  case "/__test/publish": {
    const state = publishState();
    for (const key of ["leftOut", "update", "needsName", "noCoverage"]) if (query.has(key)) state[key] = query.get(key) === "1";
    if (query.has("signedIn")) state.signedIn = query.get("signedIn") === "1";
    if (query.has("answer")) state.answer = query.get("answer");
    if (query.has("polls")) state.polls = Number(query.get("polls"));
    if (query.get("expire") === "1") state.asks.clear();
    break;
  }
  case "/__test/publish-requests": return json(response, publishState().requests);
  case "/__test/publish-waiting": return json(response, [...publishState().asks.values()].filter((held) => held.answer.state === "waiting").length);
  // 135: what the phone's Saved answers: nothing saved, a longer library than it sends, or an older app's 404.
  case "/__test/saved":
    Object.assign(savedState(), { empty: query.get("empty") === "1", gone: query.get("gone") === "1",
      total: query.get("total") ? Number(query.get("total")) : null });
    break;
  // 148: W17's six sample maps, beside High Tatras and Bratislava, each pill kind once.
  // 149: every map answers as an older phone's: none of 3490's new fields.
  case "/__test/old-maps":
    for (const each of phone.maps) { each.sendsNewFields = false; each.category = undefined; }
    break;
  case "/__test/sample-maps": phone.maps.push(...sampleMaps()); break;
  case "/__test/locked": phone.maps.find((each) => each.id === query.get("map")).locked = true; break;
  case "/__test/shares": return json(response, phone.shares);
  case "/__test/copies": return json(response, phone.copies ?? []);
  case "/__test/folder":
    for (const each of phone.maps) Object.assign(each, { stackID: "F01DE500-0000-4000-8000-000000000001", stackName: "Hills" });
    break;
  case "/__test/folder-shares": return json(response, phone.folderShares);
  case "/__test/laid-out-layer":
    phone.maps[0].layers.push({ id: "6F1E2A10-0000-4000-8000-0000000000A5", name: "Trams", kind: "API",
      symbol: "tram", isEnabled: true, layout: [{ title: null, blocks: [
        { handle: "r1", kind: "rows", name: "Info rows", counts: true, settings: { look: "nameAboveValue", icons: true,
          hidesEmpty: true, rows: [{ index: 0, title: "Speed", value: "{speed}", symbol: "gauge" }] } },
        { handle: "t1", kind: "text", name: "Text", value: "{note}", style: "box", counts: true,
          settings: { icon: false, hides: true } }] }] });
    break;
  case "/__test/takes-no-translations": phone.takesTranslations = false; break;
  case "/__test/forget-language": phone.languages = phone.languages.filter((code) => code !== query.get("code")); break;
  case "/__test/forget-symbol": phone.droppedSymbols.add(query.get("symbol")); break;
  case "/__test/lists-no-row-icons": phone.listsRowIcons = false; break;
  case "/__test/moves-layout":
    // 80: the layout changes on the phone, so the page's handles are stale.
    for (const block of phone.maps[0].layers.flatMap((layer) => layer.layout?.flatMap((one) => one.blocks) ?? [])) {
      block.handle += "x";
    }
    break;
  case "/__test/blanks-titles":
    // 81: every title written on the phone is taken away, the translations kept.
    for (const layer of phone.maps[0].layers.filter((one) => one.layout)) {
      if (layer.header) layer.header.title = null;
      for (const section of layer.layout) {
        section.title = null;
        for (const block of section.blocks) delete block.heading;
      }
    }
    break;
  case "/__test/layer-samples": {
    // 79: the points `PeerWebLayerOptions+Details` hands the page; none when the query says so.
    const layer = phone.maps[0].layers.find((one) => one.id === "6F1E2A10-0000-4000-8000-0000000000A5");
    layer.samples = query.has("none") ? [] : [
      { caption: "Line 4 · Feature 1 of 3", properties: { line: "4", speed: "30", note: "Detour via Main St" } },
      { caption: "Line 9 · Feature 2 of 3", properties: { line: "9", speed: "25" } },
      { caption: "Line 12 · Feature 3 of 3", properties: { line: "12", speed: "40", note: "Closed" } }];
    break;
  }
  case "/__test/answers-servers": phone.answersServers = true; break;
  case "/__test/identified": return json(response, phone.identified);
  case "/__test/lays-out-details": phone.laysOutDetails = true; break;
  case "/__test/details-asked": return json(response, phone.detailsAsked);
  case "/__test/train-delay": phone.trainDelay = Number(query.get("minutes")); break;
  case "/__test/live-window": phone.liveWindow = Number(query.get("seconds")); break;
  case "/__test/rows-only": phone.rowsOnly = true; break;
  case "/__test/search-missing": phone.searchMissing = true; break;
  case "/__test/search-asked": return json(response, phone.searchAsks);
  case "/__test/offline": return json(response, { asks: phone.offlineAsks, discarded: phone.discarded });
  case "/__test/pictures": return json(response, phone.pictureKinds);
  case "/__test/dxf-adds": return json(response, phone.dxfAdds);
  case "/__test/api-adds": return json(response, phone.apiAdds);
  case "/__test/land":
    phone.regions.drawn.push(...phone.regions.downloading);
    phone.regions.downloading = [];
    break;
  case "/__test/location":
    phone.location = query.has("lat")
      ? { lat: Number(query.get("lat")), lon: Number(query.get("lon")), accuracy: 8, at: Date.now() / 1000 }
      : null;
    break;
  case "/__test/live":
    phone.maps[0].layers.push({ id: "6F1E2A10-0000-4000-8000-0000000000E1", name: "Trains", kind: "API from a server",
      symbol: "tram", isEnabled: true, isLive: true });
    phone.maps[0].revision += 1;
    break;
  default: return send(response, 404, "");
  }
  json(response, { guests: present(), viewers: viewers(), asksFirst: phone.asksFirst, liveAsks: phone.liveAsks,
    placeAsks: phone.placeAsks });
}

createServer((request, response) => {
  answer(request, response).catch((error) => send(response, 500, String(error)));
}).listen(PORT, () => console.log("mock phone on http://localhost:" + PORT + "/"));
