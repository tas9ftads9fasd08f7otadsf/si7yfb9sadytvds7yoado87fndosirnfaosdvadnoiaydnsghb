import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// 2801: the owner's ask, the phone's place on the page while it shares it.
test("a phone sharing its location is a dot on the map, and its button goes there", async ({ page, request }) => {
  await phone(request, "location", { lat: "49.1795", lon: "20.0881" });
  await openViewer(page);
  const dot = page.locator(".phone-dot");
  await expect(dot).toBeVisible();
  await expect(dot).toHaveAttribute("aria-label", "Riki's iPad");
  await page.locator("#phoneButton").click();
  await expect.poll(() => page.evaluate(() => Math.abs(__riki.map.getCenter().lat - 49.1795))).toBeLessThan(0.001);
  await expect.poll(() => page.evaluate(() => __riki.map.getZoom())).toBeGreaterThanOrEqual(15);
});

// 18 (AH6z): the button stays among the map's controls and says how to turn sharing on.
test("a phone that does not share its location shows no dot, and its button says where to share", async ({ page }) => {
  await openViewer(page);
  await expect(page.locator(".phone-dot")).toHaveCount(0);
  const button = page.locator(".maplibregl-ctrl-top-right #phoneButton");
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByText("Share this phone's location")).toBeVisible();
});
