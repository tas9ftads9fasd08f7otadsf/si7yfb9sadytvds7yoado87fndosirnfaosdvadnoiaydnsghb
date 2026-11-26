import { test, expect } from "@playwright/test";
import { mockCloud, recordCoreCalls } from "./mock-cloud.mjs";

const LAKES = "6F1E2A10-0000-4000-8000-0000000000D1";
const PIENINY = "6F1E2A10-0000-4000-8000-0000000000E1";

const mapsScreen = async (page) => {
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#railMaps").click();
};

// 199 New map said "The site cannot do this yet"; the core makes the map, the site writes it to iCloud
test("New map writes the named map to the person's own zone and opens it in Edit map", async ({ page }) => {
  const calls = await recordCoreCalls(page, ["riki_new_map"]);
  const cloud = await mockCloud(page, { signedIn: true });
  await mapsScreen(page);
  await page.locator("#mapsNew").click();
  await page.locator("#newMapName").fill("Lakes");
  await page.locator("#newMapSave").click();
  await expect.poll(() => cloud.record("C0FFEE00-0000-4000-8000-0000000000B1")?.fields.CD_name?.value).toBe("Lakes");
  const [call] = await calls();
  expect(call.request.name).toBe("Lakes");
  await expect(page).toHaveURL(new RegExp(`/maps/${LAKES}/edit`));
});

// 199 Import said "The site cannot do this yet"; every map of the file is written in one batch
test("Import writes every map of the file to the person's own zone and opens the first", async ({ page }) => {
  const calls = await recordCoreCalls(page, ["riki_import"]);
  const cloud = await mockCloud(page, { signedIn: true });
  await mapsScreen(page);
  await page
    .locator("#mapsImportFile")
    .setInputFiles({
      name: "Pieniny.mapson",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ name: "Pieniny" })),
    });
  await expect.poll(() => cloud.record("C0FFEE00-0000-4000-8000-0000000000F1")?.fields.CD_name?.value).toBe("Orava");
  expect(cloud.record("C0FFEE00-0000-4000-8000-0000000000E1")?.fields.CD_name?.value).toBe("Pieniny");
  const [call] = await calls();
  expect(call.request).toMatchObject({ text: '{"name":"Pieniny"}', allowUnsigned: true });
  expect(cloud.asked.filter((each) => each.endpoint === "records/modify")).toHaveLength(1);
  await expect(page).toHaveURL(new RegExp(`/maps/${PIENINY}`));
});
