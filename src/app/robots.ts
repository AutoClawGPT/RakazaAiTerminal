import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    // Phase 1: nothing is public yet. Phase 2 opens the public pages and keeps the owner paths blocked.
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
