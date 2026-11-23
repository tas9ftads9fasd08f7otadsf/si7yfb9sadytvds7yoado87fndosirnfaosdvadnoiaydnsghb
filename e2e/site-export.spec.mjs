import { test, expect } from "@playwright/test";
import { editTab } from "./phone.mjs";
import { mockCloud, recordCoreCalls } from "./mock-cloud.mjs";

// 176 Export map said "The site cannot do this yet"; the core writes the file the phone's Share does
test("Edit map saves the iCloud map as the .mapson file the core writes, under its name", async ({ page }) => {
  const calls = await recordCoreCalls(page, ["riki_export"]);
  await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await editTab(page, "General");
  const saved = page.waitForEvent("download");
  await page.locator("#exportMap").click();
  const download = await saved;
  expect(download.suggestedFilename()).toBe("High Tatras.mapson");
  const text = Buffer.concat(await (await download.createReadStream()).toArray()).toString();
  expect(JSON.parse(text)).toMatchObject({ name: "High Tatras", _schemaVersion: 1 });
  const [call] = await calls();
  expect(call.request.id).toBe("6F1E2A10-0000-4000-8000-000000000001");
});
