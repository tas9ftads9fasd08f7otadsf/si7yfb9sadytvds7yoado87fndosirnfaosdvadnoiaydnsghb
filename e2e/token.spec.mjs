import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function rename(page, to) {
  await page.locator("#editButton").click();
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  await name.fill(to);
  await name.press("Enter");
}

// 2944: the password is sent once, to be traded for a token every edit carries.
test("a typed password is traded for a token, and edits carry it as a bearer", async ({ page }) => {
  await openViewer(page);
  const traded = page.waitForResponse((answer) => answer.url().endsWith("/web/edit-check"));
  await page.locator("#passwordField").fill("7q4 k29");
  await page.locator("#passwordForm button").click();
  expect(await (await traded).json()).toMatchObject({ token: expect.stringMatching(/^mock\./), expiresIn: 43200 });

  const edited = page.waitForRequest((request) => request.url().includes("/edit?"));
  await rename(page, "Tatras by token");
  const headers = (await edited).headers();
  expect(headers.authorization).toMatch(/^Bearer mock\./);
  expect(headers["x-riki-edit"]).toBeUndefined();
  await expect(page.locator("#mapName")).toHaveText("Tatras by token");
});

// 2944: the editing address's key leaves the address bar once traded; the tab keeps the token.
test("the editing address is traded and dropped, and a reload still edits", async ({ page }) => {
  await openViewer(page, "/?edit=7q4-k29");
  await expect(page.locator("#editButton")).toBeVisible();
  await expect(page).not.toHaveURL(/edit=/);
  await page.reload();
  await page.locator("#current .hero").waitFor();
  await expect(page.locator("#editButton")).toBeVisible();
  await expect(page.locator("#passwordField")).toHaveCount(0);
});

// 2944: a new key on the phone revokes every token; the browser is asked for the password.
// 2957: revoked once Edit map has read its coverage, so the edit is what is refused.
test("a token the phone no longer honours sends the browser back to the password", async ({ page, request }) => {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.locator("#coverageLine")).toBeVisible();
  await phone(request, "new-key");
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  await name.fill("Too late");
  await name.press("Enter");
  await expect(page.locator("#notice")).toHaveText("Type the edit password again");
  await expect(page.locator("#passwordField")).toBeVisible();
  await expect(page.locator("#editPage")).toHaveClass(/ahead/);
  await expect(page.locator("#mapName")).toHaveText("High Tatras");
  await expect.poll(() => page.locator("#side").evaluate((side) => side.scrollLeft)).toBe(0);
});

// 2957: Edit map reads the coverage with the token, so a revoked one is caught on opening.
test("opening Edit map with a token the phone no longer honours asks for the password", async ({ page, request }) => {
  await openViewer(page, "/?edit=7q4-k29");
  await expect(page.locator("#editButton")).toBeVisible();
  await phone(request, "new-key");
  await page.locator("#editButton").click();
  await expect(page.locator("#notice")).toHaveText("Type the edit password again");
  await expect(page.locator("#editPage")).toHaveClass(/ahead/);
  await expect(page.locator("#passwordField")).toBeVisible();
});
