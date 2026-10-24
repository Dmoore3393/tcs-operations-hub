import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/privacy", "/terms", "/support"].map((path) => ({
    url: `https://tcs-operations-hub.vercel.app${path === "/" ? "" : path}`,
  }));
}
