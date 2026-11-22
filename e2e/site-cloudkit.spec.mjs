import { test, expect } from "@playwright/test";
import { loadAccount, mockCloud } from "./mock-cloud.mjs";

// 87 the site calls CloudKit JS as the library is written: the stand-in keeps the library's shapes and rules
const layerRow = (page, name) => page.locator("#editBody .row").filter({ has: page.getByRole("switch", { name }) });
const modifies = (cloud) => cloud.asked.filter((each) => each.endpoint === "records/modify");

async function openEdit(page) {
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
}

test("the page asks for a zone with its own options, and names the person by discovering them", async ({ page }) => {
  const cloud = await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await expect(page.locator("#device")).toContainText("Riki Tester");
  const reads = cloud.asked.filter((each) => each.endpoint === "changes/zone");
  expect(reads.length).toBeGreaterThan(0);
  expect(reads.every((each) => each.body.zones.every((zone) => zone.zoneID))).toBe(true);
  expect(cloud.asked.find((each) => each.endpoint === "users/discover").body.lookupInfos).toEqual([{ userRecordName: "_me" }]);
});

test("the page saves a database subscription for each database, and is told of a push only then", async ({ page }) => {
  const cloud = await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await expect.poll(() => cloud.subscriptions().sort()).toEqual(["private/riki-site-private", "shared/riki-site-shared"]);
  const saved = cloud.asked.filter((each) => each.endpoint === "subscriptions/modify");
  expect(saved.map((each) => each.body.operations[0].subscription.subscriptionType)).toEqual(["database", "database"]);
  const settings = await page.evaluate(() => window.__mockCloudSettings);
  expect(settings.apnsEnvironment).toBe(settings.environment);
});

test("a zone that is not there yet is no rows and no error", async ({ page }) => {
  const cloud = await mockCloud(page, { signedIn: true });
  cloud.removeZone("private", "com.apple.coredata.cloudkit.zone");
  await page.goto("./");
  await expect(page.locator("#device #deviceDot")).toHaveAttribute("aria-label", "Connected");
  await expect(page.locator("#notice")).not.toHaveClass(/shown/);
});

test("a token the server forgot is dropped and the zone is read again from the start", async ({ page }) => {
  const cloud = await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  cloud.expireTokenNext(1);
  cloud.change("own-tatras", { CD_name: { value: "High Tatras 2", type: "STRING" } });
  await cloud.push();
  await expect(page.locator("#notice")).toHaveText("High Tatras was changed on another device");
  // 87 the notice can come before the read from the start has reached the mock, so the requests are waited for
  // 116 the private database has a share zone beside the mirror zone, so only the mirror zone's reads count
  const tokens = () => cloud.asked.filter((each) => each.endpoint === "changes/zone" && each.database === "private"
    && each.body.zones[0].zoneID.zoneName === "com.apple.coredata.cloudkit.zone").map((each) => each.body.zones[0].syncToken ?? null);
  await expect.poll(() => tokens().slice(-3)).toEqual([expect.any(String), null, expect.any(String)]);
});

test("a sign-in window that failed leaves the sign-in button working", async ({ page }) => {
  await mockCloud(page);
  await page.goto("./");
  await expect(page.locator("#gate")).toBeVisible();
  await page.evaluate(() => window.__mockCloudFailSignIn());
  await page.locator("#signIn .apple-auth-button").click();
  await expect(page.locator("#gate")).toBeHidden();
  await expect(page.locator("#device")).toContainText("Riki Tester");
});

// 161 TestFlight AF8P bug: on a phone the button sat at the card's left, its words past its right edge
test("the Sign in with Apple ID button sits centred in its card, its words in its middle", async ({ page }) => {
  await page.setViewportSize({ width: 428, height: 926 });
  await mockCloud(page);
  await page.goto("./?debug=1");
  const button = page.locator("#signIn .apple-auth-button");
  await expect(button).toBeVisible();
  const [card, box, label] = await Promise.all(["#gate .sheet", "#signIn .apple-auth-button",
    "#signIn .apple-auth-button-text"].map((each) => page.locator(each).boundingBox()));
  expect(Math.abs(box.x + box.width / 2 - (card.x + card.width / 2))).toBeLessThan(1);
  expect(Math.abs(label.x - (box.x + box.width / 2))).toBeLessThan(2);
});

// 134 bug: a refused token left the editor up with a reconnect banner and no way to sign in
test("a token Apple refuses shows why in place of the editor, and is not asked again", async ({ page }) => {
  const cloud = await mockCloud(page, { refusesToken: true });
  await page.goto("./");
  await expect(page.locator("#gateTitle")).toHaveText("iCloud refused this site");
  await expect(page.locator("#gate")).toHaveClass(/closed/);
  await expect(page.locator("#gate")).toHaveCSS("background-color", await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor));
  await expect(page.locator("#offline")).toBeHidden();
  const callers = () => cloud.asked.filter((each) => each.endpoint === "users/caller").length;
  const asked = callers();
  await page.waitForTimeout(6000);
  expect(callers()).toBe(asked);
});

test("rows to save and rows to remove go in one atomic batch, a delete with its change tag", async ({ page }) => {
  const { core } = await loadAccount();
  const cloud = await mockCloud(page, { signedIn: true, answers: { ...core,
    riki_apply: { ...core.riki_apply, write: [], remove: ["own-tatras-layer"] } } });
  await openEdit(page);
  const field = layerRow(page, "Trails").getByRole("textbox", { name: "Rename" });
  await field.fill("Ridges");
  await field.press("Enter");
  await expect.poll(() => modifies(cloud).length).toBe(1);
  const [asked] = modifies(cloud);
  expect(asked.body.atomic).toBe(true);
  expect(asked.body.zoneID.zoneName).toBe("com.apple.coredata.cloudkit.zone");
  expect(asked.body.operations.map((each) => each.operationType)).toEqual(["create", "delete"]);
  expect(asked.body.operations[1].record).toEqual({ recordName: "own-tatras-layer", recordChangeTag: "a2" });
  expect(asked.body.operations.some((each) => each.record.zoneID)).toBe(false);
  expect(cloud.record("own-tatras-layer")).toBeUndefined();
});
