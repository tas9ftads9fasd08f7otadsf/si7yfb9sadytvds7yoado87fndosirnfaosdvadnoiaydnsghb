import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// 101 W4: the rail's Data lists the phone's maps, every layer once, its servers and the map's regions.
test("the rail's Data lists the maps, layers, servers and regions", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#railData").click();
  await expect(page).toHaveURL(/\/data\/maps#/);
  await expect(page.locator("#railData")).toHaveAttribute("aria-current", "page");
  const table = page.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByRole("row", { name: /High Tatras/ })).toContainText("On map now");

  await page.getByRole("tab", { name: /Layers/ }).click();
  await expect(page).toHaveURL(/\/data\/layers#/);
  // 113 how many maps hold it, as a number under "Used in"
  await expect(table.getByRole("row", { name: /Trails/ }).getByRole("cell").nth(2)).toHaveText("1");

  await page.getByRole("tab", { name: /Servers/ }).click();
  await expect(table.getByRole("button", { name: "View" }).first()).toBeVisible();

  await page.getByRole("tab", { name: /Regions/ }).click();
  await expect(page.locator("#data")).toContainText("Regions of High Tatras");

  await page.getByRole("tab", { name: /Maps/ }).click();
  await table.getByRole("button", { name: "Bratislava" }).click();
  await expect(page.locator("#data")).toHaveCount(0);
  await expect(page.locator("#mapName")).toHaveText("Bratislava");
});

// 101 a browser that may only look sees no servers
test("a looking browser's Data has no servers", async ({ page }) => {
  await openViewer(page);
  await page.locator("#railData").click();
  await expect(page.getByRole("tab")).toHaveText([/Maps/, /Layers/, /Regions/]);
});
