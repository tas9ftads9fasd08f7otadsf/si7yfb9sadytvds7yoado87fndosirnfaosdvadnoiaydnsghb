import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openEdit(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
}

// 2946: the versions the phone keeps are there to change, and the side bar follows.
test("Edit map changes the oldest app and viewer, and a blank asks for none", async ({ page }) => {
  await openEdit(page);
  const app = page.getByRole("textbox", { name: "App", exact: true });
  const browser = page.getByRole("textbox", { name: "Browser viewer", exact: true });
  await expect(app).toHaveValue("0.18.0");
  await expect(browser).toHaveValue("0.30.0");
  await expect(browser).toHaveAttribute("placeholder", "Any version");

  const asked = page.waitForRequest((request) => request.url().includes("/edit?"));
  await browser.fill("");
  await browser.press("Tab");
  const query = new URL((await asked).url()).searchParams;
  expect(query.get("minimumApp")).toBe("0.18.0");
  expect(query.get("minimumBrowser")).toBe("");
  await page.keyboard.press("Escape");
  await expect(page.locator("#mapVersions")).toHaveText("Needs Riki Maps 0.18.0 or later");
  await expect(page.locator("#mapVersions .warning")).toHaveCount(0);
});

// 2946: a typo is never sent, as the phone's page warns rather than keeps it.
test("a version that is not numbers and dots is refused in the page", async ({ page }) => {
  await openEdit(page);
  let sent = 0;
  page.on("request", (request) => { if (request.url().includes("/edit?")) sent += 1; });
  const app = page.getByRole("textbox", { name: "App", exact: true });
  await app.fill("0.18.x");
  await app.press("Tab");
  await expect(page.locator("#notice")).toHaveText("Write up to three numbers joined by dots, like 0.18.0.");
  expect(sent).toBe(0);
});
