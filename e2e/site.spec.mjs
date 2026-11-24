import { test, expect } from "@playwright/test";
import { mockCloud } from "./mock-cloud.mjs";

// 37 the site from its zip, at the root (web) and under /editor/ (web-under-path)
// 76 the page reads iCloud now, so every page here has the mock CloudKit behind it
test.beforeEach(({ page }) => mockCloud(page, { signedIn: true }));

const base = (baseURL) => new URL(baseURL).pathname.replace(/\/$/, "");

test("the page and every file it asks for are served, under the site's own path", async ({ page, baseURL }) => {
  const missing = [];
  page.on("response", (answer) => { if (answer.status() >= 400) missing.push(answer.url()); });
  page.on("requestfailed", (asked) => missing.push(asked.url()));
  await page.goto("./");
  await expect(page.locator("#appName")).toHaveText("Riki Maps");
  const scripts = (await page.locator("script[src]").evaluateAll((all) => all.map((each) => each.getAttribute("src"))))
    .filter((src) => !src.startsWith("https://cdn.apple-cloudkit.com/"));
  expect(scripts.length).toBeGreaterThan(0);
  for (const src of scripts) expect(src.startsWith(`${base(baseURL)}/_next/static/`)).toBe(true);
  expect((await page.content()).includes("__riki_base__")).toBe(false);
  // the words files are made at deploy, so a site without them speaks English
  expect(missing.filter((url) => !/\/words\/\w+\.json$/.test(url))).toEqual([]);
});

// 122 bug: with no icon named, Chrome asked the site for /favicon.ico and logged its 404 on every load
test("the page names its own icon, so the browser asks the site for no favicon", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#appName")).toHaveText("Riki Maps");
  // 131 the icon is now Riki Maps' own, still inline, so the site is still asked for none
  await expect(page.locator('head link[rel="icon"]')).toHaveAttribute("href", /^data:image\/png;base64,/);
  await expect(page.locator("#brand [data-app-icon]")).toBeVisible();
});

// 133 bug: every icon on the site was a grey square, as the site had no pictures for them
test("the site's icons are drawn, none a plain square", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#appName")).toHaveText("Riki Maps");
  const masks = await page.locator("#rail .sym").evaluateAll((all) =>
    all.map((each) => getComputedStyle(each).getPropertyValue("--sym")));
  expect(masks.length).toBeGreaterThan(0);
  for (const mask of masks) expect(mask).toMatch(/^url\("data:image\/svg\+xml/);
});

// 131, 179: a phone is let into the site and offered the app over it
test("a phone is let in and offered the app", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
  const page = await context.newPage();
  await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await expect(page.locator("#appOffer [data-app-icon]")).toBeVisible();
  await expect(page.locator("#openInApp")).toHaveAttribute("href", "rikimaps://open");
  await expect(page.locator("#rail")).toBeVisible();
  await context.close();
});

test("a screen's address opens the page and survives a reload", async ({ page, baseURL }) => {
  await page.goto("./maps/M1/edit/layers");
  await expect(page.locator("#appName")).toHaveText("Riki Maps");
  expect(new URL(page.url()).pathname).toBe(`${base(baseURL)}/maps/M1/edit/layers`);
  await page.reload();
  await expect(page.locator("#appName")).toHaveText("Riki Maps");
  expect(new URL(page.url()).pathname).toBe(`${base(baseURL)}/maps/M1/edit/layers`);
});

test("the rail's links carry the site's path", async ({ page, baseURL }) => {
  await page.goto("./");
  await expect(page.locator("#railMaps")).toHaveAttribute("href", `${base(baseURL)}/maps`);
  await page.locator("#railMaps").click();
  expect(new URL(page.url()).pathname).toBe(`${base(baseURL)}/maps`);
});

test("nothing outside the build is served", async ({ request }) => {
  for (const path of ["site.json", "Site.php", "config.example.php", "index.php/../site.json", "_next/../site.json"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
