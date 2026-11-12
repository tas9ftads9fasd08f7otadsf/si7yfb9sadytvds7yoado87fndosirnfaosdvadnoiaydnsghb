import { test, expect } from "@playwright/test";
import { openViewer, reset, showAllMaps } from "./phone.mjs";

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
  // 2945: its styles are the header's switcher only.
  await expect(page.locator(".chips")).toHaveCount(0);
  await expect(page.locator("#styleSelect option")).toHaveText(["Summer", "Winter"]);
  // 41 an open map's side bar is the map alone.
  await expect(page.locator("#others")).toHaveCount(0);
  await expect(page.locator(".maplibregl-ctrl-zoom-in")).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-fullscreen")).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-scale")).toBeVisible();
  await expect(page.locator("#zoom")).toHaveText(/^z \d+\.\d$/);
  await expect(page.locator("#editButton")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the pointer's place is written in the status line", async ({ page }) => {
  await openViewer(page);
  const map = await page.locator("#map").boundingBox();
  await page.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
  await expect(page.locator("#pointer")).toHaveText(/^-?\d+\.\d{5}, -?\d+\.\d{5}$/);
});

// 2945: the side bar's chips are an editing browser's.
test("the style is picked in the header or in the side bar, and the map follows", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  const select = page.locator("#styleSelect");
  await expect(page.locator("#styleLabel")).toBeVisible();
  await expect(select.locator("option")).toHaveText(["Summer", "Winter"]);

  const asked = page.waitForRequest((request) => request.url().includes("/style?") && request.url().includes("hide="));
  await select.selectOption({ label: "Winter" });
  expect(new URL((await asked).url()).searchParams.get("hide")).toBe("6F1E2A10-0000-4000-8000-0000000000A2");
  await expect(page.locator(".chips button.picked")).toHaveText("Winter");
  // 30 a style other than the one the map opens on is in the address's path.
  await expect(page).toHaveURL(/\/maps\/[^/]+\/style\/6F1E2A10-0000-4000-8000-0000000000B2#/);

  await page.locator(".chips button", { hasText: "Summer" }).click();
  await expect(select).toHaveValue("6F1E2A10-0000-4000-8000-0000000000B1");
  await expect(page).not.toHaveURL(/\/style\//);
});

// 2916: the switches are an editing browser's.
test("a layer switched off in the side bar is left out of the style", async ({ page }) => {
  await openViewer(page, "/e/7q4-k29");
  await expect(page.locator("#layerList .row")).toHaveCount(2);
  const asked = page.waitForRequest((request) => request.url().includes("/style?")
    && request.url().includes("hide=6F1E2A10-0000-4000-8000-0000000000A1"));
  await page.getByRole("switch", { name: "Trails" }).click({ force: true });
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
  await expect(page.locator("#styleLabel")).toBeHidden();
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
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  await name.fill("Tatras in summer");
  await name.press("Enter");
  await name.blur();
  await expect(page.locator("#mapName")).toHaveText("Tatras in summer");
  await page.keyboard.press("Escape");
  await expect(page.locator("#editPage")).toHaveClass(/ahead/);
});

// 2800: the owner's ask, a light and dark switch on the page.
test("the header's switch turns the page light, dark or back to the computer's, and the map follows", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openViewer(page);
  const root = page.locator("html");
  const toggle = page.locator("#themeToggle");
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await expect(toggle).toHaveAttribute("aria-label", "Appearance: Automatic");
  // 30 the design's grounds
  expect(await background()).toBe("rgb(242, 242, 247)");

  let asked = page.waitForRequest((request) => request.url().includes("/style?"));
  await toggle.click();
  await expect(root).toHaveAttribute("data-theme", "light");
  expect(new URL((await asked).url()).searchParams.get("theme")).toBe("light");

  asked = page.waitForRequest((request) => request.url().includes("/style?"));
  await toggle.click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-label", "Appearance: Dark");
  expect(new URL((await asked).url()).searchParams.get("theme")).toBe("dark");
  expect(await background()).toBe("rgb(0, 0, 0)");

  await page.reload();
  await page.locator("#current .hero").waitFor();
  await expect(root).toHaveAttribute("data-theme", "dark", { timeout: 1000 });

  await toggle.click();
  await expect(root).not.toHaveAttribute("data-theme", /.*/);
  await expect(toggle).toHaveAttribute("aria-label", "Appearance: Automatic");
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
  // 2917: both follow an eased zoom; one read of the status line mid-way caught a stale value.
  await expect.poll(async () => (await badge.textContent()) === (await page.locator("#zoom").textContent()))
    .toBe(true);
});
