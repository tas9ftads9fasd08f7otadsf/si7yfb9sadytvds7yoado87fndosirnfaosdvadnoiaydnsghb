// @vitest-environment node
import "fake-indexeddb/auto";
import { zipSync, strToU8 } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { RegionFailed } from "@/backend/types";
import { downloadPiece } from "./download";
import { fakeOpfs } from "./fake-opfs";
import { createRegionPackages, readAsText } from "./packages";
import { fetchCatalog, readCatalog, type PackagePiece } from "./catalog";
import { addressOf, BlobSource, loadStored, registerArchives } from "./source";
import { idbStore, opfsStore, safePath, StorageFull, type PackageStore } from "./store";

// 112 region packages: the catalog read, a zip unpacked into the browser's own storage, and read back by range
const CATALOG = {
  _comment: "metadata", _updated_ts: 1,
  slovensko: { id: "slovakia", name: "Slovakia", bbox: [16.8, 47.7, 22.6, 49.7], maps: {
    lines: { download: "https://drive.google.com/uc?export=download&id=1xfu1OzAYa6PUtmtvSwH4yjVXZ9x9sIHO", size: 263,
      formats: { zip: { download: "https://drive.google.com/uc?export=download&id=1xfu1OzAYa6PUtmtvSwH4yjVXZ9x9sIHO", size: 263, updated_ts: 5 },
        aar: { download: "https://drive.google.com/uc?export=download&id=1xPQudJrWi5sZ63-z4NqyWAbsQZJ4iYbD", size: 250, updated_ts: 6 } } } },
  regions: { banskobystricky: { id: "slovakia-banskobystricky", name: "Banskobystrický kraj", bbox: [18.4, 48, 20.4, 48.9], maps: {
    base: { formats: { zip: { download: "https://drive.google.com/uc?export=download&id=1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", size: 100, updated_ts: 9 } } },
    water: { formats: { zip: { download: "https://drive.google.com/uc?export=download&id=1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", size: 40, updated_ts: 3 } } },
    nothing: { formats: { aar: { download: "x", size: 1 } } } } } } },
  mountains: { id: "mountains", name: "Mountains", ranges: { belianske_tatry: { id: "mountains-belianske_tatry", name: "Belianske Tatry",
    bbox: [20.18, 49.19, 20.38, 49.3], maps: { terrain: { download: "https://drive.google.com/uc?export=download&id=1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
      size: 7, updated_ts: 4 } } } } }
};

describe("the catalog", () => {
  it("lists regions by their key with the zip of each piece, nested ones and mountain ranges included", () => {
    const regions = readCatalog(CATALOG);
    expect([...regions.keys()]).toEqual(["slovensko", "banskobystricky", "belianske_tatry"]);
    expect(regions.get("slovensko")).toMatchObject({ name: "Slovakia", box: [16.8, 47.7, 22.6, 49.7],
      pieces: { lines: { fileID: "1xfu1OzAYa6PUtmtvSwH4yjVXZ9x9sIHO", bytes: 263, version: 5 } } });
    expect(Object.keys(regions.get("banskobystricky")!.pieces)).toEqual(["base", "water"]);
    expect(regions.get("belianske_tatry")!.pieces.terrain).toMatchObject({ fileID: "1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", version: 4 });
    // 165 a region knows its country's slug, and a range that it is one
    expect(regions.get("banskobystricky")).toMatchObject({ country: "slovensko", range: false });
    expect(regions.get("belianske_tatry")).toMatchObject({ country: null, range: true });
  });

  it("is empty for anything that is not a catalog and takes the zip, never the aar the app reads", () => {
    expect(readCatalog(null).size).toBe(0);
    expect(readCatalog([]).size).toBe(0);
    expect(readCatalog(CATALOG).get("slovensko")!.pieces.lines!.fileID).not.toBe("1xPQudJrWi5sZ63-z4NqyWAbsQZJ4iYbD");
  });

  it("is read through the site's own address, and fails with its status", async () => {
    const fetcher = vi.fn(async () => Response.json(CATALOG));
    expect((await fetchCatalog(fetcher as unknown as typeof fetch, "/editor")).size).toBe(3);
    expect(fetcher).toHaveBeenCalledWith("/editor/regions/catalog.json");
    await expect(fetchCatalog((async () => new Response("", { status: 502 })) as typeof fetch, "")).rejects.toThrow("502");
  });
});

const zipOf = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
const piece = (zip: Uint8Array, version = 7): PackagePiece => ({ piece: "base", fileID: "1xfu1OzAYa6PUtmtvSwH4yjVXZ9x9sIHO", bytes: zip.length, version });

/** A fetch that answers the site's file route with these bytes, in chunks the way a network delivers them. */
const serving = (bytes: Uint8Array, chunk = 64, status = 200) => vi.fn(async () => {
  if (status !== 200) return Response.json({ error: "Drive said slow down" }, { status });
  let at = 0;
  return new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    if (at >= bytes.length) return controller.close();
    controller.enqueue(bytes.slice(at, at + chunk));
    at += chunk;
  } }), { status: 200 });
}) as unknown as typeof fetch;

/** The file system made once, as the browser's is one. */
const memoryStore = () => {
  const { root } = fakeOpfs();
  return opfsStore(async () => root);
};

const stores: [string, () => PackageStore][] = [
  ["the origin's private file system", () => memoryStore()],
  ["IndexedDB, where there is none", () => idbStore(`regions-${Math.random()}`)]
];

describe.each(stores)("a package in %s", (_name, make) => {
  const files = { "contents.json": "{\"package\":\"base\"}", "base.pmtiles": "P".repeat(500), "sprites/liberty.json": "{}", "sprites/liberty.png": "png" };

  it("is unpacked as it arrives, listed whole and read back by file", async () => {
    const store = make();
    const zip = zipOf(files);
    const progress = vi.fn();
    const kept = await downloadPiece({ region: "banskobystricky", piece: piece(zip), store, fetcher: serving(zip), base: "/editor", onProgress: progress });
    expect(kept).toMatchObject({ region: "banskobystricky", piece: "base", version: 7 });
    expect(kept.files).toEqual(["base.pmtiles", "contents.json", "sprites/liberty.json", "sprites/liberty.png"]);
    expect(await store.list()).toEqual([kept]);
    expect(await (await store.blob("banskobystricky", "base", "base.pmtiles"))!.text()).toBe("P".repeat(500));
    expect(await (await store.blob("banskobystricky", "base", "sprites/liberty.json"))!.text()).toBe("{}");
    expect(await store.blob("banskobystricky", "base", "nothing")).toBeNull();
    expect(progress).toHaveBeenLastCalledWith(zip.length, zip.length);
  });

  // 112 a half-written package must never be listed, nor stay behind
  it("is not listed when the download fails half way, and leaves nothing", async () => {
    const store = make();
    const zip = zipOf(files);
    const broken = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(zip.slice(0, 120));
      controller.error(new TypeError("network gone"));
    } }))) as unknown as typeof fetch;
    await expect(downloadPiece({ region: "r", piece: piece(zip), store, fetcher: broken, base: "" })).rejects.toMatchObject({ why: "network" });
    expect(await store.list()).toEqual([]);
  });

  it("refuses a body that is not the catalog's count of bytes, as a page of the host's is", async () => {
    const store = make();
    const zip = zipOf(files);
    await expect(downloadPiece({ region: "r", piece: { ...piece(zip), bytes: zip.length + 1 }, store, fetcher: serving(zip), base: "" }))
      .rejects.toMatchObject({ why: "size" });
    await expect(downloadPiece({ region: "r", piece: { ...piece(zip), bytes: 9 }, store, fetcher: serving(strToU8("<html>Quota</html>")), base: "" }))
      .rejects.toBeInstanceOf(RegionFailed);
    expect(await store.list()).toEqual([]);
  });

  it("says what the site's server said when it refused, and that the connection failed when it did", async () => {
    const store = make();
    const zip = zipOf(files);
    await expect(downloadPiece({ region: "r", piece: piece(zip), store, fetcher: serving(zip, 64, 502), base: "" }))
      .rejects.toMatchObject({ why: "host", message: "Drive said slow down" });
    const offline = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(downloadPiece({ region: "r", piece: piece(zip), store, fetcher: offline, base: "" })).rejects.toMatchObject({ why: "network" });
  });

  // 112 a newer build replaces the held one only once it is whole; the older folder then goes
  it("keeps the older copy until the newer is whole, then holds only the newer", async () => {
    const store = make();
    const old = zipOf({ "contents.json": "{}", "base.pmtiles": "old" });
    await downloadPiece({ region: "r", piece: piece(old, 1), store, fetcher: serving(old), base: "" });
    const newer = zipOf({ "contents.json": "{}", "base.pmtiles": "newer!" });
    const writing = await store.begin("r", "base", 2);
    expect((await store.list()).map((each) => each.version)).toEqual([1]);
    await writing.abort();
    await downloadPiece({ region: "r", piece: piece(newer, 2), store, fetcher: serving(newer), base: "" });
    expect((await store.list()).map((each) => each.version)).toEqual([2]);
    expect(await (await store.blob("r", "base", "base.pmtiles"))!.text()).toBe("newer!");
  });

  it("frees a piece when it is removed", async () => {
    const store = make();
    const zip = zipOf(files);
    await downloadPiece({ region: "r", piece: piece(zip), store, fetcher: serving(zip), base: "" });
    await store.remove("r", "base");
    expect(await store.list()).toEqual([]);
    expect(await store.blob("r", "base", "contents.json")).toBeNull();
  });

  it("refuses a file named outside the package", async () => {
    const writing = await make().begin("r", "base", 1);
    for (const bad of ["../x", "/x", "a/../b", "", "a//b", "a\\b", ".complete"]) await expect(writing.open(bad)).rejects.toThrow("not kept");
    await writing.abort();
  });
});

describe("the browser's storage running out", () => {
  // 112 storage full says so, and the half package goes
  it("stops the download with the full reason and keeps nothing", async () => {
    const opfs = fakeOpfs({ quota: 300 });
    const store = opfsStore(async () => opfs.root);
    const zip = zipOf({ "contents.json": "{}", "base.pmtiles": "P".repeat(2000) });
    await expect(downloadPiece({ region: "r", piece: piece(zip), store, fetcher: serving(zip, 1000), base: "" })).rejects.toMatchObject({ why: "full" });
    expect(await store.list()).toEqual([]);
    expect(new StorageFull("x")).toBeInstanceOf(Error);
  });
});

describe("a path inside a package", () => {
  it("has no way out and no empty part", () => {
    expect(safePath("a/b.json")).toEqual(["a", "b.json"]);
    for (const bad of ["", "..", "a/..", "/a", "a/", "a//b", "a\\b", ".complete"]) expect(safePath(bad)).toBeNull();
  });
});

describe("what the regions come to", () => {
  const catalog = async () => readCatalog(CATALOG);
  const stack = async (held: { piece: string; version: number }[] = []) => {
    const store = memoryStore();
    for (const each of held) {
      const zip = zipOf({ "contents.json": `{"package":"${each.piece}"}`, [`${each.piece}.pmtiles`]: "x" });
      await downloadPiece({ region: "banskobystricky", piece: { piece: each.piece, fileID: "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", bytes: zip.length, version: each.version },
        store, fetcher: serving(zip), base: "" });
    }
    return { store, ...createRegionPackages({ store, fetcher: (async () => new Response("", { status: 500 })) as unknown as typeof fetch, base: "", catalog }) };
  };

  it("offers what the needs name and the browser lacks, with the catalog's sizes", async () => {
    const { packages } = await stack();
    const rows = await packages.rows([{ region: "banskobystricky", piece: "base" }, { region: "banskobystricky", piece: "water" },
      { region: "banskobystricky", piece: "unlisted" }, { region: "unknown", piece: "base" }]);
    expect(rows).toEqual([{ region: "banskobystricky", name: "Banskobystrický kraj", held: [],
      fetch: [{ piece: "base", bytes: 100, update: false }, { piece: "water", bytes: 40, update: false }] }]);
  });

  // 112 a newer catalog version offers an update of a held piece; one as new needs nothing
  it("offers an update where the catalog has a newer build, and nothing where the held one is current", async () => {
    const { packages } = await stack([{ piece: "base", version: 2 }, { piece: "water", version: 3 }]);
    const [row] = await packages.rows([]);
    expect(row!.fetch).toEqual([{ piece: "base", bytes: 100, update: true }]);
    expect(row!.held.map((each) => each.piece)).toEqual(["base", "water"]);
    const [current] = await (await stack([{ piece: "base", version: 9 }])).packages.rows([]);
    expect(current!.fetch).toEqual([]);
  });

  // 165 the style builder reads the manifest and the published styles, and the region's country, range and box
  it("tells the core of what it holds, with its JSON files' text and its region's facts", async () => {
    const { stored } = await stack([{ piece: "base", version: 9 }]);
    expect(await stored()).toEqual([{ region: "banskobystricky", piece: "base", version: 9, files: ["base.pmtiles", "contents.json"],
      texts: { "contents.json": "{\"package\":\"base\"}" }, country: "slovensko", range: false, bbox: [18.4, 48, 20.4, 48.9] }]);
  });

  // 165 only the manifest and the styles the pipeline published go as text, never an archive or a sprite sheet
  it("reads as text the manifest and the published styles alone", () => {
    expect(["contents.json", "obsah.json", "styles/liberty.json"].every(readAsText)).toBe(true);
    expect(["base.pmtiles", "sprites/liberty.json", "styles/a/b.json", "styles/liberty.png"].some(readAsText)).toBe(false);
  });

  it("downloads each missing piece through the site and reports the whole count", async () => {
    const base = zipOf({ "contents.json": "{}", "base.pmtiles": "b" });
    const water = zipOf({ "contents.json": "{}", "water.pmtiles": "w" });
    const bytes = new Map<string, Uint8Array>([["1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", base], ["1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", water]]);
    const store = memoryStore();
    const sizes = readCatalog(CATALOG);
    sizes.get("banskobystricky")!.pieces.base!.bytes = base.length;
    sizes.get("banskobystricky")!.pieces.water!.bytes = water.length;
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      asked.push(url);
      return new Response(bytes.get(url.split("/").pop()!)!.slice());
    }) as unknown as typeof fetch;
    const { packages } = createRegionPackages({ store, fetcher, base: "/editor", catalog: async () => sizes });
    const progress = vi.fn();
    await packages.download("banskobystricky", [{ region: "banskobystricky", piece: "base" }, { region: "banskobystricky", piece: "water" }], progress);
    expect(asked).toEqual(["/editor/regions/file/1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "/editor/regions/file/1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"]);
    expect(progress).toHaveBeenLastCalledWith(base.length + water.length, base.length + water.length);
    expect((await store.list()).map((each) => each.piece)).toEqual(["base", "water"]);
    await packages.remove("banskobystricky");
    expect(await store.list()).toEqual([]);
  });

  it("says the catalog is not there when it cannot be read", async () => {
    const store = memoryStore();
    const { packages } = createRegionPackages({ store, fetcher: fetch, base: "", catalog: async () => { throw new Error("502"); } });
    await expect(packages.download("r", [], () => {})).rejects.toBeInstanceOf(RegionFailed);
  });
});

describe("drawing from a stored package", () => {
  const stack = async () => {
    const store = memoryStore();
    const zip = zipOf({ "base.pmtiles": "0123456789", "sprites/liberty.json": "{\"a\":1}", "sprites/liberty.png": "PNG" });
    await downloadPiece({ region: "tatry", piece: piece(zip), store, fetcher: serving(zip), base: "" });
    return store;
  };

  it("reads an archive by byte range, under the key the style names it by", async () => {
    const store = await stack();
    const source = new BlobSource("riki-store/tatry/base/base.pmtiles", (await store.blob("tatry", "base", "base.pmtiles"))!);
    expect(source.getKey()).toBe("riki-store/tatry/base/base.pmtiles");
    expect(new TextDecoder().decode((await source.getBytes(2, 4)).data)).toBe("2345");
  });

  it("tells the pmtiles protocol of the archives a style names, those held and once each", async () => {
    const store = await stack();
    const tiles = new Map<string, unknown>();
    const added: unknown[] = [];
    const protocol = { tiles: tiles as never, add: (p: { source: { getKey(): string } }) => { added.push(p.source.getKey()); tiles.set(p.source.getKey(), p); } };
    const style = { sources: { base: { type: "vector", url: "pmtiles://riki-store/tatry/base/base.pmtiles" },
      missing: { type: "vector", url: "pmtiles://riki-store/tatry/water/water.pmtiles" },
      remote: { type: "vector", url: "pmtiles://https://tiles.example/a.pmtiles" } } };
    await registerArchives(style, store, protocol);
    await registerArchives(style, store, protocol);
    expect(added).toEqual(["riki-store/tatry/base/base.pmtiles"]);
  });

  it("answers a sprite sheet's JSON and image, and a retina one with the sheet it has", async () => {
    const store = await stack();
    expect(await loadStored(store, { url: "riki-store://tatry/base/sprites/liberty.json", type: "json" })).toEqual({ data: { a: 1 } });
    const image = await loadStored(store, { url: "riki-store://tatry/base/sprites/liberty@2x.png", type: "image" });
    expect(new TextDecoder().decode(image.data as ArrayBuffer)).toBe("PNG");
    await expect(loadStored(store, { url: "riki-store://tatry/base/sprites/none.json", type: "json" })).rejects.toThrow("not in a stored package");
  });

  it("reads the parts of a stored address", () => {
    expect(addressOf("tatry/base/sprites/liberty")).toEqual({ region: "tatry", piece: "base", path: "sprites/liberty" });
    expect(addressOf("tatry/base")).toBeNull();
    expect(addressOf("tatry//x")).toBeNull();
  });
});
