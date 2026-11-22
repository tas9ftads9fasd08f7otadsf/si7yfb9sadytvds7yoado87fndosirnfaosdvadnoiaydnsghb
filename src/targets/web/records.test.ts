import { describe, expect, it, vi } from "vitest";
import account from "../../../e2e/fixtures/cloud-account.json";
import type { CKRecord } from "./cloud";
import { READ_TYPES, rowOf, shareRowOf } from "./records";

const where = { database: "private", zone: "z" } as const;
const assets = account.assets as Record<string, string>;
const fetcher = vi.fn(async (url: string | URL | Request) => new Response(assets[String(url)] ?? "", { status: assets[String(url)] ? 200 : 404 }));
const [tatras, layer, secrets, history] = account.zones.private[0]!.records as unknown as CKRecord[];

describe("a record as the core's row", () => {
  // 76 CD_ prefixes come off, the type becomes the entity and the tag stays for writes
  // 163 a row's map is its record name in a STRING, as CloudKit holds it: nothing to list as a reference
  it("takes the CD_ prefixes off and keeps the change tag", async () => {
    const row = await rowOf(layer!, where, fetcher);
    expect(row).toMatchObject({ entity: "SharedMapLayer", id: "own-tatras-layer", tag: "a2", database: "private", zone: "z" });
    expect(row.refs).toBeUndefined();
    expect(row.fields).toMatchObject({ layerJSON: "{\"id\":\"L1\",\"name\":\"Trails\"}", map: "own-tatras" });
  });

  // 78 a reference is listed, so a write sends it back as one
  it("lists a field CloudKit holds as a reference", async () => {
    const record = { recordName: "r", recordType: "CD_SharedMapLayer", recordChangeTag: "t",
      fields: { CD_map: { value: { recordName: "own-tatras" }, type: "REFERENCE" } } } as unknown as CKRecord;
    const row = await rowOf(record, where, fetcher);
    expect(row.refs).toEqual(["map"]);
    expect(row.fields.map).toBe("own-tatras");
  });

  it("fetches a field moved to _ckAsset by its download URL and files it under its own name", async () => {
    const row = await rowOf(tatras!, where, fetcher);
    expect(fetcher).toHaveBeenCalledWith("https://cvws.icloud-content.com/own-tatras/payload");
    expect(row.fields).toMatchObject({ id: "6F1E2A10-0000-4000-8000-000000000001", name: "High Tatras",
      payload: "{\"symbol\":\"mountain.2\"}" });
    // 78 the asset is remembered, so a write can clear it
    expect(row.assets).toEqual(["payload"]);
  });

  // 87 bug: the download URL has a ${f} slot for a file name, which was fetched as it stood
  it("fills the file-name slot of an asset's download URL", async () => {
    const asked = vi.fn(async () => new Response("{}"));
    const record = { recordName: "r", recordType: "CD_SharedMap", fields: { CD_payload_ckAsset: {
      value: { downloadURL: "https://cvws.icloud-content.com/x/${f}?o=1" }, type: "ASSETID" } } } as unknown as CKRecord;
    await rowOf(record, where, asked as unknown as typeof fetch);
    expect(asked).toHaveBeenCalledWith("https://cvws.icloud-content.com/x/payload?o=1");
    expect(JSON.stringify(account)).toContain("${f}");
  });

  // 84 bug: BYTES came back as base64 where the core reads JSON text
  it("reads the base64 bytes of a payload as the JSON text they hold", async () => {
    const row = await rowOf(history!, where, fetcher);
    expect(row.fields.payload).toBe("{\"author\":\"Riki Tester\",\"lines\":[\"Trails added\"]}");
    expect(row.fields).toMatchObject({ updatedAt: 1789000000000, schemaVersion: 1, entityName: "SharedMapChange" });
  });

  it("leaves the bytes of a picture as base64", async () => {
    const record: CKRecord = { recordName: "r", recordType: "CD_SharedMap",
      fields: { CD_iconPicture: { value: "/9j/4AAQ", type: "BYTES" } } };
    expect((await rowOf(record, where, fetcher)).fields.iconPicture).toBe("/9j/4AAQ");
  });

  it("fails when an asset cannot be fetched", async () => {
    const record: CKRecord = { recordName: "r", recordType: "CD_SharedMap",
      fields: { CD_x_ckAsset: { value: { downloadURL: "https://nowhere/x" }, type: "ASSETID" } } };
    await expect(rowOf(record, where, fetcher)).rejects.toThrow("answered 404");
  });

  it("does not list the encrypted layer secrets as readable", () => {
    expect(READ_TYPES).not.toContain(secrets!.recordType);
    // 78 the history rows are read too, for who changed a map
    expect(READ_TYPES).toEqual(["CD_SharedMap", "CD_SharedMapLayer", "CD_SharedMapStyle", "CD_SharedMapChange",
      "CD_ServerRecord", "CD_SharedMapMember"]);
  });

  // 108 a member row is a plain mirror row: its role is its own field
  it("reads a member row's role and the map it belongs to", async () => {
    const member = account.zones.shared[0]!.records.find((each) => each.recordName === "member-me") as unknown as CKRecord;
    const row = await rowOf(member, { database: "shared", zone: "share-doprava", owner: "_friki" }, fetcher);
    expect(row).toMatchObject({ entity: "SharedMapMember", id: "member-me" });
    expect(row.fields).toMatchObject({ participantID: "_me", roleRaw: "editor", displayName: "Riki Tester", map: "shared-doprava" });
  });
});

describe("a share as the core's row", () => {
  const share = account.zones.shared[0]!.records.find((each) => each.recordName === "Share-doprava") as unknown as CKRecord;

  // 108 the people and the link sit beside the fields in what CloudKit answers; the row holds them as they came
  it("holds the share's title, people, owner, own participant and link as CloudKit answered them", () => {
    const row = shareRowOf(share, { database: "shared", zone: "share-doprava", owner: "_friki" });
    expect(row).toMatchObject({ entity: "Share", id: "Share-doprava", tag: "s2", database: "shared", zone: "share-doprava", owner: "_friki" });
    expect(row.fields["cloudkit.title"]).toBe("Doprava");
    expect(row.fields.publicPermission).toBe("NONE");
    expect(row.fields.participants).toEqual(share.participants);
    expect(row.fields.owner).toEqual(share.participants![0]);
    expect(row.fields.currentUserParticipant).toEqual(share.participants![1]);
  });

  it("leaves a thumbnail out and what is not answered unset", () => {
    const row = shareRowOf({ recordName: "s", recordType: "cloudkit.share", fields: {
      "cloudkit.thumbnailImageData": { value: "/9j/4AAQ", type: "BYTES" }, rikiAskedRole: { value: "editor", type: "STRING" } } },
    { database: "shared", zone: "z" });
    expect(row.fields).toEqual({ rikiAskedRole: "editor" });
  });
});
