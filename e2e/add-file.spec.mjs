import { test, expect } from "@playwright/test";
import { addFrom, openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const huts = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "Hut" },
  geometry: { type: "Point", coordinates: [17.1, 48.15] } }] });

async function openAddLayer(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await page.locator("#addLayer").click();
  await addFrom(page, "file");
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

const dxf = (x, y) => ["0", "SECTION", "2", "ENTITIES", "0", "POINT", "8", "Body", "10", x, "20", y, "0", "ENDSEC", "0", "EOF"]
  .join("\n");

// 66: the phone reads the DXF and answers its systems with its guess; the page sends it again with one.
test("a DXF file is added in the coordinate system picked from the phone's list", async ({ page, request }) => {
  await openAddLayer(page);
  const read = page.waitForRequest((asked) => asked.url().includes("/read-dxf?"));
  await page.locator("#layerFile").setInputFiles({ name: "plan.dxf", mimeType: "image/vnd.dxf",
    buffer: Buffer.from(dxf("-568990", "-1050538")) });
  expect((await read).postData()).toContain("ENTITIES");
  await expect(page.locator("#dxfSystem")).toHaveValue("sjtsk");
  await expect(page.locator("#dxfSaid")).toHaveText("Guessed from its numbers. Check it on the map.");
  await expect(page.locator("#dxfSystem option")).toHaveText(["WGS 84", "S-JTSK (Křovák)", "UTM 33N", "UTM 34N",
    "Web Mercator"]);

  await page.locator("#dxfSystem").selectOption("wgs84");
  await page.locator("#addDXF").click();
  await expect(page.locator("#notice")).toContainText("none of its points is anywhere in WGS 84");

  await page.locator("#dxfSystem").selectOption("utm33");
  const added = page.waitForRequest((asked) => asked.url().includes("/add-file?"));
  await page.locator("#addDXF").click();
  expect(new URL((await added).url()).searchParams.get("system")).toBe("utm33");
  await expect(page.locator("#editBody input[value='Plan']")).toHaveCount(1);
  await expect(page.locator("#dxfCard")).toHaveCount(0);
  expect(await phone(request, "dxf-adds")).toEqual(["plan.dxf:utm33:true"]);
});

// 66: a drawing whose system the phone cannot find waits for one to be chosen.
test("a DXF with no system found asks for one before it is added", async ({ page }) => {
  await openAddLayer(page);
  await page.locator("#layerFile").setInputFiles({ name: "site.dxf", mimeType: "image/vnd.dxf",
    buffer: Buffer.from(dxf("380000", "5560000")) });
  await expect(page.locator("#dxfSystem")).toHaveValue("");
  await expect(page.locator("#dxfSaid")).toHaveText("The file does not say. Choose the system it was drawn in.");
  await expect(page.locator("#addDXF")).toBeDisabled();
  await page.locator("#dxfSystem").selectOption("utm34");
  await expect(page.locator("#addDXF")).toBeEnabled();
});
