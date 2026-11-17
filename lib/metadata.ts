import type { Metadata } from "next";

import { en } from "@/content/en";

export const SITE_URL = "https://hopetheorylabs.vercel.app";
export const SITE_NAME = "Hope Theory Labs";

/**
 * Per-route metadata. Every route gets its own canonical and og:url; titles
 * and descriptions are built from the copy in content/en.ts, never invented.
 */
export function pageMetadata(path: string, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description, url: path },
    twitter: { title: `${title} | ${SITE_NAME}`, description },
  };
}

export const ROUTES = {
  about: pageMetadata("/about", en.about.eyebrow, `${en.about.heading} ${en.about.text}`),
  services: pageMetadata("/services", en.services.eyebrow, `${en.services.heading} ${en.services.intro}`),
  pricing: pageMetadata(
    "/pricing",
    en.pricing.eyebrow,
    `${en.pricing.heading} ${en.pricing.tiers.map((tier) => `${tier.name} ${tier.price}`).join(", ")}. ${en.pricing.intro}`,
  ),
  contact: pageMetadata("/contact", en.contact.eyebrow, `${en.contact.heading} ${en.contact.note}`),
} satisfies Record<string, Metadata>;
