import { test, expect } from "@playwright/test";
import { screensOf, watchConsole } from "./console.mjs";
import { mockCloud } from "./mock-cloud.mjs";

// 123 the site's screens, signed in and out, log no error in the browser's console
for (const signedIn of [false, true]) {
  test(`no screen of the site logs an error, ${signedIn ? "signed in" : "signed out"}`, async ({ page }) => {
    test.setTimeout(120_000);
    await mockCloud(page, { signedIn });
    const watched = watchConsole(page);
    for (const address of screensOf("M1", "L1")) await watched.visit(`.${address}`);
    expect(watched.found).toEqual([]);
  });
}
