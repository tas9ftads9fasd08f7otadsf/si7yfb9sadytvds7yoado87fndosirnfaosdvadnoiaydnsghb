import { test, expect } from "@playwright/test";
import { loadAccount, mockCloud, recordCoreCalls } from "./mock-cloud.mjs";

// 201 the Maps screen had no sorting or folders on the site; the core arranges, the site saves each map's zone
test("Name Z–A saves the order the core gives, in each map's own zone", async ({ page }) => {
  const { zones } = await loadAccount();
  const shareZone = zones.find((each) => each.zoneID.zoneName.includes(".share.")).zoneID.zoneName;
  const calls = await recordCoreCalls(page, ["riki_shelve"]);
  const cloud = await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#railMaps").click();
  await page.locator("#sortZA").click();
  await expect.poll(() => cloud.record("own-beskydy")?.fields.CD_rank?.value).toBe("b");
  expect(cloud.record("own-tatras")?.fields.CD_rank?.value).toBe("a");
  const [call] = await calls();
  expect(call.request.shelf).toEqual({ sort: "nameDescending" });
  const batches = cloud.asked.filter((each) => each.endpoint === "records/modify");
  expect(batches.map((each) => each.body.zoneID.zoneName)).toEqual(["com.apple.coredata.cloudkit.zone", shareZone]);
  expect(batches.every((each) => each.body.operations.every((op) => op.operationType === "update"))).toBe(true);
});
