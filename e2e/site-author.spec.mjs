import { test, expect } from "@playwright/test";
import { mockCloud, recordCoreAsks } from "./mock-cloud.mjs";

// 83 the site's account part takes the name a change is made under, kept in the browser
const layerRow = (page, name) => page.locator("#editBody .row").filter({ has: page.getByRole("switch", { name }) });

async function openEdit(page) {
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
}

// 103 back from Settings to Edit map without a reload, which would forget the asks recorded
async function backToEdit(page) {
  await page.locator("#railMap").click();
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
}

async function rename(page, from, to) {
  const field = layerRow(page, from).getByRole("textbox", { name: "Rename" });
  await field.fill(to);
  await field.press("Enter");
}

test("the account part names the Apple Account for a name not typed, and keeps one typed over a reload", async ({ page }) => {
  await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  // 103 the name is in Settings, from the rail's gear; Sign out stays in the top bar
  await page.locator("#railSettings").click();
  const name = page.locator("#accountName");
  await expect(name).toHaveAttribute("aria-label", "Your name");
  await expect(name).toHaveAttribute("placeholder", "Riki Tester");
  await expect(page.locator("#account button")).toHaveText("Sign out");
  await name.fill("Friki");
  await name.press("Enter");
  await page.reload();
  await page.locator("#current .hero").waitFor();
  await expect(name).toHaveValue("Friki");
});

test("a change is made under the typed name, else under the Apple Account's", async ({ page }) => {
  const asks = await recordCoreAsks(page);
  await mockCloud(page, { signedIn: true });
  await openEdit(page);
  await rename(page, "Trails", "Ridges");
  await expect.poll(async () => (await asks()).length).toBe(1);
  expect((await asks())[0]).toMatchObject({ author: "Riki Tester", origin: "web" });

  const name = page.locator("#accountName");
  await page.locator("#railSettings").click();
  await name.fill("Friki");
  await name.press("Enter");
  await backToEdit(page);
  await rename(page, "Trails", "Ridges 2");
  await expect.poll(async () => (await asks()).length).toBe(2);
  expect((await asks())[1]).toMatchObject({ author: "Friki", origin: "web" });

  await page.locator("#railSettings").click();
  await name.fill("");
  await name.press("Enter");
  await backToEdit(page);
  await rename(page, "Trails", "Peaks");
  await expect.poll(async () => (await asks()).length).toBe(3);
  expect((await asks())[2]).toMatchObject({ author: "Riki Tester" });
});
