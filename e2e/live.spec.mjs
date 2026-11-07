import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// TestFlight AJWq: an API layer drew nothing in the browser.
test("an API layer's points are asked of the phone and drawn", async ({ page, request }) => {
  await phone(request, "live");
  // 2916: an editing browser lists the layer; any browser draws it.
  await openViewer(page, "/?edit=7q4-k29");
  await expect(page.locator("#layerList .row", { hasText: "Trains" })).toHaveCount(1);
  await expect.poll(async () => (await phone(request, "guests")).liveAsks.length).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() =>
    __riki.map.querySourceFeatures("riki-custom-6f1e2a10-0000-4000-8000-0000000000e1").length)).toBeGreaterThan(0);
});
