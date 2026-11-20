import { test, expect } from "@playwright/test";
import { watchConsole } from "./console.mjs";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// 125 bug: one layer with two zoom curves made Safari's MapLibre throw on every redraw and tap
test("a layer MapLibre refuses is left out, and the map still draws and takes a tap", async ({ page }) => {
  await page.route("**/riki/v1/maps/*/style?**", async (route) => {
    const answer = await route.fetch();
    const style = await answer.json();
    style.sources.refused = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
    style.layers.push({ id: "two-curves", type: "line", source: "refused", paint: { "line-width":
      ["coalesce", ["interpolate", ["linear"], ["zoom"], 1, 1, 5, 2], ["step", ["zoom"], 1, 5, 2]] } });
    await route.fulfill({ response: answer, json: style });
  });
  const watched = watchConsole(page);
  await openViewer(page, "/");
  await page.waitForLoadState("networkidle");
  const box = await page.locator("#map canvas").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3);
  await page.waitForTimeout(500);
  expect(watched.found).toEqual([]);
});
