/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Copy,
  Check,
  Printer,
  RefreshCw,
  Edit2,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  Heart,
  Camera,
  Users,
  EyeOff,
  UserCheck,
  Zap,
} from "lucide-react";
import { SubmissionRecord } from "../types/questionnaire.ts";
import { STUDIO_NAME } from "../constants.ts";
import {
  parseCheatSheetDocument,
  generateCheatSheet,
  synthesizeCheatSheet,
} from "../utils/cheatSheetGenerator.ts";

interface ShootDayCheatSheetProps {
  submission: SubmissionRecord;
  cheatSheetText?: string;
  onSaveCheatSheet?: (newText: string) => Promise<void>;
  onPrint?: () => void;
  readOnly?: boolean;
}

export const ShootDayCheatSheet: React.FC<ShootDayCheatSheetProps> = ({
  submission,
  cheatSheetText: initialTextProp,
  onSaveCheatSheet,
  onPrint,
  readOnly = false,
}) => {
  const { answers } = submission;
  const p1 = (submission.partner1 || "Partner 1").trim();
  const p2 = (submission.partner2 || "Partner 2").trim();

  // Detect whether the stored cheatSheet is missing or uses the legacy format
  const rawSavedText = initialTextProp || submission.cheatSheet;
  const isLegacy = Boolean(
    !rawSavedText ||
      rawSavedText.includes("Who will cry first:") ||
      rawSavedText.includes("Camera Versatility:") ||
      rawSavedText.includes("Quiet Notes & Surprises") ||
      !rawSavedText.includes("01 — THE VIBE") ||
      !rawSavedText.includes("02 — TOP PRIORITIES")
  );

  const [currentText, setCurrentText] = useState<string>(
    isLegacy ? synthesizeCheatSheet(answers, STUDIO_NAME) : rawSavedText!
  );
  const [copied, setCopied] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedText, setEditedText] = useState<string>(currentText);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"card" | "plain">("card");

  // Auto-migrate legacy text to the new 150-220 word production standard on mount
  useEffect(() => {
    if (isLegacy && onSaveCheatSheet) {
      onSaveCheatSheet(currentText).catch(() => {});
    }
  }, [isLegacy]);

  // Sync if prop updates from outside
  useEffect(() => {
    if (rawSavedText && !isLegacy && rawSavedText !== currentText) {
      setCurrentText(rawSavedText);
      setEditedText(rawSavedText);
    }
  }, [rawSavedText, isLegacy]);

  const doc = parseCheatSheetDocument(currentText, p1, p2);

  // Approximate word count
  const wordCount = currentText
    .replace(/[#*—\-]/g, "")
    .split(/\s+/)
    .filter(Boolean).length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleRegenerate = async () => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    try {
      const regenerated = await generateCheatSheet(answers);
      setCurrentText(regenerated);
      setEditedText(regenerated);
      if (onSaveCheatSheet) {
        await onSaveCheatSheet(regenerated);
      }
      setSaveStatus("Regenerated & saved!");
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      console.error("Failed to regenerate cheat sheet:", err);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleSaveEdit = async () => {
    setCurrentText(editedText);
    setIsEditing(false);
    if (onSaveCheatSheet) {
      try {
        await onSaveCheatSheet(editedText);
        setSaveStatus("Saved changes!");
        setTimeout(() => setSaveStatus(null), 2500);
      } catch (err) {
        console.error("Failed to save edited cheat sheet:", err);
      }
    }
  };

  const handlePrint = () => {
    if (onPrint) onPrint();
    else window.print();
  };

  // Format date nicely
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "Date: TBD";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="cheat-sheet-root bg-white text-[#111111] font-sans border border-[#E5DDD2] rounded-2xl p-5 sm:p-8 shadow-xs max-w-4xl mx-auto print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none">
      {/* Top Studio Brand & Action Header */}
      <div className="border-b-2 border-[#1A1A1A] pb-4 mb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[10px] tracking-[0.25em] uppercase font-bold text-[#8C7043] print:text-black">
              {STUDIO_NAME} · SHOOT DAY CHEAT SHEET
            </span>
            <span className="text-[10px] tracking-widest font-mono text-[#5F5F5F] font-semibold bg-[#FAF7F2] px-1.5 py-0.5 rounded border border-[#E8DFD3] print:border-none">
              {submission.displayId}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 print:hidden">
              <Zap className="w-3 h-3 text-emerald-600" />
              30–60s crew scan (~{wordCount} words)
            </span>
          </div>

          <h1 className="font-cormorant text-3xl sm:text-4xl font-semibold text-[#1A1A1A] leading-tight">
            {p1} &amp; {p2}
          </h1>
          <p className="text-xs text-[#5F5F5F] font-sans mt-0.5">
            Quick production cue sheet for photography &amp; cinematography crew
          </p>
        </div>

        <div className="flex flex-col sm:items-end gap-1.5">
          <div className="text-left sm:text-right text-xs text-[#2A2A2A] space-y-0.5 print:text-right">
            <div className="font-semibold text-sm text-[#1A1A1A]">
              {formatDate(submission.weddingDate)}
            </div>
            {submission.phone && <div>📞 {submission.phone}</div>}
            {submission.email && <div>✉️ {submission.email}</div>}
          </div>

          {/* Quick Toolbar (Hidden on print) */}
          <div className="flex items-center gap-1.5 pt-1 print:hidden flex-wrap">
            <div className="inline-flex bg-[#FAF7F2] p-0.5 rounded-lg border border-[#E8DFD3] mr-1 text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                  viewMode === "card"
                    ? "bg-white text-[#1A1A1A] shadow-2xs font-semibold"
                    : "text-[#5F5F5F] hover:text-[#1A1A1A]"
                }`}
              >
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode("plain")}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                  viewMode === "plain"
                    ? "bg-white text-[#1A1A1A] shadow-2xs font-semibold"
                    : "text-[#5F5F5F] hover:text-[#1A1A1A]"
                }`}
              >
                Plain Text
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#2A2A2A] bg-[#FAF7F2] hover:bg-[#F0EAE1] rounded-lg border border-[#E8DFD3] transition-colors cursor-pointer"
              title="Copy Shoot Day Cheat Sheet"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#7A756D]" />
                  <span>Copy</span>
                </>
              )}
            </button>

            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#2A2A2A] bg-[#FAF7F2] hover:bg-[#F0EAE1] rounded-lg border border-[#E8DFD3] transition-colors cursor-pointer"
                  title="Edit text"
                >
                  <Edit2 className="w-3.5 h-3.5 text-[#7A756D]" />
                  <span>{isEditing ? "Cancel" : "Edit"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#8C7043] bg-[#FFF8E7] hover:bg-[#FCEFD0] rounded-lg border border-[#FFE082] transition-colors cursor-pointer disabled:opacity-60"
                  title="Regenerate cheat sheet with AI"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`}
                  />
                  <span>{isRegenerating ? "Writing..." : "Regenerate"}</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-[#1A1A1A] hover:bg-black rounded-lg transition-colors cursor-pointer shadow-2xs"
              title="Print clean 1-page A4 reference"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print A4</span>
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
              Edit Shoot Day Cheat Sheet (~150–220 words)
            </span>
            <span className="text-[11px] text-[#7A756D]">
              Keep headings (01 — THE VIBE, 02 — TOP PRIORITIES, etc.) intact
            </span>
          </div>
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            rows={18}
            className="w-full font-mono text-xs bg-white border border-[#E8DFD3] rounded-lg p-3.5 focus:outline-hidden focus:border-[#1A1A1A] leading-relaxed"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditedText(currentText);
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
        <div className="bg-[#FAF8F5] border border-[#E8DFD3] rounded-xl p-5 font-mono text-xs text-[#1A1A1A] whitespace-pre-wrap leading-relaxed select-all">
          {currentText}
        </div>
      ) : (
        /* Card View Mode: 6 Crisp Sections Designed for 30–60 Second Scanning */
        <div className="space-y-4 text-xs leading-relaxed">
          {/* SECTION 01: THE VIBE */}
          <div className="border border-[#E8DFD3] rounded-xl p-4 bg-[#FAF8F5]/80 print:bg-white print:border-gray-400">
            <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-2 mb-2.5 print:border-gray-300">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B08D57] print:bg-black inline-block" />
                <h2 className="font-cormorant font-bold text-sm tracking-wider uppercase text-[#1A1A1A]">
                  01 — The Vibe
                </h2>
              </div>
              <span className="text-[10px] font-semibold text-[#8C7043] uppercase tracking-wider">
                Visual Style &amp; Mood
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="inline-block bg-[#1A1A1A] text-white px-3 py-1 rounded-lg text-xs font-serif font-medium tracking-wide shadow-2xs print:bg-transparent print:text-black print:border print:border-black print:px-2">
                {doc.vibeWords || "Playful · Adventurous · Loving"}
              </div>
              <p className="text-[#2A2A2A] text-[13px] leading-relaxed pt-1">
                {doc.vibeDescription}
              </p>
            </div>
          </div>

          {/* 2-Column Grid for Sections 02 & 03 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2 print:gap-3">
            {/* SECTION 02: TOP PRIORITIES */}
            <div className="border border-[#E8DFD3] rounded-xl p-4 bg-[#FAF8F5]/80 print:bg-white print:border-gray-400 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-2 mb-2.5 print:border-gray-300">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#B08D57] print:bg-black inline-block" />
                    <h2 className="font-cormorant font-bold text-sm tracking-wider uppercase text-[#1A1A1A]">
                      02 — Top Priorities
                    </h2>
                  </div>
                  <span className="text-[10px] text-[#7A756D]">Crew focus</span>
                </div>

                <ul className="space-y-2">
                  {doc.topPriorities.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-[#2A2A2A]">
                      <span className="text-[#B08D57] font-bold text-sm leading-none mt-0.5 print:text-black">
                        •
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* SECTION 03: MUST-CAPTURE MOMENTS */}
            <div className="border border-[#E8DFD3] rounded-xl p-4 bg-[#FAF8F5]/80 print:bg-white print:border-gray-400 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-2 mb-2.5 print:border-gray-300">
                  <div className="flex items-center gap-2">
                    <Camera className="w-3.5 h-3.5 text-[#B08D57] print:text-black" />
                    <h2 className="font-cormorant font-bold text-sm tracking-wider uppercase text-[#1A1A1A]">
                      03 — Must-Capture Moments
                    </h2>
                  </div>
                  <span className="text-[10px] text-[#8C7043] font-medium">
                    Do not miss
                  </span>
                </div>

                <ul className="space-y-1.5">
                  {doc.mustCaptureMoments.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-[#2A2A2A]">
                      <span className="text-[#8C7043] font-bold text-sm leading-none mt-0.5 print:text-black">
                        *
                      </span>
                      <span className={idx === 0 ? "font-medium text-[#1A1A1A]" : ""}>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* 2-Column Grid for Sections 04 & 05 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2 print:gap-3">
            {/* SECTION 04: IMPORTANT PEOPLE */}
            <div className="border border-[#E8DFD3] rounded-xl p-4 bg-[#FAF8F5]/80 print:bg-white print:border-gray-400">
              <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-2 mb-2.5 print:border-gray-300">
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-[#B08D57] print:text-black" />
                  <h2 className="font-cormorant font-bold text-sm tracking-wider uppercase text-[#1A1A1A]">
                    04 — Important People
                  </h2>
                </div>
                <span className="text-[10px] text-[#7A756D]">VIP Family</span>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-1.5">
                  {doc.importantPeople.map((p, idx) => (
                    <div
                      key={idx}
                      className="bg-white/80 p-1.5 rounded-lg border border-[#E8DFD3]/80 text-[11px] flex items-center justify-between gap-1 print:bg-white print:border-gray-300"
                    >
                      <span className="font-semibold text-[#1A1A1A] truncate">
                        {p.name}
                      </span>
                      <span className="text-[#8C7043] font-medium text-[10px] shrink-0 print:text-black">
                        {p.relationship}
                      </span>
                    </div>
                  ))}
                </div>

                {doc.importantPeopleNote && (
                  <p className="text-[11px] text-[#4A453E] italic pt-1 border-t border-[#E8DFD3]/60 print:border-gray-200">
                    {doc.importantPeopleNote}
                  </p>
                )}
              </div>
            </div>

            {/* SECTION 05: PLEASE AVOID */}
            <div className="border border-red-200/80 rounded-xl p-4 bg-red-50/40 print:bg-white print:border-gray-400">
              <div className="flex items-center justify-between border-b border-red-200/60 pb-2 mb-2.5 print:border-gray-300">
                <div className="flex items-center gap-2">
                  <EyeOff className="w-3.5 h-3.5 text-red-600 print:text-black" />
                  <h2 className="font-cormorant font-bold text-sm tracking-wider uppercase text-red-950 print:text-black">
                    05 — Please Avoid
                  </h2>
                </div>
                <span className="text-[10px] font-semibold text-red-700 uppercase tracking-wider print:text-black">
                  Client Dislikes
                </span>
              </div>

              <ul className="space-y-1.5">
                {doc.pleaseAvoid.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-[#3A2222] print:text-black">
                    <span className="text-red-500 font-bold text-sm leading-none mt-0.5 print:text-black">
                      ✕
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* SECTION 06: WORKING WITH THE COUPLE */}
          <div className="border border-[#E8DFD3] rounded-xl p-4 bg-[#FAF8F5]/80 print:bg-white print:border-gray-400">
            <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-2 mb-2.5 print:border-gray-300">
              <div className="flex items-center gap-2">
                <UserCheck className="w-3.5 h-3.5 text-[#B08D57] print:text-black" />
                <h2 className="font-cormorant font-bold text-sm tracking-wider uppercase text-[#1A1A1A]">
                  06 — Working with the Couple
                </h2>
              </div>
              <span className="text-[10px] text-[#7A756D]">Comfort &amp; Direction</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {doc.workingWithCouple.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white/90 p-2 rounded-lg border border-[#E8DFD3] print:bg-white print:border-gray-300"
                >
                  <div className="text-[10px] uppercase font-bold text-[#8C7043] tracking-wider print:text-black">
                    {item.label}
                  </div>
                  <div className="text-[11px] font-medium text-[#1A1A1A] mt-0.5">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TECHNICAL NON-NEGOTIABLE (Separate highlight if present) */}
          {doc.technicalNonNegotiable && (
            <div className="border-2 border-[#B08D57] rounded-xl p-3.5 bg-[#FFF9EE] print:bg-white print:border-2 print:border-black">
              <div className="flex items-center gap-2 text-xs font-bold text-[#8C7043] uppercase tracking-wider mb-1 print:text-black">
                <AlertTriangle className="w-4 h-4 text-[#B08D57] print:text-black shrink-0" />
                <span>Technical Non-Negotiable</span>
              </div>
              <p className="text-xs font-medium text-[#1A1A1A] leading-relaxed pl-6">
                {doc.technicalNonNegotiable}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer bar */}
      <div className="mt-5 pt-3 border-t border-[#E8DFD3] flex items-center justify-between text-[10px] text-[#7A756D] print:border-gray-300">
        <span>Confidential · OAKS Wedding Photography &amp; Cinematography</span>
        <span>Target: 30–60 second scanning reference for shoot day crew</span>
      </div>
    </div>
  );
};
