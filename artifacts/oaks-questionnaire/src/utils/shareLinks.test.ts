import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMailtoUrl,
  buildShareMessage,
  buildWhatsAppUrl,
  isPrivateShareUrl,
  normalizePhoneDigits,
  parseContact,
} from "../lib/shareLinks.ts";

const URL1 = "https://coupleform-oaks.vercel.app/?resume=abc123";

test("invite message: studio name once, link on its own line, no extra 'wedding'", () => {
  const m = buildShareMessage({ kind: "invite", recipientName: "Leo", senderName: "Maya", url: URL1 });
  assert.equal(
    m.text,
    `Hi Leo, Maya has started our OAKS Wedding questionnaire. Please add your part here and pick your own name:\n${URL1}`
  );
  assert.equal(m.text.split("OAKS Wedding").length - 1, 1);
  assert.equal(m.subject, "Please add your part to our OAKS Wedding questionnaire");
  assert.equal(/wedding wedding/i.test(m.text), false);
});

test("reminder and team messages", () => {
  const r = buildShareMessage({ kind: "remind", recipientName: "Leo", url: URL1 });
  assert.equal(r.text, `Hi Leo, a gentle reminder to add your part of our OAKS Wedding questionnaire:\n${URL1}`);
  const t = buildShareMessage({ kind: "team", recipientName: "Maya & Leo", url: URL1 });
  assert.equal(
    t.text,
    `Hi Maya & Leo, here is your link to continue (or update) your OAKS Wedding questionnaire:\n${URL1}`
  );
});

test("phone normalisation adds the default country code", () => {
  assert.equal(normalizePhoneDigits("98765 43210"), "919876543210");
  assert.equal(normalizePhoneDigits("098765 43210"), "919876543210");
  assert.equal(normalizePhoneDigits("+44 7700 900123"), "447700900123");
  assert.equal(normalizePhoneDigits("+91 98765-43210"), "919876543210");
  assert.equal(normalizePhoneDigits("919876543210"), "919876543210");
  assert.equal(normalizePhoneDigits("abc"), null);
  assert.equal(normalizePhoneDigits("123"), null);
});

test("contact detection: email vs number vs none", () => {
  assert.deepEqual(parseContact("leo@example.com"), { type: "email", email: "leo@example.com" });
  assert.deepEqual(parseContact("98765 43210"), { type: "phone", digits: "919876543210" });
  assert.deepEqual(parseContact(""), { type: "none" });
  assert.deepEqual(parseContact("not an email@"), { type: "none" });
});

test("WhatsApp and mailto links encode apostrophes, &, accents and emoji", () => {
  const m = buildShareMessage({ kind: "invite", recipientName: "Zoë & Jean-Luc 💍", senderName: "O'Brien", url: URL1 });
  const wa = buildWhatsAppUrl(m.text, "919876543210");
  assert.ok(wa.startsWith("https://wa.me/919876543210?text="));
  assert.equal(decodeURIComponent(wa.split("?text=")[1]), m.text);
  assert.ok(buildWhatsAppUrl(m.text).startsWith("https://wa.me/?text="));
  const mail = buildMailtoUrl({ to: "leo@example.com", subject: m.subject, body: m.text });
  assert.ok(mail.startsWith("mailto:leo@example.com?subject="));
  const body = new URLSearchParams(mail.split("?")[1]).get("body");
  assert.equal(body, m.text);
  assert.equal(mail.split("?")[1].includes(" "), false);
});

test("private preview addresses are never treated as shareable", () => {
  assert.equal(isPrivateShareUrl("https://abc.sisko.replit.dev/?resume=x"), true);
  assert.equal(isPrivateShareUrl("http://localhost:3000/"), true);
  assert.equal(isPrivateShareUrl("https://x.repl.co/"), true);
  assert.equal(isPrivateShareUrl("https://coupleform-oaks.vercel.app/"), false);
});
