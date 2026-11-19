import { test, expect } from "@playwright/test";
import { openViewer, phone, reset, showAllMaps, editTab } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";

async function openEdit(page, other = null) {
  await openViewer(page, "/e/7q4-k29");
  if (other) {
    await showAllMaps(page);
    await page.locator("#others .row", { hasText: other }).click();
    await expect(page.locator("#current .hero b")).toHaveText(other);
  }
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  await editTab(page, "Sharing");
  await page.locator("#people").waitFor();
}

const asked = (page) => page.waitForRequest((request) => request.url().includes("/people?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

// 59: the share's people with their roles; the owner changes a role and removes someone.
test("the owner changes a role and removes someone", async ({ page }) => {
  await openEdit(page);
  const rita = page.locator('#people [data-person="rita"]');
  await expect(rita).toContainText("Sees the map as it is");
  await expect(page.locator('#people [data-person="you"] select')).toHaveCount(0);

  let sent = asked(page);
  await page.getByRole("combobox", { name: "Role · Rita" }).selectOption("editor");
  expect(await sent).toEqual({ person: "rita", role: "editor" });
  await expect(rita).toContainText("Edits the map");

  page.once("dialog", (dialog) => dialog.accept());
  sent = asked(page);
  await page.getByRole("button", { name: "Remove Rita" }).click();
  expect(await sent).toEqual({ remove: "rita" });
  await expect(rita).toHaveCount(0);
});

// 59: invited by email as the picked role, then the link is there to copy.
test("someone is invited by email and the link is offered", async ({ page, request }) => {
  await openEdit(page);
  await expect(page.locator("#inviteButton")).toBeDisabled();
  await page.getByRole("textbox", { name: "Email or phone" }).fill("eva@example.com");
  await page.getByRole("combobox", { name: "New people can" }).selectOption("admin");
  const sent = asked(page);
  await page.locator("#inviteButton").click();
  expect(await sent).toEqual({ invite: "eva@example.com", role: "admin" });
  await expect(page.locator("#peopleInvited")).toContainText("eva@example.com");
  await expect(page.locator("#copyInviteLink")).toBeVisible();
  await expect(page.locator('#people [data-person="invited-eva@example.com"]')).toContainText("Invited");
  const shares = await phone(request, "shares");
  expect(shares[TATRAS].people.map((each) => each.role)).toEqual(["owner", "reader", "admin"]);
});

// 59: an unshared map is yours alone until the first invitation makes its share.
test("an unshared map is shared by its first invitation", async ({ page }) => {
  await openEdit(page, "Bratislava");
  await expect(page.locator("#peopleAlone")).toContainText("This map is yours alone.");
  await expect(page.locator("#whoCanJoin")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Email or phone" }).fill("eva@example.com");
  await page.locator("#inviteButton").click();
  await expect(page.locator("#peopleAlone")).toHaveCount(0);
  await expect(page.locator("#peopleLink")).toContainText("icloud.com/share");
});

// 59: who can join is the owner's: anyone with the link, then back to invited people only.
test("the owner opens the link to anyone and closes it again", async ({ page }) => {
  await openEdit(page);
  let sent = asked(page);
  await page.getByRole("radio", { name: /Anyone with the link/ }).click();
  expect(await sent).toEqual({ link: "reader" });
  await expect(page.locator("#peopleLink")).toContainText("Anyone who opens it can join");
  sent = asked(page);
  await page.getByRole("radio", { name: /Only people you invite/ }).click();
  expect(await sent).toEqual({ link: "none" });
  await expect(page.locator("#peopleLink")).toContainText("Works only for people you invite");
});

// 59: an editor sees the people but changes nothing, as the phone's card offers them nothing.
test("an editor sees the people but may not invite or change them", async ({ page, request }) => {
  await phone(request, "share-role", { map: TATRAS, role: "editor" });
  await openEdit(page);
  await expect(page.locator('#people [data-person="rita"]')).toBeVisible();
  await expect(page.locator("#people select")).toHaveCount(0);
  await expect(page.locator("#peopleInvite")).toHaveCount(0);
  await expect(page.locator("#peopleLink")).toHaveCount(0);
});
