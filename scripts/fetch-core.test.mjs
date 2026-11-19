import { describe, expect, it } from "vitest";
import account from "../e2e/fixtures/cloud-account.json";
import { fakeCoreWasm } from "../e2e/fake-core.mjs";
import { sha256Of } from "./build-core.mjs";
import { artifactName, checkFetched, newestArtifact, refToFetch } from "./fetch-core.mjs";

const PINNED = "b60e9e4c95a00d747580d89a777fdc34818324ff";
const OTHER = "0123456789abcdef0123456789abcdef01234567";

// 96 the core built on demand is found by its commit
describe("the artifact", () => {
  it("is named by the full commit", () => {
    expect(artifactName(PINNED)).toBe(`riki-core-${PINNED}`);
  });

  it("is the newest one that has not expired, or none", () => {
    const one = (id, created_at, expired = false) => ({ id, created_at, expired, workflow_run: { id: id * 10 } });
    expect(newestArtifact([one(1, "2026-11-01T00:00:00Z"), one(2, "2026-11-03T00:00:00Z", true),
      one(3, "2026-11-02T00:00:00Z")])?.id).toBe(3);
    expect(newestArtifact([one(1, "2026-11-01T00:00:00Z", true)])).toBeNull();
    expect(newestArtifact([])).toBeNull();
  });
});

// 96 the commit fetched is the one asked for, else the pin, and always a full sha
describe("the commit to fetch", () => {
  it("is RIKI_CORE_REF when set, else rikiCore.ref", () => {
    expect(refToFetch({ ref: PINNED }, undefined)).toBe(PINNED);
    expect(refToFetch({ ref: PINNED }, OTHER)).toBe(OTHER);
  });

  it("refuses a short sha and an empty pin", () => {
    expect(() => refToFetch({ ref: PINNED }, "b60e9e4c95")).toThrow("40 characters");
    expect(() => refToFetch({ ref: null }, undefined)).toThrow("pins no rikimaps commit");
  });
});

// 96 a fetched module is checked as a build is: its sum, the pin's sum, a load
describe("a fetched module", () => {
  const bytes = fakeCoreWasm(account.core);
  const line = `${sha256Of(bytes)}  riki-core.wasm\n`;

  it("loads when it matches its .sha256 and the pin", async () => {
    const version = await checkFetched(bytes, line, { ref: PINNED, sha256: sha256Of(bytes) }, PINNED);
    expect(version.version).toBe("0.1.0");
  });

  it("is refused when it does not match its .sha256", async () => {
    await expect(checkFetched(bytes, `${"0".repeat(64)}  riki-core.wasm`, { ref: PINNED }, PINNED))
      .rejects.toThrow("the downloaded riki-core.wasm");
  });

  it("is held to rikiCore.sha256 only when it is the pinned commit", async () => {
    const pinned = { ref: PINNED, sha256: "f".repeat(64) };
    await expect(checkFetched(bytes, line, pinned, PINNED)).rejects.toThrow("rikiCore.sha256");
    expect((await checkFetched(bytes, line, pinned, OTHER)).version).toBe("0.1.0");
  });
});
