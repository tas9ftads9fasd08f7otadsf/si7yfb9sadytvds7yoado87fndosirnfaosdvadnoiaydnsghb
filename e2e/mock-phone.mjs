// A stand-in for a sharing phone, so the page is tested in a browser on any machine.
// It serves the page's build and answers as the app's `PeerRouter` does, with the guest
// rules of `PeerWebGuestBook`; `/__test/*` is the phone's side, for the specs to press.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

function freshMaps() {
  const layer = (id, name, kind, symbol) => ({ id, name, kind, symbol, isEnabled: true });
  return [
    { id: "6F1E2A10-0000-4000-8000-000000000001", name: "High Tatras", symbol: "mountain.2", iconTintHex: "#3a7d44",
      revision: 1, note: "Summer trails", minimumVersion: { app: "0.18.0", browser: "0.30.0" }, drawsRelief: true,
      layers: [layer("6F1E2A10-0000-4000-8000-0000000000A1", "Trails", "Vector tiles", "figure.hiking"),
        layer("6F1E2A10-0000-4000-8000-0000000000A2", "Huts", "Points", "house")],
      styles: [{ id: "6F1E2A10-0000-4000-8000-0000000000B1", name: "Summer", arrangement: { hidden: [] } },
        { id: "6F1E2A10-0000-4000-8000-0000000000B2", name: "Winter",
          arrangement: { hidden: ["6F1E2A10-0000-4000-8000-0000000000A2"] } }],
      nameTranslations: { sk: "Vysoké Tatry" } },
    { id: "6F1E2A10-0000-4000-8000-000000000002", name: "Bratislava", symbol: "building.2", iconTintHex: null,
      revision: 3, note: "",
      layers: [layer("6F1E2A10-0000-4000-8000-0000000000C1", "Streets", "Vector tiles", "road.lanes")],
      styles: [{ id: "6F1E2A10-0000-4000-8000-0000000000D1", name: "Day", arrangement: { hidden: [] } }] }
  ];
}

let phone = { name: "Riki's iPad", asksFirst: false, guests: new Map(), removedAddresses: new Set(),
  maps: freshMaps(), served: true, liveAsks: [], regions: freshRegions(), location: null,
  tokens: new Set(), placeAsks: [], addedServers: [], importedServers: [], identified: [], answersServers: false, pictureKinds: [], detailsAsked: [], laysOutDetails: false };

// 2802: the High Tatras on the phone, Prešov's region not yet.
function freshRegions() {
  return { drawn: [{ id: "vysoke_tatry", name: "Vysoké Tatry", box: [19.9, 49.09, 20.32, 49.32] }],
    downloadable: [{ id: "presovsky", name: "Prešovský kraj", box: [20.4, 48.6, 22.6, 49.6] }], downloading: [] };
}

function reset() {
  phone = { name: "Riki's iPad", asksFirst: false, guests: new Map(), removedAddresses: new Set(),
    maps: freshMaps(), served: true, liveAsks: [], regions: freshRegions(), location: null,
    tokens: new Set(), placeAsks: [], addedServers: [], importedServers: [], identified: [], answersServers: false, pictureKinds: [], detailsAsked: [], laysOutDetails: false };
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

// MARK: - Answers

function send(response, status, body, type = "text/plain; charset=utf-8", headers = {}) {
  response.writeHead(status, { "Content-Type": type, ...headers });
  response.end(body);
}

const json = (response, value, headers = {}) =>
  send(response, 200, JSON.stringify(value), "application/json", { "Cache-Control": "no-store", ...headers });

function catalog() {
  return { deviceID: "mock", name: phone.name, model: "iPad", version: 1, appVersion: "0.20.0",
    sharesLocation: phone.location ? true : undefined,
    maps: phone.maps.map((each) => ({ id: each.id, name: each.name, symbol: each.symbol,
      iconTintHex: each.iconTintHex, revision: each.revision, minimumVersion: each.minimumVersion,
      layers: each.layers.map(({ id, name, kind, symbol, isLive }) => ({ id, name, kind, symbol, isLive })) })) };
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
const FEATURE_KEYS = [...FEATURE_SWITCHES, "lineWidth", "valueShown", "allValuesShown", "valueTint"];
const DRAWN_VALUES = ["Hiking", "Skiing"];

function featureSections(layer) {
  const shown = layer.shownValues || DRAWN_VALUES;
  const every = shown.length === DRAWN_VALUES.length;
  return [{ kind: "slider", title: "Line width", footnote: "", key: "lineWidth", layerScoped: true,
    value: String(layer.lineWidthScale || 1), range: [0.5, 5, 0.25], ends: ["Hairline", "Bold"] },
  { kind: "switch", title: "", footnote: "Tell overlapping features apart", key: "distinctColours",
    label: "Distinct colours per feature", isOn: layer.distinctColours === true, layerScoped: true },
  { kind: "values", title: "Colour by Kind", footnote: "", key: "valueShown", layerScoped: true,
    label: every ? "None" : "All", value: every ? "0" : "1", palette: ["#E5533D", "#2E9E5B"],
    items: DRAWN_VALUES.map((value) => ({ id: value, title: value, light: layer.valueTints?.[value] || "",
      dark: layer.valueTints?.[value] || "", isOn: shown.includes(value) })) },
  { kind: "switch", title: "Grouping", footnote: "A tap gathers every part sharing that name.", key: "grouping",
    label: "Group features by name", isOn: layer.grouping === true, layerScoped: true }];
}

function editFeatures(layer, query, key) {
  const value = query.get(key);
  if (FEATURE_SWITCHES.includes(key)) layer[key] = value === "1";
  if (key === "lineWidth") layer.lineWidthScale = Number(value);
  if (key === "valueTint") layer.valueTints = { ...layer.valueTints, [value]: query.get("ink") || undefined };
  const shown = new Set(layer.shownValues || DRAWN_VALUES);
  if (key === "valueShown") { if (query.get("valueOn") === "1") shown.add(value); else shown.delete(value); }
  if (key === "allValuesShown") { shown.clear(); if (value === "1") DRAWN_VALUES.forEach((one) => shown.add(one)); }
  const kept = DRAWN_VALUES.filter((one) => shown.has(one));
  layer.shownValues = kept.length === DRAWN_VALUES.length ? undefined : kept;
}

// 2999: Edit layer's Connection, as `PeerWebLayerOptions+Network` lists it for a tile layer.
const NETWORK_KEYS = ["connectionOverride", "offlineDownload", "connection"];
const GROUPS = [["layerTiles", "Map tiles", "Tiles as you pan"], ["layerRefresh", "Refreshing", "Live answers"]];

function networkSections(layer) {
  const blocked = layer.blocked || [];
  const over = layer.overrides === true;
  return [{ kind: "switch", title: "Connection", footnote: over ? "On this map, these switches override Settings."
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

// 3003: an API answering two vehicles, as `PeerWebAPI` reads one.
function apiRead(query) {
  if (!/^https:\/\//.test(query.get("address") || "")) return null;
  const reading = query.has("reading") ? JSON.parse(query.get("reading"))
    : { itemsPath: "vehicles", spelling: "decimal", latitudeKey: "lat", longitudeKey: "lon", positionKey: "", nameKey: "line" };
  const keys = reading.itemsPath === "vehicles" ? ["lat", "lon", "line"] : [];
  const points = keys.includes(reading.latitudeKey) && keys.includes(reading.longitudeKey) ? 2 : 0;
  return { reading, paths: ["vehicles", "stops"], keys, points, name: "buses.example", said: `Answered · ${points} points` };
}

// 29: a layer's Details layout as `PeerWebLayerOptions+Details` lists it, and its edits.
const LAYOUT_WORDS = { addContent: "Add content", addSection: "Add section", removeSection: "Remove section",
  sectionTitle: "Title", fromTheApp: "From the app", name: "Name", value: "Value", label: "Label", link: "Link",
  heading: "Title", plain: "Plain", box: "Box", warning: "Warning", full: "This layout holds 10 content blocks" };

function detailsSections(layer) {
  const used = layer.layout.flatMap((section) => section.blocks).filter((block) => block.counts).length;
  return [{ kind: "details", title: "Details", footnote: "What a tapped point's sheet shows.", layerScoped: true,
    layout: { sections: layer.layout.map((section, index) => ({ ...section, name: section.title || `Section ${index + 1}` })),
      used, limit: 10, parts: [], keys: ["line", "note"], offers: [{ id: "text", title: "Text" }],
      words: { ...LAYOUT_WORDS, used: `${used} of 10 content blocks used` } } }];
}

function editLayout(layer, query) {
  const sections = layer.layout;
  const number = (key) => Number(query.get(key));
  const held = () => sections[number("section")]?.blocks[number("block")];
  const op = query.get("details");
  if (["remove", "move", "edit"].includes(op) && held()?.handle !== query.get("was")) return false;
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
  }
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
    if (layer.layout) return detailsSections(layer);
    return layer.drawn ? featureSections(layer) : layer.net ? networkSections(layer) : layer.esri ? questionSections(layer) : [];
  };
  return { layers: each.layers.map((layer) => ({ id: layer.id, sections: sections(layer) }))
    .filter((layer) => layer.sections.length) };
}

// 2966: the phone's saved servers, as `PeerWebServers` walks them.
const OSM = "0D5E1F00-0000-4000-8000-000000000001";
const ZBGIS = "0D5E1F00-0000-4000-8000-000000000002";
const SERVERS = [
  { id: OSM, name: "OpenTopoMap", line: "Tiles", address: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
    kind: "Tile server", symbol: "mountain.2", rows: [
    { kind: "layer", title: "OpenTopoMap", subtitle: "Raster", depth: 0, pick: { server: OSM, layer: "" } }] },
  { id: ZBGIS, name: "ZBGIS", line: "Esri / ArcGIS · 3 services", address: "https://zbgis.test/arcgis/rest/services",
    kind: "Esri / ArcGIS", facts: [{ name: "Version", value: "11.1" }], rows: [
    { kind: "heading", title: "Base", depth: 0 },
    { kind: "heading", title: "Parcels", subtitle: "MapServer", depth: 1 },
    { kind: "layer", title: "Parcels C", subtitle: "Areas", depth: 2,
      pick: { server: ZBGIS, service: "https://zbgis.test/Base/Parcels/MapServer", layer: "0" } },
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

// As `PeerWebAddServer.kinds`; an API needs the phone's own form.
const SERVER_KIND_LINES = { arcgis: "Esri / ArcGIS · 1 service", tilejson: "TileJSON · 1 layer",
  tiles: "Tile server · 1 layer", wmts: "WMTS · 1 layer", wms: "WMS · 1 layer", mapproxy: "MapProxy · 1 layer" };

function portable(each) {
  return { id: each.id, name: each.name, note: each.note, nameTranslations: each.nameTranslations,
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
  if (relief.length) sources.dem = { type: "raster-dem", tiles: ["/__test/none/{z}/{x}/{y}.png"], bounds: [-179.9, -89, -179.8, -88.9] };
  return { version: 8, name: each.name, sources,
    layers: [{ id: "ground", type: "background", paint: { "background-color": colours[theme] || "#ddd" } },
      ...relief,
      { id: "numbers", type: "symbol", source: "numbers",
        layout: { "text-field": "1", "symbol-z-offset": ["coalesce", ["get", "render_height"], 0] } },
      ...shown.map((layer) => layer.isLive
        ? { id: "riki-custom-layer-" + layer.id.toLowerCase(), type: "circle",
          source: "riki-custom-" + layer.id.toLowerCase(), paint: { "circle-radius": 8 } }
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

function edit(each, query, response) {
  const adjust = (change) => each.styles.forEach((style) => { style.adjustments = change({ ...style.adjustments }); });
  const looked = query.has("layer") && LAYER_LOOKS.find((key) => query.has(key));
  const featured = query.has("layer") && FEATURE_KEYS.find((key) => query.has(key));
  const asking = query.has("layer") && QUESTION_KEYS.find((key) => query.has(key));
  const networked = query.has("layer") && NETWORK_KEYS.find((key) => query.has(key));
  if (query.has("layer") && query.has("details")) {
    const layer = each.layers.find((one) => one.id === query.get("layer"));
    if (!layer?.layout) return send(response, 409, "This change does not fit the map");
    if (!editLayout(layer, query)) {
      return send(response, 409, "The layout changed on the phone; it is shown again as it is now");
    }
  } else if (featured) {
    const layer = each.layers.find((one) => one.id === query.get("layer"));
    if (!layer?.drawn) return send(response, 404, "This change does not fit the map");
    editFeatures(layer, query, featured);
  } else if (networked) {
    const layer = each.layers.find((one) => one.id === query.get("layer"));
    if (!layer?.net) return send(response, 404, "This change does not fit the map");
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
  mapSymbols: "map,mountain.2,tent", iconTints: "#F2B8B5,#B5D8F2" } };

// Read off `out/`, as the app reads its bundle; nothing outside it.
async function buildFile(name) {
  const file = path.normalize(path.join(BUILD, name));
  if (!file.startsWith(BUILD + path.sep)) return null;
  return readFile(file).catch(() => null);
}

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
    return json(response, { standing: guest.standing, viewers: viewers(), device: phone.name, edits: true },
      headers);
  }
  if (method === "GET" && (route === "/" || route === "/index.html")) {
    return send(response, 200, await buildFile("index.html"), TYPES[".html"]);
  }
  if (route === "/favicon.ico") return send(response, 204, "");
  if (route.startsWith("/web/symbols/")) return send(response, 200, PIXEL, "image/png");
  if (route === "/web/edit-check") {
    if (method !== "POST") return send(response, 405, "");
    if (!opensEditing(request)) return send(response, 403, "This browser may not change maps");
    const token = "mock." + randomUUID();
    phone.tokens.add(token);
    return json(response, { token, expiresIn: 43200 });
  }
  if (route === "/web/words") return send(response, 200, JSON.stringify(WORDS), TYPES[".json"]);
  if (route.startsWith(FILES_PREFIX)) {
    const file = await buildFile(decodeURIComponent(route.slice(FILES_PREFIX.length)));
    if (!file) return send(response, 404, "");
    return send(response, 200, file, TYPES[path.extname(route)] ?? "application/octet-stream");
  }
  if (refuses(request)) return send(response, 403, "This phone has not let this browser in");
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
  if (parts[2] === "coverage-places" && parts.length === 3) {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    return json(response, COVERAGE_PLACES);
  }
  if (parts[2] === "read-api" && parts.length === 3) {
    // 3003: as `PeerWebAPI.read` answers: the vehicles list guessed, or read as the page picked.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const read = apiRead(url.searchParams);
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
    return json(response, { servers: [...SERVERS, ...phone.addedServers, ...phone.importedServers] });
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
    phone.addedServers.push({ id, name, line: SERVER_KIND_LINES[kind], rows: [
      { kind: "layer", title: ogc ? "National map" : "Geology", subtitle: ogc ? kind.toUpperCase() : "Areas", depth: 0,
        pick: { server: id, layer: ogc ? "pixelkarte" : "0" } }] });
    return json(response, { servers: [...SERVERS, ...phone.addedServers, ...phone.importedServers] });
  }
  if (parts[2] === "servers" && parts.length === 3) {
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    return json(response, { servers: [...SERVERS, ...phone.addedServers, ...phone.importedServers] });
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
  if (parts[4] === "regions" && parts.length === 5) return json(response, phone.regions);
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
  if (method === "GET" && parts[4] === "details" && parts.length === 5) {
    // 21: as `PeerWebDetails` answers: the layer's layout filled from the feature, or nothing.
    const values = JSON.parse(url.searchParams.get("values") || "{}");
    phone.detailsAsked.push({ layer: url.searchParams.get("layer"), values });
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
  if (method === "POST" && parts[4] === "add-server-layers") {
    // 2966: as `PeerWebServers.add`: each pick in order, a pick naming nothing refused.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const picks = JSON.parse(url.searchParams.get("picks") || "[]");
    const rows = [...SERVERS, ...phone.addedServers].flatMap((server) => server.rows).filter((row) => row.pick);
    const found = picks.map((pick) => rows.find((row) => JSON.stringify(row.pick) === JSON.stringify(pick)))
      .filter(Boolean);
    if (!found.length) return send(response, 404, "This change does not fit the map");
    each.layers.push(...found.map((row) => ({ id: randomUUID().toUpperCase(), name: row.title,
      kind: "From a server", symbol: "server.rack", isEnabled: true })));
    each.revision += 1;
    return json(response, portable(each));
  }
  if (method === "POST" && parts[4] === "add-api") {
    // 3003: as `PeerWebAPI.edit`: nothing is added that would draw no point.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const read = apiRead(url.searchParams);
    if (!read?.points) return send(response, 409, "None of those items had a coordinate this app could read.");
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
    if (!["icon", "preview"].includes(kind)) return send(response, 409, "That picture could not be read");
    const isPicture = body.length === 0 || body[0] === 0xff || body[0] === 0x89;
    if (!isPicture) return send(response, 409, "That picture could not be read");
    each[kind + "Picture"] = body.length ? body.toString("base64") : undefined;
    phone.pictureKinds.push(kind + ":" + body.length);
    return json(response, portable(each));
  }
  if (method === "POST" && parts[4] === "add-file") {
    // 2995: as `PeerWebAddFile` answers: DXF stays on the phone, an unreadable file is refused.
    if (!request.headers.authorization) return send(response, 403, "This browser may not change maps");
    if (!bearsToken(request)) return send(response, 401, "Type the edit password again");
    const file = url.searchParams.get("file") || "";
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    if (/\.dxf$/i.test(file)) return send(response, 409, "Add a DXF file on the phone: it asks for the drawing's coordinate system.");
    if (!body.includes("Feature")) return send(response, 409, `${file} could not be read as a map layer.`);
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
    return edit(each, url.searchParams, response);
  }
  if (parts.length === 4) return json(response, portable(each));
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
  const point = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  json(response, { type: "FeatureCollection", features: [{ type: "Feature", properties: { Nazov: "Os 4314" },
    geometry: { type: "Point", coordinates: point } }] }, { "Content-Type": "application/geo+json" });
}

// MARK: - The phone's side

function testControl(route, query, response) {
  const id = query.get("id");
  switch (route) {
  case "/__test/reset": reset(); break;
  case "/__test/asks-first": phone.asksFirst = query.get("on") === "1"; break;
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
  case "/__test/start-city":
    phone.maps[0].start = { kind: "city", latitude: 49.06, longitude: 20.3, name: "Poprad" };
    break;
  case "/__test/one-map": phone.maps = phone.maps.slice(0, 1); break;
  case "/__test/ski-and-rail":
    phone.maps[0].layers.push(
      { id: "6F1E2A10-0000-4000-8000-0000000000F1", name: "Ski & winter", kind: "Riki Maps package",
        symbol: "figure.skiing.downhill", isEnabled: true, overlay: "ski" },
      { id: "6F1E2A10-0000-4000-8000-0000000000F2", name: "Railways", kind: "Riki Maps package",
        symbol: "tram", isEnabled: true, overlay: "railways" });
    break;
  case "/__test/drawn-file":
    phone.maps[0].layers.push({ id: "6F1E2A10-0000-4000-8000-0000000000D1", name: "Trails", kind: "GeoJSON",
      symbol: "figure.walk", isEnabled: true, drawn: true });
    break;
  case "/__test/network-tiles":
    phone.maps[0].layers.push({ id: "6F1E2A10-0000-4000-8000-0000000000C1", name: "Aerial", kind: "Tiles",
      symbol: "airplane", isEnabled: true, net: true });
    break;
  case "/__test/esri-layer":
    phone.maps[0].layers.push({ id: "6F1E2A10-0000-4000-8000-00000000009E", name: "Bedrock", kind: "Esri",
      symbol: "map", isEnabled: true, esri: true });
    break;
  case "/__test/laid-out-layer":
    phone.maps[0].layers.push({ id: "6F1E2A10-0000-4000-8000-0000000000A5", name: "Trams", kind: "API",
      symbol: "tram", isEnabled: true, layout: [{ title: null, blocks: [
        { handle: "r1", kind: "rows", name: "Info rows", counts: true },
        { handle: "t1", kind: "text", name: "Text", value: "{note}", style: "box", counts: true }] }] });
    break;
  case "/__test/answers-servers": phone.answersServers = true; break;
  case "/__test/identified": return json(response, phone.identified);
  case "/__test/lays-out-details": phone.laysOutDetails = true; break;
  case "/__test/details-asked": return json(response, phone.detailsAsked);
  case "/__test/pictures": return json(response, phone.pictureKinds);
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
