import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

const ZBGIS = "0D5E1F00-0000-4000-8000-000000000002";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openGeneral(page) {
  await openViewer(page, `/e/7q4-k29`);
  await page.locator("#railServers").click();
  await page.locator(`[data-server-card='${ZBGIS}']`).getByRole("button", { name: "View ZBGIS" }).click();
  await page.locator("#serverParts").getByRole("tab", { name: "General" }).click();
  return page.locator("#serverGeneral");
}

// 183: as the phone's Look: the name, mark and background are saved on the phone as they are picked.
test("a server's name, icon and background are changed on its General", async ({ page }) => {
  const general = await openGeneral(page);
  const renamed = page.waitForRequest((one) => one.url().includes(`/servers/${ZBGIS}/edit?`));
  await page.locator("#serverName").fill("ZBGIS, Slovakia");
  await page.locator("#serverName").press("Enter");
  expect(new URL((await renamed).url()).searchParams.get("name")).toBe("ZBGIS, Slovakia");
  await expect(page.locator("#serverTitle")).toHaveText("ZBGIS, Slovakia");
  await general.locator("#serverSymbols [data-symbol='globe']").click();
  await expect(general.locator("#serverSymbols [data-symbol='globe']")).toHaveAttribute("aria-pressed", "true");
  await general.locator("#serverTints [data-hex='#B5D8F2']").click();
  await expect(general.locator("#serverTints [data-hex='#B5D8F2']")).toHaveAttribute("aria-pressed", "true");
  await general.locator("#serverLook").screenshot({ path: "test-results/server-look-card.png" });
  await general.locator("#serverTints").getByRole("button", { name: "Auto" }).click();
  await expect(general.locator("#serverTints [data-hex='#B5D8F2']")).toHaveAttribute("aria-pressed", "false");
});

// 183: Duplicate opens the copy, as the phone's does; Delete asks a second press first.
test("Duplicate opens the copy, and Delete server takes a second press", async ({ page }) => {
  await openGeneral(page);
  await page.locator("#duplicateServer").click();
  await expect(page.locator("#serverTitle")).toHaveText("ZBGIS copy");
  await expect(page.locator("#serverParts [aria-selected=true]")).toHaveText("General");
  await page.locator("#deleteServer").click();
  await expect(page.locator("#deleteServer")).toContainText("Tap again to delete");
  await expect(page.locator("#serverTitle")).toHaveText("ZBGIS copy");
  await page.locator("#serverActions").screenshot({ path: "test-results/server-actions.png" });
  await page.locator("#deleteServer").click();
  await expect(page).toHaveURL(/\/servers#/);
  await expect(page.locator("[data-server-card]", { hasText: "ZBGIS copy" })).toHaveCount(0);
  await expect(page.locator(`[data-server-card='${ZBGIS}']`)).toHaveCount(1);
});
