import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => {
  await reset(request);
  await phone(request, "network-tiles");
});

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

// Undefined until the style is drawn, so a poll waits for it.
const tilesOf = (page) => page.evaluate(() => window.__riki?.map.getStyle()
  ?.sources["riki-net-6f1e2a10-0000-4000-8000-0000000000c1"]?.tiles);

// 43 with the phone's switch off the page has no such choice, and every tile comes through the phone
test("a phone that does not allow it offers no choice, and tiles come through it", async ({ page }) => {
  const asked = page.waitForRequest((request) => request.url().includes("/style?"));
  await openViewer(page);
  expect(new URL((await asked).url()).searchParams.has("direct")).toBe(false);
  await expect(page.locator("#tileSource")).toHaveCount(0);
  await expect.poll(() => tilesOf(page)).toEqual(["/riki/v1/relay/mock/{z}/{x}/{y}.png"]);
});

// 43 allowed by the phone, the browser chooses: the style is asked anew and the layer's own address is drawn
test("where the phone allows it, a browser loads tiles from their source, and keeps the choice", async ({ page, request }) => {
  await phone(request, "direct", { on: "1" });
  const elsewhere = [];
  await page.route("https://tiles.test/**", (route) => {
    elsewhere.push(route.request().url());
    return route.fulfill({ contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: PIXEL });
  });
  await openViewer(page);
  await expect(page.locator("#tilesViaPhone")).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => tilesOf(page)).toEqual(["/riki/v1/relay/mock/{z}/{x}/{y}.png"]);
  expect(elsewhere).toEqual([]);

  const asked = page.waitForRequest((each) => each.url().includes("/style?") && each.url().includes("direct=1"));
  await page.locator("#tilesViaSource").click();
  await asked;
  await expect(page.locator("#tilesViaSource")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#tileSourceNote")).toHaveText("Layers that need the phone's keys still come through it.");
  await expect.poll(() => tilesOf(page)).toEqual(["https://tiles.test/{z}/{x}/{y}.png"]);
  await expect.poll(() => elsewhere.length).toBeGreaterThan(0);

  await page.reload();
  await page.locator("#current .hero").waitFor();
  await expect(page.locator("#tilesViaSource")).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => tilesOf(page)).toEqual(["https://tiles.test/{z}/{x}/{y}.png"]);

  await page.locator("#tilesViaPhone").click();
  await expect.poll(() => tilesOf(page)).toEqual(["/riki/v1/relay/mock/{z}/{x}/{y}.png"]);
});

// 43 the phone's switch turned off while a browser loads directly sends its tiles back through the phone
test("turning the phone's switch off brings a browser's tiles back through the phone", async ({ page, request }) => {
  await phone(request, "direct", { on: "1" });
  await page.route("https://tiles.test/**", (route) => route.fulfill({
    contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: PIXEL }));
  await openViewer(page);
  await page.locator("#tilesViaSource").click();
  await expect.poll(() => tilesOf(page)).toEqual(["https://tiles.test/{z}/{x}/{y}.png"]);
  await phone(request, "direct", { on: "0" });
  await expect(page.locator("#tileSource")).toHaveCount(0, { timeout: 8000 });
  await expect.poll(() => tilesOf(page)).toEqual(["/riki/v1/relay/mock/{z}/{x}/{y}.png"]);
});
