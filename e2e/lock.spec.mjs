import { test, expect } from "@playwright/test";
import { editTab, openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openGeneral(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await editTab(page, "General");
  await page.locator("#privacy").waitFor();
}

const row = (page) => page.locator("#privacy [data-switch=lock]").getByRole("switch", { name: "Lock with Face ID" });

const asks = async (request) => (await phone(request, "face-asks")).asks;

// 118: Edit map's Privacy row; the phone asks Face ID, then the map is locked and takes no other edit.
test("a map is locked once the phone's person confirms, and takes no other edit until unlocked", async ({ page, request }) => {
  await openGeneral(page);
  await expect(page.locator("#editBody h2", { hasText: "Privacy" })).toBeVisible();
  await expect(page.locator("#privacy")).toContainText("Asks for Face ID or the passcode before it is shown or edited");
  await expect(row(page)).not.toBeChecked();
  const asked = page.waitForRequest((asking) => asking.url().includes("/edit?"));
  await row(page).click();
  expect(new URL((await asked).url()).searchParams.get("lock")).toBe("1");
  await expect(row(page)).toBeChecked();
  expect(await asks(request)).toBe(1);

  await page.locator("#editBody .field input[type=text]").first().fill("Renamed");
  await page.locator("#editBody .field input[type=text]").first().blur();
  await expect(page.locator("#notice")).toContainText("This map is locked on the phone");
  const names = (await (await page.request.get("/riki/v1/device")).json()).maps.map((each) => each.name);
  expect(names).toContain("High Tatras");

  await row(page).click();
  await expect(row(page)).not.toBeChecked();
  expect(await asks(request)).toBe(2);
});

// 118: while the phone waits for its person, the row says so and cannot be pressed twice.
test("the row says the phone is asking while it waits", async ({ page, request }) => {
  await phone(request, "face-id", { wait: "900" });
  await openGeneral(page);
  await row(page).click();
  await expect(page.locator("#lockNote")).toHaveText("Confirm it is you");
  await expect(row(page)).toBeDisabled();
  await expect(page.locator("#lockNote")).toContainText("Asks for Face ID", { timeout: 8000 });
  await expect(row(page)).toBeChecked();
});

// 118: nobody answered on the phone, so nothing is locked and the phone's words are shown.
test("a lock nobody confirms on the phone stays off", async ({ page, request }) => {
  await phone(request, "face-id", { answer: "0" });
  await openGeneral(page);
  await row(page).click();
  await expect(page.locator("#notice")).toContainText("Not confirmed on the phone");
  await expect(row(page)).not.toBeChecked();
  expect(await asks(request)).toBe(1);
});

// 118: no passcode on the phone, no lock; the switch is there but cannot be pressed.
test("the switch cannot be pressed on a phone without a passcode", async ({ page, request }) => {
  await phone(request, "face-id", { passcode: "0" });
  await openGeneral(page);
  await expect(row(page)).toBeDisabled();
  expect(await asks(request)).toBe(0);
});

// 118: an editor of a shared map reads the owner's lock and cannot move it.
test("an editor who is not the owner sees the lock and cannot move it", async ({ page, request }) => {
  await phone(request, "reader");
  await openGeneral(page);
  await expect(row(page)).toBeDisabled();
  await expect(page.locator("#editBody")).toContainText("The map's owner locked it for everyone it is shared with.");
  expect(await asks(request)).toBe(0);
});
