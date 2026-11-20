import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

const layer = "6F1E2A10-0000-4000-8000-0000000000D1";

test.beforeEach(async ({ request }) => {
  await reset(request);
  await phone(request, "drawn-file");
});

async function openMarks(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  const row = page.locator(`#editBody [data-layer='${layer}']`);
  await row.getByRole("button", { name: "Options" }).click();
  return page.locator(`[data-options='${layer}']`);
}

const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

// 64: a dot becomes a badge wearing the phone's first icon, then another icon and its colour.
test("a drawn file's points wear a badge, its icon and its icon colour", async ({ page }) => {
  const panel = await openMarks(page);
  const mark = panel.getByRole("combobox", { name: "Mark" });
  await expect(mark).toHaveValue("dot");
  await expect(panel.getByRole("group", { name: "Icon" })).toHaveCount(0);

  let asked = sent(page);
  await mark.selectOption("circled");
  expect(await asked).toMatchObject({ layer, pointMark: "circled" });
  const icons = panel.getByRole("group", { name: "Icon", exact: true });
  await expect(icons.locator("[data-symbol='mappin']")).toHaveAttribute("aria-pressed", "true");

  asked = sent(page);
  await panel.getByRole("group", { name: "Icon · Outdoors" }).locator("[data-symbol='tree']").click();
  expect(await asked).toMatchObject({ layer, pointIcon: "tree" });
  await expect(icons.locator("[data-symbol='tree']")).toHaveAttribute("aria-pressed", "true");

  asked = sent(page);
  await panel.getByRole("group", { name: "Icon colour" }).locator("[data-hex='#E5533D']").click();
  expect(await asked).toMatchObject({ layer, pointIconColour: "#E5533D" });
  await expect(panel.getByRole("group", { name: "Icon colour" }).locator("[data-hex='#E5533D']"))
    .toHaveAttribute("aria-pressed", "true");
});

// 64: an icon alone has no circle, so its padding and icon colour rows go; the size stays.
test("an icon alone drops the circle's rows", async ({ page }) => {
  const panel = await openMarks(page);
  let asked = sent(page);
  await panel.getByRole("combobox", { name: "Mark" }).selectOption("alone");
  expect(await asked).toMatchObject({ layer, pointMark: "alone" });
  await expect(panel.getByRole("slider", { name: "Circle padding" })).toHaveCount(0);
  await expect(panel.getByRole("group", { name: "Icon colour" })).toHaveCount(0);

  asked = sent(page);
  await panel.getByRole("slider", { name: "Point size" }).fill("2");
  expect(await asked).toMatchObject({ layer, pointSize: "2" });
  await expect(panel.getByRole("slider", { name: "Point size" })).toHaveValue("2");
});
