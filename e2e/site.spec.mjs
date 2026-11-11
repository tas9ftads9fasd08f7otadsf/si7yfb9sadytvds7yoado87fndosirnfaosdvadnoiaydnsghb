import { test, expect } from "@playwright/test";

// 37 the site from its zip, at the root (web) and under /editor/ (web-under-path)
const base = (baseURL) => new URL(baseURL).pathname.replace(/\/$/, "");

test("the page and every file it asks for are served, under the site's own path", async ({ page, baseURL }) => {
  const missing = [];
  page.on("response", (answer) => { if (answer.status() >= 400) missing.push(answer.url()); });
  page.on("requestfailed", (asked) => missing.push(asked.url()));
  await page.goto("./");
  await expect(page.locator("#appName")).toHaveText("Riki Maps");
  const scripts = await page.locator("script[src]").evaluateAll((all) => all.map((each) => each.getAttribute("src")));
  expect(scripts.length).toBeGreaterThan(0);
  for (const src of scripts) expect(src.startsWith(`${base(baseURL)}/_next/static/`)).toBe(true);
  expect((await page.content()).includes("__riki_base__")).toBe(false);
  expect(missing.filter((url) => !url.endsWith("/config.json"))).toEqual([]);
});

test("a screen's address opens the page and survives a reload", async ({ page, baseURL }) => {
  await page.goto("./maps/M1/edit/layers");
  await expect(page.locator("#appName")).toHaveText("Riki Maps");
  expect(new URL(page.url()).pathname).toBe(`${base(baseURL)}/maps/M1/edit/layers`);
  await page.reload();
  await expect(page.locator("#appName")).toHaveText("Riki Maps");
  expect(new URL(page.url()).pathname).toBe(`${base(baseURL)}/maps/M1/edit/layers`);
});

test("the rail's links carry the site's path", async ({ page, baseURL }) => {
  await page.goto("./");
  await expect(page.locator("#railMaps")).toHaveAttribute("href", `${base(baseURL)}/maps`);
  await page.locator("#railMaps").click();
  expect(new URL(page.url()).pathname).toBe(`${base(baseURL)}/maps`);
});

test("nothing outside the build is served", async ({ request }) => {
  for (const path of ["site.json", "Site.php", "config.example.php", "index.php/../site.json", "_next/../site.json"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
