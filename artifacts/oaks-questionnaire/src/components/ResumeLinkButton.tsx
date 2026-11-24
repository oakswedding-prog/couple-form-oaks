/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { Link2, Check, Mail, MessageCircle, Copy, X } from "lucide-react";
import { buildResumeUrl } from "../lib/coupleSession.ts";
import { STUDIO_NAME } from "../constants.ts";

interface ResumeLinkButtonProps {
  resumeToken: string | null;
  partner1?: string;
  partner2?: string;
  email?: string;
  compact?: boolean;
}

export const ResumeLinkButton: React.FC<ResumeLinkButtonProps> = ({
  resumeToken,
  partner1,
  partner2,
  email,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  if (!resumeToken) return null;

  const resumeUrl = buildResumeUrl(resumeToken);
  const coupleLabel =
    partner1 && partner2 ? `${partner1} & ${partner2}` : "our";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(resumeUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // Fallback copy for strict WebViews
      try {
        const textarea = document.createElement("textarea");
        textarea.value = resumeUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2400);
      } catch {
        // ignore
      }
    }
  };

  const whatsappText = encodeURIComponent(
    `Resume link for ${coupleLabel}'s ${STUDIO_NAME} questionnaire:\n${resumeUrl}`
  );
  const whatsappHref = `https://wa.me/?text=${whatsappText}`;

  const mailSubject = encodeURIComponent(
    `My ${STUDIO_NAME} Questionnaire Resume Link`
  );
  const mailBody = encodeURIComponent(
    `Hi,\n\nHere is our private link to resume the ${STUDIO_NAME} couple questionnaire from any phone or browser:\n\n${resumeUrl}\n`
  );
  const mailHref = `mailto:${encodeURIComponent(email || "")}?subject=${mailSubject}&body=${mailBody}`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          void copyLink();
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center gap-1.5 rounded-full border border-[#E8DFD3] bg-[#FAF7F2] hover:bg-[#F3ECE0] text-[#5C492A] transition-colors cursor-pointer whitespace-nowrap ${
          compact
            ? "px-2.5 py-1 text-[11px] font-medium"
            : "px-3 py-1.5 text-xs font-medium"
        }`}
        title="Copy a private link to continue on another phone or browser"
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Link copied</span>
          </>
        ) : (
          <>
            <Link2 className="w-3.5 h-3.5 text-[#B08D57] shrink-0" />
            <span>Copy my resume link</span>
          </>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Save or send your resume link"
          className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white border border-[#E5DDD2] rounded-2xl shadow-xl p-4 z-50 text-left space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-[#1A1A1A]">
                Continue anytime, on any device
              </p>
              <p className="text-[11px] text-[#7A756D] mt-0.5 leading-relaxed">
                Keep this private link to restore all your answers in Safari, Chrome, or another phone.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 text-[#7A756D] hover:text-[#1A1A1A] rounded-lg cursor-pointer"
              aria-label="Close resume link menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void copyLink()}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#1A1A1A] hover:bg-[#333333] text-white text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#E5C687]" />
                  <span>Copied to clipboard</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#E5C687]" />
                  <span>Copy my resume link</span>
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[38px] px-3 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE1] border border-[#E5DDD2] text-[#1A1A1A] text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>WhatsApp me</span>
              </a>

              <a
                href={mailHref}
                className="min-h-[38px] px-3 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE1] border border-[#E5DDD2] text-[#1A1A1A] text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-[#8C7043] shrink-0" />
                <span>Email me</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
