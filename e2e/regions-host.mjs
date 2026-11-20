// A stand-in for where region packages are hosted: maptiles' catalog and Drive's downloads, which the site's PHP server
// fetches (the browser never does). It serves one region, "tatry", whose base piece is a zip of a tiny PMTiles archive.
import { createServer } from "node:http";
import { strToU8, zipSync } from "fflate";

export const REGION = "tatry";
export const FILE_ID = "1TatryBaseAAAAAAAAAAAAAAAAAAAAAAA";
/** A 1 px PNG, what a sprite sheet's image is. */
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

/** A PMTiles v3 archive of one empty vector tile at z0, uncompressed, as pmtiles reads one. */
export function tinyPmtiles() {
  const tile = Buffer.from([0x1a, 0x05, 0x0a, 0x01, 0x78, 0x78, 0x02]);
  const root = Buffer.from([1, 0, 1, tile.length, 1]);
  const metadata = Buffer.from("{}");
  const header = Buffer.alloc(127);
  header.write("PMTiles", 0, "latin1");
  header[7] = 3;
  const rootAt = 127;
  const metaAt = rootAt + root.length;
  const tileAt = metaAt + metadata.length;
  [rootAt, root.length, metaAt, metadata.length, tileAt, 0, tileAt, tile.length, 1, 1, 1]
    .forEach((value, index) => header.writeBigUInt64LE(BigInt(value), 8 + index * 8));
  header[96] = 1; header[97] = 1; header[98] = 1; header[99] = 1;
  header[100] = 0; header[101] = 0;
  header.writeInt32LE(190_000_000, 102); header.writeInt32LE(490_000_000, 106);
  header.writeInt32LE(205_000_000, 110); header.writeInt32LE(493_000_000, 114);
  header[118] = 0; header.writeInt32LE(197_000_000, 119); header.writeInt32LE(491_000_000, 123);
  return Buffer.concat([header, root, metadata, tile]);
}

/** The package's zip, as the pipeline ships one: its manifest, the archive and a sprite sheet. */
export function packageZip() {
  return Buffer.from(zipSync({
    "contents.json": strToU8(JSON.stringify({ package: "base", region: REGION, manifest: { region: { name: "Vysoké Tatry", pmtiles: "base.pmtiles", maxzoom: 0 } } })),
    "base.pmtiles": new Uint8Array(tinyPmtiles()),
    "sprites/liberty.json": strToU8("{}"),
    "sprites/liberty.png": new Uint8Array(PNG)
  }));
}

/** maps.json with the one region, its zip listed at the bytes `packageZip` makes. */
export function catalog(version = 5) {
  const download = `https://drive.google.com/uc?export=download&id=${FILE_ID}`;
  return { _comment: "stand-in", _updated_ts: version, slovensko: { id: "slovakia", name: "Slovakia", regions: {
    [REGION]: { id: `slovakia-${REGION}`, name: "Vysoké Tatry", bbox: [19.5, 49.0, 20.5, 49.4], maps: {
      base: { download, size: packageZip().length, formats: { zip: { download, size: packageZip().length, updated_ts: version } } } } } } } };
}

/**
 * The host on a port. `/__control?block=1` makes it refuse every request until `block=0`, and `/__log` lists what it was
 * asked for, so a spec can say the browser's copy was drawn with the host gone.
 */
export function startRegionHost(port) {
  const zip = packageZip();
  const log = [];
  let blocked = false;
  const server = createServer((request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    response.setHeader("Access-Control-Allow-Origin", "*");
    if (url.pathname === "/__control") {
      blocked = url.searchParams.get("block") === "1";
      return response.end("ok");
    }
    if (url.pathname === "/__log") return response.setHeader("content-type", "application/json").end(JSON.stringify(log));
    log.push(url.pathname + url.search);
    if (blocked) return response.writeHead(500).end("blocked");
    if (url.pathname === "/maps.json") return response.setHeader("content-type", "application/json").end(JSON.stringify(catalog()));
    if (url.pathname === "/download" && url.searchParams.get("id") === FILE_ID) {
      response.writeHead(200, { "content-type": "application/zip", "content-length": zip.length });
      // In pieces, as a network sends it.
      let at = 0;
      const next = () => {
        if (at >= zip.length) return response.end();
        response.write(zip.subarray(at, at + 512));
        at += 512;
        setImmediate(next);
      };
      return next();
    }
    return response.writeHead(404).end();
  });
  server.listen(port, "127.0.0.1");
  return server;
}
