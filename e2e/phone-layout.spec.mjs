import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const PHONE = { width: 390, height: 844 };
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

// What reaches past the screen's right edge without an ancestor clipping it, or scrolls sideways.
const widerThan = (page) => page.evaluate(() => {
  const name = (each) => each.id || String(each.className);
  const clipped = (each) => {
    for (let up = each.parentElement; up; up = up.parentElement) {
      const clips = getComputedStyle(up).overflowX !== "visible";
      if (clips && up.getBoundingClientRect().right <= innerWidth + 1) return true;
    }
    return false;
  };
  const past = [...document.querySelectorAll("body *")]
    .filter((each) => each.checkVisibility() && each.getBoundingClientRect().right > innerWidth + 1 && !clipped(each));
  const sideways = [...document.querySelectorAll("body *")].filter((each) => each.checkVisibility()
    && /auto|scroll/.test(getComputedStyle(each).overflowX) && !each.matches(".data-tabs, .sources")
    && each.scrollWidth > each.clientWidth + 1);
  return [...past, ...sideways].map(name).slice(0, 5);
});

// 179 TestFlight ADKC: a phone is let in, its rail a tab bar, the side bar a sheet over the map
test("a phone gets the page laid out for it, and is counted", async ({ page, request }) => {
  await page.setViewportSize(PHONE);
  await openViewer(page);
  const rail = await page.locator("#rail").boundingBox();
  expect(rail.y + rail.height).toBeCloseTo(PHONE.height, 0);
  expect(rail.width).toBeCloseTo(PHONE.width, 0);
  const map = await page.locator("#map").boundingBox();
  expect(map.x).toBe(0);
  expect(map.width).toBeCloseTo(PHONE.width, 0);
  const side = await page.locator("#side").boundingBox();
  expect(side.y).toBeGreaterThan(map.y + 100);
  expect(side.y + side.height).toBeCloseTo(rail.y, 0);
  await expect(page.locator("#search")).toBeVisible();
  expect(await widerThan(page)).toEqual([]);
  await expect.poll(async () => (await phone(request, "guests")).viewers).toBe(1);
});

// 179 the Map tab folds the sheet away for the whole map and brings it back
test("the Map tab folds the sheet down and up", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openViewer(page);
  await page.locator("#railMap").click();
  await expect(page.locator("#side")).toBeHidden();
  await page.locator("#railMap").click();
  await expect(page.locator("#side")).toBeVisible();
});

// 179 every screen the tab bar opens fits the phone's width
for (const tab of ["#railMaps", "#railData", "#railSettings"]) {
  test(`${tab} fits a phone's width`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openViewer(page);
    await page.locator(tab).click();
    await expect(page.locator(`${tab}[aria-current=page]`)).toBeVisible();
    await expect(page.locator("#rail")).toBeVisible();
    expect(await widerThan(page)).toEqual([]);
  });
}

// 179 a short window is let in as well
test("a short window is let in", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 420 });
  await openViewer(page);
  await expect(page.locator("#top")).toBeVisible();
});

// 131, 179: an iPhone is offered the app over the page, and the offer closes
test("an iPhone is offered the app, and can close the offer", async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, hasTouch: true, userAgent: IPHONE });
  const page = await context.newPage();
  await openViewer(page);
  await expect(page.locator("#appOffer [data-app-icon]")).toBeVisible();
  await expect(page.locator("#openInApp")).toHaveAttribute("href", "rikimaps://open");
  await expect(page.locator("#openInApp")).toHaveText("Open Riki Maps");
  await page.locator("#appOfferClose").click();
  await expect(page.locator("#appOffer")).toHaveCount(0);
  await page.reload();
  await page.locator("#current .hero").waitFor();
  await expect(page.locator("#appOffer")).toHaveCount(0);
  await context.close();
});

test("a small window on a computer is not offered the app", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await openViewer(page);
  await expect(page.locator("#appOffer")).toHaveCount(0);
});
