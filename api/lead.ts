/*
 * POST /api/lead — saves an enquiry and notifies Fahad.
 *
 * Supabase and Resend are optional. `delivered` is true when at least one of
 * them took the enquiry. On any failure the response still includes a
 * prefilled WhatsApp link so the visitor can finish by hand.
 */
import { en } from "../content/en";
import { WHATSAPP } from "../lib/assistant/kb";
import {
  clientKey,
  emailLead,
  jsonResponse,
  logEvent,
  overLimit,
  readJson,
  saveLead,
} from "../lib/assistant/server";
import {
  MAX_CONTACT_CHARS,
  MAX_NAME_CHARS,
  MAX_NEED_CHARS,
  isContact,
} from "../lib/assistant/validate";

export const config = { maxDuration: 20 };

const WINDOW_MS = 10 * 60 * 1000;
const LEAD_LIMIT = 5;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function whatsappPrefill(name: string, contact: string, need: string): string {
  const message = `Hi Hope Theory Labs, I'm ${name}. ${need} Contact: ${contact}`;
  return `${WHATSAPP}?text=${encodeURIComponent(message)}`;
}

export function GET(): Response {
  return jsonResponse({ ok: true, service: "lead" }, 200);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJson(request);
    if (!body) return jsonResponse({ error: "bad_request" }, 400);

    if (text(body.website).length > 0) {
      logEvent("lead.honeypot", {});
      return jsonResponse({ ok: true, saved: false, notified: false, delivered: true }, 200);
    }

    const name = text(body.name).slice(0, MAX_NAME_CHARS);
    const contact = text(body.contact).slice(0, MAX_CONTACT_CHARS);
    const need = text(body.need).slice(0, MAX_NEED_CHARS);
    const packageName = text(body.package).slice(0, 60);
    const lang = body.lang === "bn" ? "bn" : "en";

    if (!name || !contact || !need) {
      return jsonResponse({ error: "missing_fields", message: en.assistant.enquiry.required }, 400);
    }
    if (!isContact(contact)) {
      return jsonResponse({ error: "bad_contact", message: en.assistant.enquiry.invalidContact }, 400);
    }

    const whatsapp = whatsappPrefill(name, contact, need);

    if (await overLimit(await clientKey(request, "lead"), LEAD_LIMIT, WINDOW_MS)) {
      logEvent("lead.limited", {});
      return jsonResponse(
        { ok: false, error: "rate_limited", saved: false, notified: false, delivered: false, whatsapp },
        429,
      );
    }

    const lead = { name, contact, need, packageName: packageName || undefined, lang };
    const [saved, notified] = await Promise.all([saveLead(lead), emailLead(lead)]);
    const delivered = saved || notified;

    logEvent("lead.ok", { saved, notified, lang });
    return jsonResponse({ ok: true, saved, notified, delivered, whatsapp }, 200);
  } catch (error) {
    logEvent("lead.crash", { error: String(error).slice(0, 200) });
    return jsonResponse(
      { ok: false, error: "server_error", saved: false, notified: false, delivered: false, whatsapp: WHATSAPP },
      200,
    );
  }
}
