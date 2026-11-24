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

const OSM = "0D5E1F00-0000-4000-8000-000000000001";

// 187: as the phone's server form: the address, kind, headers and login are sent together and read first.
test("a server's address, headers and login are changed on its General", async ({ page }) => {
  await openViewer(page, `/e/7q4-k29`);
  await page.locator("#railServers").click();
  await page.locator(`[data-server-card='${OSM}']`).getByRole("button", { name: "View OpenTopoMap" }).click();
  await page.locator("#serverParts").getByRole("tab", { name: "General" }).click();
  const form = page.locator("#serverForm");
  await expect(form.locator("#serverFormKind")).toHaveValue("tiles");
  await expect(page.locator("#serverHeaders [data-header='X-Api-Key']")).toContainText("Saved on this device");
  await expect(page.locator("#serverFormSave")).toBeDisabled();
  await form.locator("#serverFormAddress").fill("https://silent.test/{z}/{x}/{y}.png");
  await page.locator("#serverFormSave").click();
  await expect(page.getByText("Server replied 404")).toBeVisible();
  await form.locator("#serverFormAddress").fill("https://tiles.example.org/{z}/{x}/{y}.png");
  await page.locator("#serverHeaderName").fill("Authorization");
  await page.locator("#serverHeaderValue").fill("Bearer s3cret");
  await page.locator("#serverHeaderAdd").click();
  await page.locator("#serverLogin").getByRole("switch").click();
  await page.locator("#serverCookieAge").selectOption("600");
  const saved = page.waitForRequest((one) => one.url().includes(`/servers/${OSM}/form?`));
  await page.locator("#serverFormSave").click();
  const asked = new URL((await saved).url()).searchParams;
  expect(asked.get("address")).toBe("https://tiles.example.org/{z}/{x}/{y}.png");
  expect(JSON.parse(asked.get("headers"))).toEqual([{ name: "X-Api-Key" }, { name: "Authorization", value: "Bearer s3cret" }]);
  expect(JSON.parse(asked.get("login"))).toEqual({ isOn: true, page: "", seconds: 600 });
  await expect(page.locator("#serverHeaders [data-header='Authorization']")).toContainText("Saved on this device");
  await expect(page.locator("#serverHeaders input[type=password]").first()).toHaveValue("");
  await expect(page.locator("#serverFormSave")).toBeDisabled();
  await page.locator("#serverGeneral").screenshot({ path: "test-results/server-form.png" });
});
