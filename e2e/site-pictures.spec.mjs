import { test, expect } from "@playwright/test";
import { editTab } from "./phone.mjs";
import { mockCloud, recordCoreAsks } from "./mock-cloud.mjs";

/** A PNG's or a JPEG's width and height, read from its header. */
function sizeOf(bytes) {
  if (bytes[0] === 0x89) return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  for (let at = 2; at < bytes.length; ) {
    const marker = bytes[at + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return [bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)];
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  return null;
}

const openGeneral = async (page) => {
  await page.goto("./");
  await page.locator("#current .hero").waitFor();
  await page.locator("#editButton").click();
  await editTab(page, "General");
};

// 202 the icon's picture said "The site cannot do this yet"; the browser squares it as the phone does
test("a chosen picture reaches the core as the phone's 132 pixel square", async ({ page }) => {
  const asks = await recordCoreAsks(page);
  await mockCloud(page, { signedIn: true });
  await openGeneral(page);
  const wide = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = [300, 200];
    const context = canvas.getContext("2d");
    context.fillStyle = "#2a7";
    context.fillRect(0, 0, 300, 200);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator("#iconPictureFile").setInputFiles({
    name: "hut.png",
    mimeType: "image/png",
    buffer: Buffer.from(wide, "base64"),
  });
  await expect.poll(async () => (await asks()).find((each) => each.picture)?.picture.kind).toBe("icon");
  const { picture } = (await asks()).find((each) => each.picture);
  expect(sizeOf(Buffer.from(picture.data, "base64"))).toEqual([132, 132]);
});

// 202 the preview is the map as the browser draws it, kept as a JPEG no bigger than the phone's
test("Take preview hands the core the drawn map as a JPEG within 720 by 540", async ({ page }) => {
  const asks = await recordCoreAsks(page);
  await mockCloud(page, { signedIn: true });
  await openGeneral(page);
  await page.locator("#takePreview").click();
  await expect.poll(async () => (await asks()).find((each) => each.picture)?.picture.kind).toBe("preview");
  const bytes = Buffer.from((await asks()).find((each) => each.picture).picture.data, "base64");
  expect(bytes[0]).toBe(0xff);
  const [width, height] = sizeOf(bytes);
  expect(width).toBeLessThanOrEqual(720);
  expect(height).toBeLessThanOrEqual(540);
  expect(Math.abs(width / height - 4 / 3)).toBeLessThan(0.01);
});
