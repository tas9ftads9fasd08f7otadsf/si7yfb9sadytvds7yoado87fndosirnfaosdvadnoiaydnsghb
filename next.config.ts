import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { PAGE_SEGMENTS } from "./src/lib/route";

// Where `next dev` sends what a phone answers: the stand-in, or PHONE_URL for a real one.
const PHONE = process.env.PHONE_URL ?? "http://localhost:8799";

export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
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
    output: "export",
    // The phone answers these under one prefix; the page itself stays at `/`.
    assetPrefix: "/web/app",
    images: { unoptimized: true },
    poweredByHeader: false
  };
}
