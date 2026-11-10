import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";
const BRATISLAVA = "6F1E2A10-0000-4000-8000-000000000002";
const WINTER = "6F1E2A10-0000-4000-8000-0000000000B2";
const ZBGIS = "0D5E1F00-0000-4000-8000-000000000002";
const path = (page) => new URL(page.url()).pathname;

test.beforeEach(async ({ request }) => { await reset(request); });

// 30 the edit link's key is traded for a token, then gone from the address and the history.
test("the unlock address leaves no key behind", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await expect(page.locator("#editButton")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/maps/${TATRAS}#`));
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(2);
  await page.goBack();
  expect(page.url()).not.toContain("7Q4K29");
});

// 30 `/` opens the map shown last.
test("home opens the first map, then the one shown last", async ({ page }) => {
  await openViewer(page);
  await expect(page).toHaveURL(new RegExp(`/maps/${TATRAS}#`));
  await page.locator("#others .row", { hasText: "Bratislava" }).click();
  await expect(page).toHaveURL(new RegExp(`/maps/${BRATISLAVA}#`));
  await openViewer(page, "/");
  await expect(page).toHaveURL(new RegExp(`/maps/${BRATISLAVA}#`));
});

// 30 each screen phase 1 draws, opened directly and reloaded.
test("every screen's address opens it, and a reload keeps it", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  const screens = [
    [`/maps/${BRATISLAVA}`, async () => expect(page.locator("#mapName")).toHaveText("Bratislava")],
    [`/maps/${TATRAS}/style/${WINTER}`, async () => expect(page.locator("#styleSelect")).toHaveValue(WINTER)],
    [`/maps/${TATRAS}/edit/layers`, async () => expect(page.locator("#editTitle")).toHaveText("Edit map")],
    [`/servers/${ZBGIS}/general`, async () => expect(page.locator("#serverGeneral")).toContainText("zbgis.test")],
    ["/maps", async () => expect(page.locator("#railMaps")).toHaveAttribute("aria-current", "page")]
  ];
  for (const [address, shows] of screens) {
    await openViewer(page, address);
    await shows();
    expect(path(page)).toBe(address);
    await page.reload();
    await page.locator("#current .hero").waitFor();
    await shows();
    expect(path(page)).toBe(address);
  }
});

// 30 moving between screens walks the browser's history.
test("back and forward walk the screens", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await expect(page).toHaveURL(new RegExp(`/maps/${TATRAS}/edit/layers`));
  await page.locator("#back").click();
  await expect(page.locator("#editPage")).toHaveClass(/ahead/);
  await page.locator("#mapPickerButton").click();
  await page.locator("#mapMenu .row", { hasText: "Bratislava" }).click();
  await expect(page.locator("#mapName")).toHaveText("Bratislava");

  await page.goBack();
  await expect(page.locator("#mapName")).toHaveText("High Tatras");
  expect(path(page)).toBe(`/maps/${TATRAS}`);
  await page.goBack();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  await expect(page.locator("#railMap")).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(page.locator("#editPage")).toHaveClass(/ahead/);
  await page.goForward();
  await expect(page.locator("#mapName")).toHaveText("Bratislava");
});

// 30 the top bar's map picker and the rail.
test("the map picker lists every map and All maps; the rail lights the screen shown", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await expect(page.locator("#railMap")).toHaveAttribute("aria-current", "page");
  await page.locator("#mapPickerButton").click();
  await expect(page.locator("#mapMenu .row")).toHaveText(["High Tatras", "Bratislava", "All maps"]);
  await expect(page.locator("#mapMenu .row", { hasText: "Bratislava" })).toHaveAttribute("href", `/maps/${BRATISLAVA}`);
  await page.locator("#allMaps").click();
  await expect(page.locator("#mapMenu")).toHaveCount(0);
  expect(path(page)).toBe("/maps");
  await expect(page.locator("#railMaps")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#railMap")).not.toHaveAttribute("aria-current", /.*/);
  await page.locator("#railServers").click();
  expect(path(page)).toBe("/servers");
  await expect(page.locator("#railServers")).toHaveAttribute("aria-current", "page");
  await page.locator("#railMap").click();
  expect(path(page)).toBe(`/maps/${TATRAS}`);
});

// 31 an old edit link is no address of the page's: it opens the map, not editing.
test("an old edit link unlocks nothing", async ({ page }) => {
  await openViewer(page, "/?edit=7q4-k29");
  await expect(page.locator("#editButton")).toHaveCount(0);
  await expect(page).toHaveURL(/\/maps\/6F1E2A10-0000-4000-8000-000000000001#/);
});

// 30 Share copies the address, camera and all.
test("Share copies the page's address", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openViewer(page);
  const shown = page.url().split("#")[0];
  await page.locator("#shareButton").click();
  await expect(page.locator("#notice")).toHaveText("Link copied");
  // 31 the map may still be framing, so the camera is checked for its shape, not its numbers
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split("#")[0]).toBe(shown);
  expect(copied).toMatch(/#\d+(\.\d+)?\/-?\d/);
});
