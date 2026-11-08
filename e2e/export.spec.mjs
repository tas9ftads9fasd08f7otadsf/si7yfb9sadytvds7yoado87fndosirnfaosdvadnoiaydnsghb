import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// 2961: the phone writes the file; the browser saves it under the phone's name for it.
test("Edit map saves the map as a .mapson file", async ({ page }) => {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  const saved = page.waitForEvent("download");
  await page.locator("#exportMap").click();
  const download = await saved;
  expect(download.suggestedFilename()).toBe("High Tatras.mapson");
  const text = await (await download.createReadStream()).toArray();
  expect(JSON.parse(Buffer.concat(text).toString()).name).toBe("High Tatras");
});
