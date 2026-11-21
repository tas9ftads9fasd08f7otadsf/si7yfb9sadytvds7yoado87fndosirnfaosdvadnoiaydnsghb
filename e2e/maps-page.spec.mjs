import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const tile = (page, name) => page.locator("#mapsCards .map-tile").filter({ has: page.locator(".tile-name", { hasText: name }) });
const names = (page) => page.locator("#mapsCards .map-tile .tile-name").allTextContents();

async function openMaps(page, address = "/e/7q4-k29") {
  await openViewer(page, address);
  await page.locator("#railMaps").click();
  await page.locator("#mapsCards").waitFor();
}

// 148: the rail's Maps opens the Maps screen at /maps, with how many maps the phone shares and a card for each.
test("the rail's Maps opens the Maps screen with a card for each map", async ({ page, request }) => {
  await phone(request, "sample-maps");
  await page.goto("/e/7q4-k29");
  await page.locator("#current .hero").waitFor();
  await page.locator("#railMaps").click();
  await expect(page).toHaveURL(/\/maps#/);
  await expect(page.locator("#railMaps")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#maps h1")).toHaveText("Maps");
  await expect(page.locator("#mapsCount")).toHaveText("7 maps shared by this phone");
  await expect(page.locator("#mapsCards .map-tile")).toHaveCount(7);
  await expect(tile(page, "High Tatras").locator("[data-on-map]")).toHaveText("On map now");
  await expect(page.locator("#mapsCards [data-on-map]")).toHaveCount(1);
});

// 148: "All maps" in the top bar's map picker opens it too.
test("the top bar's map picker opens the Maps screen", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#mapPicker").click();
  await expect(page).toHaveURL(/\/maps#/);
  await expect(page.locator("#mapsCards")).toBeVisible();
});

// 148: each pill kind once, drawn only where the phone sent its field; a map shared to look at has no Edit.
test("a card draws the sharing, offline and size pills, the version line, and no Edit on a view-only map", async ({ page, request }) => {
  await phone(request, "sample-maps");
  await openMaps(page);
  const doprava = tile(page, "Doprava");
  await expect(doprava.locator("[data-sharing]")).toHaveText("Shared with 3 · Owner");
  await expect(doprava.locator("[data-offline=ready]")).toHaveText("Ready offline");
  await expect(doprava.locator("[data-held]")).toHaveText("1.2 GB");
  await expect(doprava.locator("[data-category]")).toHaveText("Transit");
  await expect(doprava).toContainText("Trains, trams and buses");
  await expect(doprava.getByRole("link", { name: "Day" })).toHaveAttribute("href", /\/maps\/.*\/style\//);
  await expect(doprava.getByRole("link", { name: "Edit map" })).toHaveAttribute("href", /\/edit\/layers$/);
  const historicka = tile(page, "Historická 2");
  await expect(historicka.locator("[data-sharing]")).toHaveText("View only");
  await expect(historicka.locator("[data-offline=online]")).toHaveText("Online only");
  await expect(historicka.locator("[data-held]")).toHaveCount(0);
  await expect(historicka.locator("[data-needs]")).toHaveText("Needs Riki Maps 0.18.0 or later");
  await expect(historicka.getByRole("link", { name: "Edit map" })).toHaveCount(0);
  await expect(tile(page, "Fitness").locator("[data-offline=update]")).toHaveText("Update");
  await expect(tile(page, "Trains in Slovakia").locator("[data-offline=partly]")).toHaveText("Partly offline");
  // a map the phone sent no new fields for draws none of them
  const bratislava = tile(page, "Bratislava");
  await expect(bratislava.locator(".pill-tag")).toHaveCount(0);
});

// 148: the field, the three filters, the sort and the Category filter reorder and narrow the cards.
test("the field, the filters, the sort and the category narrow and reorder the cards", async ({ page, request }) => {
  await phone(request, "sample-maps");
  await openMaps(page);
  await expect(page.locator("#mapsFilter-all")).toContainText("7");
  await page.locator("#mapsFind").fill("tra");
  expect(await names(page)).toEqual(["Doprava", "High Tatras", "Trains in Slovakia"]);
  await page.locator("#mapsFind").fill("");
  await page.locator("#mapsFilter-shared").click();
  expect(await names(page)).toEqual(["Fitness", "Historická 2"]);
  await page.locator("#mapsFilter-mine").click();
  expect(await names(page)).toEqual(["Doprava", "High Tatras", "Riki Maps", "Trains in Slovakia"]);
  await page.locator("#mapsFilter-all").click();
  await page.locator("#mapsSort").click();
  await page.locator("#mapsSort-changed").click();
  expect((await names(page)).slice(0, 3)).toEqual(["Doprava", "Riki Maps", "Historická 2"]);
  await page.locator("#mapsSort").click();
  await page.locator("#mapsSort-size").click();
  const bySize = await names(page);
  expect(bySize.slice(0, 3)).toEqual(["Doprava", "High Tatras", "Riki Maps"]);
  expect(bySize.slice(-2)).toEqual(["Bratislava", "Historická 2"]);
  await page.locator("#mapsCategory").selectOption("Transit");
  expect(await names(page)).toEqual(["Doprava"]);
  await page.locator("#mapsCategory").selectOption("");
  await page.locator("#mapsFind").fill("hiking");
  expect(await names(page)).toEqual(["High Tatras"]);
});

// 148: a filter with no map says No map named “…” with Clear.
test("a filter with no map says so and Clear brings the maps back", async ({ page }) => {
  await openMaps(page);
  await page.locator("#mapsFind").fill("volcano");
  await expect(page.locator("#mapsNone")).toContainText("No map named “volcano”");
  await expect(page.locator("#mapsCards .map-tile")).toHaveCount(0);
  await page.locator("#mapsClear").click();
  await expect(page.locator("#mapsCards .map-tile")).toHaveCount(2);
  await expect(page.locator("#mapsFind")).toHaveValue("");
});

// 148: a card opens the map with a plain click, and a ⌘/Ctrl-click opens a tab.
test("a card opens the map, and a modified click opens a tab", async ({ page, context, request }) => {
  await phone(request, "sample-maps");
  await openMaps(page);
  const opened = context.waitForEvent("page");
  await tile(page, "Fitness").locator(".tile-name").click({ modifiers: ["Control"] });
  const other = await opened;
  expect(new URL(other.url()).pathname).toMatch(/^\/maps\/6F1E2A10-0000-4000-8000-00000000F05$/);
  await other.close();
  await expect(page).toHaveURL(/\/maps#/);
  await tile(page, "Fitness").locator(".tile-name").click();
  await expect(page).toHaveURL(/\/maps\/6F1E2A10-0000-4000-8000-00000000F05/);
  await expect(page.locator("#mapName")).toHaveText("Fitness");
});

// 148: Edit goes to Edit map's Layers; More duplicates the map through Edit map's call.
test("Edit opens Edit map and More duplicates the map", async ({ page }) => {
  await openMaps(page);
  await tile(page, "Bratislava").getByRole("link", { name: "Edit map" }).click();
  await expect(page).toHaveURL(/\/edit\/layers/);
  await expect(page.locator("#editSub")).toHaveText("Bratislava");
  await page.locator("#railMaps").click();
  await tile(page, "Bratislava").getByRole("button", { name: "More" }).click();
  await tile(page, "Bratislava").getByRole("menuitem", { name: "Duplicate map" }).click();
  await expect(page.locator("#mapName")).not.toHaveText("Bratislava");
});

const row = (page, name) => page.locator("#mapsList [role=row]").filter({ has: page.locator(".tile-name", { hasText: name }) });

// 149: List shows W4's table, a row for each map with a column for each field the phone sent; the choice is kept.
test("List shows a row for each map, with the fields the phone sent, and the choice is kept", async ({ page, request }) => {
  await phone(request, "sample-maps");
  await openMaps(page);
  await expect(page.locator("#mapsViewCards")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#mapsViewList").click();
  await expect(page.locator("#mapsCards")).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Maps" }).getByRole("columnheader")).toHaveText(
    ["Map", "Styles", "Layers", "Shared", "On the phone", "Size", "Changed"]);
  await expect(page.locator("#mapsList [role=row]")).toHaveCount(8);
  const doprava = row(page, "Doprava");
  await expect(doprava).toContainText("Shared with 3 · Owner");
  await expect(doprava).toContainText("Ready offline");
  await expect(doprava).toContainText("1.2 GB");
  await expect(doprava).toContainText("Today");
  await expect(row(page, "Riki Maps")).toContainText("Yesterday");
  await expect(row(page, "Historická 2")).toContainText("View only");
  await expect(row(page, "Historická 2").locator("[data-column=size]")).toHaveText("");
  expect(await page.evaluate(() => localStorage.getItem("riki-maps-view"))).toBe("list");
  await page.reload();
  await page.locator("#mapsList").waitFor();
  await expect(page.locator("#mapsViewList")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#mapsViewCards").click();
  await expect(page.locator("#mapsCards .map-tile")).toHaveCount(7);
});

// 149: a row opens its map; the name is a link, so a Ctrl-click opens a tab.
test("a row opens the map, and a modified click on its name opens a tab", async ({ page, context, request }) => {
  await phone(request, "sample-maps");
  await openMaps(page);
  await page.locator("#mapsViewList").click();
  const opened = context.waitForEvent("page");
  await row(page, "Fitness").locator(".tile-name").click({ modifiers: ["Control"] });
  const other = await opened;
  expect(new URL(other.url()).pathname).toBe("/maps/6F1E2A10-0000-4000-8000-00000000F05");
  await other.close();
  await expect(page).toHaveURL(/\/maps#/);
  await row(page, "Fitness").locator("[data-column=changed]").click();
  await expect(page).toHaveURL(/\/maps\/6F1E2A10-0000-4000-8000-00000000F05/);
  await expect(page.locator("#mapName")).toHaveText("Fitness");
});

// 149: the field, the filters and the empty state work on the list as on the cards.
test("the list narrows with the field and the filters, and says No map named for an empty filter", async ({ page, request }) => {
  await phone(request, "sample-maps");
  await openMaps(page);
  await page.locator("#mapsViewList").click();
  await page.locator("#mapsFilter-shared").click();
  await expect(page.locator("#mapsList [role=row] .tile-name")).toHaveText(["Fitness", "Historická 2"]);
  await page.locator("#mapsFilter-all").click();
  await page.locator("#mapsFind").fill("volcano");
  await expect(page.locator("#mapsNone")).toContainText("No map named “volcano”");
  await expect(page.locator("#mapsList")).toHaveCount(0);
  await page.locator("#mapsClear").click();
  await expect(page.locator("#mapsList [role=row]")).toHaveCount(8);
});

// 149: a phone that sent no new fields has a list of the map and its layers alone.
test("an older phone's list has only the Map and Layers columns", async ({ page, request }) => {
  await phone(request, "old-maps");
  await openMaps(page);
  await page.locator("#mapsViewList").click();
  await expect(page.getByRole("table", { name: "Maps" }).getByRole("columnheader")).toHaveText(["Map", "Layers"]);
  await expect(page.locator("#mapsFilter-all")).toHaveCount(0);
});

// 148: a browser that only looks sees the cards, and no Edit, Export or More.
test("a looking browser sees the cards and no Edit, Export, More or New map", async ({ page }) => {
  await openViewer(page, "/");
  await page.locator("#railMaps").click();
  await expect(page.locator("#mapsCards .map-tile")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Edit map" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "More" })).toHaveCount(0);
  await expect(page.locator("#mapsNew")).toHaveCount(0);
});
