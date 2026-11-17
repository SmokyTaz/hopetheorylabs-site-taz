import type { Metadata } from "next";

import { PageShell } from "@/components/PageShell";
import { BASE_OPEN_GRAPH, HOME_SHARE } from "@/lib/metadata";

/* Spreads the base: a page-level openGraph replaces the layout's (see lib/metadata.ts). */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    ...BASE_OPEN_GRAPH,
    ...HOME_SHARE,
    url: "/",
  },
};

/*
  Server entry: statically exported. All rendering lives in <PageShell>
  (client) so the language toggle can re-render every string (issue #3).
*/
export default function Home() {
  return <PageShell />;
}
