"use client";

import Link from "next/link";

import { useContent } from "./LanguageProvider";
import { LanguageToggle } from "./LanguageToggle";
import { WhatsAppCta } from "./WhatsAppCta";

const CONTACT_HREF = "/contact";

export function Header() {
  const content = useContent();
  const { nav } = content.header;
  const contact = nav.find((item) => item.href === CONTACT_HREF);
  return <>
    <a href="#main" className="skip-link">{content.header.skip}</a>
    <header className="site-header">
      <Link href="/" className="site-wordmark" aria-label={`${content.header.wordmark} — home`}>{content.header.wordmark}</Link>
      <nav className="desktop-nav" aria-label="Primary">
        {nav.filter((item) => item.href !== CONTACT_HREF).map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
        <LanguageToggle />
        {contact && <a href={contact.href} className="nav-contact">{contact.label}</a>}
      </nav>
      <details className="mobile-menu">
        <summary aria-label={content.header.menu}><span></span><span></span></summary>
        <nav aria-label="Mobile primary">{nav.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}<LanguageToggle /><WhatsAppCta href={content.hero.whatsappLink}>{content.header.whatsapp}</WhatsAppCta></nav>
      </details>
    </header>
  </>;
}
