import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // The store and screens are tested once, against the phone target.
  resolve: { alias: {
    "@backend": fileURLToPath(new URL("./src/targets/phone/backend.ts", import.meta.url)),
    "@base": fileURLToPath(new URL("./src/targets/phone/base.ts", import.meta.url)),
    "@": fileURLToPath(new URL("./src", import.meta.url))
  } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    setupFiles: ["src/test-setup.ts"],
    restoreMocks: true
  }
});
