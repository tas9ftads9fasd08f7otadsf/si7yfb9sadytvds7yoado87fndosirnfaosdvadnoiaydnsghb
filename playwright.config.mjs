import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT || 8799);
// Against a real phone: BASE_URL=http://192.168.1.20:8765/ runs the specs that need no `/__test` side.
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}/`;

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: process.env.BASE_URL ? undefined : {
    command: "node e2e/mock-phone.mjs",
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/__test/guests`,
    reuseExistingServer: false
  }
});
