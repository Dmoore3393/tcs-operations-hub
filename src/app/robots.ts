import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/$", "/privacy$", "/terms$", "/support$"], disallow: "/" },
    sitemap: "https://tcs-operations-hub.vercel.app/sitemap.xml",
  };
}
