"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantCopy } from "@/content/types";
import { matchFaq } from "@/lib/assistant/kb";
import {
  MAX_CONTACT_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_NAME_CHARS,
  MAX_NEED_CHARS,
  hasBangla,
  isContact,
} from "@/lib/assistant/validate";

export interface AssistantPanelProps {
  copy: AssistantCopy;
  /** Base wa.me link, e.g. https://wa.me/8801718463471 */
  whatsapp: string;
  email: string;
  calcomUrl?: string;
  onClose: () => void;
}

type Role = "user" | "assistant";
interface Bubble {
  id: number;
  role: Role;
  content: string;
  /** Greeting and status notices: shown, never sent to the model. */
  local?: boolean;
}
type Step = "name" | "contact" | "need" | "summary";
type Field = Exclude<Step, "summary">;
interface Enquiry {
  name: string;
  contact: string;
  need: string;
}

const STEPS: Field[] = ["name", "contact", "need"];
const FIELD_LIMIT: Record<Field, number> = {
  name: MAX_NAME_CHARS,
  contact: MAX_CONTACT_CHARS,
  need: MAX_NEED_CHARS,
};

/*
 * Conversation state lives at module scope so closing and reopening the panel
 * (which unmounts it) keeps the chat and any half-finished enquiry for the
 * rest of the page visit. Nothing is written to storage.
 */
interface Session {
  bubbles: Bubble[];
  enquiry: Enquiry;
  delivered: boolean;
}
let session: Session | null = null;
let bubbleCounter = 1;
const nextBubbleId = () => bubbleCounter++;

function startSession(intro: string): Session {
  session ??= {
    bubbles: [{ id: 0, role: "assistant", content: intro, local: true }],
    enquiry: { name: "", contact: "", need: "" },
    delivered: false,
  };
  return session;
}

/** While the dialog is open, everything else on the page is inert (not focusable, hidden from AT). */
function useInertBackground(panel: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = panel.current;
    if (!root) return;
    const others = Array.from(document.body.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && !node.contains(root) && !node.inert,
    );
    for (const node of others) node.inert = true;
    return () => {
      for (const node of others) node.inert = false;
    };
  }, [panel]);
}

export default function AssistantPanel({ copy, whatsapp, email, calcomUrl, onClose }: AssistantPanelProps) {
  const saved = startSession(copy.intro);
  const [bubbles, setBubbles] = useState<Bubble[]>(saved.bubbles);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"chat" | "enquiry">("chat");
  const [step, setStep] = useState<Step>("name");
  const [form, setForm] = useState<Enquiry>(saved.enquiry);
  const [field, setField] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [saving, setSaving] = useState(false);
  const [delivered, setDelivered] = useState(saved.delivered);
  const [note, setNote] = useState<{ kind: "saved" | "failed"; text: string } | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLAnchorElement>(null);

  useInertBackground(panelRef);

  // Mirror state into the module-level session so it survives unmounting.
  useEffect(() => {
    if (session) {
      session.bubbles = bubbles;
      session.enquiry = form;
      session.delivered = delivered;
    }
  }, [bubbles, form, delivered]);

  const push = useCallback((role: Role, content: string, local = false) => {
    const id = nextBubbleId();
    setBubbles((current) => [...current, { id, role, content, local }]);
  }, []);

  useEffect(() => {
    if (mode === "chat") inputRef.current?.focus();
    else if (step === "summary") summaryRef.current?.focus();
    else fieldRef.current?.focus();
  }, [mode, step]);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [bubbles, busy, mode, step, note, warning]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || busy) return;
    if (message.length > MAX_MESSAGE_CHARS) {
      setWarning(copy.tooLong);
      return;
    }
    setWarning(null);
    const id = nextBubbleId();
    const history: Bubble[] = [...bubbles, { id, role: "user", content: message }];
    setBubbles(history);
    setDraft("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history
            .filter((bubble) => !bubble.local)
            .slice(-12)
            .map(({ role, content }) => ({ role, content })),
        }),
      });
      if (response.status === 429) {
        push("assistant", copy.rateLimited, true);
        return;
      }
      if (!response.ok) throw new Error(`chat_${response.status}`);
      const data = (await response.json()) as { reply?: string };
      const reply = data.reply?.trim();
      if (reply) push("assistant", reply);
      else push("assistant", copy.error, true);
    } catch {
      // Offline, or the function isn't deployed: answer from the same FAQ the server would use.
      push("assistant", matchFaq(message).reply);
    } finally {
      setBusy(false);
    }
  };

  const goToStep = (next: Step) => {
    setStep(next);
    setField(next === "summary" ? "" : form[next]);
    setWarning(null);
  };

  const startEnquiry = () => {
    setMode("enquiry");
    setNote(null);
    goToStep(form.name && form.contact && form.need ? "summary" : "name");
  };

  const leaveEnquiry = () => {
    setMode("chat");
    setNote(null);
    setWarning(null);
  };

  const nextStep = (event: React.FormEvent) => {
    event.preventDefault();
    if (step === "summary") return;
    const value = field.trim();
    if (!value) {
      setWarning(copy.enquiry.required);
      return;
    }
    if (step === "contact" && !isContact(value)) {
      setWarning(copy.enquiry.invalidContact);
      return;
    }
    const changed = form[step] !== value;
    setForm((current) => ({ ...current, [step]: value }));
    // Editing a saved enquiry makes it a new one.
    if (changed) {
      setDelivered(false);
      setNote(null);
    }
    goToStep(STEPS[STEPS.indexOf(step) + 1] ?? "summary");
  };

  const summaryMessage = `Hi Hope Theory Labs, I'm ${form.name}. ${form.need} Contact: ${form.contact}`;
  const whatsappHref = `${whatsapp}?text=${encodeURIComponent(summaryMessage)}`;
  const mailtoHref = `mailto:${email}?subject=${encodeURIComponent(copy.enquiry.emailSubject)}&body=${encodeURIComponent(summaryMessage)}`;

  const saveEnquiry = async () => {
    if (saving || delivered) return;
    setSaving(true);
    setNote(null);
    const lang = hasBangla(`${form.name} ${form.contact} ${form.need}`) ? "bn" : "en";
    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, lang, website: honeypot }),
      });
      const data = (await response.json().catch(() => null)) as { delivered?: boolean } | null;
      if (response.ok && data?.delivered) {
        setDelivered(true);
        setNote({ kind: "saved", text: copy.enquiry.saved });
      } else {
        setNote({ kind: "failed", text: copy.enquiry.saveFailed });
      }
    } catch {
      setNote({ kind: "failed", text: copy.enquiry.saveFailed });
    } finally {
      setSaving(false);
    }
  };

  const stepQuestion = step === "summary" ? "" : copy.enquiry[step];

  return (
    <div
      className="asst-p"
      role="dialog"
      aria-modal="true"
      aria-labelledby="asst-title"
      aria-describedby="asst-privacy"
      ref={panelRef}
    >
      <div className="asst-h">
        <h2 id="asst-title">{copy.title}</h2>
        <button type="button" className="asst-x" onClick={onClose} aria-label={copy.close}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>

      <div className="asst-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions text">
        {bubbles.map((bubble) => (
          <p key={bubble.id} className={bubble.role === "user" ? "asst-m asst-me" : "asst-m"}>
            {bubble.content}
          </p>
        ))}
        {busy ? (
          <p className="asst-m asst-typing" aria-hidden="true">
            ···
          </p>
        ) : null}
        {note ? (
          <p className={note.kind === "saved" ? "asst-n asst-ok" : "asst-n"} role="status">
            {note.text}
          </p>
        ) : null}
        {warning ? (
          <p className="asst-n" role="alert">
            {warning}
          </p>
        ) : null}
      </div>

      {mode === "chat" ? (
        <>
          {bubbles.length === 1 ? (
            <div className="asst-chips">
              {copy.chips.map((chip, index) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => (index === copy.chips.length - 1 ? startEnquiry() : void send(chip))}
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="asst-compose"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <label className="asst-sr" htmlFor="asst-input">
              {copy.inputLabel}
            </label>
            <input
              id="asst-input"
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={copy.placeholder}
              maxLength={MAX_MESSAGE_CHARS}
              autoComplete="off"
            />
            <button type="submit" disabled={busy || !draft.trim()}>
              {busy ? copy.sending : copy.send}
            </button>
          </form>

          <div className="asst-links">
            {bubbles.length > 1 ? (
              <button type="button" className="asst-book" onClick={startEnquiry}>
                {copy.enquiryCta}
              </button>
            ) : null}
            {calcomUrl ? (
              <a className="asst-book" href={calcomUrl} target="_blank" rel="noopener noreferrer">
                {copy.booking}
              </a>
            ) : null}
          </div>
        </>
      ) : (
        <div className="asst-enq">
          {step === "summary" ? (
            <>
              <p className="asst-step">{copy.enquiry.summary}</p>
              <dl className="asst-sum">
                {STEPS.map((key) => (
                  <div key={key}>
                    <dt>{copy.enquiry[key]}</dt>
                    <dd>{form[key]}</dd>
                  </div>
                ))}
              </dl>
              <div className="asst-acts">
                <a
                  className="asst-btn asst-primary"
                  ref={summaryRef}
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {copy.enquiry.sendWhatsApp}
                </a>
                <a className="asst-btn" href={mailtoHref}>
                  {copy.enquiry.email}
                </a>
                <button
                  type="button"
                  className="asst-btn"
                  onClick={() => void saveEnquiry()}
                  disabled={saving || delivered}
                >
                  {saving ? copy.enquiry.saving : copy.enquiry.save}
                </button>
              </div>
              <div className="asst-acts">
                <button type="button" className="asst-btn" onClick={() => goToStep("name")}>
                  {copy.enquiry.edit}
                </button>
                <button type="button" className="asst-btn" onClick={leaveEnquiry}>
                  {copy.enquiry.back}
                </button>
              </div>
            </>
          ) : (
            <form className="asst-fstep" onSubmit={nextStep} noValidate>
              <label className="asst-step" htmlFor="asst-field">
                {stepQuestion}
              </label>
              <input
                id="asst-field"
                ref={fieldRef}
                value={field}
                onChange={(event) => setField(event.target.value)}
                autoComplete={step === "name" ? "name" : "off"}
                aria-invalid={warning ? true : undefined}
                maxLength={FIELD_LIMIT[step]}
              />
              <div className="asst-acts">
                <button type="submit" className="asst-btn asst-primary">
                  {copy.enquiry.next}
                </button>
                <button type="button" className="asst-btn" onClick={leaveEnquiry}>
                  {copy.enquiry.back}
                </button>
              </div>
            </form>
          )}
          <input
            className="asst-hp"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
            name="website"
          />
        </div>
      )}

      <p className="asst-note" id="asst-privacy">
        {copy.privacy}
      </p>
    </div>
  );
}
