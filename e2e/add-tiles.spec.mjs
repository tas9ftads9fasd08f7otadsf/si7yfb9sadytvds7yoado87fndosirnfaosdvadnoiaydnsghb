import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openTileField(page) {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
  await expect(page.locator("#tileAddress")).toBeVisible();
}

// 2964: the phone reads the address first; the layer joins the map under its host's name.
test("a tile address is added as a layer", async ({ page }) => {
  await openTileField(page);
  await expect(page.locator("#addTiles")).toBeDisabled();
  await page.locator("#tileAddress").fill("https://tiles.example.org/{z}/{x}/{y}.png");
  const asked = page.waitForRequest((request) => request.url().includes("/add-tiles?"));
  await page.locator("#addTiles").click();
  const sent = new URL((await asked).url()).searchParams;
  expect(sent.get("template")).toBe("https://tiles.example.org/{z}/{x}/{y}.png");
  await expect(page.locator("#editBody input[value='tiles.example.org']")).toHaveCount(1);
  await expect(page.locator("#tileAddress")).toHaveCount(0);
});

// 2964: what the phone's probe says is said in the page, and nothing is added.
test("an address the phone cannot read says why", async ({ page }) => {
  await openTileField(page);
  await page.locator("#tileAddress").fill("https://unreachable.example.org/{z}/{x}/{y}.png");
  await page.locator("#addTiles").click();
  await expect(page.locator("#notice")).toContainText("Server replied 404");
  await expect(page.locator("#tileAddress")).toBeVisible();
});

// 2965: a TileJSON address is read by the phone and added under its document's name.
test("a TileJSON address is added as the layer it describes", async ({ page }) => {
  await openTileField(page);
  await page.locator("#tileAddress").fill("https://tiles.example.org/tiles.json");
  await page.locator("#addTiles").click();
  await expect(page.locator("#editBody input[value='OpenMapTiles']")).toHaveCount(1);
});

// 2965: a document counting its rows the TMS way is refused with the phone's words.
test("a TMS TileJSON is refused", async ({ page }) => {
  await openTileField(page);
  await page.locator("#tileAddress").fill("https://tiles.example.org/tms.json");
  await page.locator("#addTiles").click();
  await expect(page.locator("#notice")).toContainText("TMS scheme — not supported");
});

// 2967: a WMS lists its layers first; only what the phone can draw can be ticked.
test("a WMS address lists its layers, and the ticked ones are added", async ({ page }) => {
  await openTileField(page);
  await page.locator("#tileAddress").fill("https://geo.example.org/arcgis/rest/services/Geology/MapServer/WMSServer?request=GetCapabilities");
  await page.locator("#addTiles").click();
  await expect(page.locator("#serviceLayers [data-service-layer]")).toHaveCount(2);
  await expect(page.locator("#serviceLayers .dimmed")).toContainText("Only in Web Mercator");
  await expect(page.locator("#addServiceLayers")).toBeDisabled();
  await page.locator("[data-service-layer=rocks]").click();
  await page.locator("[data-service-layer=faults]").click();
  const asked = page.waitForRequest((request) => request.url().includes("/add-service-layers?"));
  await page.locator("#addServiceLayers").click();
  const sent = new URL((await asked).url()).searchParams;
  expect(JSON.parse(sent.get("picks"))).toEqual(["rocks", "faults"]);
  await expect(page.locator("#editBody input[value='Rocks']")).toHaveCount(1);
  await expect(page.locator("#serviceLayers")).toHaveCount(0);
});

// 2967: a service that says nothing it publishes is said so, and nothing is listed.
test("a WMS that publishes nothing readable says so", async ({ page }) => {
  await openTileField(page);
  await page.locator("#tileAddress").fill("https://silent.example.org/arcgis/rest/services/X/MapServer/WMSServer");
  await page.locator("#addTiles").click();
  await expect(page.locator("#notice")).toContainText("did not say what it publishes");
  await expect(page.locator("#serviceLayers")).toHaveCount(0);
});
