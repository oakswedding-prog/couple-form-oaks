/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ArrowLeft, Check, Loader2, RefreshCw } from "lucide-react";
import { ACCENT_COLOR } from "../constants.ts";
import type { AutoSaveStatus, FillMode, PartnerSlot } from "../types/questionnaire.ts";
import { ResumeLinkButton } from "./ResumeLinkButton.tsx";
import { InvitePartnerButton, ModeSwitcherMenu } from "./SplitModeUI.tsx";

interface HeaderProps {
  currentStep: number;
  totalSteps: number;
  chapterTitle?: string;
  onBack: () => void;
  canGoBack: boolean;
  editingFromReview?: boolean;
  onReturnToReview?: () => void;
  autoSaveStatus?: AutoSaveStatus;
  resumeToken?: string | null;
  partner1?: string;
  partner2?: string;
  email?: string;
  splitModeEnabled?: boolean;
  fillMode?: FillMode;
  activePartner?: PartnerSlot;
  partnerACount?: number;
  partnerBCount?: number;
  invitedAlready?: boolean;
  onChangeFillMode?: (mode: FillMode) => void;
  onChangeActivePartner?: (slot: PartnerSlot) => void;
  onPartnerInvited?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentStep,
  totalSteps,
  chapterTitle,
  onBack,
  canGoBack,
  editingFromReview,
  onReturnToReview,
  autoSaveStatus = "idle",
  resumeToken = null,
  partner1,
  partner2,
  email,
  splitModeEnabled = false,
  fillMode = "together",
  activePartner = "partnerA",
  partnerACount,
  partnerBCount,
  invitedAlready = false,
  onChangeFillMode,
  onChangeActivePartner,
  onPartnerInvited,
}) => {
  const progressPercent =
    currentStep > 0 && currentStep <= totalSteps
      ? Math.round((currentStep / totalSteps) * 100)
      : currentStep > totalSteps
      ? 100
      : 0;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-[#E8E8E8]/70">
      {/* Thin Gold Progress Line */}
      <div className="w-full h-1 bg-[#E8E8E8]/50 overflow-hidden">
        <div
          className="h-full transition-all duration-300 ease-out"
          style={{
            width: `${progressPercent}%`,
            backgroundColor: ACCENT_COLOR,
          }}
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      <div className="max-w-[680px] mx-auto px-4 py-2.5 flex items-center justify-between gap-2 min-h-[56px]">
        {/* Back Button */}
        <div className="flex items-center gap-2 shrink-0">
          {canGoBack ? (
            <button
              onClick={onBack}
              type="button"
              className="flex items-center gap-1.5 px-3 py-2 -ml-2 rounded-xl text-[#1A1A1A] hover:bg-[#FAFAFA] active:bg-[#E8E8E8] transition-colors text-base font-medium min-h-[44px] cursor-pointer"
              aria-label="Go back to previous question"
            >
              <ArrowLeft className="w-5 h-5 text-[#1A1A1A]" />
              <span className="hidden sm:inline">Back</span>
            </button>
          ) : (
            <div className="w-8" />
          )}

          {chapterTitle && (
            <span className="text-xs uppercase tracking-widest font-semibold text-[#5F5F5F] px-2 py-1 bg-[#FAFAFA] border border-[#E8E8E8] rounded-md hidden md:inline-block">
              {chapterTitle}
            </span>
          )}
        </div>

        {/* Right Side: Editing return or Real Auto-Save + Resume Link */}
        {editingFromReview && onReturnToReview ? (
          <button
            onClick={onReturnToReview}
            type="button"
            className="text-xs sm:text-sm font-medium px-3 py-1.5 rounded-full bg-[#1A1A1A] text-white hover:bg-[#333333] transition-colors cursor-pointer"
          >
            Done · Return to Review
          </button>
        ) : (
          currentStep > 0 &&
          currentStep <= totalSteps && (
            <div className="flex items-center gap-2 sm:gap-2.5 text-sm text-[#5F5F5F] min-w-0">
              <span className="font-medium text-[#1A1A1A] whitespace-nowrap text-xs sm:text-sm">
                {currentStep} of {totalSteps}
              </span>

              {/* Real Firestore Auto-Save Status */}
              {autoSaveStatus === "saving" && (
                <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-[#7A756D] whitespace-nowrap">
                  <Loader2 className="w-3 h-3 animate-spin text-[#B08D57]" />
                  <span>Saving…</span>
                </span>
              )}
              {autoSaveStatus === "saved" && (
                <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-[#5F5F5F]/90 whitespace-nowrap">
                  <Check className="w-3.5 h-3.5 text-[#B08D57]" />
                  <span>Saved</span>
                </span>
              )}
              {autoSaveStatus === "retrying" && (
                <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-amber-700 whitespace-nowrap">
                  <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                  <span>Not saved, retrying</span>
                </span>
              )}

              {splitModeEnabled && fillMode === "separate" && resumeToken && (
                <InvitePartnerButton
                  resumeToken={resumeToken}
                  partner1={partner1 || "Partner 1"}
                  partner2={partner2 || "Partner 2"}
                  activePartner={activePartner}
                  invitedAlready={invitedAlready}
                  onShared={onPartnerInvited}
                  compact
                />
              )}

              {splitModeEnabled && onChangeFillMode && onChangeActivePartner && (
                <ModeSwitcherMenu
                  fillMode={fillMode}
                  activePartner={activePartner}
                  partner1={partner1 || "Partner 1"}
                  partner2={partner2 || "Partner 2"}
                  onChangeMode={onChangeFillMode}
                  onChangePartner={onChangeActivePartner}
                />
              )}

              {resumeToken && (!splitModeEnabled || fillMode !== "separate") && (
                <ResumeLinkButton
                  resumeToken={resumeToken}
                  partner1={partner1}
                  partner2={partner2}
                  email={email}
                  compact
                />
              )}
            </div>
          )
        )}
      </div>

      {/* Per-partner live progress strip (ONLY shown when ENABLE_SPLIT_MODE is ON and fillMode === "separate") */}
      {splitModeEnabled &&
        fillMode === "separate" &&
        currentStep > 0 &&
        currentStep <= totalSteps &&
        typeof partnerACount === "number" &&
        typeof partnerBCount === "number" && (
          <div className="bg-[#FAF8F5] border-t border-[#EFECE6] px-4 py-1.5">
            <div className="max-w-[680px] mx-auto flex items-center justify-between gap-2 text-[11px] sm:text-xs text-[#5F5F5F] tabular-nums">
              <span className="truncate">
                <strong className={activePartner === "partnerA" ? "text-[#1A1A1A]" : "font-medium"}>
                  {(partner1 || "Partner 1").trim()}: {partnerACount} of {totalSteps}
                </strong>
                <span className="mx-1.5 text-[#C4A474]">·</span>
                <strong className={activePartner === "partnerB" ? "text-[#1A1A1A]" : "font-medium"}>
                  {(partner2 || "Partner 2").trim()}: {partnerBCount} of {totalSteps}
                </strong>
              </span>
            </div>
          </div>
        )}
    </header>
  );
};
