import type { Metadata } from "next";

import { en } from "@/content/en";

export const SITE_URL = "https://hopetheorylabs.vercel.app";
export const SITE_NAME = "Hope Theory Labs";

const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Hope Theory Labs — Your data. Connected. Your business. Smarter.",
};

/*
 * Next.js merges metadata shallowly: a page that sets `openGraph` or
 * `twitter` replaces the layout's whole object. Every page therefore spreads
 * these bases so the share image, type and card survive.
 */
export const BASE_OPEN_GRAPH = {
  type: "website",
  siteName: SITE_NAME,
  locale: "en_US",
  images: [OG_IMAGE],
} as const satisfies NonNullable<Metadata["openGraph"]>;

/** Share title/description for the homepage (layout default and the / route). */
export const HOME_SHARE = {
  title: SITE_NAME,
  description: "Mobile websites with WhatsApp orders. From ৳10,000. Based in Dhaka.",
};

export const BASE_TWITTER = {
  card: "summary_large_image",
  images: [OG_IMAGE.url],
} as const satisfies NonNullable<Metadata["twitter"]>;

/**
 * Per-route metadata. Every route gets its own canonical and og:url; titles
 * and descriptions are built from the copy in content/en.ts, never invented.
 */
export function pageMetadata(path: string, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { ...BASE_OPEN_GRAPH, title: `${title} | ${SITE_NAME}`, description, url: path },
    twitter: { ...BASE_TWITTER, title: `${title} | ${SITE_NAME}`, description },
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
