import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openNewServer(page) {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
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
