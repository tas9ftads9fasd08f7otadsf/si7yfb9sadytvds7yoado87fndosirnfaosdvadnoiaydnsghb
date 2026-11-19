import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import account from "../e2e/fixtures/cloud-account.json";
import { fakeCoreWasm } from "../e2e/fake-core.mjs";
import { CONTRACT, checkoutProblem, readPin, sha256Of, sizes, smoke, verifyPinned, verifySum } from "./build-core.mjs";

// 88 the pieces of the core's build that need no Swift
describe("the pin", () => {
  it("is nothing while no rikimaps commit is pinned", () => {
    expect(readPin({ ref: null, sha256: null })).toEqual({ ref: null, sha256: null });
    expect(readPin(undefined)).toEqual({ ref: null, sha256: null });
    expect(readPin({ ref: "abc123", sha256: "f".repeat(64) })).toEqual({ ref: "abc123", sha256: "f".repeat(64) });
  });

  it("names the contract rikimaps documents: the package, the product, both downloads and their sums", () => {
    expect(CONTRACT.package).toBe("tools/linux-core/wasm");
    expect(CONTRACT.product).toBe("riki-core");
    expect(CONTRACT.sdk.id).toBe("swift-6.2-RELEASE_wasm");
    expect(CONTRACT.sdk.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(CONTRACT.toolchain.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(CONTRACT.calls).toHaveLength(7);
  });
});

describe("checksums", () => {
  it("takes a download whose sum is the pinned one and fails, naming both, on another", () => {
    const bytes = Buffer.from("abc");
    expect(sha256Of(bytes)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(() => verifySum(bytes, sha256Of(bytes), "the SDK")).not.toThrow();
    expect(() => verifySum(bytes, "0".repeat(64), "the SDK")).toThrow(/the SDK is ba7816.*pinned sha256 is 0{64}/);
  });

  it("holds a module to rikiCore.sha256 once there is one", () => {
    expect(() => verifyPinned("a".repeat(64), null)).not.toThrow();
    expect(() => verifyPinned("a".repeat(64), "a".repeat(64))).not.toThrow();
    expect(() => verifyPinned("a".repeat(64), "b".repeat(64))).toThrow("rikiCore.sha256");
  });

  it("counts a module's bytes raw and brotli", () => {
    const size = sizes(Buffer.alloc(10_000));
    expect(size.raw).toBe(10_000);
    expect(size.brotli).toBeLessThan(100);
  });
});

describe("the rikimaps checkout", () => {
  const checkout = (git) => {
    const dir = mkdtempSync(path.join(tmpdir(), "rikimaps-"));
    mkdirSync(path.join(dir, CONTRACT.package), { recursive: true });
    writeFileSync(path.join(dir, CONTRACT.package, "Package.swift"), "// package");
    if (git) mkdirSync(path.join(dir, ".git"));
    return dir;
  };

  it("is taken at the pinned commit, by a short or a full sha", () => {
    expect(checkoutProblem(checkout(true), "abc1234", () => "abc1234def5678")).toBeNull();
    expect(checkoutProblem(checkout(true), "abc1234def5678", () => "abc1234def5678")).toBeNull();
  });

  it("is refused at another commit, naming both", () => {
    expect(checkoutProblem(checkout(true), "abc1234", () => "fff9999")).toMatch(/is at fff9999, but rikiCore.ref pins abc1234/);
  });

  it("is refused without the core's package, and an export without git cannot be told from the pin", () => {
    expect(checkoutProblem(mkdtempSync(path.join(tmpdir(), "nothing-")), "abc")).toMatch(/no tools\/linux-core\/wasm\/Package.swift/);
    expect(checkoutProblem(checkout(false), "abc")).toBeNull();
  });
});

describe("the module loaded as the site loads it", () => {
  const calls = account.core.riki_version.calls;
  const notReady = Object.fromEntries(calls.map((name) => [name, { refused: "coreNotReady", call: name }]));

  it("is accepted with every call ready, as the stand-in core has them", async () => {
    expect((await smoke(fakeCoreWasm(account.core))).version).toBe("0.1.0");
  });

  it("is accepted where the calls that are not ready answer coreNotReady", async () => {
    const bytes = fakeCoreWasm({ ...notReady, riki_version: { ...account.core.riki_version, ready: [] } });
    expect((await smoke(bytes)).ready).toEqual([]);
  });

  it("is refused where a call that is not ready answers something else", async () => {
    const bytes = fakeCoreWasm({ riki_version: { ...account.core.riki_version, ready: [] } });
    await expect(smoke(bytes)).rejects.toThrow(/riki_maps answered .* where its rules are not in yet/);
  });

  it("is refused when it lists other calls than the site asks, or says no version", async () => {
    await expect(smoke(fakeCoreWasm({ riki_version: { version: "0.1.0", calls: ["riki_maps"], ready: [] } }))).rejects.toThrow("it lists the calls");
    await expect(smoke(fakeCoreWasm({ riki_version: { version: "x", calls, ready: calls } }))).rejects.toThrow("riki_version says");
  });
});
