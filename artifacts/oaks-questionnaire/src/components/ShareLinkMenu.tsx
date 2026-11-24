import { createPortal } from "react-dom";
import React, { useEffect, useMemo, useState } from "react";
import { Check, Copy, FileText, Mail, MessageCircle, MoreHorizontal, X } from "lucide-react";
import {
  buildMailtoUrl,
  buildShareMessage,
  buildWhatsAppUrl,
  isPrivateShareUrl,
  loadSavedShareContact,
  parseContact,
  saveShareContact,
  type ShareKind,
} from "../lib/shareLinks.ts";
import { STUDIO_NAME } from "../constants.ts";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export interface ShareLinkMenuProps {
  open: boolean;
  onClose: () => void;
  url: string;
  kind: ShareKind;
  /** Who the message is addressed to (partner name, or the couple's names for the team). */
  recipientName: string;
  /** Who is sending (used in the invite message). */
  senderName?: string;
  /** Player side: shows the optional contact field and remembers it under this key. */
  contactStorageKey?: string;
  /** Team side: the couple's own contact details (no field is shown). */
  knownPhone?: string;
  knownEmail?: string;
  /** Called after a share/copy action so callers can mark the partner as invited. */
  onShared?: () => void;
}

export const ShareLinkMenu: React.FC<ShareLinkMenuProps> = ({
  open,
  onClose,
  url,
  kind,
  recipientName,
  senderName,
  contactStorageKey,
  knownPhone,
  knownEmail,
  onShared,
}) => {
  const [contact, setContact] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (open && contactStorageKey) setContact(loadSavedShareContact(contactStorageKey));
    if (!open) {
      setCopied(null);
      setNotice(null);
    }
  }, [open, contactStorageKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const message = useMemo(
    () => buildShareMessage({ kind, recipientName, senderName, url, studioName: STUDIO_NAME }),
    [kind, recipientName, senderName, url]
  );

  const parsed = useMemo(() => {
    if (contactStorageKey) return parseContact(contact);
    return { type: "none" as const };
  }, [contact, contactStorageKey]);

  if (!open) return null;

  const privateLink = isPrivateShareUrl(url);

  let phoneDigits: string | null = null;
  let toEmail: string | null = null;
  if (contactStorageKey) {
    if (parsed.type === "phone") phoneDigits = parsed.digits;
    if (parsed.type === "email") toEmail = parsed.email;
  } else {
    const p = knownPhone ? parseContact(knownPhone) : { type: "none" as const };
    if (p.type === "phone") phoneDigits = p.digits;
    const e = knownEmail ? parseContact(knownEmail) : { type: "none" as const };
    if (e.type === "email") toEmail = e.email;
  }

  const whatsappHref = buildWhatsAppUrl(message.text, phoneDigits);
  const mailHref = buildMailtoUrl({ to: toEmail, subject: message.subject, body: message.text });
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const rememberContact = () => {
    if (contactStorageKey) saveShareContact(contactStorageKey, contact);
  };

  const handleLinkClick = () => {
    rememberContact();
    onShared?.();
    onClose();
  };

  const handleCopy = async (which: "link" | "message") => {
    rememberContact();
    const ok = await copyText(which === "link" ? url : message.text);
    if (ok) {
      setCopied(which);
      setNotice(null);
      onShared?.();
      window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 2400);
    } else {
      setNotice("Could not copy automatically. Please select and copy the link manually.");
    }
  };

  const handleNativeShare = async () => {
    rememberContact();
    try {
      await navigator.share({ title: message.subject, text: message.intro, url });
      onShared?.();
      onClose();
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        const ok = await copyText(url);
        setNotice(
          ok
            ? "Sharing is not available here, so the link was copied instead."
            : "Sharing is not available here. Please copy the link manually."
        );
      }
    }
  };

  const rowClass =
    "w-full flex items-center gap-3 px-4 py-3 min-h-[48px] rounded-xl border border-[#E5DDD2] bg-white hover:bg-[#FAF7F2] text-sm font-medium text-[#1A1A1A] transition-colors cursor-pointer text-left";
  const disabledRow = "opacity-50 pointer-events-none";

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/40"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share link"
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-3 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-lg text-[#1A1A1A]">
            {kind === "remind" ? "Send a reminder" : kind === "team" ? "Send link" : "Send invite"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 rounded-lg text-[#5F5F5F] hover:bg-[#FAF7F2] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {contactStorageKey && (
          <label className="block space-y-1">
            <span className="text-xs text-[#5F5F5F]">
              {recipientName}&apos;s WhatsApp number or email (optional)
            </span>
            <input
              type="text"
              inputMode="email"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g. 98765 43210 or name@example.com"
              className="w-full px-3 py-2.5 rounded-xl border border-[#DFD4C3] text-sm focus:outline-none focus:border-[#B08D57]"
            />
          </label>
        )}

        {privateLink && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            This is a private preview address that other people cannot open. Open the live website
            to send a link that works for everyone.
          </p>
        )}

        <div className="space-y-2">
          <a
            href={privateLink ? undefined : whatsappHref}
            target="_blank"
            rel="noopener"
            onClick={handleLinkClick}
            className={`${rowClass} ${privateLink ? disabledRow : ""}`}
          >
            <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>WhatsApp</span>
          </a>
          <a
            href={privateLink ? undefined : mailHref}
            target="_blank"
            rel="noopener"
            onClick={handleLinkClick}
            className={`${rowClass} ${privateLink ? disabledRow : ""}`}
          >
            <Mail className="w-4 h-4 text-[#9A7B4F] shrink-0" />
            <span>Email</span>
          </a>
          <button type="button" onClick={() => void handleCopy("link")} className={rowClass}>
            {copied === "link" ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Copy className="w-4 h-4 text-[#9A7B4F] shrink-0" />
            )}
            <span>{copied === "link" ? "Copied" : "Copy link only"}</span>
          </button>
          <button type="button" onClick={() => void handleCopy("message")} className={rowClass}>
            {copied === "message" ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-[#9A7B4F] shrink-0" />
            )}
            <span>{copied === "message" ? "Copied" : "Copy message and link"}</span>
          </button>
          {canNativeShare && (
            <button type="button" onClick={() => void handleNativeShare()} className={rowClass}>
              <MoreHorizontal className="w-4 h-4 text-[#9A7B4F] shrink-0" />
              <span>More options...</span>
            </button>
          )}
        </div>

        {notice && <p className="text-xs text-[#5F5F5F]">{notice}</p>}
      </div>
    </div>,
    document.body
  );
};
