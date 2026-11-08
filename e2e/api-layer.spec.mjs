import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openAddLayer(page) {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
  await expect(page.locator("#apiAddress")).toBeVisible();
}

// 3003: the phone reads the API and guesses its keys; a key picked here is read again there.
test("an API is read, its keys picked, and added as a layer", async ({ page }) => {
  await openAddLayer(page);
  await page.locator("#apiAddress").fill("https://buses.example/now");
  await page.locator("#readAPI").click();
  await expect(page.locator("#apiItemsPath")).toHaveValue("vehicles");
  await expect(page.locator("#apiLatitude")).toHaveValue("lat");
  await expect(page.locator("#apiSaid")).toHaveText("Answered · 2 points");

  const reread = page.waitForRequest((request) => request.url().includes("/read-api?"));
  await page.locator("#apiItemsPath").selectOption("stops");
  const sent = JSON.parse(new URL((await reread).url()).searchParams.get("reading"));
  expect(sent).toMatchObject({ itemsPath: "stops", latitudeKey: "" });
  await expect(page.locator("#apiSaid")).toHaveText("Answered · 0 points");
  await expect(page.locator("#addAPI")).toBeDisabled();

  await page.locator("#apiItemsPath").selectOption("vehicles");
  await page.locator("#apiLatitude").selectOption("lat");
  await page.locator("#apiLongitude").selectOption("lon");
  await expect(page.locator("#addAPI")).toBeEnabled();
  const added = page.waitForRequest((request) => request.url().includes("/add-api?"));
  await page.locator("#addAPI").click();
  expect(new URL((await added).url()).searchParams.get("address")).toBe("https://buses.example/now");
  await expect(page.locator("#editBody input[value='buses.example']")).toHaveCount(1);
});

// 3003: an address the phone cannot ask is said, and nothing is offered to add.
test("an address the phone cannot read is refused", async ({ page }) => {
  await openAddLayer(page);
  await page.locator("#apiAddress").fill("ftp://buses.example");
  await page.locator("#readAPI").click();
  await expect(page.getByText("That is not an address this app can ask.")).toBeVisible();
  await expect(page.locator("#addAPI")).toHaveCount(0);
});
