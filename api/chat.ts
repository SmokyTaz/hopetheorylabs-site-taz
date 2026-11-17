/*
 * POST /api/chat — the assistant's model endpoint.
 *
 * Provider chain: Groq free tier → Google Gemini free tier → the scripted FAQ
 * matcher in `lib/assistant/kb.ts`. The last step needs no key at all, so the
 * chat keeps answering with nothing configured.
 *
 * Model IDs come from GROQ_MODEL / GEMINI_MODEL so a provider retiring a model
 * is an env change, not a deploy. Providers retire free-tier models often:
 * llama-3.1-8b-instant (Groq, Aug 2026) and gemini-2.0-flash (Jun 2026) both
 * went this way.
 *
 * Handlers never throw: provider errors fall back to FAQ/handoff.
 */
import { en } from "../content/en";
import {
  HANDOFF_REPLY,
  buildSystemPrompt,
  matchFaq,
  unknownPrice,
} from "../lib/assistant/kb";
import { clientKey, jsonResponse, logEvent, overLimit, readJson } from "../lib/assistant/server";
import { MAX_MESSAGE_CHARS, hasBangla } from "../lib/assistant/validate";

export const config = { maxDuration: 30 };

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

/** Longest reply we ever show; also the cap on assistant turns sent back to us. */
const MAX_REPLY_CHARS = 1200;
const MAX_TURNS = 12;
/** Reasoning models spend part of this on hidden thinking; the 90-word rule keeps replies short. */
const MAX_OUTPUT_TOKENS = 1024;
const PROVIDER_TIMEOUT_MS = 12000;
const WINDOW_MS = 10 * 60 * 1000;
const MESSAGE_LIMIT = 20;

interface Turn {
  role: "user" | "assistant";
  content: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitize(reply: string): string {
  return reply
    .replace(/\*\*|__|`/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\s{3,}/g, " ")
    .trim()
    .slice(0, MAX_REPLY_CHARS);
}

async function askGroq(turns: Turn[], system: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
        temperature: 0.3,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: "system", content: system }, ...turns],
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) {
      logEvent("chat.provider", { provider: "groq", status: response.status });
      return null;
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return text(data.choices?.[0]?.message?.content) || null;
  } catch (error) {
    logEvent("chat.provider", { provider: "groq", status: 0, error: String(error).slice(0, 120) });
    return null;
  }
}

async function askGemini(turns: Turn[], system: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        // Header, not ?key=: keeps the key out of URLs and request logs.
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: turns.map((turn) => ({
            role: turn.role === "assistant" ? "model" : "user",
            parts: [{ text: turn.content }],
          })),
          generationConfig: { temperature: 0.3, maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      logEvent("chat.provider", { provider: "gemini", status: response.status });
      return null;
    }
    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return text(parts.map((part) => part.text ?? "").join("")) || null;
  } catch (error) {
    logEvent("chat.provider", { provider: "gemini", status: 0, error: String(error).slice(0, 120) });
    return null;
  }
}

/** Keeps well-formed turns, caps their size, and drops leading assistant turns (the panel's greeting). */
function readTurns(messages: unknown[]): Turn[] | "too_long" {
  const turns: Turn[] = [];
  for (const item of messages.slice(-MAX_TURNS)) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = text((item as { content?: unknown }).content);
    if ((role !== "user" && role !== "assistant") || !content) continue;
    if (content.length > (role === "user" ? MAX_MESSAGE_CHARS : MAX_REPLY_CHARS)) return "too_long";
    turns.push({ role, content });
  }
  // Providers expect the conversation to open with the visitor.
  while (turns[0]?.role === "assistant") turns.shift();
  return turns;
}

export function GET(): Response {
  return jsonResponse({ ok: true, service: "chat" }, 200);
}

export async function POST(request: Request): Promise<Response> {
  let question = "";
  try {
    const body = await readJson(request);
    if (!body || !Array.isArray(body.messages)) {
      return jsonResponse({ error: "bad_request" }, 400);
    }

    const turns = readTurns(body.messages);
    if (turns === "too_long") {
      return jsonResponse({ error: "too_long", message: en.assistant.tooLong }, 400);
    }
    const last = turns[turns.length - 1];
    if (!last || last.role !== "user") {
      return jsonResponse({ error: "bad_request" }, 400);
    }
    question = last.content;

    if (await overLimit(await clientKey(request, "chat"), MESSAGE_LIMIT, WINDOW_MS)) {
      logEvent("chat.limited", { turns: turns.length });
      return jsonResponse(
        { error: "rate_limited", message: en.assistant.rateLimited, reply: en.assistant.rateLimited },
        429,
      );
    }

    const system = buildSystemPrompt();
    const lang = hasBangla(question) ? "bn" : "en";

    let reply = await askGroq(turns, system);
    let source = "groq";
    if (!reply) {
      reply = await askGemini(turns, system);
      source = "gemini";
    }
    if (!reply) {
      const fallback = matchFaq(question);
      reply = fallback.reply;
      source = `faq:${fallback.id}`;
    }

    if (unknownPrice(reply)) {
      logEvent("chat.price_guard", { source });
      reply = HANDOFF_REPLY;
      source = "guard";
    }

    const clean = sanitize(reply);
    if (!clean) {
      return jsonResponse({ reply: HANDOFF_REPLY, source: "handoff", lang }, 200);
    }

    logEvent("chat.ok", { source, lang, turns: turns.length });
    return jsonResponse({ reply: clean, source, lang }, 200);
  } catch (error) {
    // Last-resort net (e.g. Supabase or Web Crypto failing): answer from the FAQ.
    logEvent("chat.crash", { error: String(error).slice(0, 200) });
    const fallback = matchFaq(question || "help");
    return jsonResponse({ reply: fallback.reply, source: `faq:${fallback.id}` }, 200);
  }
}
