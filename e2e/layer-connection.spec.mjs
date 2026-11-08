import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

const layer = "6F1E2A10-0000-4000-8000-0000000000C1";

test.beforeEach(async ({ request }) => {
  await reset(request);
  await phone(request, "network-tiles");
});

async function openConnection(page) {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  const row = page.locator("#editBody .row", { has: page.locator("input[value='Aerial']") });
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
  await panel.getByRole("switch", { name: "Map tiles" }).first().click({ force: true });
  expect(await asked).toMatchObject({ layer, connection: "wifi", group: "layerTiles", allowed: "0" });
  await expect(panel.getByRole("switch", { name: "Map tiles" }).first()).not.toBeChecked();

  asked = sent(page);
  await panel.getByRole("switch", { name: "Override Settings" }).click({ force: true });
  expect(await asked).toMatchObject({ layer, connectionOverride: "1" });
  await expect(panel.locator("[data-locked]")).toHaveCount(0);
});

// 2999: offline download is one switch with the layer.
test("a layer's offline download is switched off", async ({ page }) => {
  const panel = await openConnection(page);
  const asked = sent(page);
  await panel.getByRole("switch", { name: "Allow offline download" }).click({ force: true });
  expect(await asked).toMatchObject({ layer, offlineDownload: "0" });
  await expect(panel.getByRole("switch", { name: "Allow offline download" })).not.toBeChecked();
});
