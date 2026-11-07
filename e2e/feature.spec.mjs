import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// TestFlight AFKF: a feature in the browser could be seen, never asked about.
test("a clicked feature shows what it carries, as text", async ({ page }) => {
  await openViewer(page);
  await page.evaluate(() => {
    __riki.map.addSource("riki-custom-6f1e2a10-0000-4000-8000-0000000000a2", { type: "geojson", data: {
      type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point",
        coordinates: __riki.map.getCenter().toArray() },
      properties: { Nazov: "Chata pod Rysmi", Elevation: "2250", Note: "<b>open</b>", riki_stack: 0 } }] } });
    __riki.map.addLayer({ id: "huts", type: "circle", source: "riki-custom-6f1e2a10-0000-4000-8000-0000000000a2",
      paint: { "circle-radius": 12 } });
  });
  const box = await page.locator("#map").boundingBox();
  await expect.poll(() => page.evaluate(() => __riki.map.queryRenderedFeatures({ layers: ["huts"] }).length))
    .toBeGreaterThan(0);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  const card = page.locator(".maplibregl-popup .feature");
  await expect(card.locator("b")).toHaveText("Chata pod Rysmi");
  await expect(card.locator("small")).toHaveText("Huts");
  await expect(card.locator("dd", { hasText: "2250" })).toHaveCount(1);
  await expect(card.locator("dd", { hasText: "<b>open</b>" })).toHaveCount(1);
  await expect(card.locator("dt", { hasText: "riki_stack" })).toHaveCount(0);

  await page.mouse.click(box.x + 20, box.y + 20);
  await expect(page.locator(".maplibregl-popup")).toHaveCount(0);
});
