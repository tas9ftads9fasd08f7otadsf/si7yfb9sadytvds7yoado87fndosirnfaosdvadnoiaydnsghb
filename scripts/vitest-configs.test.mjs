import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (name) => readFileSync(path.join(process.cwd(), name), "utf8");
const suites = readdirSync(path.join(process.cwd(), "scripts")).filter((name) => name.endsWith(".ftps.test.mjs"));

// 174 npm test ran FTPS servers, which need OpenSSL 1.1.1+ and pyftpdlib, on every Mac
describe("the test configs", () => {
  it("leave the FTPS suites out of npm test", () => {
    expect(suites.sort()).toEqual(["check-server.ftps.test.mjs", "deploy-site.ftps.test.mjs"]);
    expect(read("vitest.config.ts")).toContain('exclude: [...configDefaults.exclude, "scripts/**/*.ftps.test.mjs"]');
  });

  it("run them, and only them, as test:ftps", () => {
    expect(read("vitest.ftps.config.ts")).toContain('include: ["scripts/**/*.ftps.test.mjs"]');
    const own = JSON.parse(read("package.json"));
    expect(own.scripts["test:ftps"]).toBe("vitest run --config vitest.ftps.config.ts");
    expect(own.scripts.test).toBe("vitest run");
  });
});
