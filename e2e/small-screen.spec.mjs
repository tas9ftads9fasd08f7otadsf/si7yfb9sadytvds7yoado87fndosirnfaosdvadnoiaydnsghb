import { test, expect } from "@playwright/test";
import { phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

for (const [what, size] of [["a phone", { width: 390, height: 844 }], ["a tablet upright", { width: 820, height: 1180 }],
  ["a short window", { width: 1280, height: 420 }]]) {
  test(`${what} is told to use the app, and is not counted`, async ({ page, request }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.locator("#small")).toBeVisible();
    await expect(page.locator("#smallTitle")).toHaveText("Made for a computer's screen");
    await expect(page.locator("#smallText")).toContainText("not supported");
    await expect(page.locator("#smallText")).toContainText("Riki Maps");
    await expect(page.locator("#top")).toBeHidden();
    await expect(page.locator("#side")).toBeHidden();
    expect((await phone(request, "guests")).guests).toHaveLength(0);
  });
}

test("a window made wide enough drops the notice and joins", async ({ page, request }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto("/");
  await expect(page.locator("#small")).toBeVisible();
  await page.setViewportSize({ width: 1300, height: 850 });
  await expect(page.locator("#small")).toBeHidden();
  await page.locator("#current .hero").waitFor();
  await expect.poll(async () => (await phone(request, "guests")).viewers).toBe(1);
});

// 131: the notice wears the app's icon and, on an iPhone, opens the app.
test("an iPhone is offered the app under its icon", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("#small [data-app-icon]")).toBeVisible();
  await expect(page.locator("#openInApp")).toHaveAttribute("href", "rikimaps://open");
  await expect(page.locator("#openInApp")).toHaveText("Open Riki Maps");
  await context.close();
});

test("a small window on a computer is not offered the app", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto("/");
  await expect(page.locator("#small")).toBeVisible();
  await expect(page.locator("#openInApp")).toHaveCount(0);
});

// 131: debug=1 lets a phone-sized window in, the next visit too, until debug=0.
test("debug=1 lets a small window in for a day, and debug=0 ends it", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?debug=1");
  await expect(page.locator("#small")).toBeHidden();
  await page.locator("#current .hero").waitFor();
  await expect.poll(async () => (await phone(request, "guests")).viewers).toBe(1);
  await page.goto("/");
  await expect(page.locator("#small")).toBeHidden();
  await expect(page.locator("#top")).toBeVisible();
  await page.goto("/?debug=0");
  await expect(page.locator("#small")).toBeVisible();
});
