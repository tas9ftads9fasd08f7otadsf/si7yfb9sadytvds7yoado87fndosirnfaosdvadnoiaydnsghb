import { describe, expect, it } from "vitest";
import { opensTheApp } from "./opens-the-app";

describe("opens the app", () => {
  // 131: the app's link is offered only where the app runs
  it("offers the app on an iPhone or an iPad only", () => {
    expect(opensTheApp("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe(true);
    expect(opensTheApp("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(opensTheApp("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(opensTheApp("Mozilla/5.0 (Linux; Android 15)", 5)).toBe(false);
  });
});
