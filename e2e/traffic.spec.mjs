import { test, expect } from "@playwright/test";
import { openViewer, reset, showAllMaps } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const speedOf = async (locator) => {
  const [, number, unit] = /^([\d.]+) (KB|MB)\/s$/.exec(await locator.textContent());
  return Number(number) * (unit === "MB" ? 1000 : 1);
};

// 46 the header's chip: what the phone sends is counted as the phone's, and nothing as another source's
test("the header shows the download speed from the phone and from other sources", async ({ page }) => {
  await openViewer(page);
  await expect(page.locator("#traffic")).toBeVisible();
  await expect(page.locator("#traffic")).toHaveAttribute("aria-label", /^From the phone: [\d.]+ [KM]B\/s · From other sources: 0 KB\/s$/);
  await showAllMaps(page);
  await page.locator("#others .row", { hasText: "Bratislava" }).click();
  await expect.poll(() => speedOf(page.locator("#trafficPhone")), { timeout: 8000 }).toBeGreaterThan(0);
  await expect(page.locator("#trafficOther")).toHaveText("0 KB/s");
  // Quiet again once the window has passed.
  await expect(page.locator("#trafficPhone")).toHaveText("0 KB/s", { timeout: 15000 });
});

// 46 a fetch made in MapLibre's worker, to another origin, is counted as another source's
test("what the map's workers fetch from elsewhere is counted as other sources", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://tiles.test/**", (route) => route.fulfill({
    contentType: "application/json", headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ type: "FeatureCollection", features: [], padding: "x".repeat(600_000) })
  }));
  await openViewer(page);
  await expect(page.locator("#trafficOther")).toHaveText("0 KB/s");
  await page.evaluate(() => {
    window.__riki.map.addSource("elsewhere", { type: "geojson", data: "https://tiles.test/points.geojson" });
    window.__riki.map.addLayer({ id: "elsewhere", type: "circle", source: "elsewhere" });
  });
  await expect.poll(() => speedOf(page.locator("#trafficOther")), { timeout: 8000 }).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});
