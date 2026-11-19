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
