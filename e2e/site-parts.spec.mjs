import { test, expect } from "@playwright/test";
import { editTab } from "./phone.mjs";
import { mockCloud } from "./mock-cloud.mjs";

// 82 the site leaves out what it does not do yet, and never says "Not connected" for it
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sawOffline = false;
    new MutationObserver(() => {
      if (document.querySelector("#offline")) window.sawOffline = true;
    }).observe(document, { childList: true, subtree: true });
  });
});

const stayedConnected = async (page) => {
  await expect(page.locator("#device #deviceDot")).toHaveAttribute("aria-label", "Connected");
  expect(await page.evaluate(() => window.sawOffline)).toBe(false);
};

test("the Maps screen offers no New map, Import, sorting or Servers, and stays connected", async ({ page }) => {
  await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#railMaps").click();
  await expect(page.locator("#others")).toContainText("Doprava");
  await expect(page.locator("#newMap")).toHaveCount(0);
  await expect(page.locator("#sortAZ")).toHaveCount(0);
  await expect(page.locator("#railServers")).toHaveCount(0);
  await expect(page.locator("#serverCards")).toHaveCount(0);
  await stayedConnected(page);
});

test("Edit map offers what the site does and leaves out the rest, staying connected", async ({ page }) => {
  await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  // 94 each tab looked through, as what the site leaves out may sit under any
  await editTab(page, "General");
  await expect(page.getByRole("textbox", { name: "Name" }).first()).toBeVisible();
  for (const tab of ["General", "Offline", "Layers"]) {
    await editTab(page, tab);
    // 176 Export map is the site's since riki_export
    for (const id of ["#duplicateMap", "#coverageBox", "#iconPictureFile", "#takePreview"]) {
      await expect(page.locator(id)).toHaveCount(0);
    }
  }
  // 86 Add layer is there, with the tile address and nothing the site cannot add yet
  await expect(page.locator("#addLayer")).toBeVisible();
  // Long enough for the beat that used to answer "Connected again".
  await page.waitForTimeout(1500);
  await expect(page.locator("#notice")).not.toHaveClass(/shown/);
  await stayedConnected(page);
});
