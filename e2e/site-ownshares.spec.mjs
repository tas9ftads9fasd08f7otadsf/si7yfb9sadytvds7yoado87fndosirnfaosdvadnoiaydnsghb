import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { editTab } from "./phone.mjs";
import { mockCloud, recordCoreCalls } from "./mock-cloud.mjs";

const account = JSON.parse(readFileSync(new URL("./fixtures/cloud-account.json", import.meta.url), "utf8"));
const SHARE_ZONE = account.zones.private[1].zoneID.zoneName;
const BESKYDY = "6F1E2A10-0000-4000-8000-000000000003";

const beskydy = { id: BESKYDY, name: "Beskydy", symbol: "leaf", revision: 1,
  layers: [{ id: "L3", name: "Forest roads", kind: "Vector tiles", symbol: "road.lanes" }] };
// The stand-in core answers what it was given; the map the person shares is one more of the maps list.
const answers = {
  ...account.core,
  riki_maps: { ...account.core.riki_maps, maps: [...account.core.riki_maps.maps, beskydy] },
  riki_map: { id: BESKYDY, name: "Beskydy", symbol: "leaf", styles: account.core.riki_map.styles,
    selectedStyleID: "B1", stack: [{ id: "L3", name: "Forest roads", kind: "Vector tiles" }] },
  riki_people: { shared: true, role: "owner", linkRole: null, people: [
    { id: "_me", name: "Riki Tester", role: "owner", hasAccepted: true, isYou: true },
    { id: "_jana", name: "Jana", role: "editor", hasAccepted: true, isYou: false },
    { id: "_petr", name: "petr@example.com", role: "reader", hasAccepted: false, isYou: false }] }
};

// 116 bug: the site read only the mirror zone, so a map the person shares never showed in Maps
async function openOwnShared(page) {
  const calls = await recordCoreCalls(page, ["riki_people", "riki_maps"]);
  const cloud = await mockCloud(page, { signedIn: true, answers });
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#railMaps").click();
  await page.locator("#others .row", { hasText: "Beskydy" }).click();
  return { cloud, calls };
}

test("a map the person shares shows in Maps, opens, and its Sharing tab lists the people", async ({ page }) => {
  await openOwnShared(page);
  await page.locator("#editButton").click();
  await expect(page.locator("#editTitle")).toHaveText("Edit map");
  await editTab(page, "Sharing");
  const people = page.locator("#people");
  await expect(people.locator("[data-person=_me]")).toContainText("Owner");
  await expect(people.locator("[data-person=_jana]")).toContainText("Can edit · Joined");
  await expect(people.locator("[data-person=_petr]")).toContainText("View only · Invited");
});

test("the page reads the zone made for the shared map, and hands the core its rows and share", async ({ page }) => {
  const { cloud, calls } = await openOwnShared(page);
  await page.locator("#editButton").click();
  await editTab(page, "Sharing");
  await expect(page.locator("#people [data-person]")).toHaveCount(3);
  const reads = cloud.asked.filter((each) => each.endpoint === "changes/zone" && each.database === "private")
    .map((each) => each.body.zones[0].zoneID.zoneName);
  expect(reads).toEqual(expect.arrayContaining(["com.apple.coredata.cloudkit.zone", SHARE_ZONE]));
  const people = (await calls()).find((each) => each.call === "riki_people");
  expect(people.request.id).toBe(BESKYDY);
  const inZone = people.request.rows.filter((row) => row.zone === SHARE_ZONE);
  expect(inZone.map((row) => row.entity).sort()).toEqual(["Share", "SharedMap", "SharedMapLayer", "SharedMapMember", "SharedMapMember"]);
  expect(inZone.every((row) => row.database === "private")).toBe(true);
  expect(inZone.find((row) => row.entity === "Share").fields.participants).toHaveLength(3);
});

// 116 sharing stopped: the zone is gone and Core Data put the map's rows back into the mirror zone
test("a map that stops being shared leaves its zone, and its rows are read from the mirror zone", async ({ page }) => {
  const { cloud, calls } = await openOwnShared(page);
  cloud.removeZone("private", SHARE_ZONE);
  cloud.add("private", "com.apple.coredata.cloudkit.zone", account.zones.private[1].records[0]);
  expect(await cloud.push()).toBe(true);
  const latest = async () => (await calls()).filter((each) => each.call === "riki_maps").at(-1)?.request.rows ?? [];
  await expect.poll(async () => (await latest()).filter((row) => row.id === "own-beskydy").map((row) => row.zone))
    .toEqual(["com.apple.coredata.cloudkit.zone"]);
  expect((await latest()).filter((row) => row.zone === SHARE_ZONE)).toEqual([]);
  await expect(page.locator("#device #deviceDot")).toHaveAttribute("aria-label", "Connected");
});
