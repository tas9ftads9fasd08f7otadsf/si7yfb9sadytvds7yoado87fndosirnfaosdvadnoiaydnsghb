import { test, expect } from "@playwright/test";
import { editTab } from "./phone.mjs";
import { mockCloud, recordCoreCalls } from "./mock-cloud.mjs";

const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";
const COPY_ROW = "C0FFEE00-0000-4000-8000-0000000000A1";
const COPY = "6F1E2A10-0000-4000-8000-0000000000C1";

// 198 Duplicate map said "The site cannot do this yet"; the core makes the copy, the site writes it to iCloud
test("Edit map duplicates the iCloud map into the person's own zone and opens the copy", async ({ page }) => {
  const calls = await recordCoreCalls(page, ["riki_duplicate"]);
  const cloud = await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await editTab(page, "General");
  await page.locator("#duplicateMap").click();
  await expect.poll(() => cloud.record(COPY_ROW)?.fields.CD_name?.value).toBe("High Tatras copy");
  expect(cloud.record(`${COPY_ROW.slice(0, -1)}2`)?.fields.CD_map?.value).toBe(COPY_ROW);
  const [call] = await calls();
  expect(call.request.id).toBe(TATRAS);
  const modify = cloud.asked.find((each) => each.endpoint === "records/modify");
  expect(modify.database).toBe("private");
  expect(modify.body.zoneID.zoneName).toBe("com.apple.coredata.cloudkit.zone");
  // 206 bug: the recorded core lists no copy, so whether its hero showed was a race; the address is the page's
  await expect(page).toHaveURL(new RegExp(`/maps/${COPY}`));
});
