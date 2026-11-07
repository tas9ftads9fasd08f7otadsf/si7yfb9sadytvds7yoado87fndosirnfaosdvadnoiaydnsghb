import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openServers(page) {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
  await expect(page.locator("[data-server]")).toHaveCount(2);
}

// 2966: the phone's servers as its list walks them: folders and services named, unread ones said.
test("the phone's saved servers are listed with what they publish", async ({ page }) => {
  await openServers(page);
  const zbgis = page.locator("[data-server='0D5E1F00-0000-4000-8000-000000000002']");
  await expect(zbgis).toContainText("Esri / ArcGIS · 3 services");
  await expect(zbgis.locator("button[data-layer]")).toHaveCount(3);
  await expect(zbgis).toContainText("Not read yet — open it under Servers.");
  await expect(page.locator("#addServerLayers")).toBeDisabled();
});

// 2966: ticked layers go in the order they were ticked, named as the server names them.
test("ticked server layers are added in the order they were ticked", async ({ page }) => {
  await openServers(page);
  const zbgis = page.locator("[data-server='0D5E1F00-0000-4000-8000-000000000002']");
  await zbgis.getByRole("button", { name: /Orthophoto/ }).click();
  await zbgis.getByRole("button", { name: /Parcels E/ }).click();
  await expect(zbgis.getByRole("button", { name: /Orthophoto/ })).toHaveAttribute("aria-pressed", "true");
  const asked = page.waitForRequest((request) => request.url().includes("/add-server-layers?"));
  await page.locator("#addServerLayers").click();
  const picks = JSON.parse(new URL((await asked).url()).searchParams.get("picks"));
  expect(picks.map((pick) => pick.service)).toEqual(["https://zbgis.test/Ortho/ImageServer",
    "https://zbgis.test/Base/Parcels/MapServer"]);
  await expect(page.locator("#editBody input[value='Orthophoto']")).toHaveCount(1);
  await expect(page.locator("#editBody input[value='Parcels E']")).toHaveCount(1);
});
