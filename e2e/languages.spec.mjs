import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openEdit(page) {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
}

// 2919: a translation written on the phone is there to change in the browser.
test("a name in another language is shown and changed", async ({ page }) => {
  await openEdit(page);
  const slovak = page.getByRole("textbox", { name: "Name · Slovak" });
  await expect(slovak).toHaveValue("Vysoké Tatry");
  const asked = page.waitForRequest((request) => request.url().includes("/edit?")
    && new URL(request.url()).searchParams.get("language") === "sk");
  await slovak.fill("Tatry");
  await slovak.press("Tab");
  expect(new URL((await asked).url()).searchParams.get("name")).toBe("Tatry");
  await expect(page.getByRole("textbox", { name: "Name · Slovak" })).toHaveValue("Tatry");
});

// 2919: a language is added from the ones the app speaks, written, and taken away again.
test("a language is added, written in and removed", async ({ page }) => {
  await openEdit(page);
  const picker = page.locator("#addLanguage");
  await expect(picker.locator("option")).toHaveText(["Add a language", "German"]);
  await picker.selectOption("de");
  const note = page.getByRole("textbox", { name: "Note · German" });
  await note.fill("Sommerwege");
  await note.blur();
  await expect.poll(() => page.evaluate(() => __riki.state().portable.noteTranslations?.de)).toBe("Sommerwege");
  await expect(page.locator("#addLanguage")).toHaveCount(0);

  await page.getByRole("button", { name: "Remove · German" }).click();
  await expect(page.locator("[data-language=de]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => __riki.state().portable.noteTranslations?.de)).toBeUndefined();
  await expect(page.locator("#addLanguage option")).toHaveText(["Add a language", "German"]);
});
