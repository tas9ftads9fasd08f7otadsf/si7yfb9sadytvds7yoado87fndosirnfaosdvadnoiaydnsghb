import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const HUT = "5A1E1000-0000-4000-8000-000000000001";
const TRAIL = "5A1E1000-0000-4000-8000-000000000002";
const LAKE = "5A1E1000-0000-4000-8000-000000000003";

const row = (page, id) => page.locator(`[data-saved="${id}"]`);

async function openSaved(page, ready = "#savedPage .group") {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#railSaved").click();
  await page.locator(ready).waitFor();
}

// 135: the rail's Saved item lists what the phone saved, newest first, with its count.
test("the rail's Saved lists the phone's saved places, newest first", async ({ page }) => {
  await openSaved(page);
  expect(new URL(page.url()).pathname).toBe("/saved");
  await expect(page.locator("#railSaved")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#savedCount")).toHaveText("4 saved");
  await expect(page.locator("[data-saved]")).toHaveCount(4);
  await expect(page.locator("[data-saved]").first()).toContainText("Chata pri Zelenom plese");
  await expect(row(page, HUT)).toContainText("Shelter, Tatras");
  await expect(row(page, TRAIL)).toContainText("Trail, Hikes of Rita");
  for (const name of ["Save", "Delete", "Move"]) await expect(page.getByRole("button", { name })).toHaveCount(0);
});

// 135: the field, the kind chips and the folder picker narrow the list.
test("the field, the chips and the folder picker narrow the list", async ({ page }) => {
  await openSaved(page);
  await page.locator("#savedSearch").fill("water");
  await expect(page.locator("[data-saved]")).toHaveCount(1);
  await expect(page.locator("#savedCount")).toHaveText("1 saved");
  await page.locator("#savedSearch").fill("");
  await page.locator("#savedKinds").getByRole("button", { name: "Lines" }).click();
  await expect(page.locator("[data-saved]")).toHaveCount(1);
  await expect(row(page, TRAIL)).toBeVisible();
  await page.locator("#savedKinds").getByRole("button", { name: "All" }).click();
  await page.locator("#savedFolder").selectOption({ label: "Tatras" });
  await expect(page.locator("[data-saved]")).toHaveCount(1);
  await page.locator("#savedFolder").selectOption({ label: "Unfiled" });
  await expect(page.locator("[data-saved]")).toHaveCount(2);
  await page.locator("#savedSearch").fill("volcano");
  await expect(page.locator("#savedNone")).toHaveText("Nothing here matches.");
});

// 135: a point is shown on the map as a mark, and its row opens the place panel with the phone's words.
test("a row flies to the place and opens the panel with its note, map, layer and date", async ({ page }) => {
  await openSaved(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.__riki.map.getLayer("riki-saved-marks")))).toBe(true);
  await row(page, HUT).click();
  expect(new URL(page.url()).pathname).toBe(`/saved/${HUT}`);
  const panel = page.locator("#placePanel");
  await expect(panel.getByRole("heading", { name: "Chata pri Zelenom plese" })).toBeVisible();
  await expect(panel).toContainText("Shelter, Tatras");
  await expect(panel).toContainText("Water at the back door");
  await expect(panel).toContainText("High Tatras");
  await expect(panel).toContainText("Huts");
  await expect(panel).toContainText("49.20000 N, 20.20000 E");
  await expect.poll(() => page.evaluate(() => window.__riki.map.getCenter().lat), { timeout: 8000 }).toBeCloseTo(49.2, 1);
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/saved");
});

// 135: a line or an area is fetched whole and drawn, and the map fits its box.
test("a line is fetched whole, drawn on the map and fitted", async ({ page }) => {
  await openSaved(page);
  const asked = page.waitForRequest((asking) => asking.url().endsWith(`/riki/v1/saved/${TRAIL}`));
  await row(page, TRAIL).click();
  await asked;
  await expect(page.locator("#placePanel")).toContainText("Tatranska magistrala");
  await expect.poll(() => page.evaluate(() => window.__riki.map.getSource("riki-saved-shape")._data.features.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__riki.map.getCenter().lng), { timeout: 8000 }).toBeCloseTo(20.1, 0);
  await row(page, LAKE).click();
  await expect.poll(() => page.evaluate(() => window.__riki.map.getSource("riki-saved-shape")._data.features[0].geometry.type))
    .toBe("Polygon");
});

// 135: an address with a row in it opens that row after a reload.
test("an address naming a row opens it again after a reload", async ({ page }) => {
  await openSaved(page);
  await row(page, LAKE).click();
  await expect(page.locator("#placePanel")).toContainText("Swim in summer");
  await page.reload();
  await expect(page.locator("#placePanel")).toContainText("Swim in summer", { timeout: 15000 });
  await expect(row(page, LAKE)).toHaveAttribute("aria-current", "true");
});

// 135: leaving the screen takes the marks and the place off the map.
test("leaving Saved takes its marks and its place panel off the map", async ({ page }) => {
  await openSaved(page);
  await row(page, HUT).click();
  await expect(page.locator("#placePanel")).toBeVisible();
  await page.locator("#railMaps").click();
  await expect(page.locator("#placePanel")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Boolean(window.__riki.map.getLayer("riki-saved-marks")))).toBe(false);
});

// 135: nothing saved says so with the phone's hint, and a longer library says how much is shown.
test("an empty library says what to do, and a cut one says Showing N of M", async ({ page, request }) => {
  await phone(request, "saved", { empty: "1" });
  await openSaved(page, "#savedEmpty");
  await expect(page.locator("#savedEmpty")).toContainText("Nothing saved yet");
  await expect(page.locator("#savedEmpty")).toContainText("Tap ☆ on any place, line or area.");
  await phone(request, "saved", { total: "5200" });
  await page.locator("#railMaps").click();
  await page.locator("#railSaved").click();
  await expect(page.locator("#savedCount")).toHaveText("Showing 4 of 5200");
});

// 135: a browser that may not edit, and an older phone that answers 404, have no Saved item.
test("no Saved item for a browser that only looks, nor for a phone that answers 404", async ({ page, request }) => {
  await openViewer(page, "/");
  await expect(page.locator("#railMaps")).toBeVisible();
  await expect(page.locator("#railSaved")).toHaveCount(0);
  await phone(request, "saved", { gone: "1" });
  await openViewer(page, "/e/7q4-k29");
  await expect(page.locator("#railMaps")).toBeVisible();
  await expect(page.locator("#railSaved")).toHaveCount(0);
});

// 135: the phone refuses the list to a browser with no edit token, so a plain request gets 403.
test("the phone refuses the saved places to a browser with no edit token", async ({ request }) => {
  expect((await request.get("/riki/v1/saved")).status()).toBe(403);
  expect((await request.get(`/riki/v1/saved/${HUT}`)).status()).toBe(403);
});
