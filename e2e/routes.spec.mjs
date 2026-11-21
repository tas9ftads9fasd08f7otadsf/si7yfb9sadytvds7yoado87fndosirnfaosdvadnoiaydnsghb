import { test, expect } from "@playwright/test";
import { openViewer, reset, showAllMaps } from "./phone.mjs";

const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";
const BRATISLAVA = "6F1E2A10-0000-4000-8000-000000000002";
const WINTER = "6F1E2A10-0000-4000-8000-0000000000B2";
const ZBGIS = "0D5E1F00-0000-4000-8000-000000000002";
// 73 the address follows a step back a moment later, so it is polled, never read at once
const path = (page) => new URL(page.url()).pathname;

test.beforeEach(async ({ request }) => { await reset(request); });

// 30 the edit link's key is traded for a token, then gone from the address and the history.
test("the unlock address leaves no key behind", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await expect(page.locator("#editButton")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/maps/${TATRAS}#`));
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(2);
  await page.goBack();
  // 154 bug: going back reopens the link, which checks the key again; closing mid-check hung teardown
  await page.waitForLoadState("networkidle");
  expect(page.url()).not.toContain("7Q4K29");
});

// 30 `/` opens the map shown last.
test("home opens the first map, then the one shown last", async ({ page }) => {
  await openViewer(page);
  await expect(page).toHaveURL(new RegExp(`/maps/${TATRAS}#`));
  await showAllMaps(page);
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
    [`/maps/${TATRAS}/style/${WINTER}`, async () => expect(page.locator("#sideStyle")).toHaveText("Winter")],
    [`/maps/${TATRAS}/edit/layers`, async () => expect(page.locator("#editTitle")).toHaveText("Edit map")],
    [`/servers/${ZBGIS}/general`, async () => expect(page.locator("#serverGeneral")).toContainText("zbgis.test")],
    ["/maps", async () => expect(page.locator("#railMaps")).toHaveAttribute("aria-current", "page")]
  ];
  for (const [address, shows] of screens) {
    await openViewer(page, address);
    await shows();
    await expect.poll(() => path(page)).toBe(address);
    await page.reload();
    await page.locator("#current .hero").waitFor();
    await shows();
    await expect.poll(() => path(page)).toBe(address);
  }
});

// 30 moving between screens walks the browser's history.
test("back and forward walk the screens", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await expect(page).toHaveURL(new RegExp(`/maps/${TATRAS}/edit/layers`));
  await page.locator("#back").click();
  await expect(page.locator("#editPage")).toHaveClass(/ahead/);
  // 47 another map is opened from the Maps screen, which is one more step back.
  await showAllMaps(page);
  await page.locator("#others .row", { hasText: "Bratislava" }).click();
  await expect(page.locator("#mapName")).toHaveText("Bratislava");

  await page.goBack();
  await expect.poll(() => path(page)).toBe("/maps");
  await page.goBack();
  await expect(page.locator("#mapName")).toHaveText("High Tatras");
  await expect.poll(() => path(page)).toBe(`/maps/${TATRAS}`);
  await page.goBack();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  await expect(page.locator("#railMap")).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(page.locator("#editPage")).toHaveClass(/ahead/);
  await page.goForward();
  await page.goForward();
  await expect(page.locator("#mapName")).toHaveText("Bratislava");
});

// 30 the rail. 47 the header names the map and holds one drop-down, the style switcher.
// 90 the header has no drop-down: the style is the side bar's and the map's; the map's name opens Maps.
test("the header has no drop-down; the rail lights the screen shown", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await expect(page.locator("#railMap")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#mapName")).toHaveText("High Tatras");
  await expect(page.locator("#mapPickerButton")).toHaveCount(0);
  await expect(page.locator("#mapMenu")).toHaveCount(0);
  await expect(page.locator("#top select")).toHaveCount(0);
  await expect(page.locator("#top [aria-haspopup]")).toHaveCount(0);
  await page.locator("#mapName").click();
  await expect(page.locator("#top [role=menu]")).toHaveCount(0);
  await expect.poll(() => path(page)).toBe("/maps");
  await expect(page.locator("#railMaps")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#railMap")).not.toHaveAttribute("aria-current", /.*/);
  await page.locator("#railServers").click();
  await expect.poll(() => path(page)).toBe("/servers");
  await expect(page.locator("#railServers")).toHaveAttribute("aria-current", "page");
  await page.locator("#railMap").click();
  await expect.poll(() => path(page)).toBe(`/maps/${TATRAS}`);
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
  // 138 bug: `/` moves to the map's address a moment after the map loads; read it once it has
  await expect(page).toHaveURL(/\/maps\/6F1E2A10-0000-4000-8000-000000000001#/);
  const shown = page.url().split("#")[0];
  await page.locator("#shareButton").click();
  await expect(page.locator("#notice")).toHaveText("Link copied");
  // 31 the map may still be framing, so the camera is checked for its shape, not its numbers
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split("#")[0]).toBe(shown);
  expect(copied).toMatch(/#\d+(\.\d+)?\/-?\d/);
});

// 122 bug: a browser without the edit key opened Edit map and logged a 401 for every part
test("Edit map opened without the edit key asks the phone nothing it would refuse", async ({ page }) => {
  const refused = [];
  page.on("response", (answer) => { if (answer.status() === 401) refused.push(answer.url()); });
  const logged = [];
  page.on("console", (message) => { if (message.type() === "error") logged.push(message.text()); });
  for (const tab of ["layers", "general", "styling", "sharing", "offline"]) {
    await page.goto(`/maps/${TATRAS}/edit/${tab}`);
    await page.locator("#map").waitFor();
  }
  await page.waitForLoadState("networkidle");
  expect(refused).toEqual([]);
  expect(logged).toEqual([]);
});
