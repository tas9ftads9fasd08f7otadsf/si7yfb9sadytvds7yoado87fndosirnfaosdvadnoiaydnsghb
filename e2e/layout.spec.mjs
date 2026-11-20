import { test, expect } from "@playwright/test";
import { openViewer, reset, showAllMaps, editTab } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

test("a computer's screen gets a header, a side bar, the map and a status line", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await openViewer(page);

  await expect(page.locator("#appName")).toHaveText("Riki Maps");
  await expect(page.locator("#device")).toHaveText("Riki's iPad");
  await expect(page.locator("#mapName")).toHaveText("High Tatras");
  await expect(page).toHaveTitle("Riki's iPad · Riki Maps");
  await expect(page.locator("#small")).toBeHidden();
  await expect(page.locator("#gate")).toBeHidden();

  const side = await page.locator("#side").boundingBox();
  const map = await page.locator("#map").boundingBox();
  expect(side.width).toBeGreaterThanOrEqual(320);
  expect(map.x).toBeGreaterThanOrEqual(side.x + side.width - 1);
  expect(map.width).toBeGreaterThan(900);

  // 2916: a browser that may only look gets no layer switches.
  await expect(page.locator("#layerList")).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(0);
  // 2945: it picks among the styles; 90 from the side bar's drop-down.
  await page.locator("#sideStyle").click();
  await expect(page.locator("#current [role=option]")).toHaveText(["Summer", "Winter"]);
  // 41 an open map's side bar is the map alone.
  await expect(page.locator("#others")).toHaveCount(0);
  await expect(page.locator(".maplibregl-ctrl-zoom-in")).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-fullscreen")).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-scale")).toBeVisible();
  // 105 the zoom is the map's badge alone, and no [ hint sits under the map
  await expect(page.locator("#mapZoom")).toHaveText(/^z \d+\.\d$/);
  await expect(page.locator("#zoom")).toHaveCount(0);
  await expect(page.locator("#status kbd")).toHaveCount(0);
  await expect(page.locator("#editButton")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the pointer's place is written in the status line", async ({ page }) => {
  await openViewer(page);
  const map = await page.locator("#map").boundingBox();
  await page.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
  await expect(page.locator("#pointer")).toHaveText(/^-?\d+\.\d{5}, -?\d+\.\d{5}$/);
});

// 90 the style is picked from the side bar's drop-down or the map's switcher, and the map follows.
test("the style is picked in the side bar or over the map, and the map follows", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#sideStyle").click();
  await expect(page.getByRole("option")).toHaveText(["Summer", "Winter"]);

  const asked = page.waitForRequest((request) => request.url().includes("/style?") && request.url().includes("hide="));
  await page.getByRole("option", { name: "Winter" }).click();
  expect(new URL((await asked).url()).searchParams.get("hide")).toBe("6F1E2A10-0000-4000-8000-0000000000A2");
  await expect(page.locator("#sideStyle")).toHaveText("Winter");
  await expect(page.locator("#switcherButton")).toHaveText("Winter");
  // 30 a style other than the one the map opens on is in the address's path.
  await expect(page).toHaveURL(/\/maps\/[^/]+\/style\/6F1E2A10-0000-4000-8000-0000000000B2#/);

  await page.locator("#switcherButton").click();
  await expect(page.getByRole("dialog", { name: "Layers" })).toBeVisible();
  await page.locator("#switcherStyle").click();
  await page.locator("#switcherPanel").getByRole("option", { name: "Summer" }).click();
  await expect(page.locator("#sideStyle")).toHaveText("Summer");
  await expect(page).not.toHaveURL(/\/style\//);
  const map = await page.locator("#map").boundingBox();
  await page.mouse.click(map.x + map.width / 2, map.y + map.height / 2);
  await expect(page.locator("#switcherPanel")).toHaveCount(0);
});

// 90 the map's buttons are its glass, bottom right; the style and the layers top right.
test("the map's buttons sit bottom right and the switcher top right", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  const map = await page.locator("#map").boundingBox();
  const zoom = await page.locator(".maplibregl-ctrl-zoom-in").boundingBox();
  const phone = await page.locator("#phoneButton").boundingBox();
  const switcher = await page.locator("#switcherButton").boundingBox();
  expect(map.x + map.width - (zoom.x + zoom.width)).toBeLessThan(40);
  expect(map.y + map.height - (phone.y + phone.height)).toBeLessThan(40);
  expect(phone.y).toBeGreaterThan(zoom.y);
  expect(map.x + map.width - (switcher.x + switcher.width)).toBeLessThan(40);
  expect(switcher.y - map.y).toBeLessThan(40);
  // 90 the credits are a line beside the scale, bottom left, not a button among the map's
  await expect(page.locator(".maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib:not(.maplibregl-compact)"))
    .toHaveCount(1);
  await expect(page.locator(".maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib")).toHaveCount(0);
});

// 2916: the switches are an editing browser's.
test("a layer switched off in the side bar is left out of the style", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await expect(page.locator("#layerList .row")).toHaveCount(2);
  const asked = page.waitForRequest((request) => request.url().includes("/style?")
    && request.url().includes("hide=6F1E2A10-0000-4000-8000-0000000000A1"));
  await page.getByRole("switch", { name: "Trails" }).click();
  await asked;
  await expect(page.getByRole("switch", { name: "Trails" })).not.toBeChecked();
});

// 2945: one map is listed too, so a browser sees what the phone shares. 41 on the Maps screen.
test("the Maps screen lists the maps even when the phone shares only one", async ({ page, request }) => {
  await request.get("/__test/one-map");
  await openViewer(page);
  await showAllMaps(page);
  await expect(page.locator("#others .title")).toHaveText("All maps");
  await expect(page.locator("#others .row")).toHaveCount(1);
  await expect(page.locator("#others .row.picked")).toContainText("High Tatras");
});

// 41 the list is the Maps screen's; the opened map's side bar drops it again.
test("another map is opened from the Maps screen's list", async ({ page }) => {
  await openViewer(page);
  await showAllMaps(page);
  await expect(page.locator("#others .row")).toHaveCount(2);
  await expect(page.locator("#others .row.picked")).toContainText("High Tatras");
  await expect(page).toHaveURL(/\/maps#/);
  await page.locator("#others .row", { hasText: "Bratislava" }).click();
  await expect(page.locator("#others")).toHaveCount(0);
  await expect(page.locator("#mapName")).toHaveText("Bratislava");
  // 90 a map of one style offers no drop-down
  await expect(page.locator("#sideStyle")).toHaveCount(0);
  await expect(page.locator("#current .hero b")).toHaveText("Bratislava");
  // 30 the map's own address
  await expect(page).toHaveURL(/\/maps\/6F1E2A10-0000-4000-8000-000000000002#/);
});

// 30 the rail's Map item folds it now, and the address stays.
test("the side bar folds away with the rail's Map item or the [ key, and the map takes the room", async ({ page }) => {
  await openViewer(page);
  const wide = (await page.locator("#map").boundingBox()).width;
  const address = page.url();
  await page.locator("#railMap").click();
  await expect(page.locator("body")).toHaveClass(/side-hidden/);
  expect(page.url().split("#")[0]).toBe(address.split("#")[0]);
  await expect.poll(async () => (await page.locator("#map").boundingBox()).width).toBeGreaterThan(wide + 300);
  await page.locator("#map canvas").click();
  await page.keyboard.press("[");
  await expect(page.locator("body")).not.toHaveClass(/side-hidden/);
});

test("a page opened from the editing address edits the map in the side bar", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  await editTab(page, "General");
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  await name.fill("Tatras in summer");
  await name.press("Enter");
  await name.blur();
  await expect(page.locator("#mapName")).toHaveText("Tatras in summer");
  await page.keyboard.press("Escape");
  await expect(page.locator("#editPage")).toHaveClass(/ahead/);
});

// 2800: the owner's ask, a light and dark switch on the page; 103 Settings' Appearance, from the rail's gear.
test("Settings turns the page light, dark or back to the computer's, and the map follows", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openViewer(page);
  const root = page.locator("html");
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.locator("#railSettings").click();
  await expect(page).toHaveURL(/\/settings#/);
  await expect(page.locator("#theme-auto")).toHaveAttribute("aria-checked", "true");
  // 30 the design's grounds
  expect(await background()).toBe("rgb(242, 242, 247)");

  let asked = page.waitForRequest((request) => request.url().includes("/style?"));
  await page.locator("#theme-light").click();
  await expect(root).toHaveAttribute("data-theme", "light");
  expect(new URL((await asked).url()).searchParams.get("theme")).toBe("light");

  asked = page.waitForRequest((request) => request.url().includes("/style?"));
  await page.locator("#theme-dark").click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#theme-dark")).toHaveAttribute("aria-checked", "true");
  expect(new URL((await asked).url()).searchParams.get("theme")).toBe("dark");
  expect(await background()).toBe("rgb(0, 0, 0)");

  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "dark", { timeout: 2000 });
  await expect(page.locator("#settings")).toBeVisible();

  await page.locator("#theme-auto").click();
  await expect(root).not.toHaveAttribute("data-theme", /.*/);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await background()).toBe("rgb(0, 0, 0)");
});

// 2800: the owner's ask, the zoom shown on the map as the app shows it.
test("the zoom is written on the map's top left and follows it", async ({ page }) => {
  await openViewer(page);
  const badge = page.locator("#mapZoom");
  await expect(badge).toHaveText(/^z \d+\.\d$/);
  const map = await page.locator("#map").boundingBox();
  const box = await badge.boundingBox();
  expect(box.x - map.x).toBeLessThan(40);
  expect(box.y - map.y).toBeLessThan(40);
  const before = await badge.textContent();
  await page.locator(".maplibregl-ctrl-zoom-in").click();
  await expect(badge).not.toHaveText(before);
  // 2917: it follows an eased zoom to its end; 105 read against the map, the status line has none
  await expect.poll(async () => (await badge.textContent())
    === await page.evaluate(() => `z ${window.__riki.map.getZoom().toFixed(1)}`)).toBe(true);
});

// 94 Edit map is W5–W9's page of tabs beside the live map; a tab is an address that a reload keeps.
test("Edit map's tabs are addresses, beside the map as its live preview", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.getByRole("tab", { name: "Layers" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#livePreview")).toHaveText("Live preview · Summer");
  await expect(page.locator("#switcherButton")).toHaveCount(0);
  const side = await page.locator("#side").boundingBox();
  expect(side.width).toBeGreaterThanOrEqual(500);
  await expect.poll(async () => (await page.locator("#map").boundingBox()).x)
    .toBeGreaterThanOrEqual(side.x + side.width - 1);

  await page.getByRole("tab", { name: "Sharing" }).click();
  await expect(page).toHaveURL(/\/maps\/[^/]+\/edit\/sharing#/);
  await expect(page.locator("#people")).toBeVisible();
  await expect(page.locator("#editBody [data-layer]")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Sharing" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#people")).toBeVisible();

  await page.locator("#editDone").click();
  await expect(page.locator("#livePreview")).toHaveCount(0);
  await expect(page).toHaveURL(/\/maps\/[^/]+#/);
});

// 97 W11: the side bar's Add layer opens the window of sources over the map, the first one picked.
test("Add layer opens its window of sources from the side bar", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#current .add-layer").click();
  const dialog = page.getByRole("dialog", { name: "Add layer" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".sources [aria-pressed=true]")).toHaveId("addFrom-builtin");
  await expect(dialog).toContainText("Into High Tatras · Summer");
  await dialog.locator("#addFrom-tile").click();
  await expect(dialog.locator("#tileAddress")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

// 104 the top bar's side bar button hides it, the map takes the room, and the same button brings it back.
test("the top bar's button hides the side bar and brings it back", async ({ page }) => {
  await openViewer(page);
  const wide = (await page.locator("#map").boundingBox()).width;
  await page.getByRole("button", { name: "Hide the side bar" }).click();
  await expect(page.locator("body")).toHaveClass(/side-hidden/);
  await expect(page.locator("#side")).toBeHidden();
  await expect.poll(async () => (await page.locator("#map").boundingBox()).width).toBeGreaterThan(wide + 300);
  await page.getByRole("button", { name: "Show the side bar" }).click();
  await expect(page.locator("#side")).toBeVisible();
  await expect(page.locator("body")).not.toHaveClass(/side-hidden/);
});
