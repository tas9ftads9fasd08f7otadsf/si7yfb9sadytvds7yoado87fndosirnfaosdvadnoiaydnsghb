import { test, expect } from "@playwright/test";
import { editTab } from "./phone.mjs";
import { loadAccount, mockCloud, recordCoreAsks } from "./mock-cloud.mjs";

// 205 Edit map's Esri services were missing on the site; the core lists them, and Forget is the core's edit
test("Edit map lists the map's Esri services and forgets one, keeping its layers", async ({ page }) => {
  const { core } = await loadAccount();
  const hiking = core.riki_esri_services.services[0].id;
  const asks = await recordCoreAsks(page);
  const cloud = await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await editTab(page, "Layers");
  await page.locator(`#esriServices [data-service="${hiking}"]`).click();
  await expect(page.locator("#esriServicePage")).toBeVisible();
  await page.locator("#forgetEsriService").click();
  await expect.poll(() => cloud.asked.filter((each) => each.endpoint === "records/modify").length).toBe(1);
  const [forget] = await asks();
  expect(forget.edit).toEqual({ forgetService: hiking });
});
