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
