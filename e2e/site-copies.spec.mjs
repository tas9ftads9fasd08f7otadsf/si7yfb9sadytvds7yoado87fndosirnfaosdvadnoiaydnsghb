import { test, expect } from "@playwright/test";
import { addFrom } from "./phone.mjs";
import { loadAccount, mockCloud, recordCoreAsks, recordCoreCalls } from "./mock-cloud.mjs";

const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";

// 203 From your maps was missing on the site; the core lists the other maps' layers and copies the ticked ones
test("Add layer copies a layer ticked under another of the person's maps", async ({ page }) => {
  const { core } = await loadAccount();
  const ridges = core.riki_copies.groups[0].rows[0].layer;
  const calls = await recordCoreCalls(page, ["riki_copies"]);
  const asks = await recordCoreAsks(page);
  const cloud = await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
  await addFrom(page, "copy");
  await page.locator(`[data-copy-layer="${ridges}"]`).click();
  await page.locator("#addCopies").click();
  await expect.poll(() => cloud.asked.filter((each) => each.endpoint === "records/modify").length).toBe(1);
  const [listing, copying] = await calls();
  expect(listing.request).toMatchObject({ id: TATRAS });
  expect(listing.request.layers).toBeUndefined();
  expect(copying.request).toMatchObject({ id: TATRAS, layers: [ridges] });
  const [apply] = await asks();
  expect(apply.layers).toEqual(core.riki_copies.layers);
});
