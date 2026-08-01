import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not set outputFileTracingRoot to process.cwd() — under pm2 it can make
  // `/_next/static` resolve incorrectly and return 400 for CSS/JS while HTML
  // still renders (exactly the "design disappeared" failure mode).
  //
  // Production releases build into a staging dir first (see deploy/release.sh)
  // so the live `.next` is never wiped mid-traffic.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
