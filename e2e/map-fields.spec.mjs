import { test, expect } from "@playwright/test";
import { openViewer, reset, showAllMaps } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";
const WINTER = "6F1E2A10-0000-4000-8000-0000000000B2";

// 128 High Tatras answers every field of 3490; Bratislava answers as an older phone.
test("the map card says who has the map and its role, where the phone told", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await expect(page.locator("#mapSharing")).toHaveText("Shared with 1 · Owner");
  await showAllMaps(page);
  await page.locator("#mapList button.row", { hasText: "Bratislava" }).click();
  await expect(page.locator("#mapName")).toHaveText("Bratislava");
  await expect(page.locator("#mapSharing")).toHaveCount(0);
});

// 128 the side bar's list draws a map's offline state and size only if the phone sent them
test("the side bar's maps carry their offline state and size only when the phone sent them", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await showAllMaps(page);
  const tatras = page.locator("#mapList button.row", { hasText: "High Tatras" });
  await expect(tatras.locator("[data-offline=ready]")).toHaveText("Ready offline");
  await expect(tatras.locator("[data-held]")).toHaveText("1.2 GB");
  const bratislava = page.locator("#mapList button.row", { hasText: "Bratislava" });
  await expect(bratislava.locator(".pill-tag")).toHaveCount(0);
});

// 128 W4's Maps tab: pills beside the map, a chip opens the style by its id
test("W4's Maps tab draws the pills, and a style chip opens that style's address", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#railData").click();
  const tatras = page.locator("#data [data-row]", { hasText: "High Tatras" });
  await expect(tatras.locator("[data-offline=ready]")).toHaveText("Ready offline");
  await expect(tatras.locator("[data-held]")).toHaveText("1.2 GB");
  await expect(tatras.locator(".style-chip")).toHaveText(["Summer", "Winter"]);
  await expect(tatras.getByRole("link", { name: "Winter" })).toHaveAttribute("href", `/maps/${TATRAS}/style/${WINTER}`);
  const bratislava = page.locator("#data [data-row]", { hasText: "Bratislava" });
  await expect(bratislava.locator(".pill-tag, .style-chip")).toHaveCount(0);

  await tatras.getByRole("link", { name: "Winter" }).click();
  await expect(page).toHaveURL(new RegExp(`/maps/${TATRAS}/style/${WINTER}`));
  await expect(page.locator("#data")).toHaveCount(0);
});
