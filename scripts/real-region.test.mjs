import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { readRealMap, realStyle, serveReal } from "../e2e/real-map.mjs";
import { packagesOf } from "./real-region.mjs";

const PUBLISHED = "https://tas9ftads9fasd08f7otadsf.github.io/sad7tfs9fnnsdfhdnsf8aosdnfladhsgfia76w4fhasdf/";
const MAPSON = path.join(import.meta.dirname, "..", "e2e", "fixtures", "riki-maps.mapson");

function region() {
  const root = mkdtempSync(path.join(tmpdir(), "real-"));
  const pack = (name, layers, theme = "svetla") => {
    const folder = path.join(root, "bratislavsky", `bratislavsky-${name}`);
    mkdirSync(path.join(folder, "fragments", name), { recursive: true });
    mkdirSync(path.join(folder, "tiles"), { recursive: true });
    writeFileSync(path.join(folder, "contents.json"), JSON.stringify({ package: name }));
    writeFileSync(path.join(folder, "tiles", `bratislavsky-${name}.pmtiles`), "0123456789");
    writeFileSync(path.join(folder, "fragments", name, `bratislavsky-turisticka-${theme}.json`), JSON.stringify({
      version: 8, glyphs: `${PUBLISHED}fonts/{fontstack}/{range}.pbf`,
      sources: { [name]: { type: "vector", url: `pmtiles://${PUBLISHED}tiles/bratislavsky-${name}.pmtiles` } },
      layers }));
  };
  pack("roads", [{ id: "road", type: "line", source: "roads", metadata: { "riki:z": 20 } }]);
  pack("water", [{ id: "river", type: "fill", source: "water", metadata: { "riki:z": 5 } }]);
  return root;
}

describe("the real map", () => {
  // 93 a region's packages, without the articles, downloaded straight from Drive
  it("lists a region's packages from the catalogue", () => {
    const catalog = { slovensko: { regions: { bratislavsky: { maps: {
      roads: { file: "bratislavsky-roads.zip", size: 3, download: "https://drive.google.com/uc?export=download&id=R" },
      wikipedia: { file: "w.zip", size: 1, download: "https://drive.google.com/uc?export=download&id=W" } } } } } };
    expect(packagesOf(catalog, "slovensko/bratislavsky")).toEqual([{ key: "roads", file: "bratislavsky-roads.zip",
      size: 3, address: "https://drive.usercontent.google.com/download?export=download&id=R&confirm=t" }]);
    expect(() => packagesOf(catalog, "slovensko/none")).toThrow("No region slovensko/none");
  });

  // 93 the Riki Maps map keeps its layers, each with the overlay it draws
  it("reads the Riki Maps map from its .mapson", () => {
    const map = readRealMap(MAPSON);
    expect(map.name).toBe("Riki Maps");
    expect(map.layers.find((layer) => layer.name === "Roads").overlay).toBe("roads");
    expect(map.styles[0].variant).toBe("turisticka");
  });

  // 93 the shown layers' parts joined in the pipeline's order, their tiles served from here
  it("joins the parts of the shown layers and points them here", () => {
    const root = region();
    const map = readRealMap(MAPSON);
    const style = realStyle(map, new Set(), "light", "http://phone", root);
    expect(style.layers.map((layer) => layer.id)).toEqual(["ground", "river", "road"]);
    expect(style.sources.roads.url).toBe("pmtiles://http://phone/__real/tiles/bratislavsky-roads.pmtiles");
    expect(style.glyphs).toBe(`${PUBLISHED}fonts/{fontstack}/{range}.pbf`);
    const roads = map.layers.find((layer) => layer.name === "Roads").id;
    expect(realStyle(map, new Set([roads]), "dark", "http://phone", root).layers.map((layer) => layer.id))
      .toEqual(["ground", "river"]);
  });

  // 93 pmtiles reads an archive by ranges
  it("serves a package's tiles by range", async () => {
    const root = region();
    const response = new PassThrough();
    let head;
    response.writeHead = (status, headers) => { head = { status, headers }; };
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    const ended = new Promise((resolve) => response.on("end", resolve));
    expect(serveReal("/__real/tiles/bratislavsky-roads.pmtiles", { headers: { range: "bytes=2-4" } }, response, root))
      .toBe(true);
    await ended;
    expect(head.status).toBe(206);
    expect(head.headers["Content-Range"]).toBe("bytes 2-4/10");
    expect(Buffer.concat(chunks).toString()).toBe("234");
    expect(serveReal("/riki/v1/maps", { headers: {} }, response, root)).toBe(false);
    const refused = new PassThrough();
    refused.writeHead = (status) => { head = { status }; };
    serveReal("/__real/fragments/../../../etc/passwd", { headers: {} }, refused, root);
    expect(head.status).toBe(404);
  });
});
