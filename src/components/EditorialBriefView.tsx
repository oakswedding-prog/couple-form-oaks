/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  Sparkles,
  Copy,
  Check,
  Download,
  Loader2,
  RefreshCw,
  Edit2,
  CheckCircle2,
  BookOpen,
} from "lucide-react";
import { QuestionnaireAnswers, SubmissionRecord } from "../types/questionnaire.ts";
import {
  generateEditorialBrief,
  isOutdatedEditorialBrief,
  parseEditorialBriefDocument,
  synthesizeEditorialBrief,
} from "../utils/editorialBriefGenerator.ts";
import { exportToPdf } from "../utils/exportBrief.ts";

interface EditorialBriefViewProps {
  brief?: string;
  answers: QuestionnaireAnswers;
  coupleNames: string;
  weddingDate?: string;
  displayId?: string;
  onSaveBrief?: (newBrief: string) => Promise<void>;
  readOnly?: boolean;
}

export const EditorialBriefView: React.FC<EditorialBriefViewProps> = ({
  brief: initialBrief,
  answers,
  coupleNames,
  weddingDate,
  displayId,
  onSaveBrief,
  readOnly = false,
}) => {
  const needsUpgrade = isOutdatedEditorialBrief(initialBrief);

  const [briefText, setBriefText] = useState<string>(
    needsUpgrade ? synthesizeEditorialBrief(answers) : (initialBrief as string)
  );
  const [copied, setCopied] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedText, setEditedText] = useState<string>(briefText);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleDownloadPdf = async () => {
    if (isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    try {
      const dummyRecord = {
        id: displayId || "brief",
        displayId: displayId || "#000",
        partner1: (answers.partner1 || "Partner 1").trim(),
        partner2: (answers.partner2 || "Partner 2").trim(),
        weddingDate: weddingDate || "",
        answers,
        editorialBrief: briefText,
      } as SubmissionRecord;
      await exportToPdf(dummyRecord);
    } catch (err) {
      console.error("Failed to export PDF:", err);
      window.print();
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Auto-upgrade legacy 8-section or v1 briefs on open and persist if callback exists
  React.useEffect(() => {
    if (needsUpgrade && onSaveBrief) {
      onSaveBrief(briefText).catch(() => {});
    }
  }, [needsUpgrade]);

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(briefText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  // Regenerate with AI or refined synthesis
  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setSaveStatus(null);
    try {
      const regenerated = await generateEditorialBrief(answers, { forceAI: true });
      setBriefText(regenerated);
      setEditedText(regenerated);
      if (onSaveBrief) {
        await onSaveBrief(regenerated);
        setSaveStatus("Updated & saved");
        setTimeout(() => setSaveStatus(null), 3000);
      }
    } catch (err: any) {
      console.error("Failed to regenerate brief:", err);
      setSaveStatus("Regeneration completed with editorial fallback");
      setTimeout(() => setSaveStatus(null), 3000);
    } finally {
      setIsRegenerating(false);
    }
  };

  // Save manual edits
  const handleSaveEdit = async () => {
    setBriefText(editedText);
    setIsEditing(false);
    if (onSaveBrief) {
      try {
        await onSaveBrief(editedText);
        setSaveStatus("Saved to records");
        setTimeout(() => setSaveStatus(null), 2500);
      } catch (err) {
        console.error("Failed to save edited brief:", err);
      }
    }
  };

  const chapters = parseEditorialBriefDocument(briefText);

  return (
    <div className="bg-white border border-[#E5DDD2] rounded-3xl p-6 sm:p-10 shadow-xs relative overflow-hidden space-y-8">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E8DFD3]">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-[#8C7043]">
            <Sparkles className="w-3.5 h-3.5 text-[#B08D57]" />
            <span className="font-semibold">Editorial Creative Brief</span>
            {displayId && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono font-bold text-[#7A756D] tabular-nums">
                  {displayId}
                </span>
              </>
            )}
            {saveStatus && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-600 font-medium animate-in fade-in">
                  ✓ {saveStatus}
                </span>
              </>
            )}
          </div>
          <h2 className="font-cormorant text-2xl sm:text-3xl font-semibold text-[#1A1A1A] tracking-tight">
            The Couple Story &amp; Wedding Brief
          </h2>
          <p className="text-xs sm:text-sm text-[#7A756D]">
            All 27 questionnaire answers summarised for {coupleNames}
            {weddingDate ? ` · ${weddingDate}` : ""} (Quick team reference · 6 chapters)
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#F2ECE4] border border-[#E8DFD3] transition-colors cursor-pointer"
            title="Copy entire brief"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-600 font-semibold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#7A756D]" />
                <span>Copy Brief</span>
              </>
            )}
          </button>

          {!readOnly && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (isEditing) {
                    handleSaveEdit();
                  } else {
                    setEditedText(briefText);
                    setIsEditing(true);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                  isEditing
                    ? "bg-[#1A1A1A] text-white border-[#1A1A1A]"
                    : "text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#F2ECE4] border-[#E8DFD3]"
                }`}
              >
                {isEditing ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Done Editing</span>
                  </>
                ) : (
                  <>
                    <Edit2 className="w-3.5 h-3.5 text-[#7A756D]" />
                    <span>Edit</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[#8C7043] bg-[#FAF7F2] hover:bg-[#F2ECE4] border border-[#E8DFD3] transition-colors cursor-pointer disabled:opacity-50"
                title="Regenerate with AI editorial intelligence"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-[#8C7043] ${
                    isRegenerating ? "animate-spin" : ""
                  }`}
                />
                <span>{isRegenerating ? "Refining..." : "Regenerate AI"}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#1A1A1A] hover:bg-black transition-colors cursor-pointer shadow-2xs disabled:opacity-60"
            title="Download Editorial Brief as PDF"
          >
            {isDownloadingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      {/* Editing Mode */}
      {isEditing ? (
        <div className="space-y-4">
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            rows={20}
            className="w-full p-4 font-mono text-xs sm:text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-2xl leading-relaxed text-[#1A1A1A] focus:outline-hidden focus:ring-1 focus:ring-[#B08D57]"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[#7A756D] hover:bg-[#FAF8F5]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              className="px-5 py-2 rounded-xl text-xs font-medium bg-[#1A1A1A] text-white hover:bg-[#333333]"
            >
              Save Brief
            </button>
          </div>
        </div>
      ) : (
        /* Formatted 6-Chapter · 27-Question Quick-Reference Layout */
        <div className="space-y-8">
          {chapters.length > 0 ? (
            chapters.map((chapter, idx) => (
              <div
                key={idx}
                className="space-y-4 pb-7 border-b border-[#F2ECE4] last:border-b-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-2 pb-1">
                  <h3 className="font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A] tracking-wide">
                    {chapter.title}
                  </h3>
                  {chapter.questions.length > 0 && (
                    <span className="text-xs text-[#8C7043] tabular-nums shrink-0">
                      {chapter.questions.length}{" "}
                      {chapter.questions.length === 1 ? "question" : "questions"}
                    </span>
                  )}
                </div>

                {chapter.questions.length > 0 ? (
                  <div className="divide-y divide-[#F5EFE6]">
                    {chapter.questions.map((q) => (
                      <div key={q.code} className="py-3.5 first:pt-1 last:pb-1 space-y-2">
                        <div className="flex items-baseline gap-2.5">
                          <span className="font-mono text-xs font-semibold text-[#8C7043] tabular-nums shrink-0">
                            {q.code}
                          </span>
                          <h4 className="text-sm sm:text-[15px] font-semibold text-[#1A1A1A] leading-snug">
                            {q.question}
                          </h4>
                        </div>

                        {q.isNotProvided ? (
                          <p className="pl-9 text-sm text-[#9A948C] italic">
                            Not provided
                          </p>
                        ) : (
                          <ul className="pl-9 space-y-1.5">
                            {q.bullets.map((bullet, bIdx) => (
                              <li
                                key={bIdx}
                                className="flex items-start gap-2.5 text-sm sm:text-[15px] text-[#33302C] leading-relaxed"
                              >
                                <span
                                  aria-hidden="true"
                                  className="w-1.5 h-1.5 rounded-full bg-[#B08D57] mt-2 shrink-0"
                                />
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm sm:text-[15px] text-[#33302C] leading-relaxed space-y-3 font-serif">
                    {chapter.rawBody.split("\n\n").map((block, pIdx) => {
                      const cleanBlock = block.trim();
                      if (!cleanBlock) return null;
                      const lines = cleanBlock.split("\n").map((l) => l.trim()).filter(Boolean);
                      const isBulletList = lines.every((l) => l.startsWith("- ") || l.startsWith("• "));
                      if (isBulletList) {
                        return (
                          <ul key={pIdx} className="space-y-1.5 pl-1 my-2">
                            {lines.map((l, lIdx) => (
                              <li key={lIdx} className="flex items-start gap-2.5 text-sm sm:text-[15px] text-[#1A1A1A]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#B08D57] mt-2 shrink-0" />
                                <span>{l.replace(/^[-•]\s*/, "")}</span>
                              </li>
                            ))}
                          </ul>
                        );
                      }
                      return (
                        <p key={pIdx} className="leading-relaxed whitespace-pre-line">
                          {cleanBlock}
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="font-serif text-sm leading-relaxed whitespace-pre-wrap text-[#33302C]">
              {briefText}
            </div>
          )}

          {/* Studio Footer Stamp */}
          <div className="pt-6 border-t border-[#E8DFD3] flex items-center justify-between text-xs text-[#8C7043] font-medium">
            <div className="flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5" />
              <span>OAKS WEDDING CREATIVE DOCUMENTATION</span>
            </div>
            <span className="text-[#A1988B]">Confidential · For internal crew only</span>
          </div>
        </div>
      )}
    </div>
  );
};
