import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not set outputFileTracingRoot to process.cwd() — under pm2 it can make
  // `/_next/static` resolve incorrectly and return 400 for CSS/JS while HTML
  // still renders (exactly the "design disappeared" failure mode).
};

export default nextConfig;
