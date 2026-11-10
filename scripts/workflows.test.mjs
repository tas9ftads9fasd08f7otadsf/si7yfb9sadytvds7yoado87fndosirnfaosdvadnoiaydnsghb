import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (name) => readFileSync(path.join(process.cwd(), ".github/workflows", name), "utf8");

/** Every `name: level` under a `permissions:` key, as the text writes them. */
function asked(text) {
  const found = new Set();
  let depth = null;
  for (const line of text.split("\n")) {
    const indent = line.length - line.trimStart().length;
    if (/^\s*permissions:\s*$/.test(line)) depth = indent;
    else if (depth != null && indent > depth && /^\s*[\w-]+:\s*\w+/.test(line)) found.add(line.trim());
    else if (line.trim()) depth = null;
  }
  return found;
}

// 32 Release never started: CI asked to read pull requests, and Release did not grant it.
describe("the release workflow", () => {
  it("grants the CI it calls every permission CI's jobs ask for", () => {
    const release = read("release.yml");
    const check = release.slice(release.indexOf("  check:"), release.indexOf("\n  release:"));
    const granted = asked(check);
    for (const permission of asked(read("ci.yml"))) expect(granted).toContain(permission);
  });
});
