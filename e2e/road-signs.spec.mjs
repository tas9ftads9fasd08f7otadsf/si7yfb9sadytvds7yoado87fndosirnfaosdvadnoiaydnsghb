import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

const roads = "6F1E2A10-0000-4000-8000-0000000000B7";

test.beforeEach(async ({ request }) => {
  await reset(request);
  await phone(request, "roads-layer");
});

async function openRoads(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  const row = page.locator("#editBody .layer-item", { has: page.locator("input[value='Roads']") });
  await row.getByRole("button", { name: "Options" }).click();
  return page.locator(`[data-options='${roads}']`);
}

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

// 69: the key lists one country's signs, drawn by the phone; another is found by name and picked.
test("the signs' key shows one country at a time, found by its name", async ({ page, request }) => {
  const panel = await openRoads(page);
  await expect(panel.locator("[data-sign='sk.ts.202']")).toContainText("Stop");
  await expect(panel.getByRole("button", { name: "Slovakia" })).toHaveAttribute("aria-pressed", "true");
  const picture = await page.request.get("/web/icons/sk.ts.202");
  expect(picture.headers()["content-type"]).toBe("image/png");

  await panel.getByLabel("Search countries").fill("aus");
  await expect(panel.getByRole("button", { name: "Slovakia" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Austria" }).click();
  await expect(panel.locator("[data-sign='at.ts.1']")).toContainText("Vorrang geben");
  await expect(panel.locator("[data-sign='sk.ts.202']")).toHaveCount(0);
  const asked = await (await request.get("/__test/signs-asked")).json();
  expect(asked.at(-1)).toMatchObject({ country: "at", q: "aus" });
});

// 69: switching the signs off takes the key away, as the phone's panel folds it.
test("the key goes with the signs", async ({ page }) => {
  const panel = await openRoads(page);
  await expect(panel.getByLabel("Search countries")).toBeVisible();
  const asked = sent(page);
  await panel.getByRole("switch", { name: "Signs by the road" }).click();
  expect(await asked).toMatchObject({ roadSigns: "0" });
  await expect(panel.getByLabel("Search countries")).toHaveCount(0);
});

// 69: road numbers are the phone's, for every map, and sent without a layer.
test("road numbers are set for the phone", async ({ page }) => {
  const panel = await openRoads(page);
  const asked = sent(page);
  await panel.getByLabel("Road numbers").selectOption("classic");
  const query = await asked;
  expect(query).toMatchObject({ roadShields: "classic" });
  expect(query.layer).toBeUndefined();
  await expect(panel.getByLabel("Road numbers")).toHaveValue("classic");
});
