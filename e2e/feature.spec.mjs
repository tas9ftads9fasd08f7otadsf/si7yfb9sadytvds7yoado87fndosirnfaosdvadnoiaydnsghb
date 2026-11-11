import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// TestFlight AFKF: a feature in the browser could be seen, never asked about.
// 39 the side bar shows before the style loads, and adding a source then throws
test("a clicked feature shows what it carries, as text", async ({ page }) => {
  await openViewer(page);
  await page.evaluate(async () => {
    // 39 checked and added in one task: a style drawn between the two would refuse the source
    await new Promise((loaded) => {
      const check = () => (__riki.map.isStyleLoaded() ? loaded() : __riki.map.once("styledata", check));
      check();
    });
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

// 3001: empty ground is asked of the layers' servers through the phone, every answer shown.
test("a click on empty ground shows what the servers answer", async ({ page, request }) => {
  await phone(request, "answers-servers");
  await openViewer(page);
  const box = await page.locator("#map").boundingBox();
  await page.mouse.click(box.x + box.width / 3, box.y + box.height / 3);

  const cards = page.locator(".maplibregl-popup .feature");
  await expect(cards).toHaveCount(2);
  await expect(cards.first().locator("b")).toHaveText("Granite");
  await expect(cards.first().locator("small")).toHaveText("Geology");
  const asked = (await phone(request, "identified"))[0];
  expect(asked.box.split(",")).toHaveLength(4);
  expect(asked.size).toMatch(/^\d+,\d+$/);
  expect(Number(asked.lat)).toBeGreaterThan(-90);
});

// 21: a layer with a Details layout shows its sections, filled by the phone from the feature.
test("a clicked feature wears its layer's layout", async ({ page, request }) => {
  await phone(request, "lays-out-details");
  await openViewer(page);
  await page.evaluate(async () => {
    // 39 checked and added in one task: a style drawn between the two would refuse the source
    await new Promise((loaded) => {
      const check = () => (__riki.map.isStyleLoaded() ? loaded() : __riki.map.once("styledata", check));
      check();
    });
    __riki.map.addSource("riki-custom-6f1e2a10-0000-4000-8000-0000000000a2", { type: "geojson", data: {
      type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point",
        coordinates: __riki.map.getCenter().toArray() },
      properties: { Nazov: "Chata pod Rysmi", Elevation: "2250", Beds: "40" } }] } });
    __riki.map.addLayer({ id: "huts", type: "circle", source: "riki-custom-6f1e2a10-0000-4000-8000-0000000000a2",
      paint: { "circle-radius": 12 } });
  });
  const box = await page.locator("#map").boundingBox();
  await expect.poll(() => page.evaluate(() => __riki.map.queryRenderedFeatures({ layers: ["huts"] }).length))
    .toBeGreaterThan(0);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  const card = page.locator(".maplibregl-popup .feature");
  await expect(card.locator("b")).toHaveText("Hut Chata pod Rysmi");
  await expect(card.locator("h4")).toHaveText(["About", "Source"]);
  await expect(card.locator("dd", { hasText: "2250 m" })).toHaveCount(1);
  await expect(card.locator(".feature-note.warning")).toContainText("Closed in winter");
  await expect(card.locator("dt", { hasText: "Beds" })).toHaveCount(1);
  await expect(card.locator("dt", { hasText: "Elevation" })).toHaveCount(0);
  const asked = (await phone(request, "details-asked"))[0];
  expect(asked.layer).toBe("6f1e2a10-0000-4000-8000-0000000000a2");
  expect(asked.values.Beds).toBe("40");
});
