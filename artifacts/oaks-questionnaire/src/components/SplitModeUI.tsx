/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Lock,
  Share2,
  Smartphone,
  UserCheck,
  Users,
} from "lucide-react";
import { STUDIO_LOGO_URL, STUDIO_NAME } from "../constants.ts";
import { LOCKED_LINK_MESSAGE } from "../config/splitMode.ts";
import { buildResumeUrl } from "../lib/coupleSession.ts";
import type { FillMode, PartnerSlot } from "../types/questionnaire.ts";
import { getPartnerDisplayName } from "../utils/splitModeHelpers.ts";

/**
 * Shown whenever a resume or invite link is locked, revoked, expired (> 7 days),
 * or no longer active. Renders ZERO couple answers or personal details.
 */
export const LockedLinkScreen: React.FC = () => {
  return (
    <div className="min-h-[100dvh] bg-white flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="max-w-md w-full space-y-6">
        <img
          src={
            STUDIO_LOGO_URL ||
            "https://res.cloudinary.com/pcodbmuo/image/upload/v1792483927/Black_OAKS_uctgsb.webp"
          }
          alt={STUDIO_NAME}
          className="h-12 sm:h-14 w-auto object-contain mx-auto"
        />
        <div className="p-8 rounded-3xl bg-[#FAF8F5] border border-[#E8DFD3] space-y-4">
          <div className="w-12 h-12 rounded-full bg-white border border-[#E8DFD3] flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-[#9A7B4F]" />
          </div>
          <p className="font-cormorant text-[24px] sm:text-[26px] text-[#1A1A1A] leading-snug">
            {LOCKED_LINK_MESSAGE}
          </p>
        </div>
      </div>
    </div>
  );
};

interface PartnerIdentityGateProps {
  partner1: string;
  partner2: string;
  onSelectPartner: (slot: PartnerSlot) => void;
}

/**
 * Shown when opening an invite/separate link so each person picks their own name
 * before viewing or editing their side of the questionnaire.
 */
export const PartnerIdentityGate: React.FC<PartnerIdentityGateProps> = ({
  partner1,
  partner2,
  onSelectPartner,
}) => {
  const nameA = (partner1 || "Partner 1").trim();
  const nameB = (partner2 || "Partner 2").trim();

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col items-center justify-center px-5 py-12">
      <div className="max-w-md w-full space-y-7 text-center">
        <img
          src={
            STUDIO_LOGO_URL ||
            "https://res.cloudinary.com/pcodbmuo/image/upload/v1792483927/Black_OAKS_uctgsb.webp"
          }
          alt={STUDIO_NAME}
          className="h-12 sm:h-14 w-auto object-contain mx-auto"
        />

        <div className="p-6 sm:p-8 rounded-3xl bg-[#FAF8F5] border border-[#E8DFD3] space-y-6">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[#9A7B4F]">
              {nameA} &amp; {nameB}
            </p>
            <h1 className="font-cormorant text-[32px] sm:text-[36px] text-[#1A1A1A] leading-tight font-normal">
              Who&apos;s opening this?
            </h1>
            <p className="text-sm text-[#5F5F5F] leading-relaxed">
              Make sure you pick your own name. Your answers will stay neatly
              paired together in one shared questionnaire.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onSelectPartner("partnerA")}
              className="min-h-[58px] px-5 py-3.5 rounded-2xl bg-white hover:bg-[#1A1A1A] text-[#1A1A1A] hover:text-white border border-[#DFD4C3] hover:border-[#1A1A1A] font-cormorant text-[22px] transition-all shadow-2xs cursor-pointer"
            >
              I&apos;m {nameA}
            </button>
            <button
              type="button"
              onClick={() => onSelectPartner("partnerB")}
              className="min-h-[58px] px-5 py-3.5 rounded-2xl bg-white hover:bg-[#1A1A1A] text-[#1A1A1A] hover:text-white border border-[#DFD4C3] hover:border-[#1A1A1A] font-cormorant text-[22px] transition-all shadow-2xs cursor-pointer"
            >
              I&apos;m {nameB}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface InvitePartnerButtonProps {
  resumeToken: string | null;
  partner1: string;
  partner2: string;
  activePartner: PartnerSlot;
  invitedAlready?: boolean;
  onShared?: () => void;
  compact?: boolean;
  className?: string;
}

/**
 * Shares the couple's active invite/resume link with the other partner via
 * native mobile Share Sheet (`navigator.share`) or clipboard copy fallback.
 */
export const InvitePartnerButton: React.FC<InvitePartnerButtonProps> = ({
  resumeToken,
  partner1,
  partner2,
  activePartner,
  invitedAlready = false,
  onShared,
  compact = false,
  className = "",
}) => {
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!resumeToken) return null;

  const otherPartnerSlot: PartnerSlot =
    activePartner === "partnerA" ? "partnerB" : "partnerA";
  const otherName = getPartnerDisplayName({ partner1, partner2 }, otherPartnerSlot);
  const myName = getPartnerDisplayName({ partner1, partner2 }, activePartner);

  const label = invitedAlready ? `Remind ${otherName}` : `Invite ${otherName}`;

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = buildResumeUrl(resumeToken);
    const shareText = `Hey ${otherName}, here's our ${STUDIO_NAME} wedding questionnaire link. Tap it to fill in your part — make sure you pick your own name!`;

    let sharedViaNative = false;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${myName} & ${otherName} — ${STUDIO_NAME}`,
          text: shareText,
          url,
        });
        sharedViaNative = true;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }

    if (!sharedViaNative) {
      const fullCopy = `${shareText}\n${url}`;
      try {
        await navigator.clipboard.writeText(fullCopy);
      } catch {
        try {
          const ta = document.createElement("textarea");
          ta.value = fullCopy;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        } catch {
          // ignore
        }
      }
    }

    onShared?.();
    setFeedback(sharedViaNative ? `Shared with ${otherName}` : "Invite link copied");
    window.setTimeout(() => setFeedback(null), 2600);
  };

  return (
    <button
      type="button"
      onClick={(e) => void handleShare(e)}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#DFD4C3] bg-[#FAF8F5] hover:bg-[#F2ECE1] text-[#1A1A1A] font-medium transition-colors cursor-pointer whitespace-nowrap ${
        compact
          ? "px-2.5 py-1.5 text-[11px] sm:text-xs min-h-[34px]"
          : "px-4 py-2.5 text-sm min-h-[44px]"
      } ${className}`}
    >
      {feedback ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <span>{feedback}</span>
        </>
      ) : (
        <>
          <Share2 className="w-3.5 h-3.5 text-[#9A7B4F] shrink-0" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
};

interface ModeSwitcherMenuProps {
  fillMode: FillMode;
  activePartner: PartnerSlot;
  partner1: string;
  partner2: string;
  onChangeMode: (mode: FillMode) => void;
  onChangePartner: (slot: PartnerSlot) => void;
}

/**
 * Compact header menu allowing couples to switch between "Together" and "Separately"
 * or switch which partner is filling without losing any saved answers.
 */
export const ModeSwitcherMenu: React.FC<ModeSwitcherMenuProps> = ({
  fillMode,
  activePartner,
  partner1,
  partner2,
  onChangeMode,
  onChangePartner,
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const nameA = (partner1 || "Partner 1").trim();
  const nameB = (partner2 || "Partner 2").trim();
  const currentName = activePartner === "partnerA" ? nameA : nameB;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E8E8E8] bg-[#FAF8F5] hover:border-[#B08D57] text-[11px] sm:text-xs font-medium text-[#1A1A1A] min-h-[34px] cursor-pointer whitespace-nowrap"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {fillMode === "separate" ? (
          <>
            <Smartphone className="w-3 h-3 text-[#9A7B4F] shrink-0" />
            <span className="max-w-[78px] truncate">{currentName}</span>
          </>
        ) : (
          <>
            <Users className="w-3 h-3 text-[#9A7B4F] shrink-0" />
            <span>Together</span>
          </>
        )}
        <ChevronDown className="w-3 h-3 text-[#7A756D] shrink-0" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 w-60 rounded-2xl bg-white border border-[#E8DFD3] shadow-lg p-2 z-50 space-y-1.5 text-left"
        >
          <div className="px-2.5 pt-1 pb-0.5 text-[10px] uppercase tracking-wider font-semibold text-[#7A756D]">
            Filling mode
          </div>
          <button
            type="button"
            onClick={() => {
              onChangeMode("together");
              setOpen(false);
            }}
            className={`w-full px-2.5 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer ${
              fillMode === "together"
                ? "bg-[#FAF7F2] text-[#1A1A1A] font-semibold"
                : "text-[#4A453E] hover:bg-[#FAF8F5]"
            }`}
          >
            <span className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-[#9A7B4F]" />
              Fill together on one device
            </span>
            {fillMode === "together" && <Check className="w-3.5 h-3.5 text-[#B08D57]" />}
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeMode("separate");
              setOpen(false);
            }}
            className={`w-full px-2.5 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer ${
              fillMode === "separate"
                ? "bg-[#FAF7F2] text-[#1A1A1A] font-semibold"
                : "text-[#4A453E] hover:bg-[#FAF8F5]"
            }`}
          >
            <span className="flex items-center gap-2">
              <Smartphone className="w-3.5 h-3.5 text-[#9A7B4F]" />
              Fill separately on own phones
            </span>
            {fillMode === "separate" && <Check className="w-3.5 h-3.5 text-[#B08D57]" />}
          </button>

          {fillMode === "separate" && (
            <>
              <div className="border-t border-[#EFECE6] my-1" />
              <div className="px-2.5 pt-1 pb-0.5 text-[10px] uppercase tracking-wider font-semibold text-[#7A756D]">
                Filling as
              </div>
              <button
                type="button"
                onClick={() => {
                  onChangePartner("partnerA");
                  setOpen(false);
                }}
                className={`w-full px-2.5 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer ${
                  activePartner === "partnerA"
                    ? "bg-[#FAF7F2] text-[#1A1A1A] font-semibold"
                    : "text-[#4A453E] hover:bg-[#FAF8F5]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <UserCheck className="w-3.5 h-3.5 text-[#9A7B4F]" />
                  {nameA}
                </span>
                {activePartner === "partnerA" && (
                  <Check className="w-3.5 h-3.5 text-[#B08D57]" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangePartner("partnerB");
                  setOpen(false);
                }}
                className={`w-full px-2.5 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer ${
                  activePartner === "partnerB"
                    ? "bg-[#FAF7F2] text-[#1A1A1A] font-semibold"
                    : "text-[#4A453E] hover:bg-[#FAF8F5]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <UserCheck className="w-3.5 h-3.5 text-[#9A7B4F]" />
                  {nameB}
                </span>
                {activePartner === "partnerB" && (
                  <Check className="w-3.5 h-3.5 text-[#B08D57]" />
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

interface SameForBothToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  partner1: string;
  partner2: string;
}

/**
 * Shown in Together mode (when ENABLE_SPLIT_MODE is ON) on per-person overlay questions.
 * Checked by default = single shared answer (fast & clean). Unchecked = separate inputs for each partner.
 */
export const SameForBothToggle: React.FC<SameForBothToggleProps> = ({
  checked,
  onChange,
  partner1,
  partner2,
}) => {
  return (
    <label className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#FAF8F5] border border-[#E8DFD3] cursor-pointer">
      <div className="space-y-0.5">
        <span className="block text-sm font-medium text-[#1A1A1A]">
          Same answer for both of us
        </span>
        <span className="block text-xs text-[#7A756D]">
          {checked
            ? "Uncheck if " + (partner1 || "Partner 1") + " and " + (partner2 || "Partner 2") + " want separate answers"
            : `Showing separate spaces for ${partner1 || "Partner 1"} and ${partner2 || "Partner 2"}`}
        </span>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-[#1A1A1A] cursor-pointer shrink-0"
      />
    </label>
  );
};

interface SharedFieldConflictBannerProps {
  otherPartnerName: string;
  onKeepTheirs: () => void;
  onUseMine: () => void;
}

/**
 * Gentle prompt shown only when both partners edited the exact same shared question
 * within a few seconds of each other.
 */
export const SharedFieldConflictBanner: React.FC<SharedFieldConflictBannerProps> = ({
  otherPartnerName,
  onKeepTheirs,
  onUseMine,
}) => {
  return (
    <div
      role="status"
      className="mb-4 p-4 rounded-2xl bg-[#FAF7F2] border border-[#DFD4C3] space-y-2.5"
    >
      <div className="flex items-start gap-2.5 text-sm text-[#1A1A1A]">
        <AlertCircle className="w-4 h-4 text-[#B08D57] shrink-0 mt-0.5" />
        <p className="font-medium leading-snug">
          {otherPartnerName} changed this a moment ago. Keep theirs or use yours?
        </p>
      </div>
      <div className="flex flex-wrap gap-2 pl-6">
        <button
          type="button"
          onClick={onKeepTheirs}
          className="px-3.5 py-1.5 rounded-xl bg-[#1A1A1A] text-white text-xs font-medium hover:bg-[#333333] cursor-pointer"
        >
          Keep {otherPartnerName}&apos;s
        </button>
        <button
          type="button"
          onClick={onUseMine}
          className="px-3.5 py-1.5 rounded-xl bg-white border border-[#DFD4C3] text-[#1A1A1A] text-xs font-medium hover:border-[#1A1A1A] cursor-pointer"
        >
          Use mine
        </button>
      </div>
    </div>
  );
};
