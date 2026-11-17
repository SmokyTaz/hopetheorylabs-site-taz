"use client";

import { Heading, type HeadingLevel } from "./Heading";
import { SectionMarker } from "./SectionMarker";
import { useContent } from "./LanguageProvider";

export function About({ headingLevel = 2 }: { headingLevel?: HeadingLevel }) {
  const content = useContent();
  return (
    <section id="about" className="about-section about-section-html border-b border-paper/10" aria-labelledby="about-heading">
      <SectionMarker index="008" />
      <div className="about-inner scene-copy">
        <p className="eyebrow">{content.about.eyebrow}</p>
        <Heading level={headingLevel} id="about-heading">{content.about.heading}</Heading>
        <p>{content.about.text}</p>
      </div>
    </section>
  );
}
