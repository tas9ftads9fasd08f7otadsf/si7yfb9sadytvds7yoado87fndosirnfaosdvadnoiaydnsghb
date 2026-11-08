import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => {
  await reset(request);
  await phone(request, "ski-and-rail");
});

async function openOptions(page, layerName) {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  const row = page.locator("#editBody .row", { has: page.locator(`input[value='${layerName}']`) });
  await row.getByRole("button", { name: "Options" }).click();
  return row;
}

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

// 2960: only a layer with Edit layer panels offers them; plain ones have no button.
test("only the layers with panels offer Options", async ({ page }) => {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.getByRole("button", { name: "Options" })).toHaveCount(2);
});

// 2960: a ski kind switched off is written into every style, and the switch reads it back.
test("a ski kind is switched off in every style", async ({ page }) => {
  await openOptions(page, "Ski & winter");
  const panel = page.locator("[data-options='6F1E2A10-0000-4000-8000-0000000000F1']");
  await expect(panel).toContainText("Pistes, lifts and trails");
  const lifts = panel.getByRole("switch", { name: "Lifts" });
  await expect(lifts).toBeChecked();

  const asked = sent(page);
  await lifts.click({ force: true });
  expect(await asked).toMatchObject({ kindFamily: "ski", kind: "lift", shown: "0" });
  await expect(panel.getByRole("switch", { name: "Lifts" })).not.toBeChecked();
});

// 2960: each style keeps its own railway look; the track marks go in every style at once.
test("the railways look is picked per style and the marks for all", async ({ page }) => {
  await openOptions(page, "Railways");
  const panel = page.locator("[data-options='6F1E2A10-0000-4000-8000-0000000000F2']");
  const winter = panel.getByRole("combobox", { name: "Winter" });
  await expect(winter).toHaveValue("standard");

  let asked = sent(page);
  await winter.selectOption("maxSpeed");
  expect(await asked).toMatchObject({ railVariant: "maxSpeed", railStyle: "6F1E2A10-0000-4000-8000-0000000000B2" });
  await expect(panel.getByRole("combobox", { name: "Winter" })).toHaveValue("maxSpeed");
  await expect(panel.getByRole("combobox", { name: "Summer" })).toHaveValue("standard");

  asked = sent(page);
  await panel.getByRole("switch", { name: "Marks on the track" }).click({ force: true });
  expect((await asked).railMarks).toBe("0");
  await expect(panel.getByRole("switch", { name: "Marks on the track" })).not.toBeChecked();
});

// 2962: a layer's light or dark, colour, switches and label language, sent with the layer.
test("a layer's look is set from its Options", async ({ page }) => {
  await openOptions(page, "Ski & winter");
  const panel = page.locator("[data-options='6F1E2A10-0000-4000-8000-0000000000F1']");
  const layer = "6F1E2A10-0000-4000-8000-0000000000F1";

  let asked = sent(page);
  await panel.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  expect(await asked).toMatchObject({ layer, appearance: "dark" });
  await expect(panel.getByRole("combobox", { name: "Appearance" })).toHaveValue("dark");

  asked = sent(page);
  await panel.locator("[data-hex='#2E9E5B']").click();
  expect(await asked).toMatchObject({ layer, tint: "#2E9E5B" });
  await expect(panel.locator("[data-hex='#2E9E5B']")).toHaveAttribute("aria-pressed", "true");

  asked = sent(page);
  await panel.getByRole("switch", { name: "Icons along its roads and paths" }).click({ force: true });
  expect(await asked).toMatchObject({ layer, routeIcons: "0" });

  asked = sent(page);
  await panel.getByRole("combobox", { name: "Labels" }).selectOption("local");
  expect(await asked).toMatchObject({ layer, labelLanguage: "local" });
  await expect(panel.getByRole("combobox", { name: "Labels" })).toHaveValue("local");
});
