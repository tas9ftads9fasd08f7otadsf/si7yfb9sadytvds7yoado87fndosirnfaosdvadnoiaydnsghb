import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

const layer = "6F1E2A10-0000-4000-8000-0000000000A5";

test.beforeEach(async ({ request }) => {
  await reset(request);
  await phone(request, "laid-out-layer");
});

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

async function openLayout(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  const row = page.locator("#editBody .layer-item", { has: page.locator("input[value='Trams']") });
  await row.getByRole("button", { name: "Options" }).click();
  return page.locator(`[data-options='${layer}']`);
}

// 29: a block moves by its place and handle, and the panel reads the phone's layout back.
test("a block of the Details layout is moved and removed", async ({ page }) => {
  const panel = await openLayout(page);
  const blocks = panel.locator(".layout-block");
  await expect(blocks).toHaveCount(2);

  let asked = sent(page);
  await panel.getByRole("button", { name: "Move down Info rows" }).click();
  expect(await asked).toMatchObject({ layer, details: "move", section: "0", block: "0", was: "r1", toPlace: "1" });
  await expect(blocks.first()).toHaveAttribute("data-handle", "t1");

  asked = sent(page);
  await panel.getByRole("button", { name: "Remove Info rows" }).click();
  expect(await asked).toMatchObject({ details: "remove", block: "1", was: "r1" });
  await expect(blocks).toHaveCount(1);
});

// 29: a text block is added at the foot of its section, reading one of the layer's keys.
test("a text block is added to the Details layout", async ({ page }) => {
  const panel = await openLayout(page);
  await panel.getByRole("combobox", { name: "Add content" }).selectOption("text");
  await panel.locator(".add-content").getByRole("combobox", { name: "Value" }).fill("{line}");

  const asked = sent(page);
  await panel.locator(".add-content").getByRole("button", { name: "Add content" }).click();
  expect(await asked).toMatchObject({ details: "add", kind: "text", value: "{line}", section: "0", place: "2" });
  await expect(panel.locator(".layout-block")).toHaveCount(3);
  await expect(panel).toContainText("3 of 10 content blocks used");
});

// 50: a text block's heading, words and style, each sent with the block's place and handle.
test("a text block's heading, value and style are edited", async ({ page }) => {
  const panel = await openLayout(page);
  const text = panel.locator(".layout-block[data-handle='t1']");

  let asked = sent(page);
  await text.getByRole("textbox", { name: "Title" }).fill("Line");
  await text.getByRole("textbox", { name: "Title" }).press("Enter");
  expect(await asked).toMatchObject({ details: "edit", section: "0", block: "1", was: "t1", title: "Line",
    value: "{note}" });

  asked = sent(page);
  await text.getByRole("textbox", { name: "Value" }).fill("{line}");
  await text.getByRole("textbox", { name: "Title" }).focus();
  expect(await asked).toMatchObject({ details: "edit", was: "t1", value: "{line}" });

  asked = sent(page);
  await text.getByRole("combobox", { name: "Text" }).selectOption("warning");
  expect(await asked).toMatchObject({ details: "edit", was: "t1", style: "warning" });
  await expect(panel.locator(".layout-block[data-handle='t1']").getByRole("combobox", { name: "Text" }))
    .toHaveValue("warning");
});

// 50: sections are added, titled and removed; the last one stays.
test("a section is added, titled and removed", async ({ page }) => {
  const panel = await openLayout(page);
  await expect(panel.getByRole("button", { name: "Remove section" })).toHaveCount(0);

  let asked = sent(page);
  await panel.getByRole("button", { name: "Add section" }).click();
  expect(await asked).toMatchObject({ layer, details: "addSection" });
  await expect(panel.locator(".layout-section")).toHaveCount(2);

  asked = sent(page);
  const title = panel.locator(".layout-section[data-section='1']").getByRole("textbox", { name: "Title" }).first();
  await title.fill("Timetable");
  await title.press("Enter");
  expect(await asked).toMatchObject({ details: "sectionTitle", section: "1", title: "Timetable" });

  asked = sent(page);
  await panel.locator(".layout-section[data-section='1']").getByRole("button", { name: "Remove section" }).click();
  expect(await asked).toMatchObject({ details: "removeSection", section: "1" });
  await expect(panel.locator(".layout-section")).toHaveCount(1);
});
