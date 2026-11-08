import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// 2915: a Riki map's hidden 3D colour layer left the whole map blank in the browser.
test("a map with relief draws, without the layer type this MapLibre lacks", async ({ page }) => {
  await openViewer(page);
  await page.waitForFunction(() => __riki.map.isStyleLoaded() && __riki.map.getLayer("relief") !== undefined,
    null, { timeout: 15000 });
  const ids = await page.evaluate(() => __riki.map.getStyle().layers.map((layer) => layer.id));
  expect(ids).toContain("ground");
  expect(ids).not.toContain("riki-colour-relief-0");
});

// 2941: the house numbers' 3D lift, a property only the app's MapLibre has, left the map black.
test("a map whose house numbers stand on roofs draws, without the lift", async ({ page }) => {
  await openViewer(page);
  await page.waitForFunction(() => __riki.map.isStyleLoaded() && __riki.map.getLayer("numbers") !== undefined,
    null, { timeout: 15000 });
  const layout = await page.evaluate(() => __riki.map.getStyle().layers.find((layer) => layer.id === "numbers").layout);
  expect(layout["text-field"]).toBe("1");
  expect(layout["symbol-z-offset"]).toBeUndefined();
});

