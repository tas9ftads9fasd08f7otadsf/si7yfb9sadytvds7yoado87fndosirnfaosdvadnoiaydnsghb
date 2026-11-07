import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openEdit(page) {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
}

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

// 2958: the map's own mark leads the suggestions, and a picked one leads them next.
test("Edit map changes the icon's symbol", async ({ page }) => {
  await openEdit(page);
  const marks = page.locator("#mapSymbols button");
  await expect(marks).toHaveCount(3);
  await expect(marks.first()).toHaveAttribute("data-symbol", "mountain.2");
  await expect(marks.first()).toHaveAttribute("aria-pressed", "true");

  const asked = sent(page);
  await page.locator("#mapSymbols [data-symbol=tent]").click();
  expect((await asked).symbol).toBe("tent");
  await expect(page.locator("#mapSymbols [data-symbol=tent]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#mapSymbols button").first()).toHaveAttribute("data-symbol", "tent");
});

// 2958: a ground from the palette, any colour from the browser's picker, or the map's own.
test("Edit map changes the icon's ground, and Automatic takes it away", async ({ page }) => {
  await openEdit(page);
  await expect(page.locator("#iconTints [data-hex='#3A7D44']")).toHaveAttribute("aria-pressed", "true");

  let asked = sent(page);
  await page.locator("#iconTints [data-hex='#B5D8F2']").click();
  expect((await asked).iconTint).toBe("#B5D8F2");
  await expect(page.locator("#iconTints [data-hex='#B5D8F2']")).toHaveAttribute("aria-pressed", "true");

  asked = sent(page);
  await page.locator("#iconTints input[type=color]").fill("#123456");
  expect((await asked).iconTint).toBe("#123456");
  await expect(page.locator("#iconTints [data-hex='#123456']")).toHaveAttribute("aria-pressed", "true");

  asked = sent(page);
  await page.getByRole("group", { name: "Background" }).getByRole("button", { name: "Automatic" }).click();
  expect((await asked).iconTint).toBe("");
  await expect(page.getByRole("group", { name: "Background" }).getByRole("button", { name: "Automatic" }))
    .toHaveAttribute("aria-pressed", "true");
});

// 2958: a dark map is drawn dark in a light browser, as the phone builds its style.
test("Edit map sets the map dark, and the map is drawn dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openEdit(page);
  const looks = page.getByRole("group", { name: "Appearance" });
  await expect(looks.getByRole("button", { name: "Automatic" })).toHaveAttribute("aria-pressed", "true");

  const asked = sent(page);
  const drawn = page.waitForResponse((response) => response.url().includes("/style?") && response.ok());
  await looks.getByRole("button", { name: "Dark" }).click();
  expect((await asked).appearance).toBe("dark");
  const style = await (await drawn).json();
  expect(style.layers[0].paint["background-color"]).toBe("#1d2a22");
  await expect(looks.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
});
