import { test, expect } from "@playwright/test";
import { addFrom, openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// 188: an API server is added from Add layer, and its page lists its endpoints, more typed in on its host.
test("an API server is added, and its page lists and takes endpoints", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
  await addFrom(page, "server");
  await page.locator("#serverKind").selectOption("api");
  await page.locator("#serverAddress").fill("https://api.caffes.test/v1/items.json");
  await page.locator("#serverName").fill("Caffès");
  const asked = page.waitForRequest((request) => request.url().includes("/add-server?"));
  await page.locator("#addServer").click();
  expect(new URL((await asked).url()).searchParams.get("kind")).toBe("api");
  await expect(page.locator("[data-server]").filter({ hasText: "Caffès" })).toBeVisible();

  await openViewer(page, "/e/7q4-k29");
  await page.locator("#railServers").click();
  await page.locator("[data-server-card]", { hasText: "Caffès" }).getByRole("button", { name: "View Caffès" }).click();
  const layers = page.locator("#serverLayers");
  await expect(layers.locator(".endpoint")).toHaveText(["https://api.caffes.test/v1/items.json"]);
  await page.locator("#serverNewLayerAddress").fill("https://elsewhere.test/shops.json");
  await page.locator("#serverNewLayerAdd").click();
  await expect(page.getByText("The address has to be on api.caffes.test, as the server's is.")).toBeVisible();
  await page.locator("#serverNewLayerAddress").fill("https://api.caffes.test/v1/shops.json");
  await page.locator("#serverNewLayerAdd").click();
  await expect(layers.locator(".endpoint")).toHaveText(["https://api.caffes.test/v1/items.json",
    "https://api.caffes.test/v1/shops.json"]);
  await layers.screenshot({ path: "test-results/api-server-endpoints.png" });
  await layers.getByRole("button", { name: "Remove from this server shops" }).click();
  await expect(layers.locator(".endpoint")).toHaveCount(1);
});

// 186: a server's own layer page opens off its Layers, an API layer's under the scope pill and banner.
test("a server's layer opens its own page, an API layer's under the server's scope", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
  await addFrom(page, "server");
  await page.locator("#serverKind").selectOption("api");
  await page.locator("#serverAddress").fill("https://api.caffes.test/v1/items.json");
  await page.locator("#serverName").fill("Caffès");
  await page.locator("#addServer").click();
  await expect(page.locator("[data-server]").filter({ hasText: "Caffès" })).toBeVisible();
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#railServers").click();
  await page.locator("[data-server-card]", { hasText: "Caffès" }).getByRole("button", { name: "View Caffès" }).click();
  await page.locator("#serverLayers").getByRole("button", { name: "items" }).click();
  await expect(page).toHaveURL(/\/layers\/%40(#|$)/);
  const layer = page.locator("#serverLayerPage");
  await expect(layer.locator("#serverScopePill")).toHaveText("Server · Caffès");
  await expect(layer.locator("#serverScopeBanner")).toContainText("No map of yours uses it yet.");
  await expect(layer.locator("#serverLayerAddress")).toHaveText("https://api.caffes.test/v1/items.json");
  await expect(layer.locator("#serverLayerLook [data-part]")).toHaveCount(3);
  await layer.screenshot({ path: "test-results/server-layer-page.png" });
  await page.reload();
  await expect(layer.locator("#serverScopePill")).toHaveText("Server · Caffès");
  await layer.locator("#serverOwnLayerBack").click();
  await expect(page.locator("#serverLayers")).toBeVisible();
});

// 186: an Esri layer's page has no scope: what it publishes, and the footnote the phone's has.
test("an Esri layer's page shows what it publishes, without a scope", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#railServers").click();
  await page.locator("[data-server-card='0D5E1F00-0000-4000-8000-000000000002']").getByRole("button", { name: "View ZBGIS" }).click();
  await page.locator("#serverLayers").getByRole("button", { name: "Parcels C" }).click();
  const layer = page.locator("#serverLayerPage");
  await expect(layer.locator("#serverOwnLayerName")).toHaveText("Parcels C");
  await expect(layer.locator("#serverLayerPublished")).toContainText("Slovakia");
  await expect(layer.locator("#serverScopePill")).toHaveCount(0);
});
