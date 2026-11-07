import { describe, expect, it } from "vitest";
import { isOlder, isVersion } from "./version";

describe("isOlder", () => {
  it("compares part by part, as numbers", () => {
    expect(isOlder("0.9.9", "0.10")).toBe(true);
    expect(isOlder("0.20.0", "0.19.0")).toBe(false);
  });
  it("reads a missing part as zero", () => {
    expect(isOlder("1.0", "1")).toBe(false);
  });
  it("never calls an unknown or 0.0.0 viewer older", () => {
    expect(isOlder("0.0.0", "9")).toBe(false);
    expect(isOlder(undefined, "9")).toBe(false);
  });
});

describe("isVersion", () => {
  it.each(["1", "0.18", "0.18.0"])("takes %s", (text) => expect(isVersion(text)).toBe(true));
  it.each(["", "1.2.3.4", "v1", "1."])("refuses %j", (text) => expect(isVersion(text)).toBe(false));
});
