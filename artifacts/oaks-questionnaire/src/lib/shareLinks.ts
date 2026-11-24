/**
 * Pure helpers for sharing invite / reminder / resume links via WhatsApp and email.
 * All message texts live in SHARE_TEMPLATES so every channel uses the same wording.
 */

import { STUDIO_NAME } from "../constants.ts";

/** Country code added to phone numbers that do not include one. */
export const DEFAULT_COUNTRY_CODE = "91";

export type ShareKind = "invite" | "remind" | "team";

export const SHARE_TEMPLATES = {
  invite: (p: { partner: string; name: string; studio: string }) =>
    `Hi ${p.partner}, ${p.name} has started our ${p.studio} questionnaire. Please add your part here and pick your own name:`,
  remind: (p: { partner: string; studio: string }) =>
    `Hi ${p.partner}, a gentle reminder to add your part of our ${p.studio} questionnaire:`,
  team: (p: { names: string; studio: string }) =>
    `Hi ${p.names}, here is your link to continue (or update) your ${p.studio} questionnaire:`,
  emailSubject: (p: { studio: string }) =>
    `Please add your part to our ${p.studio} questionnaire`,
  teamEmailSubject: (p: { studio: string }) =>
    `Your ${p.studio} questionnaire link`,
};

export interface ShareMessageInput {
  kind: ShareKind;
  /** The person the message is for (partner name, or "Name & Name" for the team). */
  recipientName: string;
  /** The person sending (used by the invite message). */
  senderName?: string;
  url: string;
  studioName?: string;
}

export interface ShareMessage {
  /** Message text, with the link on its own line. */
  text: string;
  /** Message text without the link. */
  intro: string;
  subject: string;
}

export function buildShareMessage(input: ShareMessageInput): ShareMessage {
  const studio = input.studioName ?? STUDIO_NAME;
  const recipient = input.recipientName.trim() || "there";
  const sender = (input.senderName ?? "").trim() || "Your partner";
  let intro: string;
  let subject: string;
  if (input.kind === "invite") {
    intro = SHARE_TEMPLATES.invite({ partner: recipient, name: sender, studio });
    subject = SHARE_TEMPLATES.emailSubject({ studio });
  } else if (input.kind === "remind") {
    intro = SHARE_TEMPLATES.remind({ partner: recipient, studio });
    subject = SHARE_TEMPLATES.emailSubject({ studio });
  } else {
    intro = SHARE_TEMPLATES.team({ names: recipient, studio });
    subject = SHARE_TEMPLATES.teamEmailSubject({ studio });
  }
  return { intro, text: `${intro}\n${input.url}`, subject };
}

// ---------------------------------------------------------------------------
// Contact detection
// ---------------------------------------------------------------------------

export type ParsedContact =
  | { type: "email"; email: string }
  | { type: "phone"; digits: string }
  | { type: "none" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Turns free text into WhatsApp-ready digits (country code, no "+").
 * Accepts digits, spaces, dashes, brackets, a leading "+" or "00", and a leading 0
 * (local number, so the default country code is added).
 */
export function normalizePhoneDigits(
  raw: string,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE
): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  if (!/^[+\d][\d\s\-().]*$/.test(trimmed)) return null;
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (hasPlus) {
    // already has a country code
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = defaultCountryCode + digits.replace(/^0+/, "");
  } else if (digits.length <= 10) {
    digits = defaultCountryCode + digits;
  }
  // Else: 11+ digits without a "+" are treated as already including a country code.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function parseContact(
  raw: string,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE
): ParsedContact {
  const value = (raw ?? "").trim();
  if (!value) return { type: "none" };
  if (value.includes("@")) {
    return EMAIL_RE.test(value) ? { type: "email", email: value } : { type: "none" };
  }
  const digits = normalizePhoneDigits(value, defaultCountryCode);
  return digits ? { type: "phone", digits } : { type: "none" };
}

// ---------------------------------------------------------------------------
// Link builders
// ---------------------------------------------------------------------------

export function buildWhatsAppUrl(text: string, phoneDigits?: string | null): string {
  const base = phoneDigits ? `https://wa.me/${phoneDigits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function buildMailtoUrl(opts: {
  to?: string | null;
  subject: string;
  body: string;
}): string {
  const to = opts.to ? encodeURIComponent(opts.to).replace(/%40/g, "@") : "";
  return `mailto:${to}?subject=${encodeURIComponent(opts.subject)}&body=${encodeURIComponent(opts.body)}`;
}

// ---------------------------------------------------------------------------
// Public link safety
// ---------------------------------------------------------------------------

/** True for editor / development / private preview hosts that clients cannot open. */
export function isPrivateShareHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (/^(127\.|10\.|192\.168\.|0\.0\.0\.0$)/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/\.(replit\.dev|repl\.co|replit\.app|worf\.replit\.dev|riker\.replit\.dev|kirk\.replit\.dev|spock\.replit\.dev|sisko\.replit\.dev)$/.test(host)) return true;
  if (/(^|\.)replit\.(dev|com|app)$/.test(host)) return true;
  if (/^ais-(dev|pre)-[a-z0-9.-]+\.run\.app$/.test(host)) return true;
  return false;
}

export function isPrivateShareUrl(url: string): boolean {
  try {
    return isPrivateShareHost(new URL(url).hostname);
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Saved partner contact (per resume link, on this device)
// ---------------------------------------------------------------------------

const CONTACT_KEY_PREFIX = "oaks_share_contact_";

export function loadSavedShareContact(token: string): string {
  try {
    return localStorage.getItem(CONTACT_KEY_PREFIX + token) ?? "";
  } catch {
    return "";
  }
}

export function saveShareContact(token: string, value: string): void {
  try {
    const key = CONTACT_KEY_PREFIX + token;
    if (value.trim()) localStorage.setItem(key, value.trim());
    else localStorage.removeItem(key);
  } catch {
    // storage unavailable: sharing still works, the number just is not remembered
  }
}
