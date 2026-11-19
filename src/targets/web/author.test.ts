import { describe, expect, it } from "vitest";
import { AUTHOR_KEY, AUTHOR_MOST, storedAuthor } from "./author";

// 83 the name typed in the site's account part is kept per browser
describe("the author kept in the browser", () => {
  const memory = () => {
    const held = new Map<string, string>();
    return { held, storage: { getItem: (key: string) => held.get(key) ?? null, setItem: (key: string, value: string) => { held.set(key, value); },
      removeItem: (key: string) => { held.delete(key); } } as unknown as Storage };
  };

  it("reads back what was kept, trimmed", () => {
    const { storage, held } = memory();
    const author = storedAuthor(() => storage);
    expect(author.read()).toBe("");
    author.keep("  Friki  ");
    expect(held.get(AUTHOR_KEY)).toBe("Friki");
    expect(author.read()).toBe("Friki");
  });

  it("forgets the name when it is cleared or only spaces", () => {
    const { storage, held } = memory();
    const author = storedAuthor(() => storage);
    author.keep("Friki");
    author.keep("   ");
    expect(held.has(AUTHOR_KEY)).toBe(false);
    expect(author.read()).toBe("");
  });

  it("keeps no more than the most a name may hold", () => {
    const { storage } = memory();
    const author = storedAuthor(() => storage);
    author.keep("x".repeat(AUTHOR_MOST + 20));
    expect(author.read()).toHaveLength(AUTHOR_MOST);
  });

  // 83 a browser that blocks its storage must not stop a change
  it("answers no name and keeps none when the browser's storage throws", () => {
    const blocked = () => { throw new DOMException("blocked", "SecurityError"); };
    const author = storedAuthor(blocked);
    expect(author.read()).toBe("");
    expect(() => author.keep("Friki")).not.toThrow();
  });
});
