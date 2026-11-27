import { test, expect } from "@playwright/test";
import { editTab } from "./phone.mjs";
import { mockCloud, recordCoreAsks, recordCoreCalls } from "./mock-cloud.mjs";

const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";

// 207 Edit layer's options were missing on the site; the core lists them, the signs' key included
test("Edit layer's options list the traffic signs and their key, and a switch is written by the core", async ({
  page,
}) => {
  const calls = await recordCoreCalls(page, ["riki_layer_options", "riki_road_signs"]);
  const asks = await recordCoreAsks(page);
  const cloud = await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await editTab(page, "Layers");
  const row = page.locator("#editBody .layer-item", { has: page.locator("input[value='Trails']") });
  await row.getByRole("button", { name: "Options" }).click();
  const panel = page.locator("[data-options='L1']");
  await expect(panel.locator("[data-sign='sk.ts.202']")).toContainText("Stop");
  await expect(panel.getByRole("button", { name: "Slovakia" })).toHaveAttribute("aria-pressed", "true");
  const listed = (await calls()).find((each) => each.call === "riki_layer_options");
  expect(listed.request).toMatchObject({ id: TATRAS, keys: {} });
  await panel.getByRole("switch", { name: "Signs by the road" }).click();
  await expect.poll(() => cloud.asked.filter((each) => each.endpoint === "records/modify").length).toBe(1);
  expect((await asks()).at(-1).edit).toEqual({ roadSigns: "0" });
});
