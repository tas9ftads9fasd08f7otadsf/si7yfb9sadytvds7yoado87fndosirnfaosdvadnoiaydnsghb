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

// Writes a title through the page and waits for the phone's answer to be read back.
async function write(page, field, text) {
  const asked = sent(page);
  const read = reread(page);
  await field.fill(text);
  await field.press("Enter");
  await asked;
  await read;
}

// 81: the header's title is translated into a language added, changed, and taken away again.
test("the header title is translated, changed and removed", async ({ page }) => {
  const panel = await openLayout(page);
  const header = panel.locator("[data-part='header']");
  // A title not written yet takes no translation, so none is offered.
  await expect(header.locator("details.translations")).toHaveCount(0);
  await write(page, header.getByRole("textbox", { name: "Header Title" }), "{line}");

  const part = header.locator("details.translations");
  await part.locator("summary").click();
  await part.getByRole("combobox", { name: "Add a language · Header" }).selectOption("de");
  const field = part.getByRole("textbox", { name: "Header · German" });
  await expect(field).toBeFocused();

  let asked = sent(page);
  await field.fill("Linie");
  await field.press("Enter");
  expect(await asked).toMatchObject({ layer, details: "translation", target: "header", language: "de", text: "Linie" });
  await expect(part.locator("summary")).toHaveText("Other languages (1)");
  await expect(field).toHaveValue("Linie");

  asked = sent(page);
  await field.fill("Linien");
  await field.press("Enter");
  expect(await asked).toMatchObject({ target: "header", language: "de", text: "Linien" });
  await expect(field).toHaveValue("Linien");

  asked = sent(page);
  await part.getByRole("button", { name: "Remove · Header · German" }).click();
  expect(await asked).toMatchObject({ target: "header", language: "de", text: "" });
  await expect(part.getByRole("textbox", { name: "Header · German" })).toHaveCount(0);
  await expect(part.locator("summary")).toHaveText("Other languages");
});

// 81: a section's title, a text block's heading and a custom button's label each take a translation.
test("a section, a text block and a button are translated", async ({ page }) => {
  const panel = await openLayout(page);
  const section = panel.locator(".layout-section[data-section='0']");
  await write(page, section.locator("> .section-head").getByRole("textbox"), "Facts");
  await pickPart(page, "Text");
  const text = panel.locator(".settings-pane .layout-block[data-handle='t1']");
  await write(page, text.getByRole("textbox", { name: "Title" }), "About");

  const sectionPart = section.locator("> details.translations");
  await sectionPart.locator("summary").click();
  await sectionPart.getByRole("combobox", { name: "Add a language · Title 1" }).selectOption("sk");
  let asked = sent(page);
  await sectionPart.getByRole("textbox", { name: "Title 1 · Slovak" }).fill("Fakty");
  await sectionPart.getByRole("textbox", { name: "Title 1 · Slovak" }).press("Enter");
  expect(await asked).toMatchObject({ details: "translation", target: "section", section: "0", language: "sk",
    text: "Fakty" });

  const textPart = text.locator("details.translations");
  await textPart.locator("summary").click();
  await textPart.getByRole("combobox", { name: "Add a language · Text 1.2" }).selectOption("de");
  asked = sent(page);
  await textPart.getByRole("textbox", { name: "Text 1.2 · German" }).fill("Über");
  await textPart.getByRole("textbox", { name: "Text 1.2 · German" }).press("Enter");
  expect(await asked).toMatchObject({ target: "text", section: "0", block: "1", was: "t1", language: "de", text: "Über" });

  await pickPart(page, "Action buttons");
  const actions = panel.locator(".settings-pane [data-part='actions']");
  await actions.getByRole("button", { name: "Add action buttons" }).click();
  await actions.getByRole("button", { name: "Add custom button" }).click();
  const button = actions.locator(".button-fields");
  const buttonPart = button.locator("details.translations");
  await buttonPart.locator("summary").click();
  await buttonPart.getByRole("combobox", { name: /^Add a language/ }).selectOption("de");
  asked = sent(page);
  await buttonPart.getByRole("textbox", { name: /· German$/ }).fill("Eigener Knopf");
  await buttonPart.getByRole("textbox", { name: /· German$/ }).press("Enter");
  const byID = await asked;
  expect(byID).toMatchObject({ target: "button", language: "de", text: "Eigener Knopf" });
  expect(byID.button).toBeTruthy();

  // Moved below the rows it is a block, and names its place and handle instead.
  asked = sent(page);
  await button.getByRole("combobox", { name: "Place" }).selectOption("belowRows");
  await asked;
  await panel.locator(".layout-pane .layout-item[data-block='button'] .part-card").click();
  const placed = panel.locator(".settings-pane .layout-block[data-block='button']");
  const placedPart = placed.locator("details.translations");
  await expect(placedPart.locator("summary")).toHaveText("Other languages (1)");
  await placedPart.locator("summary").click();
  asked = sent(page);
  await placedPart.getByRole("textbox", { name: /· German$/ }).fill("Neuer Knopf");
  await placedPart.getByRole("textbox", { name: /· German$/ }).press("Enter");
  expect(await asked).toMatchObject({ target: "button", section: "0", was: expect.stringMatching(/^h/), language: "de",
    text: "Neuer Knopf" });
});

// 81: a language the phone no longer speaks is refused in its words, and the part stays usable.
test("an unknown language shows the phone's words", async ({ page, request }) => {
  const panel = await openLayout(page);
  const header = panel.locator("[data-part='header']");
  await write(page, header.getByRole("textbox", { name: "Header Title" }), "{line}");
  const part = header.locator("details.translations");
  await part.locator("summary").click();
  await phone(request, "forget-language", { code: "sk" });
  await part.getByRole("combobox", { name: "Add a language · Header" }).selectOption("sk");
  const read = reread(page);
  await part.getByRole("textbox", { name: "Header · Slovak" }).fill("Linka");
  await part.getByRole("textbox", { name: "Header · Slovak" }).press("Enter");
  await expect(page.locator("#notice")).toContainText("The app has no such language");
  await read;
});

// 81: a title taken away on the phone leaves nothing to translate, and the refusal says so.
test("a title no longer written refuses a translation", async ({ page, request }) => {
  const panel = await openLayout(page);
  const section = panel.locator(".layout-section[data-section='0']");
  await write(page, section.locator("> .section-head").getByRole("textbox"), "Facts");
  await phone(request, "blanks-titles");
  const part = section.locator("> details.translations");
  await part.locator("summary").click();
  await part.getByRole("combobox", { name: "Add a language · Title 1" }).selectOption("de");
  await part.getByRole("textbox", { name: "Title 1 · German" }).fill("Fakten");
  await part.getByRole("textbox", { name: "Title 1 · German" }).press("Enter");
  await expect(page.locator("#notice")).toContainText("This map cannot draw that layer");
});

// 81: a layout that moved on the phone is refused, and shown again as it now stands.
test("a moved layout refuses a translation", async ({ page, request }) => {
  const panel = await openLayout(page);
  await pickPart(page, "Text");
  const text = panel.locator(".settings-pane .layout-block[data-handle='t1']");
  await write(page, text.getByRole("textbox", { name: "Title" }), "About");
  const part = text.locator("details.translations");
  await part.locator("summary").click();
  await phone(request, "moves-layout");
  await part.getByRole("combobox", { name: "Add a language · Text 1.2" }).selectOption("de");
  const read = reread(page);
  await part.getByRole("textbox", { name: "Text 1.2 · German" }).fill("Über");
  await part.getByRole("textbox", { name: "Text 1.2 · German" }).press("Enter");
  await expect(page.locator("#notice")).toContainText("The layout changed on the phone");
  await read;
  await expect(panel.locator(".layout-pane .layout-item[data-handle='t1x']")).toBeVisible();
});

// 81: a phone naming no languages, holding no translation, shows no translations part at all.
test("a phone without languages shows no translations", async ({ page, request }) => {
  await phone(request, "forget-language", { code: "de" });
  await phone(request, "forget-language", { code: "sk" });
  const panel = await openLayout(page);
  await expect(panel.locator(".layout-header")).toBeVisible();
  await expect(panel.locator("details.translations")).toHaveCount(0);
});

// 81: an older phone names languages but sends no `takesTranslations`, so no part is shown.
test("a phone that names languages but sends no flag shows no translations", async ({ page, request }) => {
  await phone(request, "takes-no-translations");
  const panel = await openLayout(page);
  await expect(panel.locator(".layout-header")).toBeVisible();
  await expect(panel.locator("details.translations")).toHaveCount(0);
});
