import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// 27 TestFlight AApG, AL9n: View on a server's card opens its page in parts, as on the phone.
test("a server's View opens its page on Layers, then General and Sharing", async ({ page }) => {
  await openViewer(page, "/?edit=7q4-k29");
  const card = page.locator("[data-server-card='0D5E1F00-0000-4000-8000-000000000002']");
  await expect(card).toContainText("ZBGIS");
  await card.getByRole("button", { name: "View ZBGIS" }).click();
  await expect(page.locator("#serverTitle")).toHaveText("ZBGIS");
  await expect(page.locator("#serverLayers")).toContainText("Parcels E");
  await page.locator("#serverParts").getByRole("tab", { name: "General" }).click();
  await expect(page.locator("#serverGeneral")).toContainText("https://zbgis.test/arcgis/rest/services");
  await expect(page.locator("#serverFacts")).toContainText("11.1");
  await page.locator("#serverParts").getByRole("tab", { name: "Sharing" }).click();
  const saved = page.waitForEvent("download");
  await page.locator("#exportServer").click();
  expect((await saved).suggestedFilename()).toBe("ZBGIS.servson");
  await page.locator("#serverBack").click();
  await expect(page.locator("#serverPage")).toHaveClass(/ahead/);
});

// 27: a browser that may only look sees no servers
test("a browser without the edit password lists no servers", async ({ page }) => {
  await openViewer(page, "/");
  await expect(page.locator("#mapsPage")).toBeVisible();
  await expect(page.locator("#serverCards")).toHaveCount(0);
});
