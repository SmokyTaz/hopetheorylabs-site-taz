# Hope Theory Labs — Canonical Website Specification

**Design source:** Fahad's supplied standalone HTML concept (25 October 2026). This document supersedes older layout notes where they conflict. The live stack is **Next.js components + R3F**, not the locked inline HTML page on `main` (that path is superseded by this PR's architecture).

## Goal

One responsive, accessible marketing site. Do not iframe the source HTML. Copy, sections and the WebGL behaviour match the reference page.

## Stack and implementation constraints

- Next.js App Router, TypeScript, Tailwind CSS v4, static export, Vercel. DOM motion is CSS (no animation library).
- Copy in `content/en.ts` / `content/bn.ts` (Bangla TODO).
- Fonts via `next/font/google`: Instrument Sans, Newsreader, Hind Siliguri (mono labels use the system monospace stack).
- No analytics, cookies, tracking, fake metrics or testimonials.
- **WebGL:** npm `three` + `@react-three/fiber`, shaders ported from the complete inline script in the supplied HTML (particle morph, fresnel core, rings, flow edges/dots, burst, drag-rotate, stars). No CDN scripts.
- One fixed canvas (`components/experience/`). Scroll → damped `pp` → morph and HUD. Copy in single column; scene group offset matches HTML (`gx0` / mobile `gy0`). No scroll hijacking.
- Progressive enhancement: SVG `IntelligenceCore` + `LabsBackground` when WebGL unavailable (`detectWebGL`, shader error, context loss, `?experience=fallback`).
- Reduced motion: visitors get the static SVG core by default (the WebGL chunk is never fetched). When WebGL is forced (`?experience=high`), `frameloop="demand"` and burst/drag/intro/cursor are disabled or static.
- Quality tiers: 12000 / 4000 / 2500 particles (high / mid / low; lowered from the HTML's 18000 / 9000 / 6000 to hold the mobile Lighthouse 90+ gate); `?experience=low|mid|high` for QA.
- Security headers via `vercel.json` (from main): CSP, HSTS, etc.

## Visual system

- Palette and typography as in `docs/BRAND.md`.
- Hero headline unchanged: “Your data. Connected. / Your business. Smarter.”
- Eight flow sources: **Productivity, CRM, Databases, Files, Apps, APIs, Systems, People** with captions in `hero.coreNodeDetails` (kinds of data, not client integrations).
- Intro overlay (brand + line), grain + vignette, custom cursor (mouse only), magnetic hero CTA, header blur on scroll.
- HUD states: **Scattered → Structured → Alive** (not the old per-section IO labels in WebGL mode).

## Page sequence

Home (`/`): header, hero, Stage I/II, living flow (centred heading + three pills), how it works (four steps + live description), services, pricing, work (Rollers Republic **Concept**), about, contact + ticker, footer, floating WhatsApp.

Standalone routes `/about`, `/services`, `/pricing` and `/contact` reuse the same section components with that section's heading as the page H1, plus their own title, description and canonical (`lib/metadata.ts`). Nav links that target home sections are written `/#method`, `/#work` so they work from every route.

## Functional behaviour

- Native anchor navigation; smooth scroll when motion allowed.
- How-it-works: step buttons update copy and trigger a centre **burst** in the scene (when motion allowed).
- Flow section: eight `.flow-node` labels (focusable when flow active) show captions; monogram **H** at core.
- Contact form → prefilled WhatsApp URL only (also works without JavaScript: the form GETs `wa.me` with `text`).
- Site assistant (see `docs/ASSISTANT.md`) may store an enquiry the visitor explicitly saves (Supabase) and email it to the studio (Resend). Both optional, free tier.
- Floating WhatsApp hidden when Contact is in view.

## Accessibility

- Flow labels: `tabIndex` 0 only when `uF > 0.6`; captions `aria-live="polite"`.
- Decorative: canvas layer, intro, cursor, HUD (`aria-hidden`).
- Skip link, focus rings, 44px targets.

## Release gates

`npm run lint`, `typecheck`, `test`, `build`, `test:e2e` (all in CI); preview QA including mobile Lighthouse, keyboard, reduced motion, fallback; merge only after review. Production promotion remains Fahad's call.
