import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockCloud, recordCoreCalls } from "./mock-cloud.mjs";

// 110 the site serves the glyphs and the base sprite a style names, under its own path
const account = JSON.parse(readFileSync(new URL("./fixtures/cloud-account.json", import.meta.url), "utf8"));

/** A style that draws a label and names the site's own glyphs and sprite, as the core's does from the catalog. */
const labelled = (site) => ({ version: 8, glyphs: `${site}glyphs/{fontstack}/{range}.pbf`, sprite: `${site}sprites/temaki-sprite`,
  sources: { points: { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [19.9, 49.2] } } } },
  layers: [{ id: "ground", type: "background", paint: { "background-color": "#ddd" } },
    { id: "name", type: "symbol", source: "points", layout: { "text-field": "Tatry", "text-font": ["Noto Sans Regular"] } }] });

test("the core is told where the site's glyphs and sprite are, under the site's own path", async ({ page, baseURL }) => {
  const calls = await recordCoreCalls(page, ["riki_style"]);
  await mockCloud(page, { signedIn: true });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await expect.poll(async () => (await calls()).length).toBeGreaterThan(0);
  const [{ request }] = await calls();
  expect(request.catalog).toMatchObject({ glyphsBase: `${baseURL}glyphs`, spriteBase: `${baseURL}sprites/temaki-sprite` });
});

test("a label's glyphs and the sprite are answered by the site, with their types", async ({ page, baseURL }) => {
  const seen = [];
  page.on("response", (response) => { if (/\/(glyphs|sprites)\//.test(response.url())) seen.push(response); });
  await mockCloud(page, { signedIn: true, answers: { ...account.core, riki_style: labelled(baseURL) } });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await expect.poll(() => seen.map((each) => new URL(each.url()).pathname)).toEqual(expect.arrayContaining(
    [new URL(baseURL).pathname + "glyphs/Noto%20Sans%20Regular/0-255.pbf", new URL(baseURL).pathname + "sprites/temaki-sprite.json"]));
  const glyph = seen.find((each) => each.url().endsWith(".pbf"));
  expect(glyph.status()).toBe(200);
  expect(glyph.headers()["content-type"]).toBe("application/x-protobuf");
  expect(seen.find((each) => each.url().endsWith("temaki-sprite.json")).status()).toBe(200);
});
