import { test, expect } from "@playwright/test";
import { openViewer, reset, showAllMaps } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const rows = (page) => page.locator("#mapList [data-map] > button.row");

// 52: the phone sorts by name, and the page lists what it answers.
test("Name A–Z and Z–A sort the phone's maps", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await showAllMaps(page);
  await expect(rows(page)).toHaveText([/High Tatras/, /Bratislava/]);
  await page.locator("#sortAZ").click();
  await expect(rows(page)).toHaveText([/Bratislava/, /High Tatras/]);
  await page.locator("#sortZA").click();
  await expect(rows(page)).toHaveText([/High Tatras/, /Bratislava/]);
});

// 52: up and down move a map one place.
test("Move down moves a map", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await showAllMaps(page);
  await page.getByLabel("Move down High Tatras").click();
  await expect(rows(page)).toHaveText([/Bratislava/, /High Tatras/]);
});

// 52: a folder is made of two maps, renamed, and emptied again.
test("A folder is made, renamed and left", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await showAllMaps(page);
  await page.locator("#newFolderButton").click();
  await page.locator("#newFolderName").fill("Slovakia");
  await page.getByLabel("High Tatras", { exact: true }).check();
  await page.getByLabel("Bratislava", { exact: true }).check();
  await page.locator("#newFolderSave").click();
  const name = page.getByLabel("Rename · Slovakia");
  await expect(name).toHaveValue("Slovakia");
  await name.fill("Home");
  await name.press("Enter");
  await expect(page.getByLabel("Rename · Home")).toHaveValue("Home");
  await page.getByLabel("Out of the folder · Bratislava").click();
  await expect(page.locator("[data-folder]")).toHaveCount(0);
});

test("A browser that may not edit cannot arrange the maps", async ({ page }) => {
  await openViewer(page);
  await showAllMaps(page);
  await expect(page.locator("#sortAZ")).toHaveCount(0);
  await expect(page.locator("#newFolderButton")).toHaveCount(0);
});
