import { test, expect } from "@playwright/test";
import { editTab, openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

async function openCard(page) {
  await openViewer(page, "/e/7q4-k29");
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  await editTab(page, "Sharing");
  await page.locator("#publish").waitFor();
}

// What the sheet needs: a category, a name and description (the map's own), and the agreement.
async function fillIn(page) {
  await page.locator("#publishCategory-hiking").click();
  await page.locator("#publishSummary").fill("Summer trails and huts of the High Tatras");
  await page.locator("#publishAgree").click();
}

const send = (page) => page.locator("#publishSend");
const requests = (request) => phone(request, "publish-requests");

// 136: the card under People; Send says what is still to do until the sheet's fields are written.
test("the Gallery card names what is still missing on Send, and sends once it is written", async ({ page, request }) => {
  await phone(request, "publish", { polls: "1" });
  await openCard(page);
  await expect(page.locator("#publishTitle")).toHaveText("Publish to the gallery");
  await expect(page.locator("#publishTile")).toHaveText("High Tatras");
  await expect(page.locator("#publish")).toContainText("Layers and styles are sent");
  await expect(page.locator("#publishCoverage")).toContainText("Slovakia, Poland");
  await expect(send(page)).toBeDisabled();
  await expect(send(page)).toContainText("Choose a category");
  await page.locator("#publishCategory-hiking").click();
  await expect(page.locator("#publishSummary")).toHaveValue("Summer trails");
  await page.locator("#publishSummary").fill("");
  await expect(send(page)).toContainText("Say what it shows");
  await page.locator("#publishSummary").fill("Summer trails and huts of the High Tatras");
  await expect(send(page)).toContainText("Tap Publish in the card above");
  await page.locator("#publishAgree").click();
  await expect(send(page)).toBeEnabled();
  await expect(send(page)).toHaveText("Publish to the gallery");
  await send(page).click();
  await expect(page.locator("#publishCode")).toHaveText(/^[0-9A-F]{4}$/);
  await expect(page.locator("#publishBadge")).toHaveText("Waiting");
  await expect(page.locator("#publishSent")).toContainText("Sent for review", { timeout: 15000 });
  await expect(page.locator("#publishSteps")).toContainText("Reviewer checks it");
  await expect(page.locator("#publishSteps")).toContainText("Live in the Gallery");
  const [sent] = await requests(request);
  expect(sent.body).toMatchObject({ category: "hiking", replaces: true, coverage: { countries: ["SK", "PL"] },
    texts: { en: { title: "High Tatras", body: "Summer trails and huts of the High Tatras" }, sk: { title: "Vysoké Tatry" } } });
  await page.locator("#publishDone").click();
  await expect(send(page)).toBeVisible();
});

// 136: a map with no preview posts the map as drawn first, and the phone then holds it.
test("a map with no preview has it posted first", async ({ page, request }) => {
  await openCard(page);
  await fillIn(page);
  const order = [];
  page.on("request", (asking) => {
    if (asking.url().includes("/picture?kind=preview")) order.push("preview");
    if (asking.method() === "POST" && asking.url().endsWith("/publish")) order.push("send");
  });
  await send(page).click();
  await expect(page.locator("#publishCode")).toBeVisible();
  expect(order).toEqual(["preview", "send"]);
  expect((await phone(request, "pictures")).some((kind) => kind.startsWith("preview:"))).toBe(true);
});

// 136: the phone's person says no; the card comes back with the phone's words and what was written kept.
test("a publication the phone's person does not confirm returns to the card with the phone's words", async ({ page, request }) => {
  await phone(request, "publish", { answer: "refused", polls: "1" });
  await openCard(page);
  await fillIn(page);
  await send(page).click();
  await expect(page.locator("#publishCode")).toBeVisible();
  await expect(page.locator("#publishSaid")).toHaveText("The phone's person did not publish it", { timeout: 15000 });
  await expect(page.locator("#publishCategory-hiking")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#publishSummary")).toHaveValue("Summer trails and huts of the High Tatras");
});

// 136: Cancel takes the ask back from the phone, so nothing waits there and a second try is not busy.
test("Cancel takes the ask back from the phone", async ({ page, request }) => {
  await phone(request, "publish", { answer: "wait" });
  await openCard(page);
  await fillIn(page);
  await send(page).click();
  await expect(page.locator("#publishCode")).toBeVisible();
  expect(await phone(request, "publish-waiting")).toBe(1);
  await page.locator("#publishCancel").click();
  await expect(send(page)).toBeEnabled();
  expect(await phone(request, "publish-waiting")).toBe(0);
  await send(page).click();
  await expect(page.locator("#publishCode")).toBeVisible();
});

// 136: one ask waits at a time; a second browser's POST is 429 and the page says the phone is busy.
test("a second ask while one waits says the phone is busy", async ({ page, request }) => {
  await phone(request, "publish", { answer: "wait" });
  await openCard(page);
  await fillIn(page);
  const asked = await page.request.post(`/riki/v1/maps/6F1E2A10-0000-4000-8000-000000000001/publish`, {
    headers: { Authorization: `Bearer ${await page.evaluate(() => window.__riki.state().editToken)}`, "Content-Type": "application/json" },
    data: { texts: { en: { title: "High Tatras", body: "Trails" } }, category: "hiking", coverage: { countries: ["SK"] }, replaces: true }
  });
  expect(asked.status()).toBe(202);
  await send(page).click();
  await expect(page.locator("#publishSaid")).toHaveText("Too many publications wait on the phone");
  await expect(send(page)).toBeEnabled();
});

// 136: the phone forgot the ask: the card says it ran out.
test("an ask the phone forgot says it ran out", async ({ page, request }) => {
  await phone(request, "publish", { answer: "wait" });
  await openCard(page);
  await fillIn(page);
  await send(page).click();
  await expect(page.locator("#publishCode")).toBeVisible();
  await phone(request, "publish", { expire: "1" });
  await expect(page.locator("#publishSaid")).toHaveText("The phone was not answered in time; ask again", { timeout: 15000 });
  await expect(send(page)).toBeVisible();
});

// 136: the phone could not send it; the card shows the phone's message.
test("a failed send shows the phone's message", async ({ page, request }) => {
  await phone(request, "publish", { answer: "failed", polls: "1" });
  await openCard(page);
  await fillIn(page);
  await send(page).click();
  await expect(page.locator("#publishSaid")).toHaveText("iCloud could not be reached", { timeout: 15000 });
  await page.locator("#publishDone").click();
  await expect(send(page)).toBeVisible();
});

// 136: signed out of iCloud the phone refuses the offer, and the card says so in place of the form.
test("not signed in to iCloud, the card says so and has no Send", async ({ page, request }) => {
  await phone(request, "publish", { signedIn: "0" });
  await openCard(page);
  await expect(page.locator("#publishRefused")).toHaveText("Not signed in to iCloud. Sign in in the Settings app.");
  await expect(send(page)).toHaveCount(0);
});

// 136: an editor who may not change the map's settings is refused; a locked map too.
test("a map the browser may not change shows the phone's reason", async ({ page, request }) => {
  await phone(request, "reader");
  await openCard(page);
  await expect(page.locator("#publishRefused")).toHaveText("This map is shared with this phone to look at, not to change");
  await expect(send(page)).toHaveCount(0);
});

// 136: keys left out are listed and need a note; the manual must be a web address.
test("keys left out are listed, and how to get them is required", async ({ page, request }) => {
  await phone(request, "publish", { leftOut: "1" });
  await openCard(page);
  await expect(page.locator("#publishLeftOut")).toContainText("Mapy.cz key");
  await fillIn(page);
  await expect(send(page)).toContainText("Say how to get the keys");
  await page.locator("#publishKeysNote").fill("Ask the city for a free key");
  await page.locator("#publishManual").fill("not a page");
  await expect(send(page)).toContainText("Fix the web address");
  await page.locator("#publishManual").fill("https://example.com/keys");
  await expect(send(page)).toHaveText("Publish to the gallery");
  await send(page).click();
  await expect(page.locator("#publishCode")).toBeVisible();
  const [sent] = await requests(request);
  expect(sent.body).toMatchObject({ keysNote: "Ask the city for a free key", manualURL: "https://example.com/keys" });
});

// 136: an update says what changed and agrees to nothing; the first publish with no name takes one.
test("an update asks what changed, and a first publish with no name asks for one", async ({ page, request }) => {
  await phone(request, "publish", { update: "1" });
  await openCard(page);
  await expect(page.locator("#publishTitle")).toHaveText("Update in the gallery");
  await expect(page.locator("#publishReplaces")).toHaveCount(0);
  await page.locator("#publishCategory-hiking").click();
  await page.locator("#publishSummary").fill("Trails");
  await expect(send(page)).toContainText("Say what changed");
  await page.locator("#publishChanges").fill("New huts");
  await expect(send(page)).toHaveText("Update in the gallery");
  await send(page).click();
  await expect(page.locator("#publishCode")).toBeVisible();
  expect((await requests(request))[0].body).toMatchObject({ changes: "New huts" });
  await page.locator("#publishCancel").click();

  await phone(request, "publish", { update: "0", needsName: "1" });
  await page.reload();
  await page.locator("#publish").waitFor();
  await fillIn(page);
  await expect(send(page)).toContainText("Add a name");
  await page.locator("#publishPublicName").fill("Riki Hiker");
  await send(page).click();
  await expect(page.locator("#publishCode")).toBeVisible();
  expect((await requests(request))[1].body).toMatchObject({ publicName: "Riki Hiker", replaces: true });
});

// 136: a language is added and written, and goes with the request; Change opens Coverage's editor.
test("another language is written and sent, and Change opens the Coverage editor", async ({ page, request }) => {
  await openCard(page);
  await page.locator("#publishAddLanguage").selectOption("de");
  await page.locator("#publishName").fill("Hohe Tatra");
  await page.locator("#publishLanguage-en").click();
  await expect(page.locator("#publishName")).toHaveValue("High Tatras");
  await fillIn(page);
  await send(page).click();
  await expect(page.locator("#publishCode")).toBeVisible();
  expect((await requests(request))[0].body.texts.de).toEqual({ title: "Hohe Tatra", body: "" });
  await page.locator("#publishCancel").click();
  await page.locator("#publishChange").click();
  await expect(page.locator("#editTabs [aria-selected=true]")).toHaveText("Offline");
});
