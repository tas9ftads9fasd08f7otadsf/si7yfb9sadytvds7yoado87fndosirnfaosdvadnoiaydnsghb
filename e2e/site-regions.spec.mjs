import { test, expect } from "@playwright/test";
import { answerCoreWith, mockCloud } from "./mock-cloud.mjs";
import { FILE_ID, REGION, packageZip } from "./regions-host.mjs";

// 112 the site downloads a region package through its own server, keeps it in the browser and draws from that copy
const SIZE = "688 B";

/** What the core says of a style: the region's data is needed until the browser holds it, then the style draws from it. */
const style = `(request) => {
  const held = request.catalog.stored.find((each) => each.region === "tatry" && each.piece === "base");
  const style = { version: 8, sources: {}, layers: [{ id: "ground", type: "background", paint: { "background-color": "#ddd" } }],
    metadata: {} };
  if (!held) return { ...style, metadata: { "riki:needs": [{ region: "tatry", piece: "base" }] } };
  return { ...style, sprite: "riki-store://tatry/base/sprites/liberty",
    sources: { region: { type: "vector", url: "pmtiles://riki-store/tatry/base/base.pmtiles" } },
    layers: [...style.layers, { id: "land", type: "fill", source: "region", "source-layer": "x", paint: { "fill-color": "#0a0" } }] };
}`;

const host = (baseURL) => `http://127.0.0.1:${Number(new URL(baseURL).port) + 10}`;
const control = (page, baseURL, blocked) => page.request.get(`${host(baseURL)}/__control?block=${blocked ? 1 : 0}`);
const hostLog = async (page, baseURL) => (await page.request.get(`${host(baseURL)}/__log`)).json();

async function open(page) {
  await answerCoreWith(page, "riki_style", style);
  await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
}

const loaded = (page) => page.waitForFunction(() => {
  const map = window.__riki?.map;
  return Boolean(map?.getSource("region")) && map.isSourceLoaded("region");
}, null, { timeout: 15000 });

test.beforeEach(async ({ page, baseURL }) => {
  await control(page, baseURL, false);
  await page.evaluate(() => 0).catch(() => {});
});

test("a style that lacks region data tells the map: Download <region> (<size>) to see it on this map", async ({ page }) => {
  await open(page);
  await expect(page.locator("#regionNeeds button")).toHaveText(`Download Vysoké Tatry (${SIZE}) to see it on this map`);
});

test("one tap downloads the package through the site's own server, then the map draws from the copy kept in the browser", async ({ page, baseURL }) => {
  const asked = [];
  page.on("request", (request) => asked.push(new URL(request.url())));
  await open(page);
  await page.locator("#regionNeeds button").click();
  await loaded(page);
  await expect(page.locator("#regionNeeds")).toHaveCount(0);
  // The file came through the site's own route, and the browser never asked the host.
  const route = asked.filter((url) => url.pathname.endsWith(`/regions/file/${FILE_ID}`));
  expect(route).toHaveLength(1);
  expect(new URL(baseURL).origin).toBe(route[0].origin);
  expect(asked.some((url) => url.port === String(Number(new URL(baseURL).port) + 10))).toBe(false);
  expect(asked.some((url) => url.pathname.endsWith("/regions/catalog.json"))).toBe(true);
  expect((await hostLog(page, baseURL)).filter((each) => each.startsWith("/download"))).toHaveLength(1);
  // The sprite sheet of the package is read from the browser's copy too.
  await expect.poll(() => page.evaluate(() => Boolean(window.__riki.map.getStyle().sprite))).toBe(true);
});

// 112 the point of keeping it: after a reload, with the host gone, the region is still drawn
test("after a reload with the host refusing everything, the region is drawn from the local copy and nothing is asked of the host", async ({ page, baseURL }) => {
  await open(page);
  await page.locator("#regionNeeds button").click();
  await loaded(page);
  await control(page, baseURL, true);
  const before = (await hostLog(page, baseURL)).length;
  await page.reload();
  await page.locator("#current .hero").waitFor();
  await loaded(page);
  await expect(page.locator("#regionNeeds")).toHaveCount(0);
  const asked = (await hostLog(page, baseURL)).slice(before);
  expect(asked.filter((each) => each.startsWith("/download"))).toEqual([]);
});

// 112 the host refusing, as Drive does over its quota, is said in words and the button stays to try again
test("a host that refuses says so in words, and the button stays to try again", async ({ page, baseURL }) => {
  await open(page);
  await expect(page.locator("#regionNeeds button")).toBeVisible();
  await control(page, baseURL, true);
  await page.locator("#regionNeeds button").click();
  await expect(page.locator("#regionNeeds [role=alert]")).toHaveText("The region host did not give the package (HTTP 500). Try again later.");
  await control(page, baseURL, false);
  await page.locator("#regionNeeds button").click();
  await loaded(page);
});

test("Edit map lists what is held with its size, and Remove frees it and brings the note back", async ({ page }) => {
  await open(page);
  await page.locator("#regionNeeds button").click();
  await loaded(page);
  await page.locator("#editButton").click();
  const row = page.locator("#regionPackages [data-region=tatry]");
  await expect(row).toContainText("Vysoké Tatry");
  await expect(row).toContainText(/Stored in this browser · \d+ B/);
  await row.locator("[data-remove]").click();
  await expect(page.locator("#regionNeeds button")).toBeVisible();
  await expect(row.locator("[data-remove]")).toHaveCount(0);
  await expect(row).toContainText(`Download Vysoké Tatry (${SIZE}) to see it on this map`);
});

test("the site's server answers only what the catalog lists", async ({ page, baseURL }) => {
  await open(page);
  const site = new URL(baseURL);
  const at = (path) => page.request.get(new URL(path, site).href);
  expect((await at(`regions/file/${FILE_ID}`)).status()).toBe(200);
  expect((await at("regions/file/1NotInTheCatalogAAAAAAAAAAAAAAAAAA")).status()).toBe(404);
  expect((await at("regions/file/..%2F..%2Fsite.json")).status()).toBe(404);
  const catalog = await (await at("regions/catalog.json")).json();
  expect(catalog.slovensko.regions[REGION].name).toBe("Vysoké Tatry");
  expect(packageZip().length).toBe(688);
  expect((await page.request.post(new URL(`regions/file/${FILE_ID}`, site).href)).status()).toBe(405);
});
