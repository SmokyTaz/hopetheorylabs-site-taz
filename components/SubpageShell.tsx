import type { ReactNode } from "react";

import { Footer } from "./Footer";
import { Header } from "./Header";
import { LanguageProvider } from "./LanguageProvider";
import { StickyWhatsApp } from "./StickyWhatsApp";
import { en } from "@/content/en";

/** Frame shared by /about, /services, /pricing and /contact: skip link, header, one <main>, footer. */
export function SubpageShell({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <div className="site-shell">
        <Header />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Footer />
        <StickyWhatsApp href={en.hero.whatsappLink} label={en.hero.primaryCta} regionLabel={en.quickContact} />
      </div>
    </LanguageProvider>
  );
}
