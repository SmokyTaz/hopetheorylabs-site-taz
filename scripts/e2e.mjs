#!/usr/bin/env node
/**
 * End-to-end checks against the real static export (out/), served with the
 * production headers from vercel.json. Run after `npm run build`.
 *
 * Covers every route (one H1, skip link, own canonical/title, no dead links,
 * axe WCAG 2 A/AA, no console or CSP errors, no sideways scroll), the 404,
 * the assistant's states, phone layout, no-JS, reduced motion and fallback.
 *
 * /api/* answers 405 here, as on a host without functions. The assistant
 * tests that need a server answer intercept /api/lead at the network layer.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { after, before, describe, test } from "node:test";
import { chromium, devices } from "playwright";

import { serve } from "./serve-out.mjs";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const PORT = Number(process.env.E2E_PORT ?? 4174);
const BASE = `http://127.0.0.1:${PORT}`;
const SITE = "https://hopetheorylabs.vercel.app";
const ROUTES = ["/", "/about", "/services", "/pricing", "/contact"];

let server;
let browser;

before(async () => {
  server = await serve(PORT);
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

/** Opens a page and records console errors, page errors and CSP violations. */
async function open(path, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/status of 404/.test(message.text())) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await page.addInitScript(() =>
    document.addEventListener("securitypolicyviolation", (event) =>
      console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`),
    ),
  );
  const response = await page.goto(BASE + path, { waitUntil: "networkidle" });
  return { context, page, response, problems };
}

async function axeViolations(page) {
  // Let reveal fades finish: mid-transition text is part-transparent and axe would
  // measure contrast for a frame no visitor reads. Checks the settled page only.
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))));
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "best-practice"] });
    return result.violations.map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  });
}

describe("every route", () => {
  const homeIds = new Set();
  const titles = new Map();

  before(async () => {
    const { context, page } = await open("/");
    for (const id of await page.evaluate(() => [...document.querySelectorAll("[id]")].map((el) => el.id))) homeIds.add(id);
    await context.close();
  });

  for (const route of ROUTES) {
    test(`${route}: structure, metadata, links, a11y, console`, async () => {
      const { context, page, response, problems } = await open(route);
      try {
        assert.equal(response.status(), 200);
        const info = await page.evaluate(() => ({
          title: document.title,
          canonical: document.querySelector("link[rel=canonical]")?.getAttribute("href"),
          ogUrl: document.querySelector("meta[property='og:url']")?.getAttribute("content"),
          share: Object.fromEntries(
            ["og:image", "og:type", "og:site_name", "og:title", "twitter:card", "twitter:image"].map((key) => [
              key,
              document.querySelector(`meta[property='${key}'], meta[name='${key}']`)?.getAttribute("content") ?? null,
            ]),
          ),
          h1: document.querySelectorAll("h1").length,
          h1Size: parseFloat(getComputedStyle(document.querySelector("h1") ?? document.body).fontSize),
          firstFocusable: document.querySelector("a[href], button")?.className,
          links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")),
          ids: [...document.querySelectorAll("[id]")].map((el) => el.id),
        }));
        assert.equal(info.h1, 1, "exactly one H1");
        assert.ok(info.h1Size >= 32, `H1 is styled as a display heading (${info.h1Size}px)`);
        assert.equal(info.firstFocusable, "skip-link", "skip link is the first focusable element");
        const expected = route === "/" ? SITE : `${SITE}${route}`;
        assert.equal(info.canonical, expected, "canonical points at this route");
        assert.equal(info.ogUrl, expected, "og:url points at this route");
        // Page-level openGraph/twitter replace the layout's, so check the whole share card survives.
        assert.deepEqual(
          { ...info.share, "og:title": Boolean(info.share["og:title"]) },
          {
            "og:image": `${SITE}/og.png`,
            "og:type": "website",
            "og:site_name": "Hope Theory Labs",
            "og:title": true,
            "twitter:card": "summary_large_image",
            "twitter:image": `${SITE}/og.png`,
          },
          "complete share card",
        );
        titles.set(route, info.title);

        const ids = new Set(info.ids);
        const dead = info.links.filter((href) => {
          if (href.startsWith("#") && href.length > 1) return !ids.has(href.slice(1));
          if (href.startsWith("/#")) return !homeIds.has(href.slice(2));
          return false;
        });
        assert.deepEqual(dead, [], "every fragment link has a target");

        for (const href of new Set(info.links.filter((h) => h.startsWith("/") && !h.startsWith("//")))) {
          const status = (await page.request.get(BASE + href.split("#")[0])).status();
          assert.equal(status, 200, `internal link ${href}`);
        }

        assert.deepEqual(await axeViolations(page), [], "axe WCAG 2 A/AA + best practice");

        for (const width of [360, 768, 1280, 1920]) {
          await page.setViewportSize({ width, height: 800 });
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          assert.ok(overflow <= 0, `no horizontal scroll at ${width}px (overflow ${overflow}px)`);
        }
        assert.deepEqual(problems, [], "no console errors or CSP violations");
      } finally {
        await context.close();
      }
    });
  }

  test("titles are unique per route", () => {
    assert.equal(new Set(titles.values()).size, ROUTES.length, JSON.stringify([...titles]));
  });
});

test("404: status, noindex, no canonical, styled, links home", async () => {
  const { context, page, response } = await open("/does-not-exist");
  try {
    assert.equal(response.status(), 404);
    const info = await page.evaluate(() => ({
      robots: document.querySelector("meta[name=robots]")?.getAttribute("content") ?? "",
      canonical: document.querySelector("link[rel=canonical]"),
      h1: document.querySelectorAll("h1").length,
      ctaHeight: document.querySelector(".miss-cta")?.getBoundingClientRect().height,
    }));
    assert.match(info.robots, /noindex/);
    assert.equal(info.canonical, null);
    assert.equal(info.h1, 1);
    assert.ok(info.ctaHeight >= 44, "home button is a styled 44px target");
    assert.deepEqual(await axeViolations(page), []);
  } finally {
    await context.close();
  }
});

test("sitemap lists every route", async () => {
  const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
  for (const route of ROUTES) assert.ok(xml.includes(`<loc>${SITE}${route === "/" ? "/" : route}</loc>`), route);
});

describe("assistant states", () => {
  let context;
  let page;

  before(async () => {
    ({ context, page } = await open("/"));
    // Simulate a deployed /api/lead that accepted the enquiry (email or Supabase).
    await page.route("**/api/lead", (route) =>
      route.fulfill({ json: { ok: true, saved: false, notified: true, delivered: true, whatsapp: "https://wa.me/8801718463471" } }),
    );
  });
  after(() => context.close());

  // `.asst-typing` is the "···" indicator, not a message.
  const MESSAGE = ".asst-m:not(.asst-typing)";
  const messages = () => page.locator(MESSAGE).count();

  test("opening focuses the input and makes the page behind inert", async () => {
    await page.click(".asst-b");
    await page.waitForSelector(".asst-p");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "asst-input");
    assert.equal(await page.evaluate(() => document.querySelector(".site-shell")?.inert), true);
  });

  test("a question gets an FAQ answer when /api/chat is unavailable", async () => {
    await page.fill("#asst-input", "how much is a website?");
    await page.press("#asst-input", "Enter");
    await page.waitForFunction(
      (selector) => document.querySelectorAll(selector).length >= 3 && !document.querySelector(".asst-typing"),
      MESSAGE,
    );
    assert.match(await page.locator(MESSAGE).last().innerText(), /৳10,000/);
  });

  test("Escape closes, returns focus to the launcher, and un-inerts the page", async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.activeElement?.classList.contains("asst-b"));
    assert.equal(await page.evaluate(() => document.querySelector(".site-shell")?.inert), false);
  });

  test("reopening keeps the conversation", async () => {
    await page.click(".asst-b");
    await page.waitForSelector(".asst-p");
    assert.equal(await messages(), 3);
  });

  test("the enquiry is still reachable after chatting", async () => {
    await page.click(".asst-links button");
    await page.waitForSelector("#asst-field");
  });

  test("an invalid contact gets a specific message, a valid one moves on", async () => {
    await page.fill("#asst-field", "Rahim");
    await page.press("#asst-field", "Enter");
    await page.fill("#asst-field", "not-a-contact");
    await page.press("#asst-field", "Enter");
    assert.match(await page.locator(".asst-n[role=alert]").innerText(), /phone number or email/);
    await page.fill("#asst-field", "01712345678");
    await page.press("#asst-field", "Enter");
    await page.fill("#asst-field", "A shop site");
    await page.press("#asst-field", "Enter");
    await page.waitForSelector(".asst-sum");
    assert.match(await page.locator(".asst-sum").innerText(), /Rahim[\s\S]*01712345678[\s\S]*A shop site/);
  });

  test("Edit reopens the steps with the saved answers filled in", async () => {
    await page.click("text=Edit");
    assert.equal(await page.inputValue("#asst-field"), "Rahim");
    for (let i = 0; i < 3; i++) await page.press("#asst-field", "Enter");
    await page.waitForSelector(".asst-sum");
  });

  test("saving shows success and disables Save (no duplicate enquiries)", async () => {
    await page.click("text=Save my enquiry");
    await page.waitForSelector(".asst-ok");
    assert.equal(await page.locator("text=Save my enquiry").isDisabled(), true);
  });

  test("Back to chat returns to the conversation", async () => {
    await page.click("text=Back to chat");
    await page.waitForSelector("#asst-input");
    assert.equal(await messages(), 3);
  });
});

test("assistant: a failed save says so and leaves Save enabled to retry", async () => {
  const { context, page } = await open("/");
  try {
    await page.click(".asst-b");
    await page.locator(".asst-chips button").last().click();
    for (const value of ["Rahim", "rahim@example.com", "A site"]) {
      await page.fill("#asst-field", value);
      await page.press("#asst-field", "Enter");
    }
    await page.click("text=Save my enquiry");
    await page.waitForSelector(".asst-n[role=status]");
    assert.match(await page.locator(".asst-n[role=status]").innerText(), /WhatsApp instead/);
    assert.equal(await page.locator("text=Save my enquiry").isEnabled(), true);
  } finally {
    await context.close();
  }
});

test("phone: fallback scene, floating buttons don't overlap, 44px targets", async () => {
  const { context, page } = await open("/", { ...devices["Pixel 5"] });
  try {
    assert.equal(await page.evaluate(() => document.documentElement.dataset.experience), "fallback");
    const boxes = await page.evaluate(() =>
      [".asst-b", ".floating-whatsapp"].map((s) => document.querySelector(s).getBoundingClientRect().toJSON()),
    );
    const [a, b] = boxes;
    const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    assert.equal(overlap, false);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll(".site-header a, .site-header summary, .site-footer a, main a.cta, main button, .floating-whatsapp, .asst-b")]
        .filter((el) => el.getClientRects().length && el.getBoundingClientRect().height < 44)
        .map((el) => `${el.className || el.tagName} ${Math.round(el.getBoundingClientRect().height)}px`),
    );
    assert.deepEqual(small, []);
  } finally {
    await context.close();
  }
});

test("no JavaScript: content visible and the contact form posts to WhatsApp", async () => {
  const { context, page } = await open("/", { javaScriptEnabled: false });
  try {
    assert.equal(await page.locator("h1").isVisible(), true);
    assert.equal(await page.locator("#pricing").isVisible(), true);
    const form = await page.evaluate(() => {
      const el = document.querySelector(".contact-form");
      return { action: el?.getAttribute("action"), field: el?.querySelector("textarea")?.name };
    });
    assert.deepEqual(form, { action: "https://wa.me/8801718463471", field: "text" });
  } finally {
    await context.close();
  }
});

test("reduced motion: WebGL renders on demand only, no cursor ring", async () => {
  const { context, page } = await open("/?experience=high", { reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  try {
    await page.mouse.move(300, 300);
    await page.waitForFunction(() => window.__htlExperience?.frames > 0, null, { timeout: 15000 });
    const first = await page.evaluate(() => window.__htlExperience.frames);
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => window.__htlExperience.frames), first, "no continuous loop");
    assert.equal(await page.locator(".cursor-ring").count(), 0);
  } finally {
    await context.close();
  }
});

test("?experience=fallback shows the static core and never loads WebGL", async () => {
  const { context, page } = await open("/?experience=fallback", { viewport: { width: 1440, height: 900 } });
  try {
    assert.equal(await page.evaluate(() => document.documentElement.dataset.experience), "fallback");
    assert.equal(await page.locator(".hero-visual-static").isVisible(), true);
    assert.equal(await page.evaluate(() => window.__htlExperience), undefined);
  } finally {
    await context.close();
  }
});
