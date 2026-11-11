import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT || 8799);
// Against a real phone: BASE_URL=http://192.168.1.20:8765/ runs the specs that need no `/__test` side.
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}/`;
const SITE = process.env.RIKI_TARGET === "web";
const DESKTOP = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] }
  },
  // One project per target (web-icloud.md §8): the phone's build, or the site's zip at the root and under a path.
  projects: SITE ? [
    { name: "web", testMatch: /site\.spec\.mjs/, use: { ...DESKTOP, baseURL: "http://127.0.0.1:8801/" } },
    { name: "web-under-path", testMatch: /site\.spec\.mjs/,
      use: { ...DESKTOP, baseURL: "http://127.0.0.1:8802/editor/" } }
  ] : [{ name: "phone", testIgnore: /site\.spec\.mjs/, use: DESKTOP }],
  webServer: process.env.BASE_URL ? undefined : SITE ? [
    { command: "node e2e/site.mjs 8801", url: "http://127.0.0.1:8801/", reuseExistingServer: false },
    { command: "node e2e/site.mjs 8802 editor", url: "http://127.0.0.1:8802/editor/", reuseExistingServer: false }
  ] : {
    command: "node e2e/mock-phone.mjs",
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/__test/guests`,
    reuseExistingServer: false
  }
});
