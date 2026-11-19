import { describe, expect, it, vi } from "vitest";
import account from "../../../e2e/fixtures/cloud-account.json";
import type { CKRecord } from "./cloud";
import { READ_TYPES, rowOf } from "./records";

const where = { database: "private", zone: "z" } as const;
const assets = account.assets as Record<string, string>;
const fetcher = vi.fn(async (url: string | URL | Request) => new Response(assets[String(url)] ?? "", { status: assets[String(url)] ? 200 : 404 }));
const [tatras, layer, secrets] = account.zones.private[0]!.records as unknown as CKRecord[];

describe("a record as the core's row", () => {
  // 76 CD_ prefixes come off, the type becomes the entity and the tag stays for writes
  it("takes the CD_ prefixes off and keeps the change tag", async () => {
    const row = await rowOf(layer!, where, fetcher);
    expect(row).toEqual({ entity: "SharedMapLayer", id: "own-tatras-layer", tag: "a2", database: "private", zone: "z",
      fields: { name: "Trails", map: "own-tatras" } });
  });

  it("fetches a field moved to _ckAsset by its download URL and files it under its own name", async () => {
    const row = await rowOf(tatras!, where, fetcher);
    expect(fetcher).toHaveBeenCalledWith("https://cvws.icloud-content.com/own-tatras/layers");
    expect(row.fields).toEqual({ id: "6F1E2A10-0000-4000-8000-000000000001", name: "High Tatras",
      layersJSON: "[{\"id\":\"L1\",\"name\":\"Trails\"}]" });
  });

  it("fails when an asset cannot be fetched", async () => {
    const record: CKRecord = { recordName: "r", recordType: "CD_SharedMap",
      fields: { CD_x_ckAsset: { value: { downloadURL: "https://nowhere/x" }, type: "ASSETID" } } };
    await expect(rowOf(record, where, fetcher)).rejects.toThrow("answered 404");
  });

  it("does not list the encrypted layer secrets as readable", () => {
    expect(READ_TYPES).not.toContain(secrets!.recordType);
    expect(READ_TYPES).toEqual(["CD_SharedMap", "CD_SharedMapLayer", "CD_SharedMapStyle", "CD_ServerRecord"]);
  });
});
