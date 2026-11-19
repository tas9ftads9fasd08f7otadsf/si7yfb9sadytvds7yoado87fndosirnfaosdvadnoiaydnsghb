import { describe, expect, it, vi } from "vitest";
import { CHUNK_BYTES, CHUNK_TYPE, INDEX_TYPE, chunkCount, chunkName, chunkRecord, indexName, indexRecord, referenceSeconds,
  sendStore, sha256, sliceOf, type DataStore, type Entry, type Sliceable } from "./data";

// 86 files go up as the app's MapDataIndex and MapDataChunk records, in chunks of 45 MB at most
const MB = 1024 * 1024;

describe("a file cut into chunks", () => {
  it("is one chunk up to 45 MB and two from one byte over", () => {
    expect(CHUNK_BYTES).toBe(45 * MB);
    expect(chunkCount(0)).toBe(1);
    expect(chunkCount(1)).toBe(1);
    expect(chunkCount(45 * MB - 1)).toBe(1);
    expect(chunkCount(45 * MB)).toBe(1);
    expect(chunkCount(45 * MB + 1)).toBe(2);
    expect(chunkCount(90 * MB)).toBe(2);
    expect(chunkCount(90 * MB + 1)).toBe(3);
    // the app's own example: a 1.2 GB store is about 27 chunks
    expect(chunkCount(1200 * MB)).toBe(27);
  });

  it("slices at 45 MB and never past the end", () => {
    const slice = vi.fn((from?: number, to?: number) => new Blob([`${from}-${to}`]));
    const file: Sliceable = { size: 45 * MB + 5, slice };
    sliceOf(file, 0);
    sliceOf(file, 1);
    expect(slice.mock.calls).toEqual([[0, 45 * MB], [45 * MB, 45 * MB + 5]]);
  });

  it("slices a real blob into pieces that join back to it", async () => {
    const file = new Blob([new Uint8Array(250).map((_, index) => index)]);
    const joined = await new Blob([0, 1, 2].map((index) => sliceOf(file, index, 100))).arrayBuffer();
    expect(new Uint8Array(joined)).toEqual(new Uint8Array(await file.arrayBuffer()));
    expect((await sliceOf(file, 2, 100).arrayBuffer()).byteLength).toBe(50);
  });
});

const entry: Entry = { storageKey: "files|a.pmtiles", cacheKey: "6F1E2A10-0000-4000-8000-000000000009", name: "a", format: "pmtiles",
  pieces: [{ kind: "file", name: "a.pmtiles", sha: "ab".repeat(32), bytes: 250 }], updatedAt: 1, contributor: "Rita" };

describe("the records as the app writes them", () => {
  it("names a chunk by its piece's digest and its place, an index by the key's digest", async () => {
    expect(chunkName("abc", 2)).toBe("abc-2");
    const stem = (await sha256(new TextEncoder().encode("files|a.pmtiles"))).slice(0, 16);
    expect(await indexName("files|a.pmtiles")).toBe(`index-${stem}`);
    expect(stem).toHaveLength(16);
    expect(await sha256(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("writes a chunk's key, digest, place and count, and no asset of its own", () => {
    expect(chunkRecord(entry, entry.pieces[0]!, 1, 100)).toEqual({ recordName: `${"ab".repeat(32)}-1`, recordType: CHUNK_TYPE, fields: {
      storageKey: { value: "files|a.pmtiles", type: "STRING" }, sha: { value: "ab".repeat(32), type: "STRING" },
      index: { value: 1, type: "INT64" }, count: { value: 3, type: "INT64" } } });
  });

  it("writes the index with the manifest as the app's JSON, and the bytes of every piece", async () => {
    const record = await indexRecord(entry);
    expect(record.recordType).toBe(INDEX_TYPE);
    expect(record.fields.bytes).toEqual({ value: 250, type: "INT64" });
    expect(record.fields.manifest!.type).toBe("BYTES");
    expect(JSON.parse(atob(record.fields.manifest!.value as string))).toEqual(entry);
  });

  it("counts a date as Swift does, from 2001", () => {
    expect(referenceSeconds(new Date("2001-01-01T00:00:00Z"))).toBe(0);
    expect(referenceSeconds(new Date("2001-01-01T00:00:10Z"))).toBe(10);
  });
});

function store(held: string[] = []) {
  const order: string[] = [];
  const batches: number[] = [];
  const made: DataStore = {
    existing: async (names) => new Set(names.filter((name) => held.includes(name))),
    saveChunks: async (chunks) => { batches.push(chunks.length); order.push(...chunks.map((each) => each.record.recordName)); },
    saveIndex: async (record) => { order.push(record.recordName); }
  };
  return { made, order, batches };
}

describe("sending a store", () => {
  const source = new Blob([new Uint8Array(250)]);
  const sources = new Map([[entry.pieces[0]!.sha, source]]);
  const names = [0, 1, 2].map((index) => chunkName(entry.pieces[0]!.sha, index));

  it("sends the chunks three at a time and the index last", async () => {
    const big: Entry = { ...entry, pieces: [{ ...entry.pieces[0]!, bytes: 450 }] };
    const { made, order, batches } = store();
    const progress = vi.fn();
    await sendStore(made, big, new Map([[big.pieces[0]!.sha, new Blob([new Uint8Array(450)])]]), { size: 100, progress });
    expect(batches).toEqual([3, 2]);
    expect(order.slice(0, 5)).toEqual([0, 1, 2, 3, 4].map((index) => chunkName(big.pieces[0]!.sha, index)));
    expect(order.at(-1)).toBe(await indexName(entry.storageKey));
    expect(progress.mock.calls.map(([sent]) => sent)).toEqual([300, 450]);
  });

  it("does not send a chunk the zone already holds", async () => {
    const { made, order } = store([names[0]!, names[2]!]);
    await sendStore(made, entry, sources, { size: 100 });
    expect(order).toEqual([names[1], await indexName(entry.storageKey)]);
  });

  it("sends no index when a chunk fails, so no index names a chunk that is not there", async () => {
    const { made, order } = store();
    made.saveChunks = async () => { throw new Error("offline"); };
    await expect(sendStore(made, entry, sources, { size: 100 })).rejects.toThrow("offline");
    expect(order).toEqual([]);
  });

  it("says which file has no bytes", async () => {
    await expect(sendStore(store().made, entry, new Map())).rejects.toThrow("No bytes for a.pmtiles");
  });
});
