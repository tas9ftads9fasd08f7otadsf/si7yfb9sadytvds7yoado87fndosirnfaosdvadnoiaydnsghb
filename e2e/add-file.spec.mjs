import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const huts = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "Hut" },
  geometry: { type: "Point", coordinates: [17.1, 48.15] } }] });

async function openAddLayer(page) {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
  await expect(page.locator("#layerFile")).toBeAttached();
}

// 2995: a picked file is sent as the body and joins the map under its name.
test("a picked GeoJSON file is added as a layer", async ({ page }) => {
  await openAddLayer(page);
  const asked = page.waitForRequest((request) => request.url().includes("/add-file?"));
  await page.locator("#layerFile").setInputFiles({ name: "mountain_huts.geojson", mimeType: "application/geo+json",
    buffer: Buffer.from(huts) });
  const request = await asked;
  expect(new URL(request.url()).searchParams.get("file")).toBe("mountain_huts.geojson");
  expect(request.postData()).toContain("Hut");
  await expect(page.locator("#editBody input[value='Mountain huts']")).toHaveCount(1);
});

// 2995: a file dropped on the map while Add layer is open is added the same way.
test("a file dropped on the page is added as a layer", async ({ page }) => {
  await openAddLayer(page);
  const drop = await page.evaluateHandle((text) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], "ridge.geojson", { type: "application/geo+json" }));
    return transfer;
  }, huts);
  await page.locator("body").dispatchEvent("drop", { dataTransfer: drop });
  await expect(page.locator("#editBody input[value='Ridge']")).toHaveCount(1);
});

// 2995: what the phone refuses is said in the page, and nothing is added.
test("a DXF file is left to the phone", async ({ page }) => {
  await openAddLayer(page);
  await page.locator("#layerFile").setInputFiles({ name: "plan.dxf", mimeType: "image/vnd.dxf",
    buffer: Buffer.from("0\nEOF\n") });
  await expect(page.locator("#notice")).toContainText("Add a DXF file on the phone");
});
