import type { MetadataRoute } from "next";

import { ROUTES, SITE_URL } from "@/lib/metadata";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    ...Object.keys(ROUTES).map((route) => ({
      url: `${SITE_URL}/${route}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
