import { test, expect } from "@playwright/test";
import { mockCloud } from "./mock-cloud.mjs";

// 78 the site edits iCloud maps: a rename, a retried conflict, a change from elsewhere
const layerRow = (page, name) => page.locator("#editBody .row").filter({ has: page.getByRole("switch", { name }) });

async function openEdit(page) {
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
}

const modifies = (cloud) => cloud.asked.filter((each) => each.endpoint === "records/modify");

async function rename(page, from, to) {
  const field = layerRow(page, from).getByRole("textbox", { name: "Rename" });
  await field.fill(to);
  await field.press("Enter");
}

test("a layer renamed is saved to the mirror zone with its change tag and a web history row", async ({ page }) => {
  const cloud = await mockCloud(page, { signedIn: true });
  await openEdit(page);
  await rename(page, "Trails", "Ridges");
  await expect.poll(() => modifies(cloud).length).toBe(1);
  const [asked] = modifies(cloud);
  expect(asked.database).toBe("private");
  expect(asked.body.atomic).toBe(true);
  expect(asked.body.zoneID.zoneName).toBe("com.apple.coredata.cloudkit.zone");
  const [layer, history] = asked.body.operations;
  expect(layer).toMatchObject({ operationType: "update", record: { recordName: "own-tatras-layer", recordChangeTag: "a2",
    fields: { CD_layerJSON: { value: "{\"id\":\"L1\",\"name\":\"Ridges\"}", type: "STRING" } } } });
  expect(history).toMatchObject({ operationType: "create", record: { recordName: "change-web-1", recordType: "CD_SharedMapChange" } });
  expect(cloud.record("own-tatras-layer").fields.CD_layerJSON.value).toContain("Ridges");
  expect(cloud.record("change-web-1")).toBeTruthy();
});

// 84 bug: the history row went as a STRING payload without id, time or version; a deployed schema refuses it
test("the history row is written as the app's mirror writes one, which the mock's schema takes", async ({ page }) => {
  const cloud = await mockCloud(page, { signedIn: true });
  await openEdit(page);
  await rename(page, "Trails", "Ridges");
  await expect.poll(() => cloud.record("change-web-1")).toBeTruthy();
  const { fields } = cloud.record("change-web-1");
  expect(fields.CD_payload.type).toBe("BYTES");
  expect(Buffer.from(fields.CD_payload.value, "base64").toString()).toContain("\"origin\":\"web\"");
  expect(fields.CD_id.value).toMatch(/^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/);
  expect(fields.CD_updatedAt.type).toBe("TIMESTAMP");
  expect(Date.now() - fields.CD_updatedAt.value).toBeLessThan(60_000);
  expect(fields.CD_schemaVersion).toEqual({ value: 1, type: "INT64" });
  expect(fields.CD_entityName.value).toBe("SharedMapChange");
});

test("a conflict is read again and the edit applied again, and then it is saved", async ({ page }) => {
  const cloud = await mockCloud(page, { signedIn: true });
  await openEdit(page);
  cloud.conflictNext(1);
  await rename(page, "Trails", "Ridges");
  await expect.poll(() => modifies(cloud).length).toBe(2);
  const [first, second] = modifies(cloud).map((each) => each.body.operations[0].record.recordChangeTag);
  expect(first).toBe("a2");
  expect(second).toBe("a2x2");
  await expect.poll(() => cloud.record("own-tatras-layer").fields.CD_layerJSON.value).toContain("Ridges");
  await expect(page.locator("#notice")).not.toHaveClass(/shown/);
});

test("three conflicts in a row say the map changed elsewhere and put the field back", async ({ page }) => {
  const cloud = await mockCloud(page, { signedIn: true });
  await openEdit(page);
  cloud.conflictNext(3);
  await rename(page, "Trails", "Ridges");
  await expect(page.locator("#notice")).toHaveText("The map changed elsewhere. Open it again and repeat the change.");
  expect(modifies(cloud)).toHaveLength(3);
  expect(cloud.record("own-tatras-layer").fields.CD_layerJSON.value).toContain("Trails");
  await expect(layerRow(page, "Trails").getByRole("textbox", { name: "Rename" })).toHaveValue("Trails");
});

test("a change another device made shows who changed the map", async ({ page }) => {
  const cloud = await mockCloud(page, { signedIn: true, answers: undefined });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  cloud.change("own-tatras", { CD_name: { value: "High Tatras 2", type: "STRING" } });
  await cloud.push();
  await expect(page.locator("#notice")).toHaveText("High Tatras was changed on another device");
});

test("a pushed change with a history row names its author", async ({ page }) => {
  const account = await (await import("./mock-cloud.mjs")).loadAccount();
  const cloud = await mockCloud(page, { signedIn: true,
    answers: { ...account.core, riki_changes: [{ id: "change-friki", map: "own-tatras", author: "Friki", lines: ["Roads renamed"] }] } });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  cloud.add("private", "com.apple.coredata.cloudkit.zone", { recordName: "change-friki", recordType: "CD_SharedMapChange",
    fields: { CD_map: { value: { recordName: "own-tatras" }, type: "REFERENCE" } } });
  cloud.change("own-tatras", { CD_name: { value: "High Tatras 2", type: "STRING" } });
  await cloud.push();
  await expect(page.locator("#notice")).toHaveText("High Tatras was changed by Friki");
});
