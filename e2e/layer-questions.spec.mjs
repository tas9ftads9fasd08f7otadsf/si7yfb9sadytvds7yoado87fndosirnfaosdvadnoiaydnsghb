import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

const layer = "6F1E2A10-0000-4000-8000-00000000009E";

test.beforeEach(async ({ request }) => {
  await reset(request);
  await phone(request, "esri-layer");
});

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

// 3000: the server's answers are one switch; the identify request is sent once typed.
test("an Esri layer's Questions are set from its Options", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  const row = page.locator("#editBody .row", { has: page.locator("input[value='Bedrock']") });
  await row.getByRole("button", { name: "Options" }).click();
  const panel = page.locator(`[data-options='${layer}']`);

  let asked = sent(page);
  await panel.getByRole("switch", { name: "Answer taps from the server" }).click({ force: true });
  expect(await asked).toMatchObject({ layer, answersFromServer: "0" });
  await expect(panel.getByRole("switch", { name: "Answer taps from the server" })).not.toBeChecked();

  asked = sent(page);
  const field = panel.getByRole("textbox", { name: "Identify request" });
  await field.fill("https://gis.example/identify?x={lon}");
  await field.press("Enter");
  expect(await asked).toMatchObject({ layer, identifyRequest: "https://gis.example/identify?x={lon}" });
  await expect(panel.getByRole("textbox", { name: "Identify request" }))
    .toHaveValue("https://gis.example/identify?x={lon}");
});
