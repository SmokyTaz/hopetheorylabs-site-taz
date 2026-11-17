import type { Metadata, Viewport } from "next";
import { AssistantLauncher } from "@/components/assistant/AssistantLauncher";
import { en } from "@/content/en";
import { CONTACT_EMAIL, WHATSAPP_E164, whatsappLink } from "@/content/types";
import { SITE_NAME, SITE_URL } from "@/lib/metadata";
import { Instrument_Sans, Newsreader } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-newsreader",
  adjustFontFallback: true,
  preload: true,
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-instrument-sans",
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Hope Theory Labs — Mobile websites with WhatsApp orders | Dhaka",
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Fast, mobile-first websites for Dhaka businesses from ৳10,000. WhatsApp ordering, cash on delivery, fixed prices. Free concept before you pay. AI services in early access.",
  openGraph: {
    title: "Hope Theory Labs",
    description: "Mobile websites with WhatsApp orders. From ৳10,000. Based in Dhaka.",
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Hope Theory Labs — Your data. Connected. Your business. Smarter." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hope Theory Labs",
    description: "Mobile websites with WhatsApp orders. From ৳10,000. Based in Dhaka.",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#07090C",
  viewportFit: "cover",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: SITE_NAME,
  url: SITE_URL,
  image: `${SITE_URL}/og.png`,
  email: CONTACT_EMAIL,
  telephone: WHATSAPP_E164,
  areaServed: "Bangladesh",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Dhaka",
    addressCountry: "BD",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={[newsreader.variable, instrumentSans.variable].join(" ")}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }}
        />
      </head>
      <body>
        {children}
        <AssistantLauncher
          copy={en.assistant}
          whatsapp={whatsappLink}
          email={en.contact.email}
          calcomUrl={process.env.NEXT_PUBLIC_CALCOM_URL}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
