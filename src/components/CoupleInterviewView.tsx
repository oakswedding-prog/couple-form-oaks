/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  Mic,
  Copy,
  Check,
  Printer,
  RefreshCw,
  Edit2,
  CheckCircle2,
  Sparkles,
  HelpCircle,
  Video,
  Target,
  Sun,
  Flame,
  Moon,
  Compass,
} from "lucide-react";
import { QuestionnaireAnswers } from "../types/questionnaire.ts";
import {
  parseInterviewDocument,
  generateInterviewQuestions,
  synthesizeInterviewQuestions,
} from "../utils/interviewQuestionsGenerator.ts";

interface CoupleInterviewViewProps {
  questionsText?: string;
  answers: QuestionnaireAnswers;
  coupleNames: string;
  displayId?: string;
  onSaveInterview?: (newText: string) => Promise<void>;
  readOnly?: boolean;
}

export const CoupleInterviewView: React.FC<CoupleInterviewViewProps> = ({
  questionsText: initialQuestionsText,
  answers,
  coupleNames,
  displayId,
  onSaveInterview,
  readOnly = false,
}) => {
  // Detect if initial questions contain outdated v1 dramatic/copied phrases
  const isOutdatedV1 = Boolean(
    initialQuestionsText &&
      (initialQuestionsText.includes("rushing through your chest") ||
        initialQuestionsText.includes("eyes tell you that words never could") ||
        initialQuestionsText.includes("mean to your souls") ||
        initialQuestionsText.includes("hit your heart so profoundly") ||
        initialQuestionsText.includes("paths first crossed (") ||
        initialQuestionsText.includes("In private, you call each other"))
  );

  const [currentText, setCurrentText] = useState<string>(
    !initialQuestionsText || isOutdatedV1
      ? synthesizeInterviewQuestions(answers, "wedding")
      : initialQuestionsText
  );
  const [eventType, setEventType] = useState<"wedding" | "haldi" | "reception" | "general">("wedding");
  const [copied, setCopied] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedText, setEditedText] = useState<string>(currentText);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [completedQuestions, setCompletedQuestions] = useState<Record<number, boolean>>({});

  // Auto-save fresh v2 questions to database if v1 was detected on mount
  React.useEffect(() => {
    if (isOutdatedV1 && onSaveInterview) {
      onSaveInterview(currentText).catch(() => {});
    }
  }, [isOutdatedV1]);

  const p1 = (answers.partner1 || "Partner 1").trim();
  const p2 = (answers.partner2 || "Partner 2").trim();

  const doc = parseInterviewDocument(currentText, p1, p2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleEventTypeChange = async (newType: "wedding" | "haldi" | "reception" | "general") => {
    setEventType(newType);
    setIsRegenerating(true);
    setSaveStatus(null);
    try {
      const generated = await generateInterviewQuestions(answers, {
        eventType: newType,
        forceAI: false,
      });
      setCurrentText(generated);
      setEditedText(generated);
      if (onSaveInterview) {
        await onSaveInterview(generated);
      }
    } catch (err) {
      console.error("Failed to adapt questions:", err);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setSaveStatus(null);
    try {
      const regenerated = await generateInterviewQuestions(answers, {
        forceAI: true,
        eventType,
      });
      setCurrentText(regenerated);
      setEditedText(regenerated);
      if (onSaveInterview) {
        await onSaveInterview(regenerated);
        setSaveStatus("Saved to records");
        setTimeout(() => setSaveStatus(null), 3000);
      }
    } catch (err) {
      console.error("Failed to regenerate interview questions:", err);
      const fallback = synthesizeInterviewQuestions(answers, eventType);
      setCurrentText(fallback);
      setEditedText(fallback);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleSaveEdit = async () => {
    setCurrentText(editedText);
    setIsEditing(false);
    if (onSaveInterview) {
      try {
        await onSaveInterview(editedText);
        setSaveStatus("Saved changes");
        setTimeout(() => setSaveStatus(null), 2500);
      } catch (err) {
        console.error("Failed to save edited interview:", err);
      }
    }
  };

  const toggleQuestionComplete = (num: number) => {
    setCompletedQuestions((prev) => ({
      ...prev,
      [num]: !prev[num],
    }));
  };

  return (
    <div className="bg-white border border-[#E5DDD2] rounded-3xl p-6 sm:p-10 shadow-xs relative overflow-hidden space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E8DFD3]">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FAF7F2] text-[#8C7043] border border-[#E8DFD3]">
              <Mic className="w-3.5 h-3.5 text-[#B08D57]" />
              Documentary Interviewer Cues
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
            11 Personalized Testimonial &amp; Interview Questions
          </h2>
          <p className="text-xs sm:text-sm text-[#7A756D]">
            Crafted for videographers to capture authentic soundbites for {coupleNames}’s wedding film
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#F2ECE4] border border-[#E8DFD3] transition-colors cursor-pointer"
            title="Copy 11 questions"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-600 font-semibold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#7A756D]" />
                <span>Copy Questions</span>
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
                    setEditedText(currentText);
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
                title="Regenerate with AI"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-[#8C7043] ${
                    isRegenerating ? "animate-spin" : ""
                  }`}
                />
                <span>{isRegenerating ? "Generating..." : "Regenerate AI"}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[#7A756D] hover:text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#F2ECE4] border border-[#E8DFD3] transition-colors cursor-pointer"
            title="Print Interview Cue Sheet"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print Cue Sheet</span>
          </button>
        </div>
      </div>

      {/* Event Context Selector (Wedding Day, Haldi Day, Reception Night, General Couple Session) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAF8F5] p-3 rounded-2xl border border-[#E8DFD3] print:hidden">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-[#8C7043]" />
          <span className="text-xs font-semibold text-[#1A1A1A]">
            Adapt for Shoot Day Context:
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => handleEventTypeChange("wedding")}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              eventType === "wedding"
                ? "bg-[#1A1A1A] text-white shadow-2xs"
                : "bg-white text-[#5F5F5F] hover:text-[#1A1A1A] border border-[#E8DFD3]"
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <span>Wedding Day</span>
          </button>

          <button
            type="button"
            onClick={() => handleEventTypeChange("haldi")}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              eventType === "haldi"
                ? "bg-[#1A1A1A] text-white shadow-2xs"
                : "bg-white text-[#5F5F5F] hover:text-[#1A1A1A] border border-[#E8DFD3]"
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-orange-500" />
            <span>Haldi / Mehendi</span>
          </button>

          <button
            type="button"
            onClick={() => handleEventTypeChange("reception")}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              eventType === "reception"
                ? "bg-[#1A1A1A] text-white shadow-2xs"
                : "bg-white text-[#5F5F5F] hover:text-[#1A1A1A] border border-[#E8DFD3]"
            }`}
          >
            <Moon className="w-3.5 h-3.5 text-indigo-500" />
            <span>Reception Night</span>
          </button>

          <button
            type="button"
            onClick={() => handleEventTypeChange("general")}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              eventType === "general"
                ? "bg-[#1A1A1A] text-white shadow-2xs"
                : "bg-white text-[#5F5F5F] hover:text-[#1A1A1A] border border-[#E8DFD3]"
            }`}
          >
            <Video className="w-3.5 h-3.5 text-emerald-600" />
            <span>Couple Session</span>
          </button>
        </div>
      </div>

      {/* Editing Mode */}
      {isEditing ? (
        <div className="space-y-4">
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            rows={22}
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
              Save Questions
            </button>
          </div>
        </div>
      ) : (
        /* The 11 Questions List */
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            {doc.questions.map((q) => {
              const isChecked = !!completedQuestions[q.number];
              const isBride = q.askTarget.toLowerCase().includes("bride");
              const isGroom = q.askTarget.toLowerCase().includes("groom") && !isBride;
              const isBoth = q.askTarget.toLowerCase().includes("both") || (isBride && q.askTarget.toLowerCase().includes("groom"));

              return (
                <div
                  key={q.number}
                  className={`border rounded-2xl p-5 sm:p-6 transition-all ${
                    isChecked
                      ? "bg-[#FAF7F2]/40 border-[#E5DDD2] opacity-75"
                      : "bg-white border-[#E8DFD3] shadow-2xs hover:border-[#B08D57]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-[#1A1A1A] text-white">
                        {String(q.number).padStart(2, "0")}
                      </span>
                      <h3 className="font-cormorant text-lg sm:text-xl font-semibold text-[#1A1A1A] tracking-wide">
                        {q.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                          isBoth
                            ? "bg-[#FAF7F2] text-[#8C7043] border-[#E8DFD3]"
                            : isBride
                            ? "bg-rose-50 text-rose-800 border-rose-200"
                            : isGroom
                            ? "bg-blue-50 text-blue-800 border-blue-200"
                            : "bg-[#F5F2ED] text-[#5F5F5F] border-[#E8DFD3]"
                        }`}
                      >
                        Ask: {q.askTarget}
                      </span>

                      <button
                        type="button"
                        onClick={() => toggleQuestionComplete(q.number)}
                        className="print:hidden p-1 text-[#A1988B] hover:text-emerald-600 transition-colors cursor-pointer"
                        title={isChecked ? "Mark as unasked" : "Mark as recorded"}
                      >
                        <CheckCircle2
                          className={`w-5 h-5 ${
                            isChecked ? "text-emerald-600 fill-emerald-100" : ""
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Primary Question */}
                  <p className="font-serif text-base sm:text-lg text-[#1A1A1A] leading-relaxed mb-3 pl-1">
                    "{q.question}"
                  </p>

                  {/* Follow-up Cue */}
                  {q.followUp && (
                    <div className="bg-[#FAF8F5] border border-[#F2ECE4] rounded-xl px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-[#5F5F5F]">
                      <Sparkles className="w-3.5 h-3.5 text-[#B08D57] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-[#8C7043] mr-1">
                          Follow-up cue:
                        </span>
                        <span>"{q.followUp}"</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* INTERVIEW DIRECTION */}
          {doc.direction && (
            <div className="bg-[#FAF7F2] border border-[#E8DFD3] rounded-2xl p-5 sm:p-7 space-y-3">
              <div className="flex items-center gap-2 text-[#8C7043]">
                <Compass className="w-4 h-4" />
                <h4 className="font-cormorant text-xl font-semibold text-[#1A1A1A]">
                  Interview Direction for Videographers
                </h4>
              </div>
              <div className="text-xs sm:text-sm text-[#4A453E] leading-relaxed whitespace-pre-wrap space-y-2 font-sans">
                {doc.direction}
              </div>
            </div>
          )}

          {/* THE CREATIVE OBJECTIVE */}
          {doc.creativeObjective && (
            <div className="border border-[#E8DFD3] rounded-2xl p-5 sm:p-6 bg-white space-y-2">
              <div className="flex items-center gap-2 text-[#8C7043]">
                <Target className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider font-semibold text-[#8C7043]">
                  The Creative Objective
                </span>
              </div>
              <p className="font-serif italic text-sm sm:text-base text-[#1A1A1A] leading-relaxed">
                "{doc.creativeObjective}"
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
