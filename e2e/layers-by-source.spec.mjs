import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => {
  await reset(request);
  await phone(request, "ski-and-rail");
});

const SKI = "6F1E2A10-0000-4000-8000-0000000000F1";
const RAIL = "6F1E2A10-0000-4000-8000-0000000000F2";
const PACKAGES = '[data-origin="kind:Riki Maps package"]';

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

async function openGrouped(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#availability").waitFor();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator("#groupBySource").getByRole("switch").click();
  await expect(page.locator(PACKAGES)).toBeVisible();
}

// 58: grouped, the list folds under each source, closed until opened, as Edit map's groups.
test("the layers fold under their sources and a group opens and closes", async ({ page }) => {
  await openGrouped(page);
  await expect(page.locator("button.row.origin")).toHaveCount(3);
  await expect(page.locator(PACKAGES)).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(PACKAGES)).toContainText("2 of 2 on");
  await expect(page.locator(`[data-layer="${SKI}"]`)).toHaveCount(0);

  await page.locator(PACKAGES).click();
  await expect(page.locator(`[data-layer="${SKI}"]`)).toBeVisible();
  await expect(page.locator(`[data-layer="${RAIL}"]`)).toBeVisible();
  await expect(page.locator('[data-layer="6F1E2A10-0000-4000-8000-0000000000A1"]')).toHaveCount(0);

  await page.locator(PACKAGES).click();
  await expect(page.locator(`[data-layer="${SKI}"]`)).toHaveCount(0);
});

// 58: a row's switch and its moves still work inside its group, the moves within it alone.
test("a layer is switched and moved within its group", async ({ page }) => {
  await openGrouped(page);
  await page.locator(PACKAGES).click();
  const rail = page.locator(`[data-layer="${RAIL}"]`);
  await expect(rail.getByRole("button", { name: "Move up" })).toBeDisabled();
  await expect(page.locator(`[data-layer="${SKI}"]`).getByRole("button", { name: "Move down" })).toBeDisabled();

  let asked = sent(page);
  await rail.getByRole("switch").click();
  expect((await asked).layer).toBe(RAIL);
  await expect(page.locator(PACKAGES)).toContainText("1 of 2 on");

  asked = sent(page);
  await rail.getByRole("button", { name: "Move down" }).click();
  expect((await asked).order.split(",").slice(0, 2)).toEqual([SKI, RAIL]);
  await expect(page.locator(`[data-layer="${SKI}"]`).getByRole("button", { name: "Move up" })).toBeDisabled();
});
