import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Shared code reaches a target only through @backend and @base; one target never imports the other.
const reaching = (...groups) => ({ "no-restricted-imports": ["error", { patterns: [{ group: groups,
  message: "Import @backend or @base; a target's own files stay in its folder." }] }] });

const config = [
  ...nextVitals,
  ...nextTypescript,
  { files: ["src/**"], ignores: ["src/targets/**"], rules: reaching("@/targets/*", "**/targets/*") },
  { files: ["src/targets/phone/**"], rules: reaching("@/targets/web/*", "**/web/*") },
  { files: ["src/targets/web/**"], rules: reaching("@/targets/phone/*", "**/phone/*") },
  { ignores: [".next/**", "out/**", "dist/**", "next-env.d.ts", "playwright-report/**", "test-results/**"] }
];

export default config;
