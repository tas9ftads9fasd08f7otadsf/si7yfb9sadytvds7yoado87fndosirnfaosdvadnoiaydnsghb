import { describe, expect, it } from "vitest";
import { categoriesOf, cleanCategory } from "./category";

describe("cleanCategory", () => {
  // 142 one line, single spaces, as the app's MapCategoryName cleans it
  it("trims and collapses whitespace, tabs and line breaks included", () => {
    expect(cleanCategory("  Hiking   trips ")).toBe("Hiking trips");
    expect(cleanCategory("Work\n\tprojects")).toBe("Work projects");
    expect(cleanCategory("   ")).toBe("");
  });
});

describe("categoriesOf", () => {
  // 142 the maps' own categories, distinct whatever the case, the first spelling kept, sorted
  it("lists each category once, case-folded, and none for a map without", () => {
    expect(categoriesOf([{ category: "Hiking" }, { category: "hiking " }, { category: "Work" }, {}, { category: "  " },
      { category: "city  breaks" }])).toEqual(["city breaks", "Hiking", "Work"]);
    expect(categoriesOf([])).toEqual([]);
  });
});
