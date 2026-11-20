import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// 89 the 3D button raised the relief but left the camera looking straight down.
test("the 3D button raises the relief and tilts the map, and turns both off again", async ({ page }) => {
  await openViewer(page);
  await page.waitForFunction(() => __riki.map.isStyleLoaded() && __riki.map.getLayer("relief") !== undefined,
    null, { timeout: 15000 });
  // 90 with the other map buttons, bottom right.
  const button = page.locator(".maplibregl-ctrl-bottom-right #threeDButton");
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => __riki.map.getTerrain()?.source)).toBe("dem");
  await expect.poll(() => page.evaluate(() => Math.round(__riki.map.getPitch()))).toBe(60);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.evaluate(() => __riki.map.getTerrain())).toBeNull();
  await expect.poll(() => page.evaluate(() => Math.round(__riki.map.getPitch()))).toBe(0);
});
