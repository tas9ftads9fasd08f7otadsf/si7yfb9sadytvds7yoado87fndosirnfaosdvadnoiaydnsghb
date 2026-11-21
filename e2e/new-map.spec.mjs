import { test, expect } from "@playwright/test";
import { openViewer, reset, showAllMaps } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const named = (page, name) => page.locator("#current .hero", { hasText: name });

// 2978: the phone makes it and shares it, and the page opens it. 41 from the Maps screen.
// 97 W10's window at /new, from the Maps screen or the top bar; Create and edit opens Edit map.
test("New map makes a blank map and opens it", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await expect(page.locator("#newMap")).toHaveCount(0);
  await showAllMaps(page);
  await page.locator("#newMapButton").click();
  await expect(page.getByRole("dialog", { name: "New map" })).toBeVisible();
  await expect(page).toHaveURL(/\/new#/);
  await expect(page.locator("#newMapSave")).toBeDisabled();
  await page.locator("#newMapName").fill("Low Tatras");
  await page.locator("#newMapSave").click();
  await expect(page.locator("#editSub")).toHaveText("Low Tatras");
  await expect(page).toHaveURL(/\/maps\/[^/#]+\/edit\/layers#/);
  await expect(page.getByRole("dialog", { name: "New map" })).toHaveCount(0);
});

// 97 the top bar's New map opens the same window; Escape leaves the map as it was
test("the top bar's New map opens its window, and Escape closes it", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#topNewMap").click();
  await expect(page.getByRole("dialog", { name: "New map" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "New map" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/maps\/[^/#]+#/);
  await expect(page.locator("#mapName")).toHaveText("High Tatras");
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

// 152 bug: the window was a div, so Tab walked out of it into the page behind
test("Tab stays inside New map's window, and closing it gives focus back to its button", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#topNewMap").focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "New map" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#newMapName")).toBeFocused();
  for (let step = 0; step < 30; step += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((box) => box.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#topNewMap")).toBeFocused();
});
