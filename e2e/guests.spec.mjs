import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function onlyGuest(request) {
  const { guests } = await phone(request, "guests");
  expect(guests).toHaveLength(1);
  return guests[0];
}

test("each browser is counted, on the phone and in every page's header", async ({ browser, page, request }) => {
  await openViewer(page);
  await expect(page.locator("#viewerCount")).toHaveText("1");
  const other = await browser.newContext({ extraHTTPHeaders: { "x-test-address": "192.168.1.31" } });
  const second = await other.newPage();
  await openViewer(second);
  await expect(second.locator("#viewerCount")).toHaveText("2");
  await expect(page.locator("#viewerCount")).toHaveText("2", { timeout: 8000 });
  await expect(page.locator("#viewers")).toHaveAttribute("title", "Browsers viewing: 2");
  const { guests, viewers } = await phone(request, "guests");
  expect(viewers).toBe(2);
  expect(guests.map((guest) => guest.standing)).toEqual(["admitted", "admitted"]);
  await other.close();
});

test("with Ask first on, a new browser waits and sees nothing until it is let in", async ({ page, request }) => {
  await phone(request, "asks-first", { on: "1" });
  await page.goto("/");
  await expect(page.locator("#gate")).toBeVisible();
  await expect(page.locator("#gateTitle")).toHaveText("Waiting to be let in");
  await expect(page.locator("#gateDevice")).toHaveText("Riki's iPad");
  await expect(page.locator("#askToJoin")).toBeHidden();
  await expect(page.locator("#current .hero")).toHaveCount(0);
  expect((await page.request.get("/riki/v1/device")).status()).toBe(403);
  const guest = await onlyGuest(request);
  expect(guest.standing).toBe("waiting");
  expect((await phone(request, "guests")).viewers).toBe(0);

  await phone(request, "admit", { id: guest.id });
  await expect(page.locator("#gate")).toBeHidden({ timeout: 8000 });
  await page.locator("#current .hero").waitFor();
  await expect(page.locator("#mapName")).toHaveText("High Tatras");
  expect((await page.request.get("/riki/v1/device")).status()).toBe(200);
});

test("a removed browser is shut out, asks to join, and is let back in", async ({ page, request }) => {
  await openViewer(page);
  const guest = await onlyGuest(request);
  await phone(request, "remove", { id: guest.id });

  await expect(page.locator("#gate")).toBeVisible({ timeout: 8000 });
  await expect(page.locator("#gateTitle")).toHaveText("Removed from these maps");
  await expect(page.locator("#askToJoin")).toHaveText("Ask to join");
  expect((await page.request.get("/riki/v1/device")).status()).toBe(403);
  expect((await phone(request, "guests")).viewers).toBe(0);

  await page.locator("#askToJoin").click();
  await expect(page.locator("#gateTitle")).toHaveText("Waiting to be let in");
  await expect(page.locator("#askToJoin")).toBeHidden();
  expect((await onlyGuest(request)).standing).toBe("waiting");

  await phone(request, "admit", { id: guest.id });
  await expect(page.locator("#gate")).toBeHidden({ timeout: 8000 });
  await expect(page.locator("#mapName")).toHaveText("High Tatras");
  await expect(page.locator("#viewerCount")).toHaveText("1");
});

test("a removed browser that drops its cookie comes back removed, not let in", async ({ context, page, request }) => {
  await openViewer(page);
  const guest = await onlyGuest(request);
  await phone(request, "remove", { id: guest.id });
  await context.clearCookies();
  await page.reload();
  await expect(page.locator("#gate")).toBeVisible();
  await expect(page.locator("#gateTitle")).toHaveText("Removed from these maps");
  expect((await page.request.get("/riki/v1/device")).status()).toBe(403);
});

test("the gate keeps the page's keys and the map from a browser kept out", async ({ page, request }) => {
  await phone(request, "asks-first", { on: "1" });
  await page.goto("/");
  await expect(page.locator("#gate")).toBeVisible();
  await expect(page.locator("#gate")).toHaveAttribute("aria-modal", "true");
  expect((await page.request.get("/riki/v1/maps/6F1E2A10-0000-4000-8000-000000000001/style")).status()).toBe(403);
  expect((await page.request.post("/riki/v1/maps/6F1E2A10-0000-4000-8000-000000000001/edit?name=x",
    { headers: { Authorization: "Bearer mock.anything" } })).status()).toBe(403);
});
