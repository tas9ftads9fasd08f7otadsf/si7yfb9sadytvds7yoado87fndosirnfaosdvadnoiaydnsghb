import { test, expect } from "@playwright/test";
import { screensOf, watchConsole } from "./console.mjs";
import { reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";
const TRAILS = "6F1E2A10-0000-4000-8000-0000000000A1";

// 123 a pull request or a release fails while any screen logs an error in the browser's console
test("no screen logs an error for a browser that only looks", async ({ page }) => {
  test.setTimeout(120_000);
  const watched = watchConsole(page);
  for (const address of screensOf(TATRAS, TRAILS)) await watched.visit(address);
  expect(watched.found).toEqual([]);
});

// 123 the same for a browser the phone let edit
test("no screen logs an error for a browser that edits", async ({ page }) => {
  test.setTimeout(120_000);
  const watched = watchConsole(page);
  await watched.visit("/e/7q4-k29");
  await page.locator("#current .hero").waitFor();
  for (const address of screensOf(TATRAS, TRAILS)) await watched.visit(address);
  expect(watched.found).toEqual([]);
});
