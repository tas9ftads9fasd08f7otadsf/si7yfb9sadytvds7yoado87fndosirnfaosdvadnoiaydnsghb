import { describe, expect, it } from "vitest";
import { ANY_SIZE_FOR, ANY_SIZE_KEY, ANY_SIZE_SCRIPT, anySizeUntil, opensTheApp } from "./any-size";

describe("any size", () => {
  const now = 1_000_000;

  // 131: debug=1 lets a small window in for a day, and the browser keeps it
  it("lets any size in for a day after debug=1, and keeps that", () => {
    expect(anySizeUntil("?debug=1", null, now)).toBe(now + ANY_SIZE_FOR);
    expect(anySizeUntil("", String(now + 5), now)).toBe(now + 5);
    expect(anySizeUntil("", String(now - 1), now)).toBeNull();
    expect(anySizeUntil("", null, now)).toBeNull();
    expect(anySizeUntil("", "nonsense", now)).toBeNull();
  });

  // 131: debug=0 ends it before the day is out
  it("ends it at debug=0", () => {
    expect(anySizeUntil("?debug=0", String(now + 5), now)).toBeNull();
  });

  // 131: the script the page runs before its first paint marks the page and keeps the day
  it("marks the page before the first paint", () => {
    window.history.replaceState(null, "", "/?debug=1");
    delete document.documentElement.dataset.anySize;
    new Function(ANY_SIZE_SCRIPT)();
    expect(document.documentElement.dataset.anySize).toBe("1");
    expect(Number(localStorage.getItem(ANY_SIZE_KEY))).toBeGreaterThan(Date.now());
    window.history.replaceState(null, "", "/?debug=0");
    delete document.documentElement.dataset.anySize;
    new Function(ANY_SIZE_SCRIPT)();
    expect(document.documentElement.dataset.anySize).toBeUndefined();
    expect(localStorage.getItem(ANY_SIZE_KEY)).toBeNull();
    window.history.replaceState(null, "", "/");
  });

  // 131: the app's link is offered only where the app runs
  it("offers the app on an iPhone or an iPad only", () => {
    expect(opensTheApp("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe(true);
    expect(opensTheApp("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(opensTheApp("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(opensTheApp("Mozilla/5.0 (Linux; Android 15)", 5)).toBe(false);
  });
});
