import type { Metadata } from "next";
import Link from "next/link";

import { en } from "@/content/en";
import { whatsappLink } from "@/content/types";

export const metadata: Metadata = {
  title: en.notFound.kicker,
  robots: { index: false, follow: true },
};

export default function NotFound() {
  const copy = en.notFound;
  return (
    <main id="main" className="miss">
      <p className="miss-kicker">{copy.kicker}</p>
      <h1>{copy.heading}</h1>
      <p>{copy.text}</p>
      <div className="miss-actions">
        <Link className="cta miss-cta" href="/">
          {copy.home}
        </Link>
        <a className="text-link" href={whatsappLink} target="_blank" rel="noopener noreferrer">
          {copy.whatsapp}
        </a>
      </div>
    </main>
  );
}
