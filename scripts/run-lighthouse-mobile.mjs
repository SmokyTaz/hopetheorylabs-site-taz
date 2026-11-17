#!/usr/bin/env node
/**
 * Mobile Lighthouse against the built site, served with production headers
 * and gzip (scripts/serve-out.mjs). Run after `npm run build`.
 *
 *   node scripts/run-lighthouse-mobile.mjs [route ...]     default: every page
 *
 * Uses the Chromium that Playwright installs; Lighthouse is fetched with npx.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

import { serve } from "./serve-out.mjs";

const PORT = 4176;
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/about", "/services", "/pricing", "/contact"];
const dir = mkdtempSync(join(tmpdir(), "htl-lh-"));
const server = await serve(PORT);

function lighthouse(url, out) {
  const args = [
    "--yes", "lighthouse@12.6.1", url,
    "--only-categories=performance,accessibility,best-practices,seo",
    "--form-factor=mobile", "--screenEmulation.mobile=true",
    "--chrome-flags=--headless=new --no-sandbox",
    `--output-path=${out}`, "--output=json", "--quiet",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn("npx", args, { stdio: "inherit", env: { ...process.env, CHROME_PATH: chromium.executablePath() } });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`lighthouse exit ${code}`))));
  });
}

const rows = [];
try {
  for (const route of routes) {
    const out = join(dir, `${route.replace(/\W/g, "_") || "home"}.json`);
    await lighthouse(`http://127.0.0.1:${PORT}${route}`, out);
    const report = JSON.parse(readFileSync(out, "utf8"));
    const score = (key) => Math.round(report.categories[key].score * 100);
    rows.push({
      route,
      performance: score("performance"),
      accessibility: score("accessibility"),
      bestPractices: score("best-practices"),
      seo: score("seo"),
      lcp: report.audits["largest-contentful-paint"].displayValue,
      cls: report.audits["cumulative-layout-shift"].displayValue,
      tbt: report.audits["total-blocking-time"].displayValue,
    });
  }
} finally {
  server.close();
}
console.table(rows);
