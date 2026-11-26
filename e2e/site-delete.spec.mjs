import { test, expect } from "@playwright/test";
import { editTab } from "./phone.mjs";
import { loadAccount, mockCloud, recordCoreCalls } from "./mock-cloud.mjs";

const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";

// 200 Delete was offered where riki_switches said who loses the map, then said "The site cannot do this yet"
test("Edit map's Delete removes the map's records from iCloud once its name is typed", async ({ page }) => {
  const { core } = await loadAccount();
  const calls = await recordCoreCalls(page, ["riki_delete"]);
  const cloud = await mockCloud(page, {
    signedIn: true,
    answers: { ...core, riki_switches: { ...core.riki_switches, deletion: "onlyYou" } },
  });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await editTab(page, "General");
  await page.locator("#deleteMap-edit").click();
  await page.locator("#deleteMap-edit-name").fill("High Tatras");
  await page.locator("#deleteMap-edit-yes").click();
  await expect.poll(() => cloud.record("own-tatras")).toBeUndefined();
  expect(cloud.record("own-tatras-layer")).toBeUndefined();
  expect(cloud.record("own-beskydy")).toBeDefined();
  const [call] = await calls();
  expect(call.request).toMatchObject({ id: TATRAS, name: "High Tatras" });
  const modify = cloud.asked.find((each) => each.endpoint === "records/modify");
  expect(modify.body.operations.map((each) => each.operationType)).toEqual(["delete", "delete"]);
  expect(modify.body.operations.every((each) => each.record.recordChangeTag)).toBe(true);
  await expect(page).toHaveURL(/\/maps#?/);
});

// 200 a map shared alone takes its share's zone with it, as the app's Delete does
test("Delete removes a shared map's zone whole, which ends its share", async ({ page }) => {
  const { core, zones } = await loadAccount();
  const shareZone = zones.find((each) => each.zoneID.zoneName.includes(".share.")).zoneID.zoneName;
  const cloud = await mockCloud(page, {
    signedIn: true,
    answers: {
      ...core,
      riki_switches: { ...core.riki_switches, deletion: "everyone" },
      riki_delete: { reach: "everyone", database: "private", zone: shareZone, remove: [], removeZones: [shareZone] },
    },
  });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await editTab(page, "General");
  await page.locator("#deleteMap-edit").click();
  await page.locator("#deleteMap-edit-name").fill("High Tatras");
  await page.locator("#deleteMap-edit-yes").click();
  await expect.poll(() => cloud.asked.some((each) => each.endpoint === "zones/modify")).toBe(true);
  const deleted = cloud.asked.find((each) => each.endpoint === "zones/modify");
  expect(deleted.database).toBe("private");
  expect(deleted.body.operations).toEqual([{ operationType: "delete", zone: { zoneID: { zoneName: shareZone } } }]);
  expect(cloud.asked.some((each) => each.endpoint === "records/modify")).toBe(false);
  await expect(page).toHaveURL(/\/maps#?/);
});
