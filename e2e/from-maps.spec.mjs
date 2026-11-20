import { test, expect } from "@playwright/test";
import { addFrom, openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";
const BRATISLAVA = "6F1E2A10-0000-4000-8000-000000000002";
const STREETS = "6F1E2A10-0000-4000-8000-0000000000C1";

async function openCopy(page, map = TATRAS) {
  await openViewer(page, "/e/7q4-k29");
  if (map === TATRAS) await page.locator("#editButton").click();
  else await page.goto(`/maps/${map}/edit/layers`);
  await page.locator("#addLayer").click();
  await addFrom(page, "copy");
  await page.locator("#copySearch, #copyNone").first().waitFor();
}

const layer = (page, id) => page.locator(`[data-copy-layer="${id}"]`);

// 119: the other maps' layers are cards of ticked rows; Add copies them, and they are the map's own.
test("Add layer lists another map's layers and adds the ticked one as a copy", async ({ page, request }) => {
  await openCopy(page);
  await expect(page.locator(`[data-copy-map="${BRATISLAVA}"]`)).toContainText("Bratislava");
  await expect(page.locator("#copyTicked")).toHaveText("Nothing selected");
  await expect(page.locator("#addCopies")).toBeDisabled();
  await layer(page, STREETS).click();
  await expect(layer(page, STREETS)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#addCopies")).toHaveText("Add 1");
  const asked = page.waitForRequest((asking) => asking.url().includes("/add-copies?"));
  await page.locator("#addCopies").click();
  expect(new URL((await asked).url()).searchParams.get("layers")).toBe(STREETS);
  await expect(page.locator("#addLayerDialog")).toHaveCount(0);
  await expect(page.locator("#editBody input[value=Streets]")).toHaveCount(1);
  expect(await phone(request, "copies")).toEqual(["Streets"]);
});

// 119: a layer the map draws is dimmed with its reason; a map with none left is not listed.
test("a layer the map already draws is dimmed with its reason, and its map drops out", async ({ page }) => {
  await openCopy(page);
  await layer(page, STREETS).click();
  await page.locator("#addCopies").click();
  await expect(page.locator("#addLayerDialog")).toHaveCount(0);
  await page.locator("#addLayer").click();
  await addFrom(page, "copy");
  await expect(page.locator("#copyNone")).toHaveText("No other map on this device has a layer to import.");

  await page.goto(`/maps/${BRATISLAVA}/edit/layers`);
  await page.locator("#addLayer").click();
  await addFrom(page, "copy");
  const copied = page.locator(`[data-copy-map="${TATRAS}"] .row.dimmed`, { hasText: "Streets" });
  await expect(copied).toContainText("Already in this map");
  await expect(page.locator(`[data-copy-map="${TATRAS}"] button.row`)).toHaveCount(2);
  await expect(page.locator("#addCopies")).toBeDisabled();
});

// 119: the phone's picker narrows by a map's name or a layer's words.
test("the search narrows the maps and layers, and says when none match", async ({ page }) => {
  await openCopy(page, BRATISLAVA);
  await expect(page.locator("[data-copy-map]")).toHaveCount(1);
  await page.locator("#copySearch").fill("hut");
  await expect(page.locator("[data-copy-layer]")).toHaveCount(1);
  await expect(page.locator("[data-copy-layer]")).toContainText("Huts");
  await page.locator("#copySearch").fill("tatras");
  await expect(page.locator("[data-copy-layer]")).toHaveCount(2);
  await page.locator("#copySearch").fill("volcano");
  await expect(page.locator("#copyNoMatch")).toHaveText("No layer matches “volcano”.");
});

// 119: a locked map's layers wait for Face ID on the phone, so none are shown.
test("a locked map's layers are not offered", async ({ page, request }) => {
  await phone(request, "locked", { map: BRATISLAVA });
  await openCopy(page);
  await expect(page.locator("#copyNone")).toBeVisible();
  await expect(layer(page, STREETS)).toHaveCount(0);
});
