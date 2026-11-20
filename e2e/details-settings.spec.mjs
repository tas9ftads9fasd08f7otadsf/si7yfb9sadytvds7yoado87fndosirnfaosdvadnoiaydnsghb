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

async function openLayout(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  const row = page.locator("#editBody .layer-item", { has: page.locator("input[value='Trams']") });
  await row.getByRole("button", { name: "Options" }).click();
  // 95 the layout opens as W16's page of its own
  await page.locator(`[data-options='${layer}'] [data-layer-details]`).click();
  await page.locator("#details .layout-pane").waitFor();
  return page.locator("#details");
}

// 55: the header's title and icon are sent together, and the panel reads them back.
test("the Details header takes a title and an icon", async ({ page }) => {
  const panel = await openLayout(page);
  const header = panel.locator("[data-part='header']");
  let asked = sent(page);
  await header.getByRole("textbox", { name: "Header Title" }).fill("{line}");
  const read = reread(page);
  await header.getByRole("textbox", { name: "Header Title" }).press("Enter");
  expect(await asked).toMatchObject({ layer, details: "header", title: "{line}", symbol: "" });
  await read;

  asked = sent(page);
  // 111 W16's icon tiles in place of a drop-down
  await header.getByRole("group", { name: "Header Icon" }).getByRole("button", { name: "tram.fill" }).click();
  expect(await asked).toMatchObject({ details: "header", title: "{line}", symbol: "tram.fill" });
  await expect(header.getByRole("group", { name: "Header Icon" }).getByRole("button", { name: "tram.fill" }))
    .toHaveAttribute("aria-pressed", "true");
});

// 55: the action buttons are added, switched, given a custom button that is edited, and removed.
test("the action buttons and a custom button are set", async ({ page }) => {
  const panel = await openLayout(page);
  await pickPart(page, "Action buttons");
  const actions = panel.locator(".settings-pane [data-part='actions']");
  let asked = sent(page);
  await actions.getByRole("button", { name: "Add action buttons" }).click();
  expect(await asked).toMatchObject({ details: "addActions" });

  asked = sent(page);
  await actions.getByRole("switch", { name: "Copy" }).click();
  expect(await asked).toMatchObject({ details: "action", name: "copy", on: "1" });
  await expect(actions.getByRole("button", { name: "Move up Copy" })).toBeVisible();

  asked = sent(page);
  await actions.getByRole("button", { name: "Add custom button" }).click();
  expect(await asked).toMatchObject({ details: "addButton" });
  const button = actions.locator(".button-fields");
  await expect(button).toHaveCount(1);

  asked = sent(page);
  await button.getByRole("combobox", { name: "When tapped" }).selectOption("call");
  expect(await asked).toMatchObject({ details: "button", action: "call", label: "Custom button" });
  await expect(button.getByRole("textbox", { name: "Number" })).toBeVisible();

  asked = sent(page);
  await button.getByRole("combobox", { name: "Place" }).selectOption("belowRows");
  expect(await asked).toMatchObject({ details: "buttonPlace" });
  await expect(button).toHaveCount(0);
  await panel.locator(".layout-pane .layout-item[data-block='button'] .part-card").click();
  const placed = panel.locator(".settings-pane .layout-block[data-block='button'] .button-fields");
  await expect(placed).toHaveCount(1);

  asked = sent(page);
  await placed.getByRole("combobox", { name: "Place" }).selectOption("withActions");
  expect(await asked).toMatchObject({ details: "buttonPlace", section: "0" });
  await pickPart(page, "Action buttons");
  await expect(button).toHaveCount(1);

  asked = sent(page);
  await actions.getByRole("button", { name: "Remove from Details" }).click();
  expect(await asked).toMatchObject({ details: "removeActions" });
  await expect(actions.getByRole("button", { name: "Add action buttons" })).toBeVisible();
});

// 55: a text block's icon and a rows block's rows, each by the block's place and handle.
test("a block's own settings and rows are set", async ({ page }) => {
  const panel = await openLayout(page);
  await pickPart(page, "Text");
  let asked = sent(page);
  await panel.getByRole("switch", { name: "A note icon before the text" }).click();
  expect(await asked).toMatchObject({ details: "blockSettings", block: "1", was: "t1", icon: "1" });
  await expect(panel.getByRole("switch", { name: "A note icon before the text" })).toBeChecked();

  await pickPart(page, "Info rows");
  const rows = panel.locator(".settings-pane .layout-block[data-handle='r1']");
  await rows.getByRole("textbox", { name: "Add a row Name" }).fill("Line");
  await rows.getByRole("textbox", { name: "Add a row Value" }).fill("{line}");
  asked = sent(page);
  await rows.getByRole("button", { name: "Add a row" }).click();
  expect(await asked).toMatchObject({ details: "addRow", was: "r1", title: "Line", value: "{line}" });
  await expect(rows.locator(".layout-row")).toHaveCount(2);

  asked = sent(page);
  await rows.getByRole("button", { name: "Remove Speed" }).click();
  expect(await asked).toMatchObject({ details: "removeRow", row: "0" });
  await expect(rows.locator(".layout-row")).toHaveCount(1);
});

// 114 TestFlight ANfx: a shape is switched off and the panel reads it back off.
test("taps on the layer's areas are switched off", async ({ page }) => {
  const panel = await openLayout(page);
  const taps = panel.getByRole("group", { name: "A tap opens Details on" });
  await expect(taps.getByRole("checkbox")).toHaveCount(3);
  const asked = sent(page);
  const read = reread(page);
  await taps.getByRole("checkbox", { name: "Areas" }).click();
  expect(await asked).toMatchObject({ layer, details: "taps", kind: "areas", on: "0" });
  await read;
  await expect(taps.getByRole("checkbox", { name: "Areas" })).not.toBeChecked();
  await expect(taps.getByRole("checkbox", { name: "Points" })).toBeChecked();
});
