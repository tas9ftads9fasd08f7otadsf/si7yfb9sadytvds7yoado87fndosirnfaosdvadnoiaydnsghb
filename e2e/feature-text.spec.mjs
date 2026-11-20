import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

const layer = "6F1E2A10-0000-4000-8000-0000000000B7";

test.beforeEach(async ({ request }) => {
  await reset(request);
  await phone(request, "api-points");
});

async function openFeatures(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  const row = page.locator("#editBody .layer-item", { has: page.locator("input[value='Buses']") });
  await row.getByRole("button", { name: "Options" }).click();
  return page.locator(`[data-options='${layer}']`);
}

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

// 70: the text above and inside each point is a template the phone writes as Edit layer does.
test("an API layer's point text is set from its Options", async ({ page }) => {
  const panel = await openFeatures(page);
  const above = panel.getByRole("combobox", { name: "Text above points" });
  let asked = sent(page);
  await above.fill("{line}");
  await above.press("Enter");
  expect(await asked).toMatchObject({ layer, pointLabel: "{line}" });
  await expect(panel.getByRole("combobox", { name: "Text above points" })).toHaveValue("{line}");

  const inside = panel.getByRole("combobox", { name: "Text inside points" });
  asked = sent(page);
  await inside.fill("{status}");
  await inside.press("Enter");
  expect(await asked).toMatchObject({ layer, pointInnerText: "{status}" });
});

// 70: the colour is read off a key, the key changed, then by value with an Otherwise colour.
test("an API layer's colour is read from a key", async ({ page }) => {
  const panel = await openFeatures(page);

  let asked = sent(page);
  await panel.getByRole("combobox", { name: "Colour", exact: true }).selectOption("fromKey");
  expect(await asked).toMatchObject({ layer, colourMode: "fromKey" });
  const key = panel.getByRole("combobox", { name: "Colour key" });
  await expect(key).toHaveValue("{colour}");

  asked = sent(page);
  await key.fill("{status}");
  await key.press("Enter");
  expect(await asked).toMatchObject({ layer, colourKey: "{status}" });
  await expect(panel.getByRole("combobox", { name: "Colour key" })).toHaveValue("{status}");

  asked = sent(page);
  await panel.getByRole("combobox", { name: "Colour", exact: true }).selectOption("byValue");
  expect(await asked).toMatchObject({ colourMode: "byValue" });
  await expect(panel.getByRole("combobox", { name: "Value key" })).toHaveValue("{status}");
  await expect(panel.getByRole("group", { name: "Otherwise" })).toBeVisible();
});
