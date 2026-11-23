import { test, expect } from "@playwright/test";
import { addFrom, openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function readCoffeeTrip(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
  await addFrom(page, "api");
  await page.locator("#apiAddress").fill("https://coffee.example/trip");
  await page.locator("#readAPI").click();
  await expect(page.locator("#apiItemsPath")).toHaveValue("cities");
}

// 171: walk into cafes, read the points from them, use a key as the place, and add the layer.
test("the answer is walked into a list, the points read from it and a key used as the place", async ({ page, request }) => {
  await readCoffeeTrip(page);
  await page.locator("#apiExplore").click();
  await expect(page.locator("#apiTree [data-node='cafes'] small")).toHaveText("3 items");
  await expect(page.locator("#apiTree [data-node='giveaways'] button")).toBeDisabled();

  await page.locator("#apiTree [data-node='cafes'] button").click();
  await expect(page.locator("#apiTrail [data-step='cafes']")).toHaveAttribute("aria-current", "location");
  await expect(page.locator("#apiTree [data-node='cafes.city'] small")).toHaveText("2 keys");
  await page.locator("#apiReadFrom").click();
  await expect(page.locator("#apiReadingFrom")).toBeVisible();

  await page.getByLabel("Use as · latLng").selectOption("place");
  await page.getByLabel("Use as · name").selectOption("name");
  await expect(page.getByLabel("Use as · latLng")).toHaveValue("place");
  await page.locator("#apiUp").click();
  await expect(page.locator("#apiTree [data-node='cafes']")).toBeVisible();
  await page.locator("#apiPointsDone").click();
  await expect(page.locator("#apiItemsPath")).toHaveValue("cafes");
  await expect(page.locator("#apiSaid")).toHaveText("Answered · 3 points");

  await page.locator("#addAPI").click();
  const [added] = await phone(request, "api-adds");
  expect(added.reading).toMatchObject({ itemsPath: "cafes", spelling: "position", positionKey: "latLng", nameKey: "name" });
});

// 171: only the points where a key contains a value are asked for, and the page says how many that keeps.
test("a filter keeps some points and reaches the phone", async ({ page, request }) => {
  await readCoffeeTrip(page);
  await page.locator("#apiItemsPath").selectOption("cafes");
  await page.locator("#apiExplore").click();
  await page.locator("#apiTree [data-node='cafes'] button").click();
  await page.getByLabel("Use as · latLng").selectOption("place");
  await page.locator("#apiPointsDone").click();
  await expect(page.locator("#apiSaid")).toHaveText("Answered · 3 points");

  await page.locator("#apiKeysFilter").click();
  await expect(page.locator("#apiKeyList [data-key='owner.contact.email']")).toHaveCount(0);
  await expect(page.locator("#apiKeyList [data-key='city.name']")).toBeVisible();
  await page.locator("#apiKeyViews [data-view='used']").click();
  await expect(page.locator("#apiKeyList [data-key]")).toHaveCount(2);
  await page.locator("#apiKeyViews [data-view='all']").click();

  await page.locator("#apiAddRule").click();
  await page.locator("[data-rule='0']").getByLabel("Key").selectOption("tags");
  await page.locator("[data-rule='0']").getByLabel("Only some points").selectOption("contains");
  const asked = page.waitForRequest((each) => each.url().includes("/read-api?") && each.url().includes("wifi"));
  await page.locator("[data-rule='0']").getByLabel("Value").fill("wifi");
  await page.locator("[data-rule='0']").getByLabel("Value").blur();
  expect(JSON.parse(new URL((await asked).url()).searchParams.get("reading")).filter)
    .toEqual([{ key: "tags", op: "contains", value: "wifi" }]);
  await expect(page.locator("#apiKept")).toHaveText("2 of 3 points");
  await page.locator("#apiKeysDone").click();
  await expect(page.locator("#apiSaid")).toHaveText("Answered · 2 points");

  await page.locator("#addAPI").click();
  const [added] = await phone(request, "api-adds");
  expect(added.reading.filter).toEqual([{ key: "tags", op: "contains", value: "wifi" }]);
});

// 171: a phone from before this item sends no answer, so the form offers no way into it.
test("the answer's pages are offered only when the phone sends the answer", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
  await addFrom(page, "api");
  await page.route("**/read-api?*", async (route) => {
    const answered = await (await route.fetch()).json();
    delete answered.answer;
    await route.fulfill({ json: answered });
  });
  await page.locator("#apiAddress").fill("https://buses.example/now");
  await page.locator("#readAPI").click();
  await expect(page.locator("#apiItemsPath")).toHaveValue("vehicles");
  await expect(page.locator("#apiExplorer")).toHaveCount(0);
});
