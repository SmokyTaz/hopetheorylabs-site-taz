#!/usr/bin/env node
/**
 * Serves the static export in out/ the way Vercel does for this project:
 * clean URLs (/about → about.html), the headers from vercel.json (CSP etc.),
 * gzip, 404.html for misses, and 405 for non-GET requests (no functions).
 *
 *   node scripts/serve-out.mjs [port]      default 4173
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "out");
const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml", ".json": "application/json",
};
const COMPRESSIBLE = /\.(?:js|css|html|svg|txt|xml|json)$/;

function headersFor(urlPath) {
  const out = {};
  for (const rule of config.headers) {
    const pattern = new RegExp(`^${rule.source.replace("(.*)", ".*")}$`);
    if (pattern.test(urlPath)) for (const { key, value } of rule.headers) out[key] = value;
  }
  return out;
}

function resolveFile(urlPath) {
  for (const candidate of [urlPath, `${urlPath}.html`, path.join(urlPath, "index.html")]) {
    const file = path.join(outDir, candidate);
    if (file.startsWith(outDir) && fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

export function serve(port = 4173) {
  if (!fs.existsSync(outDir)) throw new Error("out/ is missing — run `npm run build` first");
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const headers = headersFor(urlPath);
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, headers);
      res.end();
      return;
    }
    const file = resolveFile(urlPath);
    const status = file ? 200 : 404;
    const target = file ?? path.join(outDir, "404.html");
    const gzip = /\bgzip\b/.test(req.headers["accept-encoding"] ?? "") && COMPRESSIBLE.test(target);
    res.writeHead(status, {
      ...headers,
      "content-type": TYPES[path.extname(target)] ?? "application/octet-stream",
      ...(gzip ? { "content-encoding": "gzip" } : {}),
    });
    const stream = fs.createReadStream(target);
    (gzip ? stream.pipe(zlib.createGzip()) : stream).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 4173);
  await serve(port);
  console.log(`serving out/ on http://127.0.0.1:${port}`);
}
