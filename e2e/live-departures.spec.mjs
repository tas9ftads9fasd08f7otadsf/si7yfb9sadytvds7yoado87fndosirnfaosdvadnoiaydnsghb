import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// 130 the vehicle the live layer draws is at the middle of the map once the phone has answered
async function tapVehicle(page, request, drawn = ".connection") {
  await phone(request, "live");
  await openViewer(page);
  await expect.poll(() => page.evaluate(() =>
    __riki.map.queryRenderedFeatures({ layers: ["riki-custom-layer-6f1e2a10-0000-4000-8000-0000000000e1"] }).length),
  { timeout: 20_000 }).toBeGreaterThan(0);
  const box = await page.locator("#map").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(`#placePanel ${drawn}`).first()).toBeVisible();
}

// 130 the card is the phone's: its words, its tone, the planned time struck through and the LIVE pill
test("a live vehicle's card is drawn as the phone words it, with the LIVE pill", async ({ page, request }) => {
  await tapVehicle(page, request);
  const card = page.locator("#placePanel .connection");
  await expect(card.locator(".delay")).toHaveText("3 min late");
  await expect(card.locator(".delay")).toHaveClass(/tone-late/);
  await expect(card.locator(".short")).toHaveText("+3 min");
  await expect(card).toContainText("Delay");
  await expect(card.locator(".connection-route")).toHaveText("Lamač → Petržalka");
  await expect(card.locator(".connection-operator")).toHaveText("Run by DPB");
  await expect(card.locator(".station")).toHaveText("Hlavná stanica");
  await expect(card.locator("s")).toHaveText("09:31");
  await expect(card.locator(".connection-times")).toContainText("09:34");
  await expect(card.locator(".feature-note")).toContainText("Note from the operator");
  await expect(card.locator(".feature-note")).toContainText("Detour via Main St");
  await expect(card.locator(".end", { hasText: "Updated" })).toContainText("09:35");
  await expect(page.locator("#placePanel .live-pill")).toHaveText("LIVE");
  await expect(page.locator("#placePanel .live-pill")).toHaveAttribute("data-live", "true");
});

// 130 the pill counts the age on from when the page asked: past the window it says what the phone said for that
test("the LIVE pill turns to Not live once the age counted on passes the window", async ({ page, request }) => {
  await phone(request, "live-window", { seconds: "3" });
  await tapVehicle(page, request);
  const pill = page.locator("#placePanel .live-pill");
  await expect(pill).toHaveText("LIVE");
  await expect(pill).toHaveText("Not live", { timeout: 10_000 });
});

// 130 an open panel keeps reading the layer's live answer: the delay, its tone and the pill follow
test("an open panel reads the layer's live answer again", async ({ page, request }) => {
  await tapVehicle(page, request);
  const card = page.locator("#placePanel .connection");
  await expect(card.locator(".delay")).toHaveText("3 min late");
  const asks = (await phone(request, "guests")).liveAsks.length;
  await phone(request, "train-delay", { minutes: "12" });
  await expect(card.locator(".delay")).toHaveText("12 min late", { timeout: 30_000 });
  await expect(card.locator(".delay")).toHaveClass(/tone-veryLate/);
  await expect(card.locator("s")).toHaveText("09:31");
  expect((await phone(request, "guests")).liveAsks.length).toBeGreaterThan(asks);
  await expect(page.locator("#placePanel .live-pill")).toHaveText("LIVE");
  await expect.poll(async () => (await phone(request, "details-asked")).at(-1).values.Delay).toBe("12");
});

// 130 closing the panel stops the asking
test("a closed panel is not read again", async ({ page, request }) => {
  await tapVehicle(page, request);
  await page.locator("#placeClose").click();
  await expect(page.locator("#placePanel")).toHaveCount(0);
  const asked = (await phone(request, "details-asked")).length;
  await page.waitForTimeout(16_500);
  expect((await phone(request, "details-asked")).length).toBe(asked);
});

// 130 a phone from before 3493 sends only the rows: they are drawn as they were, with no pill
test("an older phone's rows are still drawn, with no pill", async ({ page, request }) => {
  await phone(request, "rows-only");
  await tapVehicle(page, request, ".feature dd");
  const card = page.locator("#placePanel .feature");
  await expect(card.locator("dd", { hasText: "3 min late" })).toHaveCount(1);
  await expect(card.locator("dd", { hasText: "Run by DPB" })).toHaveCount(1);
  await expect(page.locator("#placePanel .connection")).toHaveCount(0);
  await expect(page.locator("#placePanel .live-pill")).toHaveCount(0);
});
