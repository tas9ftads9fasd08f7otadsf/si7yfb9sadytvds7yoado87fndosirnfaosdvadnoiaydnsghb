import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Bus, Circle, Map as MapIcon, Mountain, Search, ShoppingCart, TrainFront } from "lucide-static";
import { describe, expect, it } from "vitest";
import { siteSymbol, siteSymbolURL } from "./symbols";

const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? sources(path.join(dir, entry.name)) : /\.tsx$/.test(entry.name) ? [path.join(dir, entry.name)] : []);

describe("the site's symbols", () => {
  // 133 bug: the site had no pictures for its symbols and drew each as a grey square
  it("draws every symbol the page names from the open set, none as a plain circle", () => {
    const named = new Set<string>();
    for (const file of sources(path.join(process.cwd(), "src/components"))) {
      for (const [, name] of readFileSync(file, "utf8").matchAll(/Sym name="([^"]+)"/g)) if (name) named.add(name);
    }
    expect(named.size).toBeGreaterThan(40);
    for (const name of named) expect(siteSymbol(name), name).not.toBe(Circle);
    expect(siteSymbol("magnifyingglass")).toBe(Search);
  });

  // 133 a layer's own mark takes the picture nearest its word
  it("gives a layer's or a map's own mark the nearest picture, else a circle", () => {
    expect(siteSymbol("tram.fill")).toBe(TrainFront);
    expect(siteSymbol("bus.doubledecker")).toBe(Bus);
    expect(siteSymbol("mountain.2.fill")).toBe(Mountain);
    expect(siteSymbol("cart.fill")).toBe(ShoppingCart);
    expect(siteSymbol(null)).toBe(MapIcon);
    expect(siteSymbol("something.unheard.of")).toBe(Circle);
  });

  // 133 the picture is a mask the text's colour fills
  it("is an inline SVG the page masks with", () => {
    const url = siteSymbolURL("map");
    expect(url.startsWith('url("data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url)).toContain("<svg");
    expect(siteSymbolURL("map")).toBe(url);
  });
});
