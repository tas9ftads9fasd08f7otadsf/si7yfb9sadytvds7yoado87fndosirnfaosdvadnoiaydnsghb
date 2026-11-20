import { test, expect } from "@playwright/test";
import { openViewer, phone, pickPart, reset } from "./phone.mjs";

const layer = "6F1E2A10-0000-4000-8000-0000000000A5";

test.beforeEach(async ({ request }) => {
  await reset(request);
  await phone(request, "laid-out-layer");
});

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

const reread = (page) => page.waitForResponse((response) => response.url().includes("layer-options"));

async function openRows(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  const row = page.locator("#editBody .layer-item", { has: page.locator("input[value='Trams']") });
  await row.getByRole("button", { name: "Options" }).click();
  // 95 the layout opens as W16's page, the rows block's settings once its card is picked
  await page.locator(`[data-options='${layer}'] [data-layer-details]`).click();
  await pickPart(page, "Info rows");
  return page.locator("#details .settings-pane .layout-block[data-handle='r1']");
}

const marks = (rows) => rows.locator(".layout-row [data-symbol]");

// 80: a row's icon is picked among the phone's groups, and the page reads the new one back.
test("a row's icon is set from the picker", async ({ page }) => {
  const rows = await openRows(page);
  const speed = rows.locator(".layout-row[data-row='0']");
  await speed.getByRole("button", { name: "Icon 1" }).click();
  // The mark the row wears comes first, though no group lists it.
  await expect(marks(rows).first()).toHaveAttribute("data-symbol", "gauge");
  await expect(marks(rows).first()).toHaveAttribute("aria-pressed", "true");
  await expect(rows.getByRole("group", { name: "Nature" })).toBeVisible();

  const asked = sent(page);
  const read = reread(page);
  await speed.getByRole("button", { name: "bus.fill" }).click();
  expect(await asked).toMatchObject({ layer, details: "editRow", was: "r1", row: "0", title: "Speed",
    value: "{speed}", symbol: "bus.fill" });
  await read;

  await speed.getByRole("button", { name: "Icon 1" }).click();
  await expect(rows.locator("[data-symbol='bus.fill']")).toHaveAttribute("aria-pressed", "true");
  await expect(rows.locator("[data-symbol='gauge']")).toHaveCount(0);
});

// 80: a row added with an icon wears it; one added without wears the phone's first.
test("a row is added with an icon", async ({ page }) => {
  const rows = await openRows(page);
  await rows.getByRole("textbox", { name: "Add a row Name" }).fill("Line");
  await rows.getByRole("textbox", { name: "Add a row Value" }).fill("{line}");
  await rows.locator(".add-row").getByRole("button", { name: "Icon", exact: true }).click();
  await rows.getByRole("button", { name: "leaf.fill" }).click();
  const asked = sent(page);
  await rows.locator(".add-row").getByRole("button", { name: "Add a row", exact: true }).click();
  expect(await asked).toMatchObject({ details: "addRow", was: "r1", title: "Line", value: "{line}", symbol: "leaf.fill" });
  await expect(rows.locator(".layout-row")).toHaveCount(2);

  await rows.locator(".layout-row[data-row='1']").getByRole("button", { name: "Icon 2" }).click();
  await expect(rows.locator(".layout-row[data-row='1'] [data-symbol='leaf.fill']")).toHaveAttribute("aria-pressed", "true");
});

// 80: an icon the phone stopped offering is refused in its words, and the list is read again without it.
test("a refused icon shows the phone's words", async ({ page, request }) => {
  const rows = await openRows(page);
  const speed = rows.locator(".layout-row[data-row='0']");
  await speed.getByRole("button", { name: "Icon 1" }).click();
  await phone(request, "forget-symbol", { symbol: "bus.fill" });
  const read = reread(page);
  await speed.getByRole("button", { name: "bus.fill" }).click();
  await expect(page.locator("#notice")).toContainText("Edit map offers no such icon");
  await read;
  await speed.getByRole("button", { name: "Icon 1" }).click();
  await expect(rows.locator("[data-symbol='bus.fill']")).toHaveCount(0);
  await expect(rows.locator("[data-symbol='car.fill']")).toBeVisible();
});

// 80: a layout that moved on the phone is refused, and shown again as it now stands.
test("a moved layout refuses the icon", async ({ page, request }) => {
  const rows = await openRows(page);
  await phone(request, "moves-layout");
  const speed = rows.locator(".layout-row[data-row='0']");
  await speed.getByRole("button", { name: "Icon 1" }).click();
  const read = reread(page);
  await speed.getByRole("button", { name: "car.fill" }).click();
  await expect(page.locator("#notice")).toContainText("The layout changed on the phone");
  await read;
  await expect(page.locator("#details .layout-pane .layout-item[data-handle='r1x']")).toBeVisible();
});

// 80: a phone that lists no icon groups gets no picker, and its rows are still edited.
test("an older phone's rows have no icon picker", async ({ page, request }) => {
  await phone(request, "lists-no-row-icons");
  const rows = await openRows(page);
  await expect(rows.locator(".layout-row")).toHaveCount(1);
  await expect(rows.getByRole("button", { name: "Icon 1" })).toHaveCount(0);
  await expect(rows.locator(".add-row").getByRole("button", { name: "Icon", exact: true })).toHaveCount(0);
  const asked = sent(page);
  await rows.getByRole("textbox", { name: "Name 1" }).fill("Pace");
  await rows.getByRole("textbox", { name: "Name 1" }).press("Enter");
  const query = await asked;
  expect(query).toMatchObject({ details: "editRow", title: "Pace" });
  expect(query).not.toHaveProperty("symbol");
});
