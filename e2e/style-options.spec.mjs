import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const WINTER = "6F1E2A10-0000-4000-8000-0000000000B2";

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

// 51: a style's own icon, its ground and its note, as the phone's style page sets them.
test("a style's icon, colour and note are set from its options", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#availability").waitFor();
  await page.getByRole("button", { name: "Options Winter" }).click();
  const options = page.locator(`[data-style-options="${WINTER}"]`);

  let asked = sent(page);
  await options.locator('[data-symbol="snowflake"]').click();
  expect(await asked).toMatchObject({ style: WINTER, symbol: "snowflake" });
  await expect(options.locator('[data-symbol="snowflake"]')).toHaveAttribute("aria-pressed", "true");

  asked = sent(page);
  await options.locator('[data-hex="#B5D8F2"]').click();
  expect(await asked).toMatchObject({ style: WINTER, iconTint: "#B5D8F2" });
  await expect(options.locator('[data-hex="#B5D8F2"]')).toHaveAttribute("aria-pressed", "true");

  asked = sent(page);
  const note = page.getByRole("textbox", { name: "Note Winter" });
  await note.fill("For the snow");
  await note.press("Enter");
  expect(await asked).toMatchObject({ style: WINTER, note: "For the snow" });
  await expect(note).toHaveValue("For the snow");

  await page.getByRole("combobox", { name: "Add a language · Winter" }).selectOption("sk");
  asked = sent(page);
  const slovak = page.getByRole("textbox", { name: "Name · Slovak · Winter" });
  await slovak.fill("Zima");
  await slovak.press("Enter");
  expect(await asked).toMatchObject({ style: WINTER, language: "sk", name: "Zima" });
  await expect(slovak).toHaveValue("Zima");
});
