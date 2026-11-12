import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const GREEN = "rgb(52, 199, 89)";
const RED = "rgb(255, 59, 48)";

// 40 the dot by the phone's name follows the page's beat: green, red once it fails, green again
test("the dot by the phone's name is green while it answers and red while it does not", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openViewer(page);
  const dot = page.locator("#device #deviceDot");
  await expect(dot).toHaveAttribute("aria-label", "Connected");
  await expect(dot).toHaveCSS("background-color", GREEN);
  await expect(page.locator("#device")).toHaveText("Riki's iPad");

  await page.route("**/web/session", (route) => route.abort());
  await expect(dot).toHaveAttribute("aria-label", "Not connected", { timeout: 8000 });
  await expect(dot).toHaveCSS("background-color", RED);
  await expect(dot).toHaveAttribute("title", "Not connected");

  await page.unroute("**/web/session");
  await expect(dot).toHaveAttribute("aria-label", "Connected", { timeout: 8000 });
  await expect(dot).toHaveCSS("background-color", GREEN);
});
