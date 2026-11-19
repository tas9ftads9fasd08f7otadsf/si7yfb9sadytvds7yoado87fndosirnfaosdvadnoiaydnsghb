import { test, expect } from "@playwright/test";
import { openViewer, phone, reset, showAllMaps } from "./phone.mjs";

test.beforeEach(async ({ request }) => {
  await reset(request);
  await phone(request, "folder");
});

const FOLDER = "F01DE500-0000-4000-8000-000000000001";

async function openFolder(page) {
  await openViewer(page, "/e/7q4-k29");
  await showAllMaps(page);
  await page.getByRole("button", { name: "Sharing a folder · Hills" }).click();
  await page.locator(`[data-folder-people="${FOLDER}"]`).waitFor();
}

const asked = (page) => page.waitForRequest((request) => request.url().includes("/people?"))
  .then((request) => [new URL(request.url()).pathname, Object.fromEntries(new URL(request.url()).searchParams)]);

// 68: a folder nobody has is shared whole, then its people are invited as a map's are.
test("a folder is shared and someone invited to it", async ({ page, request }) => {
  await openFolder(page);
  const sharing = page.locator(`[data-folder-people="${FOLDER}"]`);
  await expect(sharing).toContainText("This folder is yours alone.");
  await expect(sharing).toContainText("2 maps would travel in this share");

  let sent = asked(page);
  await sharing.locator("#shareFolder").click();
  expect(await sent).toEqual([`/riki/v1/folders/${FOLDER}/people`, { share: "1" }]);
  await expect(sharing).toContainText("2 of 2 maps travel in this share");
  await expect(sharing.locator("#peopleLink")).toContainText("icloud.com/share");
  await expect(sharing.locator("#whoCanJoin")).toHaveCount(0);

  await sharing.getByRole("textbox", { name: "Email or phone" }).fill("eva@example.com");
  sent = asked(page);
  await sharing.locator("#inviteButton").click();
  expect((await sent)[1]).toEqual({ invite: "eva@example.com", role: "reader" });
  await expect(sharing.locator('[data-person="invited-eva@example.com"]')).toBeVisible();
  await expect(sharing.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  const shares = await phone(request, "folder-shares");
  expect(shares[FOLDER].people.map((each) => each.name)).toEqual(["Riki (you)", "eva@example.com"]);
});

// 68: the folder's button closes what it opened.
test("the folder's sharing closes again", async ({ page }) => {
  await openFolder(page);
  await page.getByRole("button", { name: "Sharing a folder · Hills" }).click();
  await expect(page.locator(`[data-folder-people="${FOLDER}"]`)).toHaveCount(0);
});
