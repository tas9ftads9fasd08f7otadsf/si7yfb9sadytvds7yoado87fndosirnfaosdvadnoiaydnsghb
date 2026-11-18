import { test, expect } from "@playwright/test";
import { openViewer, phone, reset, showAllMaps } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const SUMMER = "6F1E2A10-0000-4000-8000-0000000000B1";
const WINTER = "6F1E2A10-0000-4000-8000-0000000000B2";

async function openEdit(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  await page.locator("#availability").waitFor();
}

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

const styleNames = (page) => page.locator("#styleList [data-style] input[type=text]")
  .evaluateAll((all) => all.map((one) => one.value));

// 50: as the styles' page drags them; the ends move no further.
test("a style moves down and back up", async ({ page }) => {
  await openEdit(page);
  await expect(page.getByRole("button", { name: "Move up Summer" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move down Winter" })).toBeDisabled();

  let asked = sent(page);
  await page.getByRole("button", { name: "Move down Summer" }).click();
  expect((await asked).styleOrder).toBe([WINTER, SUMMER].join(","));
  await expect.poll(() => styleNames(page)).toEqual(["Winter", "Summer"]);

  asked = sent(page);
  await page.getByRole("button", { name: "Move up Summer" }).click();
  expect((await asked).styleOrder).toBe([SUMMER, WINTER].join(","));
  await expect.poll(() => styleNames(page)).toEqual(["Summer", "Winter"]);
});

// 50: offered while a layer has no style of its own, as the styles' page offers it.
test("a style for each layer is added, and the row goes", async ({ page }) => {
  await openEdit(page);
  const asked = sent(page);
  await page.locator("#stylePerLayer").click();
  expect((await asked).arrange).toBe("stylePerLayer");
  await expect.poll(() => styleNames(page)).toEqual(["Huts", "Summer", "Trails", "Winter"]);
  await expect(page.locator("#stylePerLayer")).toHaveCount(0);
});

// 50: Unite and Reset show only while they would change the order.
test("the styles' layer order is united, then reset to the default", async ({ page }) => {
  await openEdit(page);
  await expect(page.locator("#layerOrderDiffers")).toContainText("Layer order differs between styles");
  let asked = sent(page);
  await page.locator("#uniteLayerOrder").click();
  expect((await asked).arrange).toBe("unite");
  await expect(page.locator("#layerOrderDiffers")).toHaveCount(0);

  asked = sent(page);
  await page.locator("#resetLayerOrder").click();
  expect((await asked).arrange).toBe("reset");
  await expect(page.locator("#resetLayerOrder")).toHaveCount(0);
});

// 50: the styles a built-in map shipped with come back where they were taken out.
test("the styles the map shipped with are restored", async ({ page }) => {
  await openEdit(page);
  const asked = sent(page);
  await page.locator("#restoreStyles").click();
  expect((await asked).arrange).toBe("restoreStyles");
  await expect.poll(() => styleNames(page)).toContain("Classic");
  await expect(page.locator("#restoreStyles")).toHaveCount(0);
});

// 53: an edited style on screen goes back to published, as Edit map's row offers.
test("an edited style is reset to published", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await showAllMaps(page);
  await page.locator("#others .row", { hasText: "Bratislava" }).click();
  await expect(page.locator("#current .hero b")).toHaveText("Bratislava");
  await page.locator("#editButton").click();
  await page.locator("#availability").waitFor();
  const asked = sent(page);
  await page.locator("#resetStyle").click();
  expect((await asked).resetStyle).toBe("6F1E2A10-0000-4000-8000-0000000000D1");
  await expect(page.locator("#resetStyle")).toHaveCount(0);
});

// 50: mixed sources reorder once grouped, so the page asks first, as Edit map does.
test("grouping by source asks first and is sent once agreed", async ({ page }) => {
  await openEdit(page);
  const grouping = page.locator("#groupBySource").getByRole("switch", { name: "Group by source" });
  await expect(grouping).not.toBeChecked();

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Group the layers by source?");
    void dialog.dismiss();
  });
  await grouping.click();
  await expect(page.locator("#groupBySource").getByRole("switch")).not.toBeChecked();

  page.once("dialog", (dialog) => void dialog.accept());
  const asked = sent(page);
  await page.locator("#groupBySource").getByRole("switch").click();
  expect((await asked).groupByOrigin).toBe("1");
  await expect(page.locator("#groupBySource").getByRole("switch")).toBeChecked();
  await expect.poll(() => page.evaluate(() => __riki.state().portable.stack.map((layer) => layer.name)))
    .toEqual(["Huts", "Trails"]);
});

// 50: each of Availability's switches by its own key, read back from the phone.
for (const [name, key] of [["In the map switcher", "picker"], ["In the CarPlay switcher", "carPlay"],
  ["Show legend", "legend"], ["Show the world around", "world"]]) {
  test(`Availability's ${key} switch is turned off and on`, async ({ page }) => {
    await openEdit(page);
    const toggle = () => page.locator(`#availability [data-switch=${key}]`).getByRole("switch", { name });
    await expect(toggle()).toBeChecked();
    let asked = sent(page);
    await toggle().click();
    expect((await asked)[key]).toBe("0");
    await expect.poll(() => page.evaluate(() => __riki.state().switches)).toMatchObject({ [key]: false });
    await expect(toggle()).not.toBeChecked();

    asked = sent(page);
    await toggle().click();
    expect((await asked)[key]).toBe("1");
    await expect(toggle()).toBeChecked();
  });
}

// 50: off under Settings › Map, the map's own switch is off and says why.
test("a legend hidden on every map cannot be switched on for one", async ({ page, request }) => {
  await phone(request, "legend-everywhere", { on: "0" });
  await openEdit(page);
  const legend = page.locator("#availability [data-switch=legend]");
  await expect(legend.getByRole("switch")).toBeDisabled();
  await expect(legend.getByRole("switch")).not.toBeChecked();
  await expect(legend).toContainText("Hidden on every map under Settings › Map");
});

// 50: an editor of a shared map reads the owner's legend and world; the switchers stay theirs.
test("an editor who is not the owner cannot change the legend or the world", async ({ page, request }) => {
  await phone(request, "reader");
  await openEdit(page);
  await expect(page.locator("#availability [data-switch=legend]").getByRole("switch")).toBeDisabled();
  await expect(page.locator("#availability [data-switch=world]").getByRole("switch")).toBeDisabled();
  await expect(page.locator("#availability [data-switch=picker]").getByRole("switch")).toBeEnabled();
  await expect(page.locator("#editBody")).toContainText("The map’s owner sets the legend for everyone.");
});

// 50: Edit map's Duplicate, the copy opened as a new map is.
test("the map is duplicated and the copy opens", async ({ page }) => {
  await openEdit(page);
  const asked = page.waitForRequest((request) => request.url().endsWith("/duplicate") && request.method() === "POST");
  await page.locator("#duplicateMap").click();
  await asked;
  await expect.poll(() => page.evaluate(() => __riki.state().portable?.name)).toBe("High Tatras copy");
  await expect.poll(() => page.evaluate(() => __riki.state().portable?.styles.map((style) => style.name)))
    .toEqual(["Summer", "Winter"]);
});
