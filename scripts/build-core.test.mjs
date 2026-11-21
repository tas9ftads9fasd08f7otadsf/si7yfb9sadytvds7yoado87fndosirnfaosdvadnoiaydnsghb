import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import account from "../e2e/fixtures/cloud-account.json";
import { fakeCoreWasm } from "../e2e/fake-core.mjs";
import { CONTRACT, SCRATCH, checkoutProblem, pinFor, readPin, sha256Of, sizes, smoke, swiftBuildArgs, verifyPinned, verifySum } from "./build-core.mjs";

const shimArgs = vi.hoisted(() => []);
vi.mock("@bjorn3/browser_wasi_shim", async (original) => {
  const real = await original();
  class Recorded extends real.WASI {
    constructor(...made) {
      shimArgs.push(made[0]);
      super(...made);
    }
  }
  return { ...real, WASI: Recorded };
});

// 88 the pieces of the core's build that need no Swift
describe("the pin", () => {
  it("is nothing while no rikimaps commit is pinned", () => {
    expect(readPin({ ref: null, sha256: null })).toEqual({ ref: null, sha256: null });
    expect(readPin(undefined)).toEqual({ ref: null, sha256: null });
    expect(readPin({ ref: "abc123", sha256: "f".repeat(64) })).toEqual({ ref: "abc123", sha256: "f".repeat(64) });
  });

  // 96 bug: RIKI_CORE_REF kept the pinned sum, so another commit's module was always refused
  it("drops the pinned sum for another commit and keeps it for the pinned one, short or full", () => {
    const pinned = { ref: "b60e9e4c95a00d747580d89a777fdc34818324ff", sha256: "f".repeat(64) };
    expect(pinFor(pinned, "0123456789abcdef0123456789abcdef01234567"))
      .toEqual({ ref: "0123456789abcdef0123456789abcdef01234567", sha256: null });
    expect(pinFor(pinned, undefined)).toEqual(pinned);
    expect(pinFor(pinned, "b60e9e4c95")).toEqual(pinned);
    expect(pinFor(pinned, pinned.ref)).toEqual(pinned);
    expect(pinFor(undefined, "abc123")).toEqual({ ref: "abc123", sha256: null });
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

// 99 bug: the pinned sum came from one machine, and GitHub's runner built other bytes from the same commit
describe("the build's flags", () => {
  it("keep paths out of the module: no debug info, and a scratch that does not move with the checkout", () => {
    const here = swiftBuildArgs("/home/runner/work/site/rikimaps");
    const there = swiftBuildArgs("/Users/someone/rikimaps");
    expect(here).toContain("--swift-sdk");
    expect(here.join(" ")).toContain("-debug-info-format none");
    expect(here.join(" ")).toContain("-file-prefix-map -Xswiftc /home/runner/work/site/rikimaps=/rikimaps");
    expect(here[here.indexOf("--scratch-path") + 1]).toBe(`${SCRATCH}/build`);
    expect(there[there.indexOf("--scratch-path") + 1]).toBe(here[here.indexOf("--scratch-path") + 1]);
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

  // 155 riki_maps answers for real once listed as ready, loaded with argv[0] as the site loads it
  it("is refused where riki_maps is listed as ready but refuses, and given its name as argv[0]", async () => {
    const version = { ...account.core.riki_version, ready: ["riki_maps"] };
    const refusing = fakeCoreWasm({ ...notReady, riki_version: version });
    await expect(smoke(refusing)).rejects.toThrow("riki_maps is listed as ready but lists no maps");
    const listing = fakeCoreWasm({ ...notReady, riki_maps: account.core.riki_maps, riki_version: version });
    expect((await smoke(listing)).ready).toEqual(["riki_maps"]);
    expect(shimArgs.at(-1)).toEqual(["riki-core"]);
  });

  it("is refused when it lists other calls than the site asks, or says no version", async () => {
    await expect(smoke(fakeCoreWasm({ riki_version: { version: "0.1.0", calls: ["riki_maps"], ready: [] } }))).rejects.toThrow("it lists the calls");
    await expect(smoke(fakeCoreWasm({ riki_version: { version: "x", calls, ready: calls } }))).rejects.toThrow("riki_version says");
  });
});
