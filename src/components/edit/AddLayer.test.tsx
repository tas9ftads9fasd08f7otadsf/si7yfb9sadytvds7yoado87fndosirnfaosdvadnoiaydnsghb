import { describe, expect, it } from "vitest";
import { tileAt } from "./AddLayer";

describe("a tile address's preview", () => {
  // 111 W11: the tile where the map looks, each slot filled as a tile server reads it
  it("fills a template's slots for one tile", () => {
    expect(tileAt("https://t.test/{z}/{x}/{y}.png", 17.108, 48.145, 14))
      .toBe("https://t.test/14/8970/5685.png");
    expect(tileAt("https://{s}.t.test/{z}/{x}/{y}{r}.png", 17.108, 48.145, 14))
      .toBe("https://a.t.test/14/8970/5685.png");
    expect(tileAt("https://t.test/q/{quadkey}?z={z}&x={x}", 0.1, -0.1, 1)).toBe("https://t.test/q/3?z=1&x=1");
  });

  // 111 an address with no slots, or not on the web, previews nothing
  it("previews nothing for an address that is not a template", () => {
    expect(tileAt("https://t.test/tiles.json", 17, 48, 14)).toBeNull();
    expect(tileAt("ftp://t.test/{z}/{x}/{y}", 17, 48, 14)).toBeNull();
  });
});
