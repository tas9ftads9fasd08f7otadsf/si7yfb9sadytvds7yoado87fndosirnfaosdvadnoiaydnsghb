import { test, expect } from "@playwright/test";
import { openViewer, phone, reset } from "./phone.mjs";

test.beforeEach(async ({ request }) => { await reset(request); });

const prešov = () => __riki.map.jumpTo({ center: [21.5, 49.0], zoom: 10 });

// 2802: the owner's ask, a region the phone lacks offered in the browser and fetched on the phone.
test("over a region the phone lacks, an editing browser downloads it and draws it once it lands",
  async ({ page, request }) => {
    test.setTimeout(60000);
    await openViewer(page, "/?edit=7q4-k29");
    await page.evaluate(prešov);
    const offer = page.locator("#regionOffer");
    await expect(page.locator("#regionDownload")).toHaveText("Download Prešovský kraj");

    await page.locator("#regionDownload").click();
    await expect(offer).toHaveText("Downloading Prešovský kraj");
    await expect(page.locator("#regionDownload")).toHaveCount(0);

    const redrawn = page.waitForRequest((asked) => asked.url().includes("/style?"), { timeout: 20000 });
    await phone(request, "land");
    await redrawn;
    await expect(offer).toBeHidden();
  });

test("a browser that cannot edit is told the region is not on the phone, with nothing to press", async ({ page }) => {
  await openViewer(page);
  await page.evaluate(prešov);
  await expect(page.locator("#regionOffer")).toHaveText("Prešovský kraj is not downloaded on the phone");
  await expect(page.locator("#regionDownload")).toHaveCount(0);
});

test("over a region the phone has, nothing is offered", async ({ page }) => {
  await openViewer(page, "/?edit=7q4-k29");
  await page.evaluate(() => __riki.map.jumpTo({ center: [20.1, 49.2], zoom: 11 }));
  await expect(page.locator("#regionOffer")).toBeHidden();
});
