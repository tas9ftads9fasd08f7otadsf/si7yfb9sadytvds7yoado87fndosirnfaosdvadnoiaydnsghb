// The phone's side of the stand-in: what Nearby sharing would show and press.
export async function phone(request, action, query = {}) {
  const answer = await request.get("/__test/" + action + "?" + new URLSearchParams(query).toString());
  return answer.json();
}

export const reset = (request) => phone(request, "reset");

// The page counts as let in once the side bar lists the map on screen.
export async function openViewer(page, address = "/") {
  await page.goto(address);
  await page.locator("#current .hero").waitFor();
}

// 41 All maps, New map and the servers are on the rail's Maps screen, not under an open map.
export async function showAllMaps(page) {
  await page.locator("#railMaps").click();
  await page.locator("#others").waitFor();
}

// 94 Edit map opens on Layers; the rest of it is under its other tabs.
export async function editTab(page, name) {
  await page.locator("#editTabs").getByRole("tab", { name, exact: true }).click();
  await page.locator(`#editTabs [aria-selected=true]`, { hasText: name }).waitFor();
}

// 95 a part of the Details layout is picked by its card; its settings then take the middle pane.
export async function pickPart(page, name) {
  await page.locator("#details .layout-pane .part-card", { hasText: name }).first().click();
  await page.locator("#details .settings-pane .pane-title", { hasText: name }).waitFor();
}

// 97 Add layer is a window of sources; each spec picks the one it adds from.
export async function addFrom(page, source) {
  await page.locator(`#addFrom-${source}`).click();
  await page.locator(`#addFrom-${source}[aria-pressed=true]`).waitFor();
}

// 103 Appearance is picked in Settings, from the gear at the rail's foot.
export async function pickTheme(page, theme) {
  if (!(await page.locator("#settings").count())) await page.locator("#railSettings").click();
  await page.locator(`#theme-${theme}`).click();
}
