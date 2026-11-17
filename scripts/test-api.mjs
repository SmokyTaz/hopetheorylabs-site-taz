#!/usr/bin/env node
/**
 * Behavioural tests for the assistant's server code (api/chat.ts, api/lead.ts,
 * lib/assistant/*). The real handlers are compiled with the project's
 * TypeScript and called with real Request objects. The only stub is the
 * outbound `fetch` to AI providers, in the tests that simulate a provider —
 * that is the system boundary, not the code under test.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(tmpdir(), "htl-api-"));
const require = createRequire(import.meta.url);
let chat, lead, kb;

before(() => {
  const tsc = spawnSync(
    process.execPath,
    [require.resolve("typescript/bin/tsc"), "api/chat.ts", "api/lead.ts", "--outDir", outDir,
      "--module", "commonjs", "--target", "ES2022", "--moduleResolution", "node",
      "--skipLibCheck", "--esModuleInterop", "--lib", "ES2022,DOM", "--types", "node"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(tsc.status, 0, `tsc failed:\n${tsc.stdout}${tsc.stderr}`);
  chat = require(join(outDir, "api/chat.js"));
  lead = require(join(outDir, "api/lead.js"));
  kb = require(join(outDir, "lib/assistant/kb.js"));
  console.log = () => {}; // handlers log one JSON line per request
});
after(() => rmSync(outDir, { recursive: true, force: true }));

let ipCounter = 0;
const freshIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;
const post = (body, ip = freshIp()) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const ask = (content) => ({ messages: [{ role: "user", content }] });
const goodLead = { name: "Rahim", contact: "01712345678", need: "A shop site" };

/** Runs fn with provider env vars set and `fetch` answering like the provider would. */
async function withProvider(env, fakeFetch, fn) {
  const realFetch = globalThis.fetch;
  Object.assign(process.env, env);
  globalThis.fetch = fakeFetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
    for (const key of Object.keys(env)) delete process.env[key];
  }
}

describe("price guard (lib/assistant/kb.ts)", () => {
  for (const text of ["costs ৳12,000", "দাম ৳১২,০০০", "১২০০০ টাকা", "Tk. 12,000", "about 12k taka", "BDT 9999"]) {
    test(`flags invented price: ${text}`, () => assert.ok(kb.unknownPrice(text)));
  }
  for (const text of ["Starter ৳10,000", "Counter ৳২৫,০০০", "Founding ৳15,000", "Showroom ৳45,000", "3 packages, 4 steps, 2 weeks"]) {
    test(`allows approved or non-price text: ${text}`, () => assert.equal(kb.unknownPrice(text), null));
  }
  test("allowed prices are exactly the ones in content/en.ts pricing", () => {
    assert.deepEqual([...kb.ALLOWED_PRICES].sort(), ["10000", "15000", "25000", "45000"]);
  });
  test("kb carries no hardcoded prices (every figure comes from content/en.ts)", () => {
    const source = readFileSync(join(root, "lib/assistant/kb.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(source, /৳\s?\d|\d[\d,]{3,}\s*(?:taka|tk|bdt)/i);
  });
});

describe("POST /api/chat", () => {
  test("answers a price question from the FAQ with approved prices only (no keys)", async () => {
    const response = await chat.POST(post(ask("how much is a website?")));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source, "faq:price");
    assert.match(body.reply, /৳10,000/);
    assert.equal(kb.unknownPrice(body.reply), null);
  });
  test("malformed JSON → 400", async () => assert.equal((await chat.POST(post("{nope"))).status, 400));
  test("no user turn → 400", async () => {
    assert.equal((await chat.POST(post({ messages: [{ role: "assistant", content: "hi" }] }))).status, 400);
  });
  test("user turn over 1000 chars → 400 too_long", async () => {
    const response = await chat.POST(post(ask("a".repeat(1001))));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "too_long");
  });
  test("forged assistant history over the reply cap → 400 (no free-quota burn)", async () => {
    const body = { messages: [{ role: "assistant", content: "a".repeat(500_000) }, { role: "user", content: "hi" }] };
    assert.equal((await chat.POST(post(body))).status, 400);
  });
  test("21st message in 10 minutes from one IP → 429", async () => {
    const ip = freshIp();
    const statuses = [];
    for (let i = 0; i < 21; i++) statuses.push((await chat.POST(post(ask("hi"), ip))).status);
    assert.deepEqual([statuses[19], statuses[20]], [200, 429]);
  });
  test("provider receives the visitor's turn first, never the panel greeting", async () => {
    let sent;
    const fakeGroq = async (_url, init) => {
      sent = JSON.parse(init.body);
      return Response.json({ choices: [{ message: { content: "Starter is ৳10,000." } }] });
    };
    await withProvider({ GROQ_API_KEY: "test" }, fakeGroq, async () => {
      const body = { messages: [{ role: "assistant", content: "Hi — I'm the assistant." }, { role: "user", content: "price?" }] };
      const reply = await (await chat.POST(post(body))).json();
      assert.equal(reply.source, "groq");
      assert.deepEqual(sent.messages.map((m) => m.role), ["system", "user"]);
    });
  });
  test("an invented Bangla price from the model is replaced by the WhatsApp handoff", async () => {
    const fakeGroq = async () => Response.json({ choices: [{ message: { content: "দাম ৳১২,০০০ মাত্র" } }] });
    await withProvider({ GROQ_API_KEY: "test" }, fakeGroq, async () => {
      const reply = await (await chat.POST(post(ask("দাম কত?")))).json();
      assert.equal(reply.source, "guard");
      assert.equal(reply.reply, kb.HANDOFF_REPLY);
    });
  });
  test("Groq down → Gemini; Gemini key goes in a header, never the URL", async () => {
    const calls = [];
    const fake = async (url, init) => {
      calls.push({ url: String(url), headers: init.headers, model: JSON.parse(init.body).model });
      if (String(url).includes("groq")) return new Response("{}", { status: 503 });
      return Response.json({ candidates: [{ content: { parts: [{ text: "We build " }, { text: "websites." }] } }] });
    };
    await withProvider({ GROQ_API_KEY: "g", GEMINI_API_KEY: "SECRET" }, fake, async () => {
      const reply = await (await chat.POST(post(ask("hello")))).json();
      assert.equal(reply.source, "gemini");
      assert.equal(reply.reply, "We build websites.");
      const gemini = calls.find((call) => call.url.includes("generativelanguage"));
      assert.ok(!gemini.url.includes("SECRET"));
      assert.equal(gemini.headers["x-goog-api-key"], "SECRET");
    });
  });
  test("defaults avoid retired models; GROQ_MODEL / GEMINI_MODEL override them", async () => {
    const seen = [];
    const fake = async (url, init) => {
      seen.push(`${url} ${JSON.parse(init.body).model ?? ""}`);
      return new Response("{}", { status: 500 });
    };
    await withProvider({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k" }, fake, () => chat.POST(post(ask("hi"))));
    assert.doesNotMatch(seen.join(" "), /llama-3\.1-8b-instant|gemini-2\.0-flash/);
    assert.match(seen.join(" "), new RegExp(chat.DEFAULT_GROQ_MODEL.replace(/[./]/g, "\\$&")));
    seen.length = 0;
    await withProvider({ GROQ_API_KEY: "k", GROQ_MODEL: "custom-groq", GEMINI_API_KEY: "k", GEMINI_MODEL: "custom-gem" }, fake, () =>
      chat.POST(post(ask("hi"))),
    );
    assert.match(seen.join(" "), /custom-groq/);
    assert.match(seen.join(" "), /custom-gem/);
  });
  test("both providers failing falls back to the FAQ for the visitor's own question", async () => {
    const down = async () => { throw new Error("network down"); };
    await withProvider({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k" }, down, async () => {
      const reply = await (await chat.POST(post(ask("what is your whatsapp number?")))).json();
      assert.equal(reply.source, "faq:contact");
    });
  });
});

describe("POST /api/lead", () => {
  test("valid enquiry → 200 with a WhatsApp prefill; delivered=false when nothing is configured", async () => {
    const body = await (await lead.POST(post(goodLead))).json();
    assert.equal(body.ok, true);
    assert.equal(body.delivered, false);
    assert.match(body.whatsapp, /^https:\/\/wa\.me\/8801718463471\?text=/);
  });
  test("missing field → 400", async () => assert.equal((await lead.POST(post({ ...goodLead, need: "" }))).status, 400));
  test("bad contact → 400 with the invalid-contact message", async () => {
    const response = await lead.POST(post({ ...goodLead, contact: "not-a-contact" }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "bad_contact");
  });
  test("honeypot filled → silently accepted, nothing saved", async () => {
    const body = await (await lead.POST(post({ ...goodLead, website: "spam.example" }))).json();
    assert.equal(body.saved, false);
  });
  test("chatting first does not use up the enquiry limit", async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) await chat.POST(post(ask("price?"), ip));
    assert.equal((await lead.POST(post(goodLead, ip))).status, 200);
  });
  test("6th enquiry in 10 minutes from one IP → 429, still with a WhatsApp link", async () => {
    const ip = freshIp();
    let response;
    for (let i = 0; i < 6; i++) response = await lead.POST(post(goodLead, ip));
    assert.equal(response.status, 429);
    assert.match((await response.json()).whatsapp, /wa\.me/);
  });
});
