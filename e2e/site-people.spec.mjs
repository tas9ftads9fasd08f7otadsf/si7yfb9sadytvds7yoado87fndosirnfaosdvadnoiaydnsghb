import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { editTab } from "./phone.mjs";
import { mockCloud, recordCoreCalls } from "./mock-cloud.mjs";

const account = JSON.parse(readFileSync(new URL("./fixtures/cloud-account.json", import.meta.url), "utf8"));

// 108 the site reads a map's share and its people; it changes none of it
async function openSharing(page, answers) {
  const cloud = await mockCloud(page, { signedIn: true, ...(answers ? { answers } : {}) });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#railMaps").click();
  await page.locator("#others .row", { hasText: "Doprava" }).click();
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  await editTab(page, "Sharing");
  return cloud;
}

test("the Sharing tab lists who holds the shared map, with their roles, invited or joined, and the link off", async ({ page }) => {
  await openSharing(page);
  const people = page.locator("#people");
  await expect(people.locator("[data-person=_friki]")).toContainText("Friki");
  await expect(people.locator("[data-person=_friki]")).toContainText("Owner");
  await expect(people.locator("[data-person=_me]")).toContainText("Riki Tester (you)");
  await expect(people.locator("[data-person=_me]")).toContainText("Can edit · Joined");
  await expect(people.locator("[data-person=_marek]")).toContainText("marek@example.com");
  await expect(people.locator("[data-person=_marek]")).toContainText("View only · Invited");
  await expect(page.locator("#peopleLink")).toContainText("Works only for people you invite");
  await expect(page.locator("#peopleInApp")).toHaveText("Invitations and roles are changed in the app for now.");
});

test("the Sharing tab hands the core the map's share and member rows, in the zone they came from", async ({ page }) => {
  const calls = await recordCoreCalls(page, ["riki_people"]);
  await openSharing(page);
  await expect(page.locator("#people [data-person]")).toHaveCount(3);
  const [call] = await calls();
  expect(call.request.id).toBe("6F1E2A10-0000-4000-8000-000000000002");
  const inZone = call.request.rows.filter((row) => row.zone === "share-doprava");
  expect(inZone.map((row) => row.entity).sort()).toEqual(["Share", "SharedMap", "SharedMapMember", "SharedMapMember"]);
  const share = inZone.find((row) => row.entity === "Share");
  expect(share.fields).toMatchObject({ publicPermission: "NONE", "cloudkit.title": "Doprava" });
  expect(share.fields.participants.map((each) => each.acceptanceStatus)).toEqual(["ACCEPTED", "ACCEPTED", "PENDING"]);
  expect(inZone.filter((row) => row.entity === "SharedMapMember").map((row) => row.fields.roleRaw)).toEqual(["editor", "reader"]);
});

test("nothing on the Sharing tab changes the share: no field, role, button or link choice, and no write to CloudKit", async ({ page }) => {
  const cloud = await openSharing(page);
  await expect(page.locator("#people")).toBeVisible();
  for (const id of ["#peopleInvite", "#shareFolder", "#copyShareLink", "#whoCanJoin", "#peopleCaveat"]) {
    await expect(page.locator(id)).toHaveCount(0);
  }
  await expect(page.locator("#editBody").getByRole("combobox")).toHaveCount(0);
  await expect(page.locator("#editBody").getByRole("radio")).toHaveCount(0);
  await expect(page.locator("#people button")).toHaveCount(0);
  expect(cloud.asked.filter((each) => each.endpoint === "records/modify")).toEqual([]);
});

test("an open link says who it lets in", async ({ page }) => {
  await openSharing(page, { ...account.core, riki_people: { ...account.core.riki_people, linkRole: "reader" } });
  await expect(page.locator("#peopleLink")).toContainText("Anyone who opens it can join · View only");
});

test("a map nobody shares says it is the person's alone, and offers no invitation", async ({ page }) => {
  await mockCloud(page, { signedIn: true, answers: { ...account.core,
    riki_people: { shared: false, role: "owner", people: [], linkRole: null } } });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await editTab(page, "Sharing");
  await expect(page.locator("#peopleAlone")).toContainText("This map is yours alone.");
  await expect(page.locator("#peopleAlone")).not.toContainText("Invite someone");
  await expect(page.locator("#peopleInApp")).toBeVisible();
});

test("while the module has no riki_people the Sharing tab says nothing wrong and the page stays connected", async ({ page }) => {
  await openSharing(page, { ...account.core, riki_people: { refused: "coreNotReady", call: "riki_people", status: 501 } });
  await expect(page.locator("#people [data-person]")).toHaveCount(0);
  await expect(page.locator("#device #deviceDot")).toHaveAttribute("aria-label", "Connected");
});
