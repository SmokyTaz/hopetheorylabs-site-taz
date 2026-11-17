"use client";

import type { FormEvent } from "react";

import { whatsappLink, whatsappWith } from "@/content/types";

import { Heading, type HeadingLevel } from "./Heading";
import { SectionMarker } from "./SectionMarker";
import { useContent } from "./LanguageProvider";

/*
  Without JavaScript the form submits as a GET to wa.me, which reads `text`
  (the need). With JavaScript the name is folded into the message first.
*/
export function Contact({ headingLevel = 2 }: { headingLevel?: HeadingLevel }) {
  const content = useContent();
  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const need = String(form.get("text") ?? "").trim();
    const message = "Hi Hope Theory Labs, I’m " + (name || "a visitor") + ". " + need;
    window.open(whatsappWith(message), "_blank", "noopener,noreferrer");
  }
  return (
    <section id="contact" className="contact-section border-b border-paper/10" aria-labelledby="contact-heading">
      <SectionMarker index="009" />
      <div className="contact-grid contact-grid-html">
        <div className="contact-intro scene-copy">
          <p className="eyebrow">{content.contact.eyebrow}</p>
          <Heading level={headingLevel} id="contact-heading">{content.contact.heading}</Heading>
          <p>{content.contact.note}</p>
          <form className="contact-form" action={whatsappLink} method="get" target="_blank" onSubmit={sendMessage}>
            <label>
              {content.contact.nameLabel}
              <input name="name" autoComplete="name" />
            </label>
            <label>
              {content.contact.needLabel}
              <textarea name="text" rows={3} required />
            </label>
            <button className="primary-cta" type="submit">
              {content.contact.submit}
            </button>
          </form>
          <div className="contact-links">
            <a className="primary-cta" href={content.contact.phoneHref} target="_blank" rel="noopener noreferrer">
              {content.contact.whatsappCta}
            </a>
            <a className="text-link" href={"mailto:" + content.contact.email}>
              {content.contact.email}
            </a>
          </div>
          <p className="contact-phone">{content.contact.phone}</p>
        </div>
      </div>
      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          {[...content.footer.ticker, ...content.footer.ticker].map((item, i) => (
            <span key={item + "-" + i}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
