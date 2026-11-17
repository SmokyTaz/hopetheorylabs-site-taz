/*
 * Server helpers for the two Vercel Functions in `api/`.
 *
 * No SDKs and no node: built-ins — Supabase/Resend via fetch and hashing via
 * Web Crypto, so the functions bootstrap on both Node and Edge-style runtimes.
 */
import { en } from "../../content/en";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const data: unknown = await request.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Salted SHA-256 of the client IP, so the rate-limit table never holds an
 * address. Vercel sets `x-forwarded-for` itself (it overwrites any value the
 * client sends), so the first entry is the real client IP there.
 */
export async function clientKey(request: Request, scope: "chat" | "lead"): Promise<string> {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const salt = process.env.RATE_LIMIT_SALT || "hope-theory-labs";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${scope}:${hex.slice(0, 32)}`;
}

const LOCAL = new Map<string, number[]>();

function recordLocal(key: string, windowMs: number): number {
  const now = Date.now();
  const hits = (LOCAL.get(key) ?? []).filter((at) => now - at < windowMs);
  hits.push(now);
  LOCAL.set(key, hits);
  if (LOCAL.size > 5000) {
    for (const [other, times] of LOCAL) {
      const last = times[times.length - 1];
      if (!last || now - last >= windowMs) LOCAL.delete(other);
    }
  }
  return hits.length;
}

function supabase(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

function supabaseHeaders(key: string): Record<string, string> {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
}

async function countRows(table: string, filter: string): Promise<number | null> {
  const client = supabase();
  if (!client) return null;
  try {
    const response = await fetch(`${client.url}/rest/v1/${table}?${filter}&select=id`, {
      headers: { ...supabaseHeaders(client.key), prefer: "count=exact", range: "0-0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const range = response.headers.get("content-range") ?? "";
    const total = Number(range.split("/")[1]);
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

async function insertRow(table: string, row: Record<string, unknown>): Promise<boolean> {
  const client = supabase();
  if (!client) return false;
  try {
    const response = await fetch(`${client.url}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...supabaseHeaders(client.key), prefer: "return=minimal" },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(6000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Deletes rate-limit rows older than a day (migration `prune_rate_limit_hits`). */
async function pruneRateLimitHits(): Promise<void> {
  const client = supabase();
  if (!client) return;
  try {
    await fetch(`${client.url}/rest/v1/rpc/prune_rate_limit_hits`, {
      method: "POST",
      headers: supabaseHeaders(client.key),
      body: "{}",
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    // Pruning is housekeeping; the next sampled request retries.
  }
}

/** One request in this many also prunes old rate-limit rows, so the table stays bounded. */
const PRUNE_EVERY = 50;

/** Soft distributed limit: local bucket first; when Supabase is set, record then count. */
export async function overLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (recordLocal(key, windowMs) > limit) return true;
  if (!supabase()) return false;
  await insertRow("rate_limit_hits", { key });
  if (Math.random() < 1 / PRUNE_EVERY) void pruneRateLimitHits();
  const since = new Date(Date.now() - windowMs).toISOString();
  const shared = await countRows("rate_limit_hits", `key=eq.${encodeURIComponent(key)}&created_at=gte.${since}`);
  return shared !== null && shared > limit;
}

export interface Lead {
  name: string;
  contact: string;
  need: string;
  packageName?: string;
  lang?: string;
}

export function saveLead(lead: Lead): Promise<boolean> {
  return insertRow("leads", {
    name: lead.name,
    contact: lead.contact,
    need: lead.need,
    package: lead.packageName ?? null,
    lang: lead.lang ?? "en",
  });
}

/** Strip CR/LF so visitor text can't add lines to the email subject. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

export async function emailLead(lead: Lead): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEAD_NOTIFY_EMAIL || en.contact.email;
  if (!apiKey || !to) return false;
  const lines = [
    `Name: ${lead.name}`,
    `Contact: ${lead.contact}`,
    `Needs: ${lead.need}`,
  ];
  if (lead.packageName) lines.push(`Interested in: ${lead.packageName}`);
  if (lead.lang) lines.push(`Language: ${lead.lang}`);
  lines.push("", "Sent from the website assistant.");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: [to],
        subject: `New website enquiry — ${oneLine(lead.name)}`,
        text: lines.join("\n"),
      }),
      signal: AbortSignal.timeout(8000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function logEvent(event: string, fields: Record<string, string | number | boolean | null>): void {
  console.log(JSON.stringify({ event, ...fields }));
}
