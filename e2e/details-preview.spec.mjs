import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

const layer = "6F1E2A10-0000-4000-8000-0000000000A5";

test.beforeEach(async ({ request }) => {
  await reset(request);
  await phone(request, "laid-out-layer");
});

async function openLayout(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  const row = page.locator("#editBody .row", { has: page.locator("input[value='Trams']") });
  await row.getByRole("button", { name: "Options" }).click();
  return page.locator(`[data-options='${layer}']`);
}

// 79: the layout is drawn filled from a sample point, and Another fills it from the next.
test("the Details editor previews the layout from a sample point", async ({ page, request }) => {
  await phone(request, "layer-samples");
  const panel = await openLayout(page);
  const preview = panel.getByRole("group", { name: "Preview" });
  await expect(preview).toContainText("Line 4 · Feature 1 of 3");
  await expect(preview.locator("b")).toHaveText("Line 4");
  await expect(preview.locator(".feature-note")).toContainText("Detour via Main St");
  await expect(preview).toContainText("30");

  await preview.getByRole("button", { name: "Another" }).click();
  await expect(preview).toContainText("Line 9 · Feature 2 of 3");
  await expect(preview.locator("b")).toHaveText("Line 9");
  // The layout hides an empty note, so this point shows none.
  await expect(preview.locator(".feature-note")).toHaveCount(0);

  const asked = await phone(request, "details-asked");
  expect(asked.at(-1)).toMatchObject({ layer, values: { line: "9", speed: "25" } });
  await panel.screenshot({ path: "test-results/details-preview.png" });
});

// 79: a change to the layout fills the preview again from the same point.
test("removing a block changes the preview at once", async ({ page, request }) => {
  await phone(request, "layer-samples");
  const panel = await openLayout(page);
  const preview = panel.getByRole("group", { name: "Preview" });
  await expect(preview.locator(".feature-note")).toBeVisible();
  await panel.getByRole("button", { name: "Remove Text" }).click();
  await expect(preview.locator(".feature-note")).toHaveCount(0);
  await expect(preview).toContainText("Line 4 · Feature 1 of 3");
});

// 79: a layer with no point yet shows the phone's words and no card.
test("a layer with no sample point shows the phone's note", async ({ page, request }) => {
  await phone(request, "layer-samples", { none: "1" });
  const panel = await openLayout(page);
  const preview = panel.getByRole("group", { name: "Preview" });
  await expect(preview).toContainText("Tap a point on the map first");
  await expect(preview.locator(".feature")).toHaveCount(0);
  await expect(preview.getByRole("button", { name: "Another" })).toHaveCount(0);
});

// 79: a phone that sends no sample points gives the editor no preview.
test("a phone that sends no samples gets no preview", async ({ page }) => {
  const panel = await openLayout(page);
  await expect(panel.locator(".layout-block").first()).toBeVisible();
  await expect(panel.getByRole("group", { name: "Preview" })).toHaveCount(0);
});
