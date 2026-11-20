import { test, expect } from "@playwright/test";
import { addFrom, openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openAddLayer(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
  await addFrom(page, "api");
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

// 61: the phone's three parts; a cookie page and a typed cookie, colours and Details rows reach the phone.
test("cookies, colours and Details rows are set in the form's parts and reach the phone", async ({ page, request }) => {
  await openAddLayer(page);
  await page.locator("#apiAddress").fill("https://buses.example/now");
  await page.locator("#apiCookieCard input[role='switch']").check();
  await page.locator("#apiCookiePage").fill("https://buses.example/");
  await page.locator("#apiCookie").fill("session=abc");
  const read = page.waitForRequest((asked) => asked.url().includes("/read-api?"));
  await page.locator("#readAPI").click();
  const asked = await read;
  expect(asked.url()).not.toContain("abc");
  expect(asked.headers()["x-riki-cookie"]).toBe("session=abc");
  expect(JSON.parse(new URL(asked.url()).searchParams.get("cookies"))).toMatchObject({ isOn: true, page: "https://buses.example/" });

  await expect(page.locator("#apiParts [data-part='details']")).toHaveAttribute("aria-selected", "true");
  await page.locator("#apiColourKey").selectOption("line");
  await expect(page.locator("#apiColourKey")).toHaveValue("line");
  await expect(page.locator("[data-shown-key='line'] small")).toHaveText("N33");
  await page.locator("[data-shown-key='lat'] input[role='switch']").uncheck();
  await expect(page.locator("[data-shown-key='lat'] input[role='switch']")).not.toBeChecked();
  await page.locator("#apiAddRow").click();
  await page.locator("#apiRows input[aria-label='Name']").fill("Line");
  await page.locator("#apiRows input[aria-label='Value']").fill("{line}");
  await page.locator("#apiRefresh").selectOption("30");

  await page.locator("#apiParts [data-part='styling']").click();
  await page.locator("#apiLayerName").fill("Buses");
  await page.locator("#apiTint").fill("#ff8800");
  await page.locator("#addAPI").click();
  await expect(page.locator("#editBody input[value='Buses']")).toHaveCount(1);

  const [added] = await phone(request, "api-adds");
  expect(added.cookie).toBe("session=abc");
  expect(added.address).not.toContain("abc");
  expect(added.tint).toBe("#FF8800");
  expect(added.reading).toMatchObject({ colourKey: "line", shownKeys: ["lon", "line"], refreshSeconds: 30,
    cookies: { isOn: true, page: "https://buses.example/" } });
  expect(added.reading.detailRows).toMatchObject([{ title: "Line", value: "{line}", symbol: "info.circle" }]);

  // 61: the phone keeps the cookie; the next read is told so, never the value.
  await page.locator("#addLayer").click();
  await addFrom(page, "api");
  await page.locator("#apiAddress").fill("https://buses.example/now");
  await page.locator("#readAPI").click();
  await page.locator("#apiParts [data-part='source']").click();
  await expect(page.locator("#apiCookie")).toHaveValue("");
  await expect(page.locator("#apiCookie")).toHaveAttribute("placeholder", "Kept on this phone");
});
