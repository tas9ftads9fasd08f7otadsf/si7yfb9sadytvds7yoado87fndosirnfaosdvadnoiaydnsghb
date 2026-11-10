import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openEdit(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
}

const asked = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => new URL(request.url()).searchParams);

// 2947: a new map opens where it was left; picking coordinates takes the browser's view, as the phone's.
test("Opens at takes the map's centre, and goes back to where it was left", async ({ page }) => {
  await openEdit(page);
  const kind = page.getByRole("combobox", { name: "Opens at" });
  await expect(kind).toHaveValue("none");
  await expect(kind.locator("option")).toHaveText(["Where it was left", "Your location", "Coordinates", "Region",
    "Country", "State", "City"]);

  let query = asked(page);
  await kind.selectOption("coordinates");
  query = await query;
  expect(query.get("start")).toBe("coordinates");
  expect(Number(query.get("lat"))).toBeGreaterThan(-90);
  await expect(page.locator("#startLatitude")).toHaveValue(query.get("lat"));
  await expect(page.locator("#startZoom")).toHaveValue(Number(query.get("zoom")).toFixed(1));

  query = asked(page);
  await page.locator("#startLatitude").fill("49,1");
  await page.locator("#startLatitude").press("Tab");
  expect((await query).get("lat")).toBe("49.1");
  await expect.poll(() => page.evaluate(() => __riki.state().portable.start.latitude)).toBe(49.1);

  query = asked(page);
  await page.getByRole("combobox", { name: "Opens at" }).selectOption("none");
  expect((await query).get("start")).toBe("none");
  await expect.poll(() => page.evaluate(() => __riki.state().portable.start)).toBeUndefined();
});

// 2947: a point off the globe is never sent.
test("a latitude past the pole is marked and not sent", async ({ page }) => {
  await openEdit(page);
  await page.getByRole("combobox", { name: "Opens at" }).selectOption("coordinates");
  await expect(page.locator("#startLatitude")).toBeVisible();
  let sent = 0;
  page.on("request", (request) => { if (request.url().includes("/edit?")) sent += 1; });
  await page.locator("#startLatitude").fill("95");
  await page.locator("#startLatitude").press("Tab");
  await expect(page.locator("#startLatitude")).toHaveAttribute("aria-invalid", "true");
  expect(sent).toBe(0);
});

// 2947, 2949: a place the phone found by name is shown ticked, and can be swapped for one set here.
test("a city set on the phone is named, and your location replaces it", async ({ page, request }) => {
  await phone(request, "start-city");
  await openEdit(page);
  const kind = page.getByRole("combobox", { name: "Opens at" });
  await expect(kind).toHaveValue("city");
  await expect(page.locator("#startPlaces .row.picked")).toHaveText("Poprad");
  const query = asked(page);
  await kind.selectOption("location");
  expect((await query).get("start")).toBe("location");
  await expect(page.locator("#opensAt")).toContainText("Opens on where you are when location is allowed.");
});

// 2949: the phone lists its regions; the one picked is ticked and named.
test("a region is picked from the phone's list, filtered as it is typed", async ({ page }) => {
  await openEdit(page);
  await page.getByRole("combobox", { name: "Opens at" }).selectOption("region");
  const rows = page.locator("#startPlaces .row");
  await expect(rows).toHaveText(["Vysoké Tatry", "Prešovský krajSlovakia"]);
  await page.getByRole("searchbox", { name: "Search regions" }).fill("tatry");
  await expect(rows).toHaveCount(1);
  const query = asked(page);
  await rows.first().click();
  const sent = await query;
  expect(sent.get("start")).toBe("region");
  expect(sent.get("region")).toBe("vysoke_tatry");
  await expect.poll(() => page.evaluate(() => __riki.state().portable.start))
    .toEqual({ kind: "region", region: "vysoke_tatry" });
  await expect(page.getByRole("combobox", { name: "Opens at" })).toHaveValue("region");
  await expect(page.locator("#startPlaces .row.picked")).toHaveText("Vysoké Tatry");
});

// 2949: a country, by its code.
test("a country is picked from the phone's list", async ({ page }) => {
  await openEdit(page);
  await page.getByRole("combobox", { name: "Opens at" }).selectOption("country");
  const query = asked(page);
  await page.locator("#startPlaces .row", { hasText: "Czechia" }).click();
  expect((await query).get("country")).toBe("CZ");
  await expect(page.locator("#startPlaces .row.picked")).toHaveText("Czechia");
});

// 2949: a city is found by the phone's search, and its point and bounds travel with it.
test("a city is searched through the phone and picked with its bounds", async ({ page, request }) => {
  await openEdit(page);
  await page.getByRole("combobox", { name: "Opens at" }).selectOption("city");
  await expect(page.locator("#opensAt")).toContainText("Found with Apple Maps.");
  const search = page.getByRole("searchbox", { name: "Search cities" });
  await search.fill("Poprad");
  const asking = page.waitForRequest((sent) => sent.url().includes("/start-places?"));
  await search.press("Enter");
  expect((await asking).headers().authorization).toMatch(/^Bearer /);
  const query = asked(page);
  await page.locator("#startPlaces .row", { hasText: "Poprad" }).click();
  const sent = await query;
  expect(sent.get("name")).toBe("Poprad");
  expect(sent.get("box")).toBe("20.2,49,20.4,49.1");
  await expect(page.locator("#startPlaces .row.picked")).toContainText("Poprad");
  expect((await phone(request, "guests")).placeAsks).toEqual(["?kind=city&q=Poprad"]);
});
