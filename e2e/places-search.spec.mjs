import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const HUTS = "6f1e2a10-0000-4000-8000-0000000000a2";

// 129 the top bar's search asks the phone for places, near the map's centre, with no edit password
test("the search lists the phone's places and opens one in the place panel", async ({ page, request }) => {
  await openViewer(page);
  await page.locator("#search").fill("poprad");
  const results = page.locator("#searchResults");
  const places = results.getByRole("group", { name: "Places" });
  await expect(places.getByRole("button")).toHaveCount(2);
  await expect(places.getByRole("button", { name: /Poprad Prešov Region/ })).toBeVisible();

  const [asked] = await phone(request, "search-asked");
  expect(asked.q).toBe("poprad");
  expect(Number(asked.lat)).toBeGreaterThan(-90);
  expect(Number(asked.lon)).toBeGreaterThan(-180);
  expect(asked.bearer).toBe(false);

  await places.getByRole("button", { name: /Popradské pleso/ }).click();
  await expect(page.locator("#placePanel h2")).toHaveText("Popradské pleso");
  await expect(page.locator("#placePanel .kind")).toHaveText("lake");
  await expect(page.locator("#placePanel dd", { hasText: "1494" })).toHaveCount(1);
  await expect(page.locator("#placePanel .place-foot")).toContainText("49.06750 N, 20.07110 E");
});

// 129 a feature of the map's own is listed under the map's data, and wears its layer's Details
test("a feature of a layer opens with the layer's Details", async ({ page, request }) => {
  await phone(request, "lays-out-details");
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#search").fill("chata");
  const data = page.locator("#searchResults").getByRole("group", { name: "In this map's data" });
  await expect(data.getByRole("button")).toHaveCount(2);
  await data.getByRole("button", { name: /Zbojnícka chata/ }).click();

  const card = page.locator("#placePanel .feature");
  await expect(card.locator("b")).toHaveText("Hut Zbojnícka chata");
  await expect(card.locator("dd", { hasText: "1960 m" })).toHaveCount(1);
  await expect(page.locator("#placePanel .place-foot")).toContainText("Huts");
  const [details] = await phone(request, "details-asked");
  expect(details.layer.toLowerCase()).toBe(HUTS);
  expect(details.values.Nazov).toBe("Zbojnícka chata");
  // an editing browser is not asked for the cities when the phone searches
  const [asked] = await phone(request, "search-asked");
  expect(asked.bearer).toBe(false);
  expect((await phone(request, "guests")).placeAsks).toEqual([]);
});

// 129 a line number asks the layers alone and finds the vehicle
test("a number finds a line", async ({ page }) => {
  await openViewer(page);
  await page.locator("#search").fill("4314");
  await expect(page.locator("#searchResults").getByRole("button", { name: /Os 4314/ })).toBeVisible();
  await expect(page.locator("#searchResults").getByRole("group", { name: "Places" })).toHaveCount(0);
});

// 129 two letters are not asked of the phone, as its own field starts at three
test("two letters ask the phone nothing", async ({ page, request }) => {
  await openViewer(page);
  await page.locator("#search").fill("po");
  await expect(page.locator("#searchResults")).toContainText("Results for “po”");
  await page.waitForTimeout(800);
  expect(await phone(request, "search-asked")).toEqual([]);
});

// 129 a phone from before 3492 answers 404: the cities for an editing browser, as before
test("a phone with no places search still gives an editing browser its cities", async ({ page, request }) => {
  await phone(request, "search-missing");
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#search").fill("poprad");
  const places = page.locator("#searchResults").getByRole("group", { name: "Places" });
  await expect(places.getByRole("button")).toHaveCount(1);
  await expect(places.getByRole("button", { name: /Poprad Slovakia/ })).toBeVisible();
  await expect(page.locator("#searchResults")).toContainText("Results for “poprad”");
  await expect.poll(async () => (await phone(request, "guests")).placeAsks.length).toBe(1);
});

// 129 and a browser that only looks keeps the names it has loaded, with no places
test("a phone with no places search leaves a looking browser the names of the map", async ({ page, request }) => {
  await phone(request, "search-missing");
  await openViewer(page);
  await page.locator("#search").fill("poprad");
  await expect(page.locator("#searchResults")).toContainText("Results for “poprad”");
  await expect(page.locator("#searchResults .empty")).toHaveText("Nothing on the map goes by that name.");
  await expect(page.locator("#searchResults").getByRole("group", { name: "Places" })).toHaveCount(0);
});
