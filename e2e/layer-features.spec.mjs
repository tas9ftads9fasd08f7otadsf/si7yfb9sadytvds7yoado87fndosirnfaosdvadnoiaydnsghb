import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

const layer = "6F1E2A10-0000-4000-8000-0000000000D1";

test.beforeEach(async ({ request }) => {
  await reset(request);
  await phone(request, "drawn-file");
});

async function openFeatures(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  const row = page.locator("#editBody .row", { has: page.locator("input[value='Trails']") });
  await row.getByRole("button", { name: "Options" }).click();
  return page.locator(`[data-options='${layer}']`);
}

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

// 2998: the line width is a slider sent once it is let go; switches go with the layer.
test("a drawn file's line width and switches are set from its Options", async ({ page }) => {
  const panel = await openFeatures(page);
  const width = panel.getByRole("slider", { name: "Line width" });
  await expect(width).toHaveValue("1");
  await expect(panel).toContainText("Hairline");

  let asked = sent(page);
  await width.fill("2.5");
  expect(await asked).toMatchObject({ layer, lineWidth: "2.5" });
  await expect(panel.getByRole("slider", { name: "Line width" })).toHaveValue("2.5");

  asked = sent(page);
  await panel.getByRole("switch", { name: "Group features by name" }).click({ force: true });
  expect(await asked).toMatchObject({ layer, grouping: "1" });
  await expect(panel.getByRole("switch", { name: "Group features by name" })).toBeChecked();
});

// 2998: each value is drawn or left out, coloured on its own, and all flipped at once.
test("a drawn file is narrowed to some of its values", async ({ page }) => {
  const panel = await openFeatures(page);
  await expect(panel).toContainText("Colour by Kind");

  let asked = sent(page);
  await panel.getByRole("switch", { name: "Skiing" }).click({ force: true });
  expect(await asked).toMatchObject({ layer, valueShown: "Skiing", valueOn: "0" });
  await expect(panel.getByRole("switch", { name: "Skiing" })).not.toBeChecked();
  await expect(panel.getByRole("button", { name: "All" })).toBeVisible();

  asked = sent(page);
  await panel.getByRole("button", { name: "All" }).click();
  expect(await asked).toMatchObject({ layer, allValuesShown: "1" });
  await expect(panel.getByRole("switch", { name: "Skiing" })).toBeChecked();

  asked = sent(page);
  await panel.getByLabel("Hiking", { exact: true }).and(page.locator("input[type=color]")).fill("#2e9e5b");
  expect(await asked).toMatchObject({ layer, valueTint: "Hiking", ink: "#2E9E5B" });
  await expect(panel.locator("input[type=color][aria-label='Hiking']")).toHaveValue("#2e9e5b");
});

// 48 bug: each change emptied the options until the phone was read again, so the open panel and
// its Options button blinked out, and a click made in that gap was lost.
test("an open Options panel stays in place while the phone's list is read again", async ({ page }) => {
  const panel = await openFeatures(page);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let reads = 0;
  await page.route("**/layer-options", async (route) => {
    reads += 1;
    await gate;
    await route.continue();
  });
  const asked = sent(page);
  await panel.getByRole("switch", { name: "Group features by name" }).click({ force: true });
  await asked;
  await expect.poll(() => reads).toBe(1);
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("slider", { name: "Line width" })).toBeVisible();
  const row = page.locator("#editBody .row", { has: page.locator("input[value='Trails']") });
  await expect(row.getByRole("button", { name: "Options" })).toBeVisible();
  release();
  await expect(panel.getByRole("switch", { name: "Group features by name" })).toBeChecked();
});
