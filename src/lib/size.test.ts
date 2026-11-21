import { describe, expect, it } from "vitest";
import { heldSize, sizeText } from "./size";

describe("heldSize", () => {
  // 141 a size the phone sent is read as people read it; none, or nothing held yet, is no size
  it("words what the phone holds, and nothing where it sent none or holds none", () => {
    expect(heldSize(263_000_000)).toBe("263 MB");
    expect(heldSize(5_300_000)).toBe("5.3 MB");
    expect(heldSize(1_500_000_000)).toBe(sizeText(1_500_000_000));
    expect(heldSize(undefined)).toBeNull();
    expect(heldSize(0)).toBeNull();
  });
});
