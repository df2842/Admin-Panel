import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every admin page reads the signed-in user's cookies, so pages render per
  // request; cacheComponents/partial prefetching are left off on purpose.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
