import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { mockCloud } from "./mock-cloud.mjs";

// 91 the site speaks the language the browser asks for, from the words files made from the app's tables
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "words");

/** The made files, a few sentences of cs and en as the tables make them, in place of the pack's English alone. */
async function mockWords(page) {
  const asked = [];
  await page.route("**/words/*.json", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    asked.push(name);
    try {
      return await route.fulfill({ status: 200, contentType: "application/json", body: await readFile(path.join(FIXTURES, name)) });
    } catch {
      return route.fulfill({ status: 404, body: "" });
    }
  });
  return asked;
}

test.describe("a browser asking for Czech", () => {
  test.use({ locale: "cs" });

  test("is spoken to in Czech, from the words under the site's own path", async ({ page }) => {
    const asked = await mockWords(page);
    await mockCloud(page);
    await page.goto("./");
    await expect(page.locator("#gateTitle")).toHaveText("Přihlaste se k iCloudu");
    expect(asked).toEqual(expect.arrayContaining(["languages.json", "cs.json"]));
    expect(asked).not.toContain("en.json");
  });

  test("shows Edit map in Czech", async ({ page }) => {
    await mockWords(page);
    await mockCloud(page, { signedIn: true });
    await page.goto("./");
    await page.locator("#current .hero").waitFor();
    await page.locator("#editButton").click();
    await expect(page.locator("#editTitle")).toHaveText("Upravit mapu");
  });
});

test.describe("a browser asking for a language with no words", () => {
  test.use({ locale: "ja" });

  test("is spoken to in English", async ({ page }) => {
    const asked = await mockWords(page);
    await mockCloud(page);
    await page.goto("./");
    await expect(page.locator("#gateTitle")).toHaveText("Sign in to iCloud");
    expect(asked).toContain("en.json");
  });
});

test("the site serves its words under its path, English among them, and speaks English to a browser asking for it", async ({ page }) => {
  await mockCloud(page);
  await page.goto("./");
  await expect(page.locator("#gateTitle")).toHaveText("Sign in to iCloud");
  const list = await page.request.get(new URL("words/languages.json", page.url()).href);
  expect(await list.json()).toContain("en");
  const english = await (await page.request.get(new URL("words/en.json", page.url()).href)).json();
  expect(english).toMatchObject({ language: "en", words: { signInTitle: "Sign in to iCloud" } });
});
