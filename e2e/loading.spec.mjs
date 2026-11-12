import { test, expect } from "@playwright/test";
import { reset, showAllMaps } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// Holds back the phone's answers on a path until let go.
async function held(page, path) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route(path, async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}

// 42 the page says it is loading until the phone's maps are read, then gets out of the way
test("the page says it is loading until the phone's maps arrive", async ({ page }) => {
  const letGo = await held(page, "**/riki/v1/device");
  await page.goto("/");
  await expect(page.locator("#boot")).toBeVisible();
  await expect(page.locator("#boot")).toHaveText("Loading Riki Maps…");
  const boot = await page.locator("#boot").boundingBox();
  expect(boot.width).toBe(1440);
  expect(boot.height).toBe(900);
  letGo();
  await page.locator("#current .hero").waitFor();
  await expect(page.locator("#boot")).toHaveCount(0);
});

// 42 the splash is in the page as the phone sends it, before any script has run
test("the loading screen is in the page before its scripts run", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain('id="boot"');
  expect(html).toContain("Loading Riki Maps…");
});

// 42 a bar runs along the map while its style is on the way, and stops once the map has drawn
test("a bar runs along the map's top while the style is loading", async ({ page }) => {
  const letGo = await held(page, "**/style?**");
  await page.goto("/");
  await page.locator("#current .hero").waitFor();
  const bar = page.locator("#loadingBar");
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("role", "progressbar");
  const map = await page.locator("#map").boundingBox();
  const drawn = await bar.boundingBox();
  expect(drawn.y).toBeLessThanOrEqual(map.y);
  expect(drawn.width).toBeGreaterThanOrEqual(map.width);
  letGo();
  await expect(bar).toHaveCount(0, { timeout: 15000 });
});

// 42 the side bar's card pulses while the map it names is being read
test("the map's card pulses while another map is being read", async ({ page }) => {
  await page.goto("/");
  await page.locator("#current .hero").waitFor();
  await expect(page.locator("#current .hero")).not.toHaveClass(/pending/);
  const letGo = await held(page, "**/riki/v1/maps/6F1E2A10-0000-4000-8000-000000000002");
  await showAllMaps(page);
  await page.locator("#others .row", { hasText: "Bratislava" }).click();
  const hero = page.locator("#current .hero");
  await expect(hero).toHaveClass(/pending/);
  await expect(hero).toHaveCSS("animation-name", "pulse");
  letGo();
  await expect(hero).not.toHaveClass(/pending/);
  await expect(page.locator("#current .hero b")).toHaveText("Bratislava");
});
