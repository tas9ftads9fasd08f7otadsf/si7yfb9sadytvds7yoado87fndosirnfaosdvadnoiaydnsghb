import { test, expect } from "@playwright/test";
import { CLOSED_HOST, CORS_HOST, loadAccount, mockCloud, mockServiceHosts } from "./mock-cloud.mjs";

// 85 a layer whose host refuses browsers is edited but not drawn, and says so on its row and over the map
const SENTENCE = "This service doesn't answer browsers. The app draws it.";
const MAP = "6F1E2A10-0000-4000-8000-000000000001";

async function answers() {
  const { core } = await loadAccount();
  const layers = [{ id: "L1", name: "Trails", kind: "Raster tiles" }, { id: "L2", name: "Ridges", kind: "Raster tiles" }];
  return { ...core,
    riki_maps: { ...core.riki_maps, maps: core.riki_maps.maps.map((each) => each.id === MAP ? { ...each, layers } : each) },
    riki_map: { ...core.riki_map, stack: layers },
    riki_style: { version: 8, layers: [{ id: "ground", type: "background", paint: { "background-color": "#ddd" } },
      { id: "l1", type: "raster", source: "riki-custom-l1" }, { id: "l2", type: "raster", source: "riki-custom-l2" }],
    sources: {
      "riki-custom-l1": { type: "raster", tileSize: 256, tiles: [`${CORS_HOST}/{z}/{x}/{y}.png`] },
      "riki-custom-l2": { type: "raster", tileSize: 256, tiles: [`${CLOSED_HOST}/{z}/{x}/{y}.png`] } } } };
}

test("the map leaves out a layer whose host refuses browsers and names it, once, over the map", async ({ page }) => {
  await mockCloud(page, { signedIn: true, answers: await answers() });
  const hosts = await mockServiceHosts(page);
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await expect(page.locator("#undrawnNote")).toContainText(`Ridges ${SENTENCE}`);
  await expect(page.locator("#undrawnNote")).not.toContainText("Trails");
  expect(hosts.asked("closed").filter((path) => path.endsWith(".png"))).toEqual(["/0/0/0.png"]);
  await page.reload();
  await page.locator("#current .hero").waitFor();
  await expect(page.locator("#undrawnNote")).toContainText("Ridges");
  // asked once per browser: nothing more went to the host that refused
  expect(hosts.asked("closed")).toEqual(["/0/0/0.png"]);
});

test("the layer's row says so, and the layer can still be renamed", async ({ page }) => {
  const cloud = await mockCloud(page, { signedIn: true, answers: await answers() });
  await mockServiceHosts(page);
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  const row = (id) => page.locator(`#editBody .row[data-layer="${id}"]`);
  await expect(row("L2")).toContainText(SENTENCE);
  await expect(row("L1")).not.toContainText(SENTENCE);
  const field = row("L2").getByRole("textbox", { name: "Rename" });
  await field.fill("Crests");
  await field.press("Enter");
  await expect.poll(() => cloud.asked.filter((each) => each.endpoint === "records/modify").length).toBe(1);
});
