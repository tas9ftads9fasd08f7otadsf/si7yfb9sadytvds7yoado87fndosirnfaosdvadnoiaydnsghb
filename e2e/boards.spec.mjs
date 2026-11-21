import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";

// 151 §1.2 and the boards W5 to W9 and W16: Edit map and Details light the rail's Maps item, the map its own.
test("the rail lights Maps for Edit map and Map for the map, and Search for a search", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await expect(page.locator("#railMap")).toHaveAttribute("aria-current", "page");
  await page.locator("#editButton").click();
  await expect(page.locator("#railMaps")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#railMap")).not.toHaveAttribute("aria-current", "page");
  await page.locator("#editDone").click();
  await page.locator("#search").fill("tat");
  await page.locator("#search").press("Enter");
  await expect(page.locator("#railSearch")).toHaveAttribute("aria-current", "page");
});

// 151 bug: /maps/<map>/layers named the layer switcher and opened nothing, so W15's address drew no panel
test("the layer switcher opens at /maps/<map>/layers, and its button writes the address", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.goto(`/maps/${TATRAS}/layers`);
  await expect(page.locator("#switcherPanel")).toBeVisible();
  await page.locator("#switcherButton").click();
  await expect(page.locator("#switcherPanel")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/maps/${TATRAS}(#|$)`));
  await page.locator("#switcherButton").click();
  await expect(page).toHaveURL(new RegExp(`/maps/${TATRAS}/layers`));
  await expect(page.locator("#switcherPanel")).toBeVisible();
});

// 151 W2 and W13: the place panel covered the map's zoom and location buttons; they stand left of it now
test("the map's controls stand left of an open place panel", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#search").fill("48.1583, 17.1063");
  await page.locator("#search").press("Enter");
  await page.locator("#searchResults .row.hit").first().click();
  const panel = await page.locator("#placePanel").boundingBox();
  const zoom = await page.locator(".maplibregl-ctrl-zoom-in").boundingBox();
  expect(zoom.x + zoom.width).toBeLessThanOrEqual(panel.x);
  await page.locator("#placeClose").click();
  const free = await page.locator(".maplibregl-ctrl-zoom-in").boundingBox();
  expect(free.x).toBeGreaterThan(panel.x);
});

// 151 W5's layer rows are 60 px, W4's stat tiles 76 px: the boards' sizes
test("Edit map's layer rows and Data's stat tiles have the boards' heights", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  const row = await page.locator("#editBody .layer-item .row").first().boundingBox();
  expect(row.height).toBeGreaterThanOrEqual(60);
  expect(row.height).toBeLessThanOrEqual(64);
  await page.locator("#editDone").click();
  await page.locator("#railData").click();
  const tile = await page.locator("#data .data-stats > div").first().boundingBox();
  expect(Math.round(tile.height)).toBeGreaterThanOrEqual(74);
  expect(Math.round(tile.height)).toBeLessThanOrEqual(78);
});

// 151 W8: the invite card is apart from the people list
test("Sharing's invite card stands apart from the people list", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.goto(`/maps/${TATRAS}/edit/sharing`);
  await page.locator("#peopleInvite").waitFor();
  const people = await page.locator("#people").boundingBox();
  const invite = await page.locator("#peopleInvite").boundingBox();
  expect(invite.y - (people.y + people.height)).toBeGreaterThanOrEqual(8);
});
