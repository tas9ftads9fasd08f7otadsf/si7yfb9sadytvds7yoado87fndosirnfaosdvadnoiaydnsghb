import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openServers(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
  await expect(page.locator("#exportServers")).toBeVisible();
}

// 2997: the phone's servers are saved as a .servson under the name the phone gives.
test("the servers are exported as a .servson", async ({ page }) => {
  await openServers(page);
  const saved = page.waitForEvent("download");
  await page.locator("#exportServers").click();
  const download = await saved;
  expect(download.suggestedFilename()).toBe("Servers.servson");
});

// 2997: only the servers the phone lacks join the list.
test("a .servson adds the servers the phone lacks", async ({ page }) => {
  await openServers(page);
  const file = JSON.stringify({ servers: [{ name: "OpenTopoMap" }, { name: "Basemap.at" }] });
  await page.locator("#serversFile").setInputFiles({ name: "Mine.servson", mimeType: "application/json",
    buffer: Buffer.from(file) });
  await expect(page.locator("[data-server]").filter({ hasText: "Basemap.at" })).toHaveCount(1);
  await expect(page.locator("[data-server]").filter({ hasText: "OpenTopoMap" })).toHaveCount(1);
});

// 2997: a file of no servers says so in the phone's words.
test("a file of no servers is refused", async ({ page }) => {
  await openServers(page);
  await page.locator("#serversFile").setInputFiles({ name: "x.servson", mimeType: "application/json",
    buffer: Buffer.from("{") });
  await expect(page.locator("#notice")).toContainText("holds no Riki Maps servers");
});
