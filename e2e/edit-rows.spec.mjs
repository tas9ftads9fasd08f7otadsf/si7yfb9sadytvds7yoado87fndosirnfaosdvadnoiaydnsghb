import { test, expect } from "@playwright/test";
import { editTab, openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const TRAILS = "6F1E2A10-0000-4000-8000-0000000000A1";
const HUTS = "6F1E2A10-0000-4000-8000-0000000000A2";
const WINTER = "6F1E2A10-0000-4000-8000-0000000000B2";

async function openEdit(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
}

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

const answered = (page) => page.waitForResponse((response) => response.url().includes("/edit?"));

// 94 a layer's row with its settings, which fold out under its › button
const layerRow = (page, name) => page.locator("#editBody .layer-item")
  .filter({ has: page.getByRole("switch", { name }) });
const openSettings = (page, name) => layerRow(page, name).getByRole("button", { name: `Options ${name}` }).click();

test("the map's name and note are written on the phone", async ({ page }) => {
  await openEdit(page);
  await editTab(page, "General");
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
  await openSettings(page, "Trails");
  await expect(layerRow(page, "Trails").getByRole("button", { name: "Delete layer" })).toBeVisible();
  await expect(layerRow(page, "Trails").getByRole("slider", { name: "Opacity" })).toHaveCount(0);

  let asked = sent(page);
  const name = layerRow(page, "Huts").getByRole("textbox", { name: "Rename" });
  await name.fill("Mountain huts");
  await name.press("Enter");
  expect(await asked).toMatchObject({ layer: HUTS, name: "Mountain huts" });
  await expect(layerRow(page, "Mountain huts")).toBeVisible();
  await expect(page.locator("#layerList").getByRole("switch", { name: "Mountain huts" })).toBeVisible();

  asked = sent(page);
  await openSettings(page, "Mountain huts");
  const opacity = layerRow(page, "Mountain huts").getByRole("slider", { name: "Opacity" });
  await opacity.fill("0.5");
  expect(await asked).toMatchObject({ layer: HUTS, opacity: "0.5" });
  await expect(opacity).toHaveValue("0.5");
});

test("a layer moves down and back up, and the ends cannot move further", async ({ page }) => {
  await openEdit(page);
  // 50 the layer rows' switches alone, now that Availability and grouping have their own
  const switches = page.locator("#editBody [data-layer]").getByRole("switch");
  const names = async () => switches.evaluateAll((all) => all.map((one) => one.getAttribute("aria-label")));
  expect(await names()).toEqual(["Trails", "Huts"]);
  await openSettings(page, "Trails");
  await openSettings(page, "Huts");
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

// 115 W5's heading, with the count of the layers the list switches
test("the layers' heading says they are dragged into order, and how many", async ({ page }) => {
  await openEdit(page);
  const heading = page.locator("#editBody .title-row h2").first();
  await expect(heading).toContainText("Layers · drag to change the order");
  await expect(heading.locator(".count")).toHaveText(String(await page.locator("#editBody .layer-item").count()));
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

// 109 W7: a style is picked in the list, its settings under the two columns
test("a style is added, renamed and deleted", async ({ page }) => {
  await openEdit(page);
  await editTab(page, "Styling");
  const list = page.locator("#styleList [data-style]");
  const pick = (name) => page.locator("#styleList").getByRole("button", { name, exact: true }).click();
  const rename = page.locator("[data-style-settings]").getByRole("textbox", { name: "Rename" });
  await expect(list).toHaveText(["Summer", "Winter"]);

  let asked = sent(page);
  await page.getByRole("button", { name: "New style" }).click();
  expect((await asked).addStyle).toBe("New style 3");
  await expect(list).toHaveText(["Summer", "Winter", "New style 3"]);

  await pick("New style 3");
  await expect(rename).toHaveValue("New style 3");
  asked = sent(page);
  await rename.fill("Autumn");
  await rename.press("Enter");
  expect((await asked).name).toBe("Autumn");

  await pick("Winter");
  asked = sent(page);
  await page.locator("[data-style-settings]").getByRole("button", { name: "Delete" }).click();
  expect((await asked).removeStyle).toBe(WINTER);
  await expect(list).toHaveText(["Summer", "Autumn"]);
});

test("the last style left cannot be deleted", async ({ page }) => {
  await openEdit(page);
  await editTab(page, "Styling");
  const remove = page.locator("[data-style-settings]").getByRole("button", { name: "Delete" });
  await remove.click();
  await expect(page.locator("#styleList [data-style]")).toHaveCount(1);
  await expect(remove).toBeDisabled();
});

// 50: a layer's own switch in Edit map, written into the style the browser shows.
test("a layer is switched off and on in Edit map", async ({ page }) => {
  await openEdit(page);
  const huts = () => layerRow(page, "Huts").getByRole("switch", { name: "Huts" });
  await expect(huts()).toBeChecked();

  let asked = sent(page);
  await huts().click();
  expect(await asked).toMatchObject({ layer: HUTS, shown: "0" });
  await expect(huts()).not.toBeChecked();

  asked = sent(page);
  await huts().click();
  expect(await asked).toMatchObject({ layer: HUTS, shown: "1" });
  await expect(huts()).toBeChecked();
});
