/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  HeartHandshake,
  Copy,
  Check,
  Download,
  Loader2,
  RefreshCw,
  Edit2,
  CheckCircle2,
  MessageCircle,
  Mail,
  Send,
  Sparkles,
} from "lucide-react";
import { QuestionnaireAnswers } from "../types/questionnaire.ts";
import { STUDIO_NAME } from "../constants.ts";
import {
  generateCoupleLetter,
  synthesizeCoupleLetter,
  parseCoupleLetterDocument,
  upgradeCoupleLetterIfNeeded,
} from "../utils/coupleLetterGenerator.ts";
import { exportCoupleLetterPdf } from "../utils/exportBrief.ts";

interface CoupleLetterViewProps {
  letter?: string;
  answers: QuestionnaireAnswers;
  coupleNames: string;
  weddingDate?: string;
  phone?: string;
  email?: string;
  displayId?: string;
  onSaveLetter?: (newLetter: string) => Promise<void>;
  readOnly?: boolean;
}

export const CoupleLetterView: React.FC<CoupleLetterViewProps> = ({
  letter: initialLetterProp,
  answers,
  coupleNames,
  weddingDate,
  phone,
  email,
  displayId,
  onSaveLetter,
  readOnly = false,
}) => {
  const p1 = (answers.partner1 || "Partner 1").trim();
  const p2 = (answers.partner2 || "Partner 2").trim();

  const initialResult = useMemo(
    () => upgradeCoupleLetterIfNeeded(initialLetterProp, answers, STUDIO_NAME),
    [initialLetterProp, answers]
  );

  const [letterText, setLetterText] = useState<string>(initialResult.letter);

  const [copied, setCopied] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedText, setEditedText] = useState<string>(letterText);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"styled" | "plain">("styled");

  // Auto-persist synthesized or upgraded letter on mount if needed
  useEffect(() => {
    if (initialResult.wasUpgraded && !readOnly && onSaveLetter) {
      onSaveLetter(initialResult.letter).catch(() => {});
    }
  }, [initialLetterProp]);

  // Sync and auto-upgrade if prop updates from outside
  useEffect(() => {
    if (initialLetterProp && !isEditing) {
      const { letter: checkedLetter, wasUpgraded } = upgradeCoupleLetterIfNeeded(
        initialLetterProp,
        answers,
        STUDIO_NAME
      );
      if (checkedLetter !== letterText) {
        setLetterText(checkedLetter);
        setEditedText(checkedLetter);
      }
      if (wasUpgraded && !readOnly && onSaveLetter) {
        onSaveLetter(checkedLetter).catch(() => {});
      }
    }
  }, [initialLetterProp]);

  const parsedDoc = useMemo(
    () => parseCoupleLetterDocument(letterText, p1, p2),
    [letterText, p1, p2]
  );

  // Approximate word count
  const wordCount = useMemo(
    () =>
      letterText
        .replace(/[#*—\-]/g, "")
        .split(/\s+/)
        .filter(Boolean).length,
    [letterText]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(letterText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadPdf = async () => {
    if (isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    try {
      const dummyRecord = {
        id: displayId || "letter",
        displayId: displayId || "#000",
        partner1: p1,
        partner2: p2,
        weddingDate: weddingDate || "",
        phone: phone || "",
        email: email || "",
        answers,
        coupleLetter: letterText,
      } as any;
      await exportCoupleLetterPdf(dummyRecord, letterText);
    } catch (err) {
      console.error("Failed to export couple letter PDF:", err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleRegenerate = async () => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    setSaveStatus(null);
    try {
      const regenerated = await generateCoupleLetter(answers, { forceAI: true });
      setLetterText(regenerated);
      setEditedText(regenerated);
      if (onSaveLetter) {
        await onSaveLetter(regenerated);
      }
      setSaveStatus("Regenerated & saved with AI!");
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error("Failed to regenerate couple letter:", err);
      setSaveStatus("Regeneration fallback applied");
      setTimeout(() => setSaveStatus(null), 3000);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleSaveEdit = async () => {
    setLetterText(editedText);
    setIsEditing(false);
    if (onSaveLetter) {
      try {
        await onSaveLetter(editedText);
        setSaveStatus("Saved changes!");
        setTimeout(() => setSaveStatus(null), 2500);
      } catch (err) {
        console.error("Failed to save edited letter:", err);
      }
    }
  };

  // WhatsApp share link
  const cleanPhone = phone ? phone.replace(/[^\d+]/g, "") : "";
  const whatsappUrl = cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(letterText)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(letterText)}`;

  // Email client link
  const emailSubject = `Our Understanding of Your Wedding — ${STUDIO_NAME}`;
  const mailtoUrl = `mailto:${email || ""}?subject=${encodeURIComponent(
    emailSubject
  )}&body=${encodeURIComponent(letterText)}`;

  return (
    <div className="couple-letter-root bg-white text-[#1A1A1A] border border-[#E5DDD2] rounded-2xl p-4 sm:p-9 shadow-xs max-w-4xl mx-auto print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none">
      {/* Top Header & Action Bar */}
      <div className="border-b-2 border-[#1A1A1A] pb-4 mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] tracking-[0.25em] uppercase font-bold text-[#8C7043] print:text-black">
              {STUDIO_NAME} · CLIENT-FACING MESSAGE
            </span>
            {displayId && (
              <span className="text-[10px] tracking-widest font-mono text-[#5F5F5F] font-semibold bg-[#FAF7F2] px-1.5 py-0.5 rounded border border-[#E8DFD3] print:border-none">
                {displayId}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 print:hidden">
              <HeartHandshake className="w-3 h-3 text-emerald-600" />
              ~{wordCount} words · 2–3 min read for couple
            </span>
          </div>

          <h1 className="font-cormorant text-2xl sm:text-4xl font-semibold text-[#1A1A1A] leading-tight">
            THE COUPLE LETTER
          </h1>
          <p className="font-cormorant italic text-sm sm:text-lg text-[#8C7043] font-normal mt-0.5">
            Our Understanding of Your Wedding · {coupleNames}
          </p>
        </div>

        {/* Quick Actions Toolbar */}
        <div className="w-full sm:w-auto flex flex-col gap-2.5 print:hidden">
          {/* Row 1 on mobile: View Mode Toggle & Copy */}
          <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <div className="inline-flex bg-[#FAF7F2] p-0.5 rounded-lg border border-[#E8DFD3] text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode("styled")}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  viewMode === "styled"
                    ? "bg-white text-[#1A1A1A] shadow-2xs font-semibold"
                    : "text-[#5F5F5F] hover:text-[#1A1A1A]"
                }`}
              >
                Letter View
              </button>
              <button
                type="button"
                onClick={() => setViewMode("plain")}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  viewMode === "plain"
                    ? "bg-white text-[#1A1A1A] shadow-2xs font-semibold"
                    : "text-[#5F5F5F] hover:text-[#1A1A1A]"
                }`}
              >
                Plain Text
              </button>
            </div>

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2A2A2A] bg-[#FAF7F2] hover:bg-[#F0EAE1] rounded-lg border border-[#E8DFD3] transition-colors cursor-pointer shadow-2xs"
              title="Copy client-facing letter to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#7A756D]" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {/* Row 2: Client Delivery & Action Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* WhatsApp Send */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors cursor-pointer shadow-2xs"
              title="Open WhatsApp to send letter to the couple"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp</span>
            </a>

            {/* Email Send */}
            <a
              href={mailtoUrl}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors cursor-pointer shadow-2xs"
              title="Open Email draft to send letter to the couple"
            >
              <Mail className="w-3.5 h-3.5 text-blue-600" />
              <span>Email</span>
            </a>

            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#2A2A2A] bg-[#FAF7F2] hover:bg-[#F0EAE1] rounded-lg border border-[#E8DFD3] transition-colors cursor-pointer"
                  title="Edit letter text"
                >
                  <Edit2 className="w-3.5 h-3.5 text-[#7A756D]" />
                  <span>{isEditing ? "Cancel" : "Edit"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#8C7043] bg-[#FFF8E7] hover:bg-[#FCEFD0] rounded-lg border border-[#FFE082] transition-colors cursor-pointer disabled:opacity-60"
                  title="Regenerate letter with AI"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`}
                  />
                  <span>{isRegenerating ? "Writing..." : "Regenerate"}</span>
                </button>
              </>
            )}

            {/* Download PDF button (replacing Print A4) */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1A1A1A] hover:bg-black rounded-lg transition-colors cursor-pointer shadow-2xs disabled:opacity-60 mt-1 sm:mt-0"
              title="Download The Couple Letter as PDF"
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
      </div>

      {/* Save status notification */}
      {saveStatus && (
        <div className="mb-4 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-1.5 print:hidden">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{saveStatus}</span>
        </div>
      )}

      {/* Editing Mode */}
      {isEditing && (
        <div className="mb-6 bg-[#FAF8F5] border border-[#B08D57] rounded-xl p-4 space-y-3 print:hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#1A1A1A]">
              Edit The Couple Letter (~400–650 words)
            </span>
            <span className="text-[11px] text-[#7A756D]">
              Direct client-facing message for {coupleNames}
            </span>
          </div>
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            rows={22}
            className="w-full font-sans text-sm bg-white border border-[#E8DFD3] rounded-lg p-3.5 focus:outline-hidden focus:border-[#1A1A1A] leading-relaxed"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditedText(letterText);
                setIsEditing(false);
              }}
              className="px-3 py-1.5 text-xs text-[#5F5F5F] hover:text-[#1A1A1A] rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              className="px-4 py-1.5 text-xs font-medium text-white bg-[#1A1A1A] hover:bg-black rounded-lg shadow-2xs"
            >
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Plain Text View Mode */}
      {viewMode === "plain" && !isEditing ? (
        <div className="bg-[#FAF8F5] border border-[#E8DFD3] rounded-xl p-6 font-mono text-xs sm:text-sm text-[#1A1A1A] whitespace-pre-wrap leading-relaxed select-all">
          {letterText}
        </div>
      ) : (
        /* Styled Letter View Mode */
        <div className="couple-letter-card bg-[#FFFDF9] border border-[#EADFCF] rounded-2xl p-6 sm:p-10 shadow-2xs space-y-7 leading-relaxed font-sans print:border-none print:shadow-none print:p-0 print:bg-white">
          {/* Letterhead */}
          <div className="border-b border-[#EADFCF] pb-5 space-y-1">
            <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[#8C7043]">
              {p1.toUpperCase()} &amp; {p2.toUpperCase()}
            </div>
            <h2 className="font-cormorant text-2xl sm:text-3xl font-semibold text-[#1A1A1A] tracking-wide">
              OUR UNDERSTANDING OF YOUR WEDDING
            </h2>
            {weddingDate && (
              <p className="text-xs text-[#7A756D]">
                Wedding Date: {weddingDate}
              </p>
            )}
          </div>

          {/* Salutation & Opening Paragraph */}
          <div className="space-y-3 pt-1">
            <p className="font-cormorant text-xl sm:text-2xl font-medium text-[#1A1A1A]">
              {parsedDoc.salutation}
            </p>
            <p className="text-sm sm:text-[15px] text-[#2A2A2A] leading-relaxed">
              {parsedDoc.openingText ||
                "Thank you for taking the time to share your answers with us. We've gone through your responses, and we'd love to share what we've understood about you as a couple and how we'd like to approach your wedding photography and films."}
            </p>
          </div>

          {/* Structured Sections */}
          <div className="space-y-6 pt-2">
            {parsedDoc.sections.map((section, sIdx) => (
              <div key={sIdx} className="space-y-2.5">
                {section.title && (
                  <h3 className="font-cormorant text-base sm:text-lg font-bold tracking-[0.15em] uppercase text-[#8C7043] border-b border-[#F0EBE1] pb-1">
                    {section.title}
                  </h3>
                )}

                {section.paragraphs.map((p, pIdx) => (
                  <p
                    key={pIdx}
                    className="text-sm sm:text-[15px] text-[#2A2A2A] leading-relaxed"
                  >
                    {p}
                  </p>
                ))}

                {section.bulletPoints && section.bulletPoints.length > 0 && (
                  <ul className="space-y-1.5 pl-3 py-1">
                    {section.bulletPoints.map((item, bIdx) => (
                      <li
                        key={bIdx}
                        className="text-sm sm:text-[15px] text-[#2A2A2A] flex items-start gap-2.5 leading-relaxed"
                      >
                        <span className="text-[#B08D57] font-bold text-base leading-none mt-1">
                          •
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* OUR FINAL THOUGHT */}
          {parsedDoc.finalThought && (
            <div className="space-y-2.5 pt-3 border-t border-[#EADFCF]">
              <h3 className="font-cormorant text-base sm:text-lg font-bold tracking-[0.15em] uppercase text-[#8C7043] pb-1">
                OUR FINAL THOUGHT
              </h3>
              {parsedDoc.finalThought.split("\n\n").map((chunk, cIdx) => (
                <p
                  key={cIdx}
                  className="text-sm sm:text-[15px] text-[#2A2A2A] leading-relaxed"
                >
                  {chunk}
                </p>
              ))}
            </div>
          )}

          {/* Sign-off */}
          <div className="pt-4 border-t border-[#EADFCF] space-y-1 font-cormorant">
            <p className="text-base text-[#5F5F5F] italic">With love,</p>
            <p className="text-xl font-semibold text-[#1A1A1A] tracking-wide">
              Team {STUDIO_NAME}
            </p>
          </div>
        </div>
      )}

      {/* Footer bar */}
      <div className="mt-6 pt-3 border-t border-[#E8DFD3] flex items-center justify-between text-[10px] text-[#7A756D] print:border-gray-300">
        <span>Confidential client-facing message · {STUDIO_NAME}</span>
        <span>Ready to review and send to the couple</span>
      </div>
    </div>
  );
};
