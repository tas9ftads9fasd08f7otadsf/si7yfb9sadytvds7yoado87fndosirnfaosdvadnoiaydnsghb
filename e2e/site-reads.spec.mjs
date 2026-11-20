import { test, expect } from "@playwright/test";
import { mockCloud } from "./mock-cloud.mjs";

// 76 the site reads iCloud: sign-in, the Maps screen, and a change another device made
const base = (baseURL) => new URL(baseURL).pathname.replace(/\/$/, "");

test("signed out, the site asks for an Apple Account and shows the maps after signing in", async ({ page }) => {
  await mockCloud(page);
  await page.goto("./");
  await expect(page.locator("#gate")).toBeVisible();
  await expect(page.locator("#gateTitle")).toHaveText("Sign in to iCloud");
  // 134 signed out, the editor is not seen behind the gate
  await expect(page.locator("#gate")).toHaveClass(/closed/);
  await page.locator("#signIn button").click();
  await expect(page.locator("#gate")).toBeHidden();
  await expect(page.locator("#device")).toContainText("Riki Tester");
  await expect(page.locator("#account button")).toHaveText("Sign out");
  await page.locator("#railMaps").click();
  await expect(page.locator("#others")).toContainText("Doprava");
  await expect(page.locator("#current")).toContainText("High Tatras");
});

test("a signed-in person sees the own and the shared map, and stays signed in over a reload", async ({ page }) => {
  await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await expect(page.locator("#gate")).toBeHidden();
  await page.reload();
  await page.locator("#current .hero").waitFor();
  await page.locator("#railMaps").click();
  await expect(page.locator("#others")).toContainText("Doprava");
});

test("the page asks CloudKit with the site's token for the mirror zone and the shared zone", async ({ page }) => {
  const cloud = await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  const zones = cloud.asked.filter((each) => each.endpoint === "changes/zone")
    .map((each) => `${each.database}:${each.body.zones[0].zoneID.zoneName}`);
  expect(zones).toEqual(expect.arrayContaining(["private:com.apple.coredata.cloudkit.zone", "shared:share-doprava"]));
  expect(new Set(cloud.asked.map((each) => each.token))).toEqual(new Set(["test-token"]));
});

// 76 a push reads the zone again from the token it kept, not from the start
test("a change another device made is read again from the zone's token when CloudKit says so", async ({ page }) => {
  const cloud = await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  cloud.change("own-tatras", { CD_name: { value: "High Tatras 2", type: "STRING" } });
  await cloud.push();
  await expect.poll(() => cloud.asked.filter((each) => each.endpoint === "changes/zone" && each.database === "private"
    && each.body.zones[0].syncToken === "private-1").length).toBeGreaterThan(0);
});

test("signing out brings the sign-in back", async ({ page }) => {
  await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#account button").click();
  await expect(page.locator("#gate")).toBeVisible();
  await expect(page.locator("#signIn button")).toHaveText("Sign in with Apple");
});

test("nothing of the site's reading asks the page's own origin for the phone's API", async ({ page, baseURL }) => {
  await mockCloud(page, { signedIn: true });
  const asked = [];
  page.on("request", (request) => asked.push(new URL(request.url()).pathname));
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  expect(asked.filter((path) => path.includes("/riki/v1") || path.includes("/web/session"))).toEqual([]);
  expect(asked).toContain(`${base(baseURL)}/riki-core.wasm`);
  expect(asked).toContain(`${base(baseURL)}/config.json`);
});

// 137 bug: the loading screen said only that it loads, so a long first read looked stuck
test("while the first read lasts, the loading screen says what it has read so far", async ({ page }) => {
  await mockCloud(page, { signedIn: true });
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route(/\/changes\/zone/, async (route) => { await held; await route.fallback(); });
  await page.goto("./");
  await expect(page.locator("#bootSteps li.done")).toContainText("Map engine");
  await expect(page.locator("#bootSteps")).toContainText(/iCloud zones: 0 of \d/);
  release();
  await expect(page.locator("#boot")).toBeHidden();
  await page.locator("#current .hero").waitFor();
});
