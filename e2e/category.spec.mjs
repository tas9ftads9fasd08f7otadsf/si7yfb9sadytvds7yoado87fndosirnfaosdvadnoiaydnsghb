import { test, expect } from "@playwright/test";
import { editTab, openViewer, phone, reset, showAllMaps } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openGeneral(page, other = null) {
  await openViewer(page, "/e/7q4-k29");
  if (other) {
    await showAllMaps(page);
    await page.locator("#others .row", { hasText: other }).click();
    await expect(page.locator("#current .hero b")).toHaveText(other);
  }
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  await editTab(page, "General");
  await page.locator("#category").waitFor();
}

const edits = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => Object.fromEntries(new URL(request.url()).searchParams));

// 142: the field under the note shows the map's own label, "None" while there is none, and offers the others'.
test("the Category field shows the map's label and offers the maps' own categories", async ({ page }) => {
  await openGeneral(page);
  await expect(page.locator("#editBody h2", { hasText: "Category" })).toBeVisible();
  await expect(page.locator("#category")).toHaveValue("Hiking");
  await expect(page.locator("#category")).toHaveAttribute("maxlength", "40");
  await expect(page.locator("#categoryList option")).toHaveCount(1);
  await expect(page.locator("#categoryList option")).toHaveAttribute("value", "Hiking");
});

// 142: Enter saves it cleaned, as category=, and the phone's map is what the field and the list show.
test("a category is set cleaned on Enter, and offered for the other maps", async ({ page }) => {
  await openGeneral(page, "Bratislava");
  await expect(page.locator("#category")).toHaveValue("");
  await expect(page.locator("#category")).toHaveAttribute("placeholder", "None");
  const asked = edits(page);
  await page.locator("#category").fill("  Day   trips ");
  await page.locator("#category").press("Enter");
  expect(await asked).toMatchObject({ category: "Day trips" });
  await expect(page.locator("#category")).toHaveValue("Day trips");
  await expect(page.locator("#categoryList option[value='Day trips']")).toHaveCount(1);
  await expect(page.locator("#categoryList option[value='Hiking']")).toHaveCount(1);
  // The address names Edit map's General tab of this map, so a reload opens it again.
  await page.reload();
  await expect(page.locator("#category")).toHaveValue("Day trips");
  await expect(page.locator("#editSub")).toHaveText("Bratislava");
});

// 142: leaving the field blank, on blur, clears the category.
test("a blank category clears it on blur", async ({ page }) => {
  await openGeneral(page);
  const asked = edits(page);
  await page.locator("#category").fill("");
  await page.locator("#category").blur();
  expect(await asked).toMatchObject({ category: "" });
  await expect(page.locator("#category")).toHaveValue("");
  await expect(page.locator("#categoryList option")).toHaveCount(0);
});

// 142: a label over 40 characters is refused with the phone's words under the field, and the text stays.
test("a category over 40 characters is refused in the phone's words and the text stays", async ({ page }) => {
  await openGeneral(page);
  const long = "x".repeat(41);
  // A paste over the limit is cut by the field itself, so the longer text is set as a script would.
  await page.locator("#category").evaluate((field, text) => {
    field.value = text;
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }, long);
  await expect(page.locator("#categorySaid")).toHaveText("A category is at most 40 characters");
  await expect(page.locator("#category")).toHaveValue(long);
  await expect(page.locator("#notice")).not.toContainText("40 characters");
  await page.locator("#category").fill("Work");
  await page.locator("#category").press("Enter");
  await expect(page.locator("#categorySaid")).toHaveCount(0);
});

// 142: a map shared to look at is not the owner's, so its label is read only.
test("the Category field is read only for a map that is not the owner's", async ({ page, request }) => {
  await phone(request, "reader");
  await openGeneral(page);
  await expect(page.locator("#category")).toBeDisabled();
  await expect(page.locator("#category")).toHaveValue("Hiking");
});

// 142: the phone refuses a category edit of a map shared to look at, even from a browser that asks.
test("the phone answers 403 to a category edit of a map shared to look at", async ({ page, request }) => {
  await phone(request, "reader");
  await openViewer(page, "/e/7q4-k29");
  const token = await page.evaluate(() => window.__riki.state().editToken);
  const answer = await page.request.post("/riki/v1/maps/6F1E2A10-0000-4000-8000-000000000001/edit?category=Work",
    { headers: { Authorization: `Bearer ${token}` } });
  expect(answer.status()).toBe(403);
});
