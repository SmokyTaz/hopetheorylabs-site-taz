/*
 * Input rules shared by the assistant panel (browser) and `api/lead.ts`
 * (server), so both sides accept and reject exactly the same values.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_PATTERN = /^\+?[\d][\d\s()\-]{6,19}$/;

export const MAX_MESSAGE_CHARS = 1000;
export const MAX_NAME_CHARS = 80;
export const MAX_CONTACT_CHARS = 120;
export const MAX_NEED_CHARS = 600;

export function isContact(value: string): boolean {
  return EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value);
}

export function hasBangla(text: string): boolean {
  return /[ঀ-৿]/.test(text);
}
