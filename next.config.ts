import path from "node:path";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { PAGE_SEGMENTS } from "./src/lib/segments";

// The phone's page or the site; the other target is never imported, so never bundled.
const TARGET = process.env.RIKI_TARGET === "web" ? "web" : "phone";
const ALIASES = {
  "@backend": `./src/targets/${TARGET}/backend.ts`,
  "@base": `./src/targets/${TARGET}/base.ts`
};

// Where `next dev` sends what a phone answers: the stand-in, or PHONE_URL for a real one.
const PHONE = process.env.PHONE_URL ?? "http://localhost:8799";

const shared: NextConfig = {
  turbopack: { resolveAlias: ALIASES },
  webpack(config: { resolve: { alias: Record<string, string> } }) {
    for (const [name, file] of Object.entries(ALIASES)) config.resolve.alias[name] = path.resolve(file);
    return config;
  }
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    if (TARGET === "web") return shared;
    return {
      ...shared,
      async rewrites() {
        return {
          // The export builds one page; the phone answers every screen's path with it, and so does this.
          beforeFiles: [{ source: `/:screen(${PAGE_SEGMENTS.join("|")})/:rest*`, destination: "/" }],
          afterFiles: [
            { source: "/riki/:path*", destination: `${PHONE}/riki/:path*` },
            { source: "/web/:path*", destination: `${PHONE}/web/:path*` }
          ],
          fallback: []
        };
      }
    };
  }
  return {
    ...shared,
    output: "export",
    // The phone answers these under one prefix; the site's index.php fills in the path it is served under.
    assetPrefix: TARGET === "web" ? "/__riki_base__" : "/web/app",
    images: { unoptimized: true },
    poweredByHeader: false
  };
}
