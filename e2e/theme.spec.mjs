import { test, expect } from "@playwright/test";
import { openViewer, reset, showAllMaps } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const layers = (page) => page.evaluate(() => window.__riki.map.getStyle()?.layers?.length ?? 0);
const themeAsked = (url) => new URL(url).searchParams.get("theme");

// 4: a refused style left the page blank, and no later switch asked the phone again.
test("A style the phone refuses leaves the map drawn, and the next switch asks again", async ({ page }) => {
  await openViewer(page);
  await expect.poll(() => layers(page)).toBeGreaterThan(0);
  const drawn = await layers(page);
  let refusals = 1;
  await page.route("**/style?*", (route) => (refusals-- > 0
    ? route.fulfill({ status: 404, body: "No style could be built for this map" }) : route.continue()));

  await page.locator("#themeToggle").click();
  await expect(page.locator("#notice")).toHaveText("No style could be built for this map");
  expect(await layers(page)).toBe(drawn);

  const asked = page.waitForResponse((answer) => answer.url().includes("/style?") && answer.ok());
  await page.locator("#themeToggle").click();
  await asked;
  await expect.poll(() => layers(page)).toBe(drawn);
});

// 4: the map stays until the new style is here, and only the last switch is drawn.
test("A slow phone keeps the map on screen, and the last switch wins", async ({ page }) => {
  await openViewer(page);
  await expect.poll(() => layers(page)).toBeGreaterThan(0);
  const drawn = await layers(page);
  const urls = [];
  await page.route("**/style?*", async (route) => {
    urls.push(route.request().url());
    const wait = urls.length === 1 ? 1200 : 300;
    await new Promise((done) => setTimeout(done, wait));
    await route.continue();
  });

  await page.locator("#themeToggle").click();
  await page.locator("#themeToggle").click();
  expect(await layers(page)).toBe(drawn);
  await page.waitForTimeout(1800);
  expect(urls.map(themeAsked)).toEqual(["light", "dark"]);
  expect(await layers(page)).toBe(drawn);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

// 5: both looks name the same sources, so a switch asks no tile again.
test("A switch of light and dark keeps the sources, and another map replaces them", async ({ page }) => {
  await openViewer(page);
  await expect.poll(() => layers(page)).toBeGreaterThan(0);
  const marked = () => page.evaluate(() => Object.values(window.__riki.map.style.sourceCaches).every((each) => each.kept));
  await page.evaluate(() => { for (const each of Object.values(window.__riki.map.style.sourceCaches)) each.kept = true; });

  const light = page.waitForResponse((answer) => answer.url().includes("theme=light"));
  await page.locator("#themeToggle").click();
  await light;
  await page.waitForTimeout(300);
  expect(await marked()).toBe(true);

  await showAllMaps(page);
  const other = page.waitForResponse((answer) => answer.url().includes("000000000002/style"));
  await page.locator("#others .list button", { hasText: "Bratislava" }).click();
  await other;
  await expect.poll(marked).toBe(false);
});
