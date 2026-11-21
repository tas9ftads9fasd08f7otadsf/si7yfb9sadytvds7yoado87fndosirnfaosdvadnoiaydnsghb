import { test, expect } from "@playwright/test";
import { editTab, openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const layerItem = (page, name) => page.locator("#editBody .layer-item").filter({ has: page.getByRole("switch", { name }) });

async function openData(page, tab) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#railData").click();
  await page.getByRole("tab", { name: new RegExp(tab) }).click();
  await expect(page.getByRole("table")).toBeVisible();
}

// 141: W4's Layers table has a Size column, with what the phone holds of each layer it measured.
test("Data's Layers table has a Size column with each layer's size", async ({ page }) => {
  await openData(page, "Layers");
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "Size" })).toBeVisible();
  await expect(table.getByRole("row", { name: /Trails/ }).getByRole("cell").nth(3)).toHaveText("263 MB");
  await expect(table.getByRole("row", { name: /Huts/ }).getByRole("cell").nth(3)).toHaveText("");
  await expect(table.getByRole("row", { name: /Streets/ }).getByRole("cell").nth(3)).toHaveText("");
});

// 141: W4's Regions table: the drawn region's size beside "On the phone", none for a region still to download.
test("Data's Regions table has a Size column beside On the phone", async ({ page }) => {
  await openData(page, "Regions");
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "Size" })).toBeVisible();
  const drawn = table.getByRole("row", { name: /Vysoké Tatry/ });
  await expect(drawn).toContainText("412 MB");
  await expect(drawn).toContainText("On the phone");
  await expect(table.getByRole("row", { name: /Prešovský kraj/ })).not.toContainText("MB");
});

// 141: W5's layer rows say the size beside the kind, and the kind alone for a layer the phone has no size for.
test("Edit map's layers say the size beside the kind", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  await expect(layerItem(page, "Trails").locator(".words small").first()).toHaveText("Vector tiles · 263 MB");
  await expect(layerItem(page, "Huts").locator(".words small").first()).toHaveText("Points");
});

// 141: W9's regions table in Edit map's Offline tab.
test("Edit map's Offline regions say what the phone holds of a drawn region", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await editTab(page, "Offline");
  const drawn = page.locator('#mapRegions [data-region="vysoke_tatry"]');
  await expect(drawn).toContainText("412 MB");
  await expect(drawn).toContainText("On the phone");
  await expect(page.locator('#mapRegions [data-region="presovsky"]')).not.toContainText("MB");
});

// 141: an older phone sends no sizes; the page keeps "On the phone" and shows no size and no Size column.
test("an older phone's tables keep On the phone and show no size", async ({ page, request }) => {
  await phone(request, "sizes", { off: "1" });
  await openData(page, "Regions");
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "Size" })).toHaveCount(0);
  await expect(table.getByRole("row", { name: /Vysoké Tatry/ })).toContainText("On the phone");
  await expect(table).not.toContainText("MB");
  await page.getByRole("tab", { name: /Layers/ }).click();
  await expect(page.getByRole("table").getByRole("columnheader", { name: "Size" })).toHaveCount(0);
  await expect(page.getByRole("table")).not.toContainText("MB");
  await page.locator("#railMap").click();
  await page.locator("#editButton").click();
  await expect(layerItem(page, "Trails").locator(".words small").first()).toHaveText("Vector tiles");
  await editTab(page, "Offline");
  await expect(page.locator('#mapRegions [data-region="vysoke_tatry"]')).not.toContainText("MB");
});
