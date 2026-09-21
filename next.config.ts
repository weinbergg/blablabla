import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not set outputFileTracingRoot to process.cwd() — under pm2 it can make
  // `/_next/static` resolve incorrectly and return 400 for CSS/JS while HTML
  // still renders (exactly the "design disappeared" failure mode).
  //
  // Production releases build into a staging dir first (see deploy/release.sh)
  // so the live `.next` is never wiped mid-traffic.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  experimental: {
    // Bodies of requests that pass through middleware are cloned into memory
    // and cut off at this size (default 10 MB, silently). The big upload
    // routes bypass middleware entirely (see `middleware.ts` matcher); this
    // raise is a safety net for any other form post.
    middlewareClientMaxBodySize: "64mb",
  },
};

export default nextConfig;
