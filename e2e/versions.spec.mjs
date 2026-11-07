import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// 2798: the map's oldest app is said, and a viewer older than the map asks for warns.
test("a map says the oldest app and viewer it needs", async ({ page }) => {
  await openViewer(page);
  const versions = page.locator("#mapVersions");
  await expect(versions).toContainText("Needs Riki Maps 0.18.0 or later");
  await expect(versions.locator(".warning")).toHaveText(
    "This map needs browser viewer 0.30.0 or later. Update Riki Maps on the phone sharing it.");
});

// 2798: a map asking for no version shows no lines.
test("a map asking for no version says nothing of versions", async ({ page }) => {
  await openViewer(page, "/?map=6F1E2A10-0000-4000-8000-000000000002");
  await expect(page.locator("#current .hero b")).toHaveText("Bratislava");
  await expect(page.locator("#mapVersions")).toHaveCount(0);
});
