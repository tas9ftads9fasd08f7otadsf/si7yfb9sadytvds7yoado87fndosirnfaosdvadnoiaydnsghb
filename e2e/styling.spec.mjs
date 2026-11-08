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

// 3002: a chosen file becomes the icon's picture; the preview is the map as the browser draws it.
test("Edit map sets the icon's picture and takes the preview", async ({ page, request }) => {
  await openEdit(page);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==",
    "base64");
  await page.locator("#iconPictureFile").setInputFiles({ name: "hut.png", mimeType: "image/png", buffer: png });
  await expect(page.locator("[data-picture=icon]")).toBeVisible();
  await page.getByRole("button", { name: "Remove the picture" }).click();
  await expect(page.locator("[data-picture=icon]")).toHaveCount(0);

  await page.getByRole("button", { name: "Take", exact: true }).click();
  await expect(page.locator("[data-picture=preview]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  const kinds = await (await request.get("/__test/pictures")).json();
  expect(kinds[0]).toBe("icon:" + png.length);
  expect(kinds[1]).toBe("icon:0");
  expect(kinds[2]).toMatch(/^preview:[1-9]\d*$/);
});
