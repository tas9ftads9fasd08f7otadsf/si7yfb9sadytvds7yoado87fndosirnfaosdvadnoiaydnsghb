import { test, expect } from "@playwright/test";
import { editTab } from "./phone.mjs";
import { mockCloud, recordCoreCalls } from "./mock-cloud.mjs";

// 175 Edit map on the site had no Availability: switches answered "comes with step 4"
test("Edit map's General tab shows Availability as the core's riki_switches reads the open map", async ({ page }) => {
  await mockCloud(page, { signedIn: true });
  const calls = await recordCoreCalls(page, ["riki_switches"]);
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  await editTab(page, "General");
  const availability = page.locator("#availability");
  await expect(availability.locator("[data-switch=picker]").getByRole("switch")).toBeChecked();
  await expect(availability.locator("[data-switch=legend]").getByRole("switch")).toBeEnabled();
  const asked = (await calls()).find((each) => each.call === "riki_switches");
  expect(asked.request.id).toBe("6F1E2A10-0000-4000-8000-000000000001");
  expect(asked.request.rows.length).toBeGreaterThan(0);
});
