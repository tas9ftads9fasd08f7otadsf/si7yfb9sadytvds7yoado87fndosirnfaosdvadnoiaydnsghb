import { test, expect } from "@playwright/test";
import { addFrom } from "./phone.mjs";
import { CLOSED_HOST, CORS_HOST, loadAccount, mockCloud, mockServiceHosts, recordCoreCalls } from "./mock-cloud.mjs";

// 86 the site adds a tile address through the core, when its host answers browsers, and nothing else yet
const MAP = "6F1E2A10-0000-4000-8000-000000000001";
const modifies = (cloud) => cloud.asked.filter((each) => each.endpoint === "records/modify");

async function openAdd(page) {
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  await page.locator("#addLayer").click();
  await addFrom(page, "tile");
  await expect(page.locator("#tileAddress")).toBeVisible();
}

test("Add layer offers the tile address and none of the packages, files, API layers or servers", async ({ page }) => {
  await mockCloud(page, { signedIn: true });
  await mockServiceHosts(page);
  await openAdd(page);
  for (const id of ["#packages", "#addPackages", "#layerFile", "#apiAddress", "#serverAddress", "#addServer", "#exportServers"]) {
    await expect(page.locator(id)).toHaveCount(0);
  }
});

test("a tile template on a host that answers browsers is read and added by the core's rows", async ({ page }) => {
  const calls = await recordCoreCalls(page, ["riki_read_address", "riki_add_layer"]);
  const cloud = await mockCloud(page, { signedIn: true });
  const hosts = await mockServiceHosts(page);
  await openAdd(page);
  await page.locator("#tileAddress").fill(`${CORS_HOST}/{z}/{x}/{y}.png`);
  await page.locator("#addTiles").click();
  await expect.poll(() => modifies(cloud).length).toBe(1);
  const [asked] = modifies(cloud);
  expect(asked.body.operations.map((each) => [each.operationType, each.record.recordName])).toEqual(
    [["create", "own-tatras-layer-2"], ["create", "change-web-2"]]);
  expect(cloud.record("own-tatras-layer-2").fields.CD_layerJSON.value).toContain("Tiles");
  const [read, add] = await calls();
  // 165 the core reads an address with no network; a tile address needs nothing fetched first
  expect(read).toEqual({ call: "riki_read_address", request: { address: `${CORS_HOST}/{z}/{x}/{y}.png` } });
  expect(add).toMatchObject({ call: "riki_add_layer", request: { mapID: MAP, author: "Riki Tester", origin: "web",
    add: { kind: "tiles", address: `${CORS_HOST}/{z}/{x}/{y}.png` } } });
  expect(add.request.rows.map((row) => row.entity)).toContain("SharedMapLayer");
  expect(hosts.asked("cors")).toContain("/0/0/0.png");
});

test("a tile template on a host that refuses browsers is not added, and the notice says so", async ({ page }) => {
  const { core } = await loadAccount();
  const calls = await recordCoreCalls(page, ["riki_add_layer"]);
  const cloud = await mockCloud(page, { signedIn: true,
    answers: { ...core, riki_read_address: { kind: "direct", probe: `${CLOSED_HOST}/0/0/0.png` } } });
  await mockServiceHosts(page);
  await openAdd(page);
  await page.locator("#tileAddress").fill(`${CLOSED_HOST}/{z}/{x}/{y}.png`);
  await page.locator("#addTiles").click();
  await expect(page.locator("#notice")).toHaveText("This service doesn't answer browsers. Add it in the app.");
  expect(modifies(cloud)).toHaveLength(0);
  expect(await calls()).toHaveLength(0);
});
