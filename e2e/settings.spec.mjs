import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

// 92 Settings show the phone's QR code; once the phone scans it and says yes, the browser edits
test("Settings' QR code lets the browser edit once the phone says yes", async ({ page, request }) => {
  await openViewer(page);
  await page.locator("#railSettings").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/settings");
  const picture = page.locator("#pairPicture");
  await expect(picture).toBeVisible();
  await expect(page.locator(".pair-code b")).toHaveText(/^[0-9A-F]{4}$/);
  await expect(page.locator("#settings-passwordForm")).toBeVisible();
  await expect.poll(async () => (await phone(request, "pair", { allow: "1" })).id).not.toBeNull();
  await expect(page.locator("#editAllowed")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#railServers")).toBeVisible();
});

// 92 a no from the phone is said on the page, and a new code is shown
test("Settings say when the phone refused, and show a new code", async ({ page, request }) => {
  await openViewer(page);
  await page.locator("#railSettings").click();
  const code = page.locator(".pair-code b");
  await expect(code).toHaveText(/^[0-9A-F]{4}$/);
  const first = await code.textContent();
  await phone(request, "pair", { allow: "0" });
  await expect(page.getByRole("alert").filter({ hasText: "did not let this browser edit" })).toBeVisible({ timeout: 10000 });
  await expect.poll(() => code.textContent(), { timeout: 10000 }).not.toBe(first);
  await expect(page.locator("#editAllowed")).toHaveCount(0);
});
