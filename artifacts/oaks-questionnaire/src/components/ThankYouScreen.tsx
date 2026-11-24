/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Heart,
  RefreshCw,
  Loader2,
  AlertCircle,
  RotateCcw,
  Image as ImageIcon,
} from "lucide-react";
import { QuestionnaireAnswers } from "../types/questionnaire.ts";
import { STUDIO_NAME, STUDIO_LOGO_URL } from "../constants.ts";
import {
  getActivePendingOrFailedCount,
  getAllTrackedPhotoEntries,
  getPhotoCategoryLabel,
  MissingPhotoSlot,
  PhotoUploadEntry,
  retryBackgroundPhotoUpload,
  subscribePhotoUploads,
} from "../lib/photoUploadManager.ts";

interface ThankYouScreenProps {
  answers: QuestionnaireAnswers;
  initialPendingPhotos?: number;
  missingPhotoSlots?: MissingPhotoSlot[];
  onReaddMissingPhoto?: (stepNumber: number) => void;
  onReset: () => void;
}

export const ThankYouScreen: React.FC<ThankYouScreenProps> = ({
  answers,
  initialPendingPhotos = 0,
  missingPhotoSlots = [],
  onReaddMissingPhoto,
  onReset,
}) => {
  const p1 = answers.partner1 || "Partner 1";
  const p2 = answers.partner2 || "Partner 2";
  const coupleTitle = `${p1} & ${p2}`;

  const [trackedPhotos, setTrackedPhotos] = useState<PhotoUploadEntry[]>(() =>
    getAllTrackedPhotoEntries()
  );
  const [counts, setCounts] = useState(() => {
    const live = getActivePendingOrFailedCount();
    return {
      uploading: Math.max(live.uploading, initialPendingPhotos > 0 && live.uploading + live.failed + live.uploaded === 0 ? initialPendingPhotos : live.uploading),
      failed: live.failed,
      uploaded: live.uploaded,
    };
  });
  const [everHadPending] = useState<boolean>(
    () => initialPendingPhotos > 0 || getActivePendingOrFailedCount().uploading > 0 || getActivePendingOrFailedCount().failed > 0
  );

  useEffect(() => {
    const sync = () => {
      const live = getActivePendingOrFailedCount();
      setTrackedPhotos(getAllTrackedPhotoEntries());
      setCounts({
        uploading: live.uploading,
        failed: live.failed,
        uploaded: live.uploaded,
      });
    };
    sync();
    return subscribePhotoUploads(sync);
  }, []);

  const isStillUploading = counts.uploading > 0;
  const hasFailedPhotos = counts.failed > 0;
  const hasMissingSlots = missingPhotoSlots.length > 0;
  const isAllDone = !isStillUploading && !hasFailedPhotos && !hasMissingSlots;

  // Warn the couple before closing/refreshing the tab if any photos are still uploading
  useEffect(() => {
    if (!isStillUploading) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        "Your answers are saved, but photos are still uploading. Please keep this page open until they finish.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isStillUploading]);

  const showLivePhotoPanel =
    trackedPhotos.length > 0 &&
    (isStillUploading || hasFailedPhotos || everHadPending);

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
              {isStillUploading ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : (
                <CheckCircle2 className="w-8 h-8" />
              )}
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
              <p className="text-sm sm:text-base text-[#7A756D] max-w-lg mx-auto leading-relaxed">
                Thank you from both of you. OAKS Studio has everything and can&apos;t wait to be part of your wedding story.
              </p>
            </div>

            {/* Honest completion badge: ONLY says "All done" when every photo has finished uploading */}
            {isAllDone ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-xs font-medium text-[#065F46]">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>All done — responses &amp; photos received by {STUDIO_NAME}</span>
              </div>
            ) : isStillUploading ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200 text-xs font-medium text-amber-900">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                <span>
                  Uploading photos ({counts.uploaded} of{" "}
                  {counts.uploaded + counts.uploading + counts.failed} complete)
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200 text-xs font-medium text-amber-900">
                <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                <span>
                  Answers saved — {counts.failed + missingPhotoSlots.length}{" "}
                  {counts.failed + missingPhotoSlots.length === 1 ? "photo still pending" : "photos still pending"}
                </span>
              </div>
            )}

            {/* Required keep-open warning while photos are uploading */}
            {isStillUploading && (
              <div className="max-w-lg mx-auto p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-sm text-amber-950 font-medium flex items-start justify-center gap-2.5 text-left">
                <Loader2 className="w-4 h-4 animate-spin text-amber-700 shrink-0 mt-0.5" />
                <span>
                  Your answers are saved. Photos are still uploading, please keep this page open.
                </span>
              </div>
            )}

            {/* Live per-photo upload progress list */}
            {showLivePhotoPanel && (
              <div className="max-w-lg mx-auto text-left bg-[#FAF8F5] border border-[#E8DFD3] rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[#4A453E]">
                  <span className="inline-flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-[#8C7043]" />
                    <span>Photo upload progress</span>
                  </span>
                  <span className="tabular-nums text-[#8C7043]">
                    {counts.uploaded}/{trackedPhotos.length} uploaded
                  </span>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {trackedPhotos.map((entry) => {
                    const label = getPhotoCategoryLabel(entry.category);
                    return (
                      <div
                        key={entry.localToken}
                        className="bg-white border border-[#EDE6DC] rounded-xl px-3 py-2 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-[#1A1A1A] truncate">
                            {label}
                            {entry.fileName ? ` — ${entry.fileName}` : ""}
                          </span>

                          {entry.status === "uploaded" && (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Uploaded</span>
                            </span>
                          )}

                          {entry.status === "uploading" && (
                            <span className="text-[#8C7043] font-medium tabular-nums shrink-0">
                              {entry.waitingForAuth
                                ? "Connecting…"
                                : `${entry.progress}%`}
                            </span>
                          )}

                          {entry.status === "error" && (
                            <button
                              type="button"
                              onClick={() => {
                                void retryBackgroundPhotoUpload(entry.localToken).catch(() => {});
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FAF7F2] hover:bg-[#F2ECE1] border border-[#DFD4C3] text-[#1A1A1A] font-semibold cursor-pointer shrink-0"
                            >
                              <RotateCcw className="w-3 h-3 text-[#8C7043]" />
                              <span>Retry</span>
                            </button>
                          )}
                        </div>

                        {entry.status === "uploading" && (
                          <div className="w-full h-1.5 bg-[#F2ECE1] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#B08D57] transition-all duration-300"
                              style={{ width: `${Math.max(6, entry.progress)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Missing photos checklist (when reloaded after cleared storage or opened on another device) */}
            {hasMissingSlots && (
              <div className="max-w-lg mx-auto text-left bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-2.5">
                <p className="text-xs font-semibold text-amber-950">
                  These photos could not be found on this device and still need to be added:
                </p>
                <ul className="space-y-2">
                  {missingPhotoSlots.map((slot) => (
                    <li
                      key={slot.id}
                      className="flex items-center justify-between gap-2 bg-white border border-amber-200/80 rounded-xl px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-[#1A1A1A]">
                        {slot.label}
                      </span>
                      {onReaddMissingPhoto && (
                        <button
                          type="button"
                          onClick={() => onReaddMissingPhoto(slot.stepNumber)}
                          className="px-2.5 py-1 rounded-lg bg-[#1A1A1A] text-white font-semibold hover:bg-[#333333] transition-colors cursor-pointer shrink-0"
                        >
                          Re-add photo
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
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
              disabled={isStillUploading}
              className="inline-flex items-center gap-1.5 text-[#8C7043] hover:text-[#1A1A1A] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                isStillUploading
                  ? "Please wait for remaining photos to finish uploading"
                  : "Start a new questionnaire"
              }
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
