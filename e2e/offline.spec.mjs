import { test, expect } from "@playwright/test";
import { openViewer, reset, editTab } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const TRAILS = "6F1E2A10-0000-4000-8000-0000000000A1";
const HUTS = "6F1E2A10-0000-4000-8000-0000000000A2";

async function openEdit(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  await editTab(page, "Offline");
  await page.locator("#downloadTiles").waitFor();
}

const asked = (page, method) => page.waitForRequest((request) => request.url().includes("/tile-download?")
  && request.method() === method).then((request) => Object.fromEntries(new URL(request.url()).searchParams));

// 57: Download tiles counts the view, takes the view chosen on the map, and queues what is ticked.
test("the map's tiles are counted for the view, then queued and cancelled", async ({ page }) => {
  await openEdit(page);
  await page.locator("#downloadTiles").click();
  await expect(page.locator("#offlineArea")).toHaveText("43 km²");
  let read = asked(page, "GET");
  await page.locator("#chooseOfflineArea").click();
  expect((await read).chosen).toBe("1");
  await expect(page.locator("#offlineArea")).toHaveText("120 km²");
  await expect(page.locator(`#offlineLayers [data-layer="${HUTS}"]`)).toContainText("nothing to download");

  read = asked(page, "GET");
  await page.getByRole("slider", { name: "Maximum zoom" }).fill("12");
  expect((await read).zoom).toBe("12");
  await expect(page.locator("#offlineTotal")).toHaveText("≈ 12 MB");

  const started = asked(page, "POST");
  await page.locator("#startOfflineDownload").click();
  const start = await started;
  expect(start.start).toBe("1");
  expect(start.layers).toBe(TRAILS);
  await expect(page.locator("#startOfflineDownload")).toHaveText("Queued");
  await expect(page.locator("#startOfflineDownload")).toBeDisabled();
  await page.locator("#cancelOfflineDownload").click();
  await expect(page.locator("#startOfflineDownload")).toHaveText("Download");
});

// 57: more than the phone has room for is not offered, as the screen says.
test("a download larger than the free space is not offered", async ({ page }) => {
  await openEdit(page);
  await page.locator("#downloadTiles").click();
  await page.getByRole("slider", { name: "Maximum zoom" }).fill("19");
  await expect(page.locator("#startOfflineDownload")).toBeDisabled();
  await expect(page.getByText("Not enough free space for this selection.")).toBeVisible();
});

// 57: Edit map's Delete asks first; a no keeps the data, a yes deletes it.
test("what a layer has stored is deleted only once agreed", async ({ page, request }) => {
  await openEdit(page);
  const row = page.locator(`#offlineStored [data-stored="${HUTS}"]`);
  await expect(row).toContainText("2 KB stored");
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Delete what Huts has stored?");
    void dialog.dismiss();
  });
  await row.getByRole("button", { name: "Delete what Huts has stored?" }).click();
  await expect(row).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await row.getByRole("button", { name: "Delete what Huts has stored?" }).click();
  await expect(row).toHaveCount(0);
  const state = await (await request.get("/__test/offline")).json();
  expect(state.discarded).toEqual([HUTS]);
});
