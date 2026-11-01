/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  Sparkles,
  Copy,
  Check,
  Printer,
  RefreshCw,
  Edit2,
  CheckCircle2,
  BookOpen,
} from "lucide-react";
import { QuestionnaireAnswers } from "../types/questionnaire.ts";
import { generateEditorialBrief, synthesizeEditorialBrief } from "../utils/editorialBriefGenerator.ts";

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
  // If initialBrief is missing or contains the outdated copied-answers boilerplate from v1, use the fresh v2 brief
  const isOutdatedV1 = Boolean(
    initialBrief &&
      (initialBrief.includes("bring a distinctive energy") ||
        initialBrief.includes("CREATIVE DIRECTION SUMMARY") ||
        initialBrief.includes("Their proposal unfolded with personal significance"))
  );

  const [briefText, setBriefText] = useState<string>(
    !initialBrief || isOutdatedV1 ? synthesizeEditorialBrief(answers) : initialBrief
  );
  const [copied, setCopied] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedText, setEditedText] = useState<string>(briefText);

  // If outdated brief was upgraded on mount, persist it to storage
  React.useEffect(() => {
    if (isOutdatedV1 && onSaveBrief) {
      onSaveBrief(briefText).catch(() => {});
    }
  }, [isOutdatedV1]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

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

  // Parse sections for beautiful editorial presentation
  const parseSections = (text: string) => {
    const parsed: { title: string; body: string }[] = [];

    // Check if the text uses ================================================== dividers (Riya & Roshan benchmark format)
    if (text.includes("====")) {
      const pattern = /={20,}\s*\n([^\n]+)\n\s*={20,}/g;
      const titles: { title: string; index: number; length: number }[] = [];
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        titles.push({
          title: m[1].trim(),
          index: m.index,
          length: m[0].length,
        });
      }

      for (let i = 0; i < titles.length; i++) {
        const cur = titles[i];
        const nextIndex = i + 1 < titles.length ? titles[i + 1].index : text.length;
        const body = text.substring(cur.index + cur.length, nextIndex).trim();
        parsed.push({
          title: cur.title,
          body,
        });
      }
    } else {
      // Markdown ### fallback
      const rawSections = text.split(/(?=###\s+)/);
      for (const chunk of rawSections) {
        const match = chunk.match(/###\s+(.+)\n([\s\S]*)/);
        if (match) {
          parsed.push({
            title: match[1].trim(),
            body: match[2].trim(),
          });
        }
      }
    }

    return parsed;
  };

  const sections = parseSections(briefText);

  return (
    <div className="bg-white border border-[#E5DDD2] rounded-3xl p-6 sm:p-10 shadow-xs relative overflow-hidden space-y-8">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E8DFD3]">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FAF7F2] text-[#8C7043] border border-[#E8DFD3]">
              <Sparkles className="w-3.5 h-3.5 text-[#B08D57]" />
              Editorial Creative Brief
            </span>
            {displayId && (
              <span className="font-mono text-xs font-bold text-[#7A756D] bg-[#F5F2ED] px-2 py-0.5 rounded">
                {displayId}
              </span>
            )}
            {saveStatus && (
              <span className="text-xs text-emerald-600 font-medium animate-in fade-in">
                ✓ {saveStatus}
              </span>
            )}
          </div>
          <h2 className="font-cormorant text-2xl sm:text-3xl font-semibold text-[#1A1A1A] tracking-tight">
            The Couple Story &amp; Wedding Brief
          </h2>
          <p className="text-xs sm:text-sm text-[#7A756D]">
            Simple, human wedding brief for {coupleNames}
            {weddingDate ? ` · ${weddingDate}` : ""} (2–3 min read · ~350–500 words)
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
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[#7A756D] hover:text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#F2ECE4] border border-[#E8DFD3] transition-colors cursor-pointer"
            title="Print Brief"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print</span>
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
        /* Formatted Editorial Brief Magazine Layout */
        <div className="space-y-8">
          {sections.length > 0 ? (
            sections.map((sec, idx) => (
              <div
                key={idx}
                className="space-y-2.5 pb-6 border-b border-[#F2ECE4] last:border-b-0 last:pb-0"
              >
                <div className="flex items-center gap-2">
                  <h3 className="font-cormorant text-lg sm:text-xl font-semibold text-[#1A1A1A] tracking-wide">
                    {sec.title}
                  </h3>
                </div>
                <div className="text-sm sm:text-[15px] text-[#33302C] leading-relaxed space-y-3 font-serif">
                  {sec.body.split("\n\n").map((block, pIdx) => {
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
