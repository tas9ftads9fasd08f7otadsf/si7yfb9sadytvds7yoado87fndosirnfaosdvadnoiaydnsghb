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

// 199 New map and Import are the site's since riki_new_map and riki_import
test("the Maps screen offers New map and Import but no sorting or Servers, and stays connected", async ({ page }) => {
  await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#railMaps").click();
  await expect(page.locator("#others")).toContainText("Doprava");
  await expect(page.locator("#mapsNew")).toBeVisible();
  await expect(page.locator("#mapsImport")).toBeVisible();
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
  // 3701 the site offers no offline download, so it has no Offline tab
  await expect(page.locator("#editTab-offline")).toHaveCount(0);
  for (const tab of ["General", "Layers"]) {
    await editTab(page, tab);
    // 176 Export map is the site's since riki_export, 198 Duplicate map since riki_duplicate, 202 pictures
    for (const id of ["#coverageBox"]) {
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
