import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

const layers = { "api-points": ["Buses", "6F1E2A10-0000-4000-8000-0000000000B7"],
  "drawn-file": ["Trails", "6F1E2A10-0000-4000-8000-0000000000D1"],
  "esri-layer": ["Bedrock", "6F1E2A10-0000-4000-8000-00000000009E"] };

test.beforeEach(async ({ request }) => { await reset(request); });

async function open(page, request, which) {
  await phone(request, which);
  const [name, id] = layers[which];
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  void name;
  await page.locator(`#editBody [data-layer='${id}']`).getByRole("button", { name: "Options" }).click();
  return page.locator(`[data-options='${id}']`);
}

const tabs = (panel) => panel.getByRole("tablist", { name: "Map markers" }).getByRole("tab").allInnerTexts();

// 168: an API layer's page is Map markers and stacks, but holds no lines or areas.
test("an API layer offers Stacking and not Lines and areas", async ({ page, request }) => {
  const panel = await open(page, request, "api-points");
  await expect(panel.getByRole("heading", { name: "Map markers" })).toBeVisible();
  expect(await tabs(panel)).toEqual(["Colour", "Mark", "Text", "Stacking"]);
  const asked = page.waitForRequest((one) => one.url().includes("/edit?"));
  await panel.getByRole("tab", { name: "Stacking" }).click();
  await panel.getByRole("switch", { name: "Stack close points" }).click();
  expect(new URL((await asked).url()).searchParams.get("stacking")).toBe("1");
});

// 168: a file layer offers Lines and areas, never Stacking.
test("a file layer offers Lines and areas and not Stacking", async ({ page, request }) => {
  const panel = await open(page, request, "drawn-file");
  expect(await tabs(panel)).toEqual(["Colour", "Mark", "Text", "Lines and areas"]);
  await panel.getByRole("tab", { name: "Lines and areas" }).click();
  await expect(panel.getByRole("slider", { name: "Line width" })).toBeVisible();
});

// 168: an Esri layer offers Lines and areas beside its own questions.
test("an Esri layer offers Lines and areas", async ({ page, request }) => {
  const panel = await open(page, request, "esri-layer");
  expect(await tabs(panel)).toEqual(["Colour", "Mark", "Text", "Lines and areas"]);
  await expect(panel.getByRole("switch", { name: "Answer taps from the server" })).toBeVisible();
});

// 168: the Colour section is titled for the mark: Dot, Circle, then Icon.
test("the colour section follows the mark", async ({ page, request }) => {
  const panel = await open(page, request, "drawn-file");
  await expect(panel.getByRole("group", { name: "Dot colour" })).toBeVisible();
  await panel.getByRole("tab", { name: "Mark" }).click();
  await panel.getByRole("combobox", { name: "Mark" }).selectOption("circled");
  await panel.getByRole("tab", { name: "Colour" }).click();
  await expect(panel.getByRole("group", { name: "Circle colour" })).toBeVisible();
  await panel.getByRole("tab", { name: "Mark" }).click();
  await panel.getByRole("combobox", { name: "Mark" }).selectOption("alone");
  await panel.getByRole("tab", { name: "Colour" }).click();
  await expect(panel.getByRole("group", { name: "Icon colour" })).toBeVisible();
});
