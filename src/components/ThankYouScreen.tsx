/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { CheckCircle2, Heart, RefreshCw, Loader2 } from "lucide-react";
import { QuestionnaireAnswers } from "../types/questionnaire.ts";
import { STUDIO_NAME, STUDIO_LOGO_URL } from "../constants.ts";
import {
  getActivePendingOrFailedCount,
  subscribePhotoUploads,
} from "../lib/photoUploadManager.ts";

interface ThankYouScreenProps {
  answers: QuestionnaireAnswers;
  initialPendingPhotos?: number;
  onReset: () => void;
}

export const ThankYouScreen: React.FC<ThankYouScreenProps> = ({
  answers,
  initialPendingPhotos = 0,
  onReset,
}) => {
  const p1 = answers.partner1 || "Partner 1";
  const p2 = answers.partner2 || "Partner 2";
  const coupleTitle = `${p1} & ${p2}`;

  const [pendingCounts, setPendingCounts] = useState(() => {
    const live = getActivePendingOrFailedCount();
    return {
      uploading: Math.max(live.uploading, initialPendingPhotos),
      failed: live.failed,
    };
  });

  useEffect(() => {
    return subscribePhotoUploads(() => {
      const live = getActivePendingOrFailedCount();
      setPendingCounts({
        uploading: live.uploading,
        failed: live.failed,
      });
    });
  }, []);

  const hasBackgroundPhotos = pendingCounts.uploading > 0 || pendingCounts.failed > 0;

  return (
    <div className="min-h-[100dvh] bg-[#FAF8F5] text-[#1A1A1A] flex flex-col safe-bottom">
      {/* Top Bar */}
      <header className="bg-white border-b border-[#E5DDD2] sticky top-0 z-30 shadow-2xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {STUDIO_LOGO_URL ? (
              <img
                src={STUDIO_LOGO_URL}
                alt={STUDIO_NAME}
                className="h-8 sm:h-9 w-auto object-contain"
              />
            ) : (
              <span className="font-cormorant text-xl font-bold tracking-wider text-[#1A1A1A]">
                {STUDIO_NAME}
              </span>
            )}
            <span className="text-xs uppercase tracking-widest text-[#8C7043] font-medium hidden sm:inline">
              · Submission Received
            </span>
          </div>
        </div>
      </header>

      {/* Main Confirmation Message */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-12">
        <div className="max-w-2xl w-full space-y-6">
          <section className="bg-white border border-[#E5DDD2] rounded-3xl p-8 sm:p-12 shadow-xs text-center space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#FAF7F2] border border-[#E8DFD3] text-[#B08D57]">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-3">
              <h1 className="font-cormorant text-3xl sm:text-4xl text-[#1A1A1A] font-semibold leading-tight">
                Thank you, {coupleTitle}
              </h1>
              <p className="text-base sm:text-lg text-[#5F5F5F] max-w-lg mx-auto leading-relaxed">
                Your questionnaire responses have been received and saved.
              </p>
              <p className="text-sm sm:text-base text-[#7A756D] max-w-lg mx-auto leading-relaxed">
                Thank you for taking the time to share your story, your people,
                and your vision with us. Our team will review everything carefully
                as we prepare to document your celebration.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-xs font-medium text-[#065F46]">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Responses saved &amp; received by {STUDIO_NAME}</span>
            </div>

            {hasBackgroundPhotos && (
              <div className="max-w-md mx-auto p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#E8DFD3] text-xs text-[#5C492A] flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#B08D57] shrink-0" />
                <span>
                  All your written answers are saved. A few photos are still finishing up in the background — keeping this tab open for a moment helps them complete.
                </span>
              </div>
            )}
          </section>

          {/* Subtle Footer */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#5F5F5F] px-2">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-[#B08D57] fill-[#B08D57]/20" />
              <span>Thank you for sharing your story with {STUDIO_NAME}.</span>
            </div>

            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 text-[#8C7043] hover:text-[#1A1A1A] transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Start new questionnaire</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
