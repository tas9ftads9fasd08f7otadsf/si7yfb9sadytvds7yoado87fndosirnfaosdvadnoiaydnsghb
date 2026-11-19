import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

const layer = "6F1E2A10-0000-4000-8000-0000000000C1";

test.beforeEach(async ({ request }) => {
  await reset(request);
  await phone(request, "network-tiles");
});

async function openConnection(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  const row = page.locator("#editBody .layer-item", { has: page.locator("input[value='Aerial']") });
  await row.getByRole("button", { name: "Options" }).click();
  return page.locator(`[data-options='${layer}']`);
}

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

// 2999: a group is switched per connection; one Settings holds off waits for the override.
test("a layer's connection switches go with the transport and group", async ({ page }) => {
  const panel = await openConnection(page);
  await expect(panel).toContainText("Mobile data");
  await expect(panel.locator("[data-locked]").getByRole("switch")).toBeDisabled();

  let asked = sent(page);
  await panel.getByRole("switch", { name: "Map tiles" }).first().click();
  expect(await asked).toMatchObject({ layer, connection: "wifi", group: "layerTiles", allowed: "0" });
  await expect(panel.getByRole("switch", { name: "Map tiles" }).first()).not.toBeChecked();

  asked = sent(page);
  await panel.getByRole("switch", { name: "Override Settings" }).click();
  expect(await asked).toMatchObject({ layer, connectionOverride: "1" });
  await expect(panel.locator("[data-locked]")).toHaveCount(0);
});

// 2999: offline download is one switch with the layer.
test("a layer's offline download is switched off", async ({ page }) => {
  const panel = await openConnection(page);
  const asked = sent(page);
  await panel.getByRole("switch", { name: "Allow offline download" }).click();
  expect(await asked).toMatchObject({ layer, offlineDownload: "0" });
  await expect(panel.getByRole("switch", { name: "Allow offline download" })).not.toBeChecked();
});

// 60: a key typed here goes to the phone, which says only that one is set; Test then answers.
test("a layer's header is set on the phone and its address tested", async ({ page }) => {
  const panel = await openConnection(page);
  await expect(panel.getByRole("button", { name: "Test" })).toBeVisible();
  await panel.getByRole("button", { name: "Test" }).click();
  await expect(panel.getByText("Server replied 401")).toBeVisible();

  let asked = sent(page);
  await panel.getByLabel("Header", { exact: true }).fill("X-API-Key");
  await panel.getByLabel("Value", { exact: true }).fill("sk_live_secret");
  await panel.getByRole("button", { name: "Add header" }).click();
  expect(await asked).toMatchObject({ layer, header: "X-API-Key", headerValue: "sk_live_secret" });
  await expect(panel.locator("[data-header='X-API-Key']")).toContainText("Saved on this device");
  await expect(panel).not.toContainText("sk_live_secret");
  await expect(panel.getByLabel("X-API-Key Value")).toHaveValue("");

  await panel.getByRole("button", { name: "Test" }).click();
  await expect(panel.getByText("Tiles reachable · 256 px")).toBeVisible();

  asked = sent(page);
  await panel.getByRole("button", { name: "Remove X-API-Key" }).click();
  expect(await asked).toMatchObject({ layer, removeHeader: "X-API-Key" });
  await expect(panel.locator("[data-header]")).toHaveCount(0);
});

// 60: the address and the proxy are sent once typing is over; a broken address is refused aloud.
test("a layer's address and proxy are written, a broken address refused", async ({ page }) => {
  const panel = await openConnection(page);
  const address = panel.getByLabel("URL");
  let asked = sent(page);
  await address.fill("https://other.example/{z}/{x}/{y}.jpg");
  await address.blur();
  expect(await asked).toMatchObject({ layer, address: "https://other.example/{z}/{x}/{y}.jpg" });

  asked = sent(page);
  await address.fill("https://other.example/{z}/{x}.jpg");
  await address.blur();
  expect(await asked).toMatchObject({ address: "https://other.example/{z}/{x}.jpg" });
  await expect(page.getByText("Missing {x}, {y}")).toBeVisible();

  asked = sent(page);
  const proxy = panel.getByLabel("Proxy");
  await proxy.fill("https://proxy.example/proxy.ashx");
  await proxy.blur();
  expect(await asked).toMatchObject({ layer, proxy: "https://proxy.example/proxy.ashx" });
});
