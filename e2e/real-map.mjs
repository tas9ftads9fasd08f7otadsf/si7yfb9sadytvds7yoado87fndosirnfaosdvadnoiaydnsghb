// 93 A real map for the stand-in phone: the Riki Maps map over a region scripts/real-region.mjs
// downloaded, its style put together from the packages' parts as `StyleBuilder+Fragments` does.
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const PUBLISHED = "https://tas9ftads9fasd08f7otadsf.github.io/sad7tfs9fnnsdfhdnsf8aosdnfladhsgfia76w4fhasdf/";
const SERVED = "/__real/";
// The packages a layer's overlay draws from; names and history are drawn by the app's builder alone.
const PACKAGES = { heightModel: ["terrain"], hillshading: ["terrain"], landscape: ["landscape"],
  boundaries: ["boundaries"], rocks: ["rocks"], contours: ["contours"], water: ["water"], paths: ["paths"],
  roads: ["roads"], railways: ["railways"], settlements: ["settlements"], ski: ["ski"], points: ["points"] };
const VARIANTS = { hiking: "turisticka", ski: "lyziarska", road: "cestna", basic: "zakladna", historic: "historicka" };

/** The map a `.mapson` describes, as the stand-in phone lists its maps. */
export function readRealMap(file) {
  const mapson = JSON.parse(readFileSync(file, "utf8"));
  return { id: mapson.id, name: mapson.name, symbol: mapson.symbol, iconTintHex: null, revision: 1, note: "",
    previewPicture: mapson.previewPicture, real: true,
    layers: mapson.stack.map((layer) => ({ id: layer.id, name: layer.name, kind: layer.hint, symbol: layer.symbol,
      isEnabled: layer.isEnabled, overlay: layer.source?.region?.overlay })),
    styles: mapson.styles.map((style) => ({ id: style.id, name: style.name, arrangement: style.arrangement,
      variant: VARIANTS[style.origin?.builtIn?.pipelineStyle] ?? "turisticka" })) };
}

/** The region folders under `root`, each a package unpacked. */
export function regionPackages(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== "zips")
    .flatMap((region) => readdirSync(path.join(root, region.name), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "zips")
      .map((entry) => path.join(root, region.name, entry.name)));
}

function part(folder, variant, theme) {
  const fragments = path.join(folder, "fragments");
  if (!existsSync(fragments)) return null;
  for (const kind of readdirSync(fragments)) {
    for (const suffix of [`-${variant}-${theme}.json`, `-${variant}-svetla.json`]) {
      const name = readdirSync(path.join(fragments, kind)).filter((each) => each.endsWith(suffix)).sort()[0];
      if (name) return JSON.parse(readFileSync(path.join(fragments, kind, name), "utf8"));
    }
  }
  return null;
}

const placeOf = (layer) => layer.metadata?.["riki:z"] ?? Infinity;

/** The parts of the packages the shown layers draw from, joined into one style served from here. */
export function realStyle(each, hidden, theme, origin, root) {
  const style = each.styles[0];
  const wanted = new Set(each.layers.filter((layer) => !hidden.has(layer.id))
    .flatMap((layer) => PACKAGES[layer.overlay] ?? []));
  const parts = regionPackages(root).filter((folder) => wanted.has(packageOf(folder)))
    .map((folder) => part(folder, style.variant, theme === "dark" ? "tmava" : "svetla")).filter(Boolean);
  const sources = {};
  const layers = [];
  const sprites = [];
  let terrain;
  for (const one of parts) {
    for (const [key, source] of Object.entries(one.sources ?? {})) sources[key] ??= source;
    layers.push(...(one.layers ?? []));
    sprites.push(...(Array.isArray(one.sprite) ? one.sprite : []));
    terrain ??= one.terrain;
  }
  const ground = theme === "dark" ? "#232a22" : "#e8eedf";
  const joined = { version: 8, name: each.name, glyphs: parts[0]?.glyphs, sources,
    layers: [{ id: "ground", type: "background", paint: { "background-color": ground } },
      ...layers.sort((one, other) => placeOf(one) - placeOf(other))] };
  if (sprites.length) joined.sprite = sprites;
  if (terrain) joined.terrain = terrain;
  const text = JSON.stringify(joined).replaceAll(`pmtiles://${PUBLISHED}`, `pmtiles://${origin}${SERVED}`)
    .replaceAll(`${PUBLISHED}fragments/`, `${origin}${SERVED}fragments/`);
  return JSON.parse(text);
}

function packageOf(folder) {
  const contents = path.join(folder, "contents.json");
  return existsSync(contents) ? JSON.parse(readFileSync(contents, "utf8")).package : null;
}

/** A tile archive or sprite sheet of a downloaded package, by range as pmtiles reads it. */
export function serveReal(route, request, response, root) {
  if (!route.startsWith(SERVED)) return false;
  const wanted = route.slice(SERVED.length).split("/");
  const file = regionPackages(root).map((folder) => [folder, wanted[0] === "tiles"
    ? path.join(folder, "tiles", wanted[1] ?? "")
    : path.join(folder, ...wanted)]).find(([folder, each]) => each.startsWith(folder + path.sep) && existsSync(each))?.[1];
  if (!file) {
    response.writeHead(404);
    response.end();
    return true;
  }
  const size = statSync(file).size;
  const type = file.endsWith(".json") ? "application/json" : file.endsWith(".png") ? "image/png"
    : "application/octet-stream";
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
  if (!range) {
    response.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
    createReadStream(file).pipe(response);
    return true;
  }
  const start = Number(range[1]);
  const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
  response.writeHead(206, { "Content-Type": type, "Content-Length": end - start + 1, "Accept-Ranges": "bytes",
    "Content-Range": `bytes ${start}-${end}/${size}` });
  createReadStream(file, { start, end }).pipe(response);
  return true;
}
