import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/fplsolver", // GitHub Pages serves the repo at /fplsolver
  images: { unoptimized: true },
  // ponytail: dev-only proxy so `next dev` dodges FPL's missing CORS headers.
  // Dropped by `output: export` (Next warns about this — expected); the
  // deployed build uses NEXT_PUBLIC_FPL_PROXY instead. See lib/api/fpl.ts.
  async rewrites() {
    return [
      {
        source: "/fpl/:path*",
        destination: "https://fantasy.premierleague.com/api/:path*",
      },
    ];
  },
};

export default nextConfig;
