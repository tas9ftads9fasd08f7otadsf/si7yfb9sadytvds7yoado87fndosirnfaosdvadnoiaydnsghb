import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const GEOLOGY = "6F1E2A10-0000-4000-8000-0000000000E6";
const WINTER = "6F1E2A10-0000-4000-8000-0000000000B2";

async function openService(page, request) {
  await phone(request, "esri-service");
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  await page.locator(`#esriServices [data-service="${GEOLOGY}"]`).click();
  await page.locator("#esriServicePage").waitFor();
}

const asks = async (request) => (await request.get("/__test/esri-asks")).json();

// 67: a layer is ticked onto the map and taken off again, asked first as the service's page asks.
test("a service's layer is added, then taken off once agreed", async ({ page, request }) => {
  await openService(page, request);
  await expect(page.locator("#esriServices")).toContainText("1 of 3 in this map");
  await page.getByRole("switch", { name: "Draw Faults on this map" }).click();
  await expect(page.locator("#esriServices")).toContainText("2 of 3 in this map");
  expect((await asks(request)).at(-1)).toEqual({ service: GEOLOGY, add: "1" });

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Take Faults off the map?");
    void dialog.dismiss();
  });
  await page.getByRole("switch", { name: "Draw Faults on this map" }).click();
  await expect(page.getByRole("switch", { name: "Draw Faults on this map" })).toBeChecked();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("switch", { name: "Draw Faults on this map" }).click();
  await expect(page.locator("#esriServices")).toContainText("1 of 3 in this map");
  expect((await asks(request)).at(-1)).toEqual({ service: GEOLOGY, remove: "1" });
});

// 67: a layer the service does not let be asked is not offered, as on the phone.
test("a layer the service refuses cannot be ticked", async ({ page, request }) => {
  await openService(page, request);
  await expect(page.getByRole("switch", { name: "Draw Shading on this map" })).toBeDisabled();
  await expect(page.locator("#esriServiceLayers")).toContainText("The service does not let this one be asked");
});

// 67: read again from its address, its own style picked, then forgotten and gone from the list.
test("a service is read again, its style picked, then forgotten", async ({ page, request }) => {
  await openService(page, request);
  await page.locator("#readEsriAgain").click();
  await expect(page.locator("#readEsriAgain")).toHaveText("Read it again · last read now");
  await page.locator("#esriServiceStyle").click();
  await expect(page.locator("#esriServiceStyle")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(WINTER));
  await page.locator("#forgetEsriService").click();
  await expect(page.locator("#esriServices")).toHaveCount(0);
  expect((await asks(request)).at(-1)).toEqual({ service: GEOLOGY, forget: "1" });
});
