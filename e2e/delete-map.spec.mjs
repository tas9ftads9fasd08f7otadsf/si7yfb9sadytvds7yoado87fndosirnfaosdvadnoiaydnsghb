import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const mapNames = (request) => request.get("/riki/v1/device").then((answer) => answer.json())
  .then((device) => device.maps.map((each) => each.name));

// 62: Edit map's Delete needs the exact name, then the page is back on the Maps list.
test("a map is deleted from Edit map once its name is typed", async ({ page, request }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#deleteMap-edit").click();
  const yes = page.locator("#deleteMap-edit-yes");
  await page.locator("#deleteMap-edit-name").fill("High");
  await expect(yes).toBeDisabled();
  await page.locator("#deleteMap-edit-name").fill("High Tatras");
  const asked = page.waitForRequest((asking) => asking.url().includes("/delete?") && asking.method() === "POST");
  await yes.click();
  expect(new URL((await asked).url()).searchParams.get("name")).toBe("High Tatras");
  await expect(page).toHaveURL(/\/maps$/);
  await expect(page.locator("#others")).not.toContainText("High Tatras");
  expect(await mapNames(request)).toEqual(["Bratislava"]);
});

// 62: the map's card offers it too; Cancel keeps the map.
test("the card's Delete asks first, and Cancel keeps the map", async ({ page, request }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#deleteMap-card").click();
  await expect(page.locator("#deleteMap-card-confirm")).toContainText("This cannot be undone.");
  await page.locator("#deleteMap-card-confirm").getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("#deleteMap-card")).toBeVisible();
  expect(await mapNames(request)).toEqual(["High Tatras", "Bratislava"]);
});

// 62: no Delete for the phone's last map, a locked map or a browser without the password.
test("Delete is not offered where the phone refuses it", async ({ page, request }) => {
  await openViewer(page, "/");
  await expect(page.locator("#deleteMap-card")).toHaveCount(0);
  await phone(request, "lock");
  await openViewer(page, "/e/7q4-k29");
  await expect(page.locator("#editButton")).toBeVisible();
  await expect(page.locator("#deleteMap-card")).toHaveCount(0);
  await phone(request, "one-map");
  const refused = await request.post(`/riki/v1/maps/6F1E2A10-0000-4000-8000-000000000001/delete?name=High+Tatras`);
  expect(refused.status()).toBe(403);
});
