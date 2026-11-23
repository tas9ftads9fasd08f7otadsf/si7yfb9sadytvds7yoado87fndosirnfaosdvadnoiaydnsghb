import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

const buses = "6F1E2A10-0000-4000-8000-0000000000B7";

test.beforeEach(async ({ request }) => { await reset(request); });

async function open(page, request, query = {}) {
  await phone(request, "api-points");
  await phone(request, "server-look", query);
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await page.locator(`#editBody [data-layer='${buses}']`).getByRole("button", { name: "Options" }).click();
  return page.locator(`[data-options='${buses}']`);
}

// 172: a server look above the one answered is asked about, in a banner naming the parts.
test("the banner names the parts the server changed", async ({ page, request }) => {
  const panel = await open(page, request);
  await expect(panel.getByRole("status")).toContainText("Server update · Map markers and Details changed");
  await expect(panel.getByRole("heading", { name: "Map markers" })).toBeVisible();
});

// 172: Review takes the parts picked, and the banner is gone once the version is answered.
test("Review takes one part and keeps the other", async ({ page, request }) => {
  const panel = await open(page, request);
  await panel.getByRole("button", { name: "Review" }).click();
  await panel.getByRole("radiogroup", { name: "Details" }).getByRole("radio", { name: "Keep mine" }).click();
  const asked = page.waitForRequest((one) => one.url().includes("serverTake"));
  await panel.getByRole("button", { name: "Take version 5" }).click();
  const query = Object.fromEntries(new URL((await asked).url()).searchParams);
  expect(query).toMatchObject({ layer: buses, serverTake: "markers", serverVersion: "5" });
  await expect(panel.getByRole("status")).toHaveCount(0);
  await expect(panel.getByRole("group", { name: "Dot colour" }).locator("[data-hex='#2E9E5B']"))
    .toHaveAttribute("aria-pressed", "true");
});

// 172: Keep mine for now stops the banner for that version.
test("Keep mine for now answers the version and ends the banner", async ({ page, request }) => {
  const panel = await open(page, request);
  await panel.getByRole("button", { name: "Review" }).click();
  await panel.getByRole("button", { name: "Keep mine for now" }).click();
  await expect(panel.getByRole("status")).toHaveCount(0);
  const answers = await phone(request, "server-look-answers");
  expect(answers).toHaveLength(1);
  expect(answers[0]).toMatchObject({ serverKeep: "5" });
});

// 172: a part also changed here starts on Keep mine, so Review never loses it unasked.
test("a part changed here starts on Keep mine", async ({ page, request }) => {
  const panel = await open(page, request, { here: "details" });
  await panel.getByRole("button", { name: "Review" }).click();
  await expect(panel.getByRole("radiogroup", { name: "Details" }).getByRole("radio", { name: "Keep mine" }))
    .toHaveAttribute("aria-checked", "true");
  await expect(panel.getByText("Changed here too")).toBeVisible();
});
