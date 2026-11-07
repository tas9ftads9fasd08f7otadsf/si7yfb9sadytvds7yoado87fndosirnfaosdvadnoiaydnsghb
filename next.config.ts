import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Where `next dev` sends what a phone answers: the stand-in, or PHONE_URL for a real one.
const PHONE = process.env.PHONE_URL ?? "http://localhost:8799";

export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      async rewrites() {
        return [
          { source: "/riki/:path*", destination: `${PHONE}/riki/:path*` },
          { source: "/web/:path*", destination: `${PHONE}/web/:path*` }
        ];
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
