import { describe, expect, it, vi } from "vitest";
import { base64Of, cutOf, ICON_BYTES, sizedPicture, type Painter } from "./pictures";

const painter = (width: number, height: number, png = 10): Painter<string> => ({
  open: vi.fn(async () => ({ width, height, source: "picture" })),
  paint: vi.fn(async (_source, _cut, type) => new Blob([new Uint8Array(type === "image/png" ? png : 5)], { type })),
});

describe("the site's pictures", () => {
  // 202 the phone squares an icon to 132 pixels and fills a preview to 720 by 540, taking the middle
  it("cuts the middle of the picture in the target's shape", () => {
    expect(cutOf({ width: 400, height: 200 }, { width: 132, height: 132 }, true)).toEqual({
      sx: 100,
      sy: 0,
      sw: 200,
      sh: 200,
      width: 132,
      height: 132,
    });
    expect(cutOf({ width: 1440, height: 1440 }, { width: 720, height: 540 }, false)).toEqual({
      sx: 0,
      sy: 180,
      sw: 1440,
      sh: 1080,
      width: 720,
      height: 540,
    });
  });

  // 202 MapIconSnapshot.fitted never enlarges a preview past what was drawn
  it("draws a small preview at its own size, in the preview's shape, and enlarges an icon", () => {
    expect(cutOf({ width: 400, height: 300 }, { width: 720, height: 540 }, false)).toMatchObject({
      width: 400,
      height: 300,
    });
    expect(cutOf({ width: 40, height: 40 }, { width: 132, height: 132 }, true)).toMatchObject({
      width: 132,
      height: 132,
    });
  });

  it("makes an icon a PNG, and a JPEG when the PNG weighs more than the phone keeps", async () => {
    const light = painter(300, 300);
    expect((await sizedPicture("icon", new Blob(["x"]), light))?.type).toBe("image/png");
    const heavy = painter(300, 300, ICON_BYTES + 1);
    expect((await sizedPicture("styleIcon", new Blob(["x"]), heavy))?.type).toBe("image/jpeg");
    expect(vi.mocked(heavy.paint).mock.calls.map((call) => call[2])).toEqual(["image/png", "image/jpeg"]);
  });

  it("makes a preview a JPEG, and says nothing of a file that is no picture", async () => {
    expect((await sizedPicture("preview", new Blob(["x"]), painter(1000, 800)))?.type).toBe("image/jpeg");
    const unreadable: Painter<string> = { open: async () => null, paint: vi.fn() };
    expect(await sizedPicture("icon", new Blob(["x"]), unreadable)).toBeNull();
    expect(unreadable.paint).not.toHaveBeenCalled();
  });

  it("writes the bytes as base64", async () => {
    expect(await base64Of(new Blob([new Uint8Array([0, 255, 1])]))).toBe("AP8B");
  });
});
