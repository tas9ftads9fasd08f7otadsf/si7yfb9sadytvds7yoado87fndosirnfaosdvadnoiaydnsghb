import { test, expect } from "@playwright/test";
import { openViewer, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openCoverage(page) {
  await openViewer(page, "/?edit=7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.locator("#coverageLine")).toHaveText("Not limited");
  await page.locator("#coverageToggle").click();
  await expect(page.locator("#coveragePickers")).toBeVisible();
}

// The coverage each edit sends, as JSON.
const sent = (page) => page.waitForRequest((request) => request.url().includes("/edit?"))
  .then((request) => JSON.parse(new URL(request.url()).searchParams.get("coverage")));

const country = (page, code) => page.locator(`#coverageCountries [data-country=${code}] button[data-id=${code}]`);

// 2957: the phone says what the choices come to; a country ticked is taken in whole.
test("Coverage takes in a country, and the phone's line follows", async ({ page }) => {
  await openCoverage(page);
  await expect(page.locator("#coverageRequired")).toContainText("Its layers require Vysoké Tatry");
  await expect(page.locator("#coverageCountries [data-country] > .row:first-child .words")).toHaveText(["Slovakia", "Austria", "Czechia"]);

  const asked = sent(page);
  await country(page, "SK").click();
  expect(await asked).toEqual({ countries: ["SK"] });
  await expect(page.locator("#coverageLine")).toHaveText("SK");
  await expect(country(page, "SK")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#coverageCountries [data-country=SK] button").first().click();
  await expect(page.locator("#coverageCountries button.region[data-id=kosicky]")).toBeDisabled();
  await expect(page.locator("#coverageCountries [data-country=AT] > span.row")).toHaveText("Austria");
});

// 2957: the excluding side keeps the including one, and each row says what the other side holds.
test("a region left out of a country is struck out there and marked on the other side", async ({ page }) => {
  await openCoverage(page);
  let asked = sent(page);
  await country(page, "SK").click();
  await asked;
  await page.getByRole("button", { name: "Exclude", exact: true }).click();
  await expect(page.locator("#coveragePickers")).toContainText("What the map leaves out of that.");
  await page.locator("#coverageCountries [data-country=SK] button").first().click();
  asked = sent(page);
  await page.locator("#coverageCountries button.region[data-id=kosicky]").click();
  expect(await asked).toEqual({ countries: ["SK"], exclude: { regions: ["kosicky"] } });
  await expect(page.locator("#coverageLine")).toHaveText("SK · except kosicky");
  await expect(page.locator("#coverageCountries button.region[data-id=kosicky] .tick")).toHaveClass(/out/);

  await page.getByRole("button", { name: "Include", exact: true }).click();
  await expect(page.locator("#coverageCountries button.region[data-id=kosicky] .other")).toHaveCount(0);
  await expect(page.locator("#coverageCountries button.region[data-id=presovsky]")).toBeDisabled();
  await expect(country(page, "SK")).toHaveAttribute("aria-pressed", "true");
});

// 2957: the phone's warnings arrive with its line: nothing covered, a required range left out.
test("leaving out what a layer requires, or everything, is warned of", async ({ page }) => {
  await openCoverage(page);
  await page.getByRole("button", { name: "Exclude", exact: true }).click();
  await page.locator("#coverageRanges").click();
  let asked = sent(page);
  await page.locator("#coveragePickers button.region[data-id=vysoke_tatry]").click();
  expect(await asked).toEqual({ exclude: { regions: ["vysoke_tatry"] } });
  await expect(page.locator("#coverage .warning")).toContainText("yet a layer requires it: Vysoké Tatry");

  asked = sent(page);
  await page.getByRole("switch", { name: "Whole world" }).click({ force: true });
  expect(await asked).toEqual({ exclude: { regions: ["vysoke_tatry"], world: true } });
  await expect(page.locator("#coverage .warning").first()).toHaveText(/covers no place at all/);
});

// 2957: continents and the mountains are picked as on the phone; the search narrows the countries.
test("a continent and every range are taken in, and the countries are searched", async ({ page }) => {
  await openCoverage(page);
  let asked = sent(page);
  await page.locator("#coveragePickers button.row", { hasText: "Europe" }).click();
  expect(await asked).toEqual({ continents: ["europe"] });
  asked = sent(page);
  await page.locator("#coveragePickers button.row", { hasText: "Every mountain range" }).click();
  expect(await asked).toEqual({ continents: ["europe"], mountains: true });
  await page.locator("#coverageRanges").click();
  await expect(page.locator("#coveragePickers button.region[data-id=vysoke_tatry]")).toBeDisabled();
  await page.getByRole("searchbox", { name: "Search countries" }).fill("czech");
  await expect(page.locator("#coverageCountries [data-country] > .row:first-child .words")).toHaveText(["Czechia"]);
});
