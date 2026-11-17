# Site assistant

Floating assistant on every page. Answers only from approved site copy, helps choose website vs founding offer, captures enquiries to WhatsApp / email / Supabase.

Free tiers only. With no keys configured the assistant still answers via scripted FAQ shipped in the page.

## Code map

| Path | Role |
| --- | --- |
| `components/assistant/AssistantLauncher.tsx` | Gold bubble; only first-load JS for the feature |
| `components/assistant/AssistantPanel.tsx` | Panel chunk (lazy) |
| `components/assistant/assistant.css` | Bubble + panel styles (site tokens) |
| `lib/assistant/kb.ts` | Facts from `content/en.ts`, FAQ matcher, price guard |
| `lib/assistant/server.ts` | Rate limit, Supabase, Resend via `fetch` |
| `api/chat.ts` | Groq → Gemini → FAQ |
| `api/lead.ts` | Save enquiry + email |
| `supabase/migrations/20261030_assistant_leads.sql` | `leads` + `rate_limit_hits` |

## Behaviour

- Prices only from `pricing.tiers` / founding / payment in `content/en.ts`
- Unknown prices replaced with the WhatsApp handoff — any form: `৳12,000`, `Tk. 12,000`, `12k taka`, and Bangla digits (`৳১২,০০০`, `১২০০০ টাকা`)
- Bangla script → model lang + lead `lang: "bn"`
- Contact step validates email or phone (shared rules in `lib/assistant/validate.ts`) and says what's wrong
- Rate limit: 20 chats and, separately, 5 enquiries per 10 minutes per hashed IP (salted SHA-256; soft shared counter when Supabase is set; old rows pruned on ~1 in 50 requests)
- Requests open with the visitor's turn: the panel greeting and status notices are never sent to the model
- Panel states: the conversation and any half-finished enquiry survive closing and reopening (for the page visit, not stored); the enquiry is reachable at any time; the summary can be edited; Save disables after the enquiry is delivered; the page behind the open panel is `inert`
- `/api/lead` returns `delivered: true` when Supabase saved it **or** Resend emailed it; the panel shows "Saved" only then

## Models

`GROQ_MODEL` (default `openai/gpt-oss-20b`) and `GEMINI_MODEL` (default `gemini-3.6-flash`). Free-tier models are retired regularly — the original `llama-3.1-8b-instant` (Groq, 16 Aug 2026) and `gemini-2.0-flash` (Google, 1 Jun 2026) are both past their shutdown dates. When a provider emails a deprecation, change the env var. If both providers fail the chat answers from the FAQ, so a retired model degrades quietly: check the `chat.provider` log lines after a change.

Data: on free (unpaid) quota Google may use Gemini inputs and outputs to improve its products, including human review. The panel's privacy line says replies may come from an AI provider and asks visitors not to share sensitive details.

## Deployment note

Site uses `output: "export"`. Handlers live in root `api/` (Vercel documents root `api/` functions; it does not document them alongside a Next.js static export). Verify on every preview:

```bash
curl -sS https://<preview>/api/chat        # expect {"ok":true,"service":"chat"}
curl -sS -X POST https://<preview>/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"how much is a website?"}]}'
```

404/405 → functions not picked up; the widget still falls back to the FAQ, so nothing looks broken. Product fix is drop export and use `app/api/*/route.ts` (Fahad decision — it changes how Vercel builds and serves the site).

Supabase free projects pause after about a week of low activity. While paused, saves fail and the panel offers WhatsApp/email instead.

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

`npm test` compiles and calls the real handlers (`scripts/test-api.mjs`); only outbound provider calls are simulated. `npm run test:e2e` drives every panel state in Chromium against `out/`.

JS first-load: report measured weight honestly (~launcher only until bubble is used). Do not claim under 120 KB if measured higher.
