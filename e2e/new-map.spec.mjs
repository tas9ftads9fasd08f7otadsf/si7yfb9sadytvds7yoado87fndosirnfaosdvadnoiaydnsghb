import { test, expect } from "@playwright/test";
import { openViewer, reset, showAllMaps } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const named = (page, name) => page.locator("#current .hero", { hasText: name });

// 2978: the phone makes it and shares it, and the page opens it. 41 from the Maps screen.
test("New map makes a blank map and opens it", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await expect(page.locator("#newMap")).toHaveCount(0);
  await showAllMaps(page);
  await page.locator("#newMapButton").click();
  await page.locator("#newMapName").fill("Low Tatras");
  await page.locator("#newMapSave").click();
  await expect(named(page, "Low Tatras")).toBeVisible();
  await expect(page).toHaveURL(/\/maps\/[^/#]+#/);
  await expect(page.locator("#others")).toHaveCount(0);
});

test("Import makes a map from a .mapson", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await showAllMaps(page);
  await page.locator("#importFile").setInputFiles({ name: "Fatra.mapson", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ name: "Malá Fatra" })) });
  await expect(named(page, "Malá Fatra")).toBeVisible();
});

test("A file that is no map is refused in the phone's words", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await showAllMaps(page);
  await page.locator("#importFile").setInputFiles({ name: "Fatra.mapson", mimeType: "application/json",
    buffer: Buffer.from("not json") });
  await expect(page.locator("#notice")).toHaveText("That file is not a Riki Maps map.");
});

test("A browser that may not edit is offered neither", async ({ page }) => {
  await openViewer(page);
  await showAllMaps(page);
  await expect(page.locator("#newMap")).toHaveCount(0);
});
