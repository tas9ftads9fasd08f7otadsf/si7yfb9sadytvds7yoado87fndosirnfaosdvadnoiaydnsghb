import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openPackages(page) {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
  await expect(page.locator("#packages")).toBeVisible();
}

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

const row = (page, overlay) => page.locator(`#packages [data-overlay=${overlay}]`);

// 2959: a map with no package opens on the base map's parts, as the phone's picker does.
test("Add layer lists the phone's packages and adds the ticked ones", async ({ page }) => {
  await openPackages(page);
  await expect(row(page, "landscape")).toHaveAttribute("aria-pressed", "true");
  await expect(row(page, "roads")).toHaveAttribute("aria-pressed", "true");
  await expect(row(page, "contours")).toContainText("Not downloaded yet");
  await expect(page.locator("#packages .row.dimmed")).toContainText("The routing network");

  await row(page, "roads").click();
  await row(page, "contours").click();
  const asked = sent(page);
  await page.locator("#addPackages").click();
  expect((await asked).addPackages.split(",").sort()).toEqual(["contours", "landscape"]);
  await expect(page.locator("#packages")).toHaveCount(0);
  await expect(page.locator("#editBody input[value=Contours]")).toHaveCount(1);
  await expect(page.locator("#editBody input[value=Landscape]")).toHaveCount(1);
});

// 2953: one level, no base map; a drawn package cannot be ticked again.
test("the parts sit on one level, and a drawn package stays off", async ({ page }) => {
  await openPackages(page);
  await expect(row(page, "cartography")).toHaveCount(0);
  await expect(page.locator("#packages .row.part")).toHaveCount(0);
  const asked = sent(page);
  await page.locator("#addPackages").click();
  expect((await asked).addPackages.split(",").sort()).toEqual(["landscape", "roads"]);

  await page.locator("#addLayer").click();
  await expect(row(page, "roads")).toBeDisabled();
  await expect(row(page, "roads")).toContainText("Already in this map");
});

// 2959: as Edit layer asks; dismissed, nothing is sent.
test("a layer is deleted once the question is answered", async ({ page }) => {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  const huts = page.locator("#editBody .row", { has: page.locator("input[value=Huts]") });
  let asked = 0;
  page.on("request", (request) => { if (request.url().includes("removeLayer")) asked += 1; });

  page.once("dialog", (dialog) => { expect(dialog.message()).toBe("Remove Huts?"); dialog.dismiss(); });
  await huts.getByRole("button", { name: "Delete layer" }).click();
  expect(asked).toBe(0);

  const removing = sent(page);
  page.once("dialog", (dialog) => dialog.accept());
  await huts.getByRole("button", { name: "Delete layer" }).click();
  expect((await removing).removeLayer).toBe("6F1E2A10-0000-4000-8000-0000000000A2");
  await expect(page.locator("#editBody input[value=Huts]")).toHaveCount(0);
});
