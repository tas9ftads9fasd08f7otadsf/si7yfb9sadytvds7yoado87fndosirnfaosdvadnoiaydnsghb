import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const TRAILS = "6F1E2A10-0000-4000-8000-0000000000A1";
const HUTS = "6F1E2A10-0000-4000-8000-0000000000A2";
const WINTER = "6F1E2A10-0000-4000-8000-0000000000B2";

async function openEdit(page) {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
}

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

const answered = (page) => page.waitForResponse((response) => response.url().includes("/edit?"));

const layerRow = (page, name) => page.locator("#editBody .row").filter({ has: page.getByRole("switch", { name }) });

test("the map's name and note are written on the phone", async ({ page }) => {
  await openEdit(page);
  let asked = sent(page);
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Tatras in summer");
  await page.getByRole("textbox", { name: "Name", exact: true }).press("Enter");
  expect((await asked).name).toBe("Tatras in summer");
  await expect(page.locator("#editSub")).toHaveText("Tatras in summer");

  asked = sent(page);
  await page.getByRole("textbox", { name: "Note", exact: true }).fill("Huts open June to September");
  await page.getByRole("textbox", { name: "Name", exact: true }).focus();
  expect((await asked).note).toBe("Huts open June to September");
});

test("a layer is renamed and its opacity set; the base layer has no opacity", async ({ page }) => {
  await openEdit(page);
  await expect(layerRow(page, "Trails").getByRole("slider", { name: "Opacity" })).toHaveCount(0);

  let asked = sent(page);
  const name = layerRow(page, "Huts").getByRole("textbox", { name: "Rename" });
  await name.fill("Mountain huts");
  await name.press("Enter");
  expect(await asked).toMatchObject({ layer: HUTS, name: "Mountain huts" });
  await expect(layerRow(page, "Mountain huts")).toBeVisible();
  await expect(page.locator("#layerList").getByRole("switch", { name: "Mountain huts" })).toBeVisible();

  asked = sent(page);
  const opacity = layerRow(page, "Mountain huts").getByRole("slider", { name: "Opacity" });
  await opacity.fill("0.5");
  expect(await asked).toMatchObject({ layer: HUTS, opacity: "0.5" });
  await expect(opacity).toHaveValue("0.5");
});

test("a layer moves down and back up, and the ends cannot move further", async ({ page }) => {
  await openEdit(page);
  const switches = page.locator("#editBody").getByRole("switch");
  const names = async () => switches.evaluateAll((all) => all.map((one) => one.getAttribute("aria-label")));
  expect(await names()).toEqual(["Trails", "Huts"]);
  await expect(layerRow(page, "Trails").getByRole("button", { name: "Move up" })).toBeDisabled();
  await expect(layerRow(page, "Huts").getByRole("button", { name: "Move down" })).toBeDisabled();

  let asked = sent(page);
  let landed = answered(page);
  await layerRow(page, "Trails").getByRole("button", { name: "Move down" }).click();
  expect((await asked).order).toBe([HUTS, TRAILS].join(","));
  await landed;
  await expect.poll(names).toEqual(["Huts", "Trails"]);

  asked = sent(page);
  landed = answered(page);
  await layerRow(page, "Trails").getByRole("button", { name: "Move up" }).click();
  expect((await asked).order).toBe([TRAILS, HUTS].join(","));
  await landed;
  await expect.poll(names).toEqual(["Trails", "Huts"]);
});

// 3083 TestFlight AJNX
test("the list's own switch turns every layer off, then on again", async ({ page }) => {
  await openEdit(page);
  const all = page.locator("#allLayers");
  await expect(all).toHaveText("All off");
  let asked = sent(page);
  let landed = answered(page);
  await all.click();
  expect((await asked).shownAll).toBe("0");
  await landed;
  await expect(all).toHaveText("All on");
  await expect(layerRow(page, "Trails").getByRole("switch")).not.toBeChecked();
  await expect(layerRow(page, "Huts").getByRole("switch")).not.toBeChecked();

  asked = sent(page);
  landed = answered(page);
  await all.click();
  expect((await asked).shownAll).toBe("1");
  await landed;
  await expect(all).toHaveText("All off");
  await expect(layerRow(page, "Huts").getByRole("switch")).toBeChecked();
});

test("a style is added, renamed and deleted", async ({ page }) => {
  await openEdit(page);
  const styleNames = page.locator("#editBody .list").first().getByRole("textbox", { name: "Rename" });
  await expect(styleNames).toHaveCount(2);

  let asked = sent(page);
  await page.getByRole("button", { name: "New style" }).click();
  expect((await asked).addStyle).toBe("New style 3");
  await expect(styleNames).toHaveCount(3);
  await expect(styleNames.nth(2)).toHaveValue("New style 3");

  asked = sent(page);
  await styleNames.nth(2).fill("Autumn");
  await styleNames.nth(2).press("Enter");
  expect((await asked).name).toBe("Autumn");

  asked = sent(page);
  await page.locator("#editBody .row").filter({ has: page.getByRole("button", { name: "Winter", exact: true }) })
    .getByRole("button", { name: "Delete" }).click();
  expect((await asked).removeStyle).toBe(WINTER);
  await expect(styleNames).toHaveCount(2);
  await expect(styleNames.nth(0)).toHaveValue("Summer");
  await expect(styleNames.nth(1)).toHaveValue("Autumn");
});

test("the last style left cannot be deleted", async ({ page }) => {
  await openEdit(page);
  const remove = page.locator("#editBody .list").first().getByRole("button", { name: "Delete" });
  await expect(remove).toHaveCount(2);
  await page.locator("#editBody .list").first().getByRole("button", { name: "Delete" }).first().click();
  await expect(remove).toHaveCount(1);
  await expect(remove).toBeDisabled();
});
