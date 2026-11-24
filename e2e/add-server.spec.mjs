import { test, expect } from "@playwright/test";
import { addFrom, openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openNewServer(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
  await addFrom(page, "server");
  await expect(page.locator("#serverAddress")).toBeVisible();
}

// 2996: the phone reads the address, saves the server, and its layers can be ticked at once.
test("a server added by its address lists its layers", async ({ page }) => {
  await openNewServer(page);
  await expect(page.locator("#addServer")).toBeDisabled();
  await page.locator("#serverKind").selectOption("arcgis");
  await page.locator("#serverAddress").fill("https://gis.example.org/arcgis/rest/services/Geology/MapServer");
  await page.locator("#serverName").fill("Survey");
  const asked = page.waitForRequest((request) => request.url().includes("/add-server?"));
  await page.locator("#addServer").click();
  const sent = new URL((await asked).url()).searchParams;
  expect(sent.get("kind")).toBe("arcgis");
  expect(sent.get("name")).toBe("Survey");
  await expect(page.locator("[data-server]").filter({ hasText: "Survey" })).toHaveCount(1);
  await expect(page.locator("#serverAddress")).toHaveValue("");
  await page.locator("[data-server]").filter({ hasText: "Survey" }).locator("[data-layer='0']").click();
  await page.locator("#addServerLayers").click();
  await expect(page.locator("#editBody input[value='Geology']")).toHaveCount(1);
});

// 2996: an address that does not answer says why, and the field keeps what was typed.
test("a server that does not answer says why", async ({ page }) => {
  await openNewServer(page);
  await page.locator("#serverAddress").fill("https://silent.example.org/arcgis/rest/services");
  await page.locator("#addServer").click();
  await expect(page.locator("#notice")).toContainText("Server replied 404");
  await expect(page.locator("#serverAddress")).toHaveValue("https://silent.example.org/arcgis/rest/services");
});

// AP1E: a WMTS or WMS is a server of its own, read from its capabilities.
test("New server offers WMTS and WMS, and a WMTS lists its layers", async ({ page }) => {
  await openNewServer(page);
  const kinds = await page.locator("#serverKind option").allTextContents();
  // 188 an API server is taken too
  expect(kinds).toEqual(["Esri / ArcGIS", "TileJSON", "Tile server", "WMTS", "WMS", "MapProxy", "API"]);
  await page.locator("#serverKind").selectOption("wmts");
  await page.locator("#serverAddress").fill("https://wmts.geo.admin.ch/1.0.0/WMTSCapabilities.xml");
  const asked = page.waitForRequest((request) => request.url().includes("/add-server?"));
  await page.locator("#addServer").click();
  expect(new URL((await asked).url()).searchParams.get("kind")).toBe("wmts");
  const server = page.locator("[data-server]").filter({ hasText: "wmts.geo.admin.ch" });
  await expect(server).toContainText("WMTS · 1 layer");
  await server.locator("[data-layer='pixelkarte']").click();
  await page.locator("#addServerLayers").click();
  await expect(page.locator("#editBody input[value='National map']")).toHaveCount(1);
});

// 189: From a website: the phone reads the page, a found server fills New server, and Add names the pick.
test("a server found on a website fills New server and is added as found", async ({ page }) => {
  await openNewServer(page);
  const website = page.locator("#serverWebsite");
  await website.locator("#serverWebsiteAddress").fill("https://mapy.tuzvo.test/hofm/");
  const scanned = page.waitForRequest((request) => request.url().includes("/find-servers?"));
  await website.locator("#serverWebsiteScan").click();
  expect(new URL((await scanned).url()).searchParams.get("page")).toBe("https://mapy.tuzvo.test/hofm/");
  await expect(website.locator("[data-found]")).toHaveCount(2);
  await page.locator("#serverWebsite").screenshot({ path: "test-results/server-from-website.png" });
  await website.getByRole("button", { name: "Forest map, Esri" }).click();
  await expect(page.locator("#serverKind")).toHaveValue("arcgis");
  await expect(page.locator("#serverAddress")).toHaveValue("https://gis.tuzvo.test/arcgis/rest/services/Hofm/MapServer");
  await expect(page.locator("#serverName")).toHaveValue("Forest map");
  const added = page.waitForRequest((request) => request.url().includes("/add-server?"));
  await page.locator("#addServer").click();
  const asked = new URL((await added).url()).searchParams;
  expect(asked.get("found")).toBe("https://gis.tuzvo.test/arcgis/rest/services/Hofm/MapServer/2");
  expect(asked.get("page")).toBe("https://mapy.tuzvo.test/hofm/");
  await expect(page.locator("[data-server]").filter({ hasText: "Forest map" })).toBeVisible();
});

// 189: a page that draws nothing a server can be made of says so.
test("a website with no servers says so", async ({ page }) => {
  await openNewServer(page);
  await page.locator("#serverWebsiteAddress").fill("https://empty.example.test/");
  await page.locator("#serverWebsiteScan").click();
  await expect(page.locator("#serverWebsiteFound")).toContainText("None of what this page draws can be saved as a server.");
});
