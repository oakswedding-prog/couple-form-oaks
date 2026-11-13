/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  FileCode,
  Printer,
  Heart,
  RefreshCw,
  Sparkles,
  Mic,
  ChevronDown,
} from "lucide-react";
import { QuestionnaireAnswers, SubmissionRecord } from "../types/questionnaire.ts";
import { STUDIO_NAME, STUDIO_LOGO_URL, ACCENT_COLOR } from "../constants.ts";
import { generateBriefSummary } from "../utils/briefGenerator.ts";
import { synthesizeEditorialBrief } from "../utils/editorialBriefGenerator.ts";
import { synthesizeInterviewQuestions } from "../utils/interviewQuestionsGenerator.ts";
import { EditorialBriefView } from "./EditorialBriefView.tsx";
import { CoupleInterviewView } from "./CoupleInterviewView.tsx";
import { ShootDayCheatSheet } from "./ShootDayCheatSheet.tsx";
import { exportToPdf, exportToDocx } from "../utils/exportBrief.ts";

interface ThankYouScreenProps {
  answers: QuestionnaireAnswers;
  onReset: () => void;
}

export const ThankYouScreen: React.FC<ThankYouScreenProps> = ({
  answers,
  onReset,
}) => {
  const [activeTab, setActiveTab] = useState<"brief" | "interview" | "cheatsheet" | "full">("brief");
  const [isDownloadOpen, setIsDownloadOpen] = useState<boolean>(false);

  const p1 = answers.partner1 || "Partner 1";
  const p2 = answers.partner2 || "Partner 2";
  const coupleTitle = `${p1} & ${p2}`;

  const editorialBrief = synthesizeEditorialBrief(answers);
  const interviewQuestions = synthesizeInterviewQuestions(answers);
  const briefText = generateBriefSummary(STUDIO_NAME, answers);

  const submissionRecord: SubmissionRecord = {
    id: "submitted_today",
    sequenceNumber: 1,
    displayId: "#NEW",
    submittedAt: new Date().toISOString(),
    status: "new",
    partner1: p1,
    partner2: p2,
    weddingDate: answers.weddingDate || "",
    phone: answers.phone || "",
    email: answers.email || "",
    answers,
    editorialBrief,
    interviewQuestions,
    privateNotes: "",
  };

  const downloadJson = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(answers, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute(
      "download",
      `our-story-${p1.toLowerCase()}-${p2.toLowerCase()}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const downloadBriefTxt = () => {
    const dataStr =
      "data:text/plain;charset=utf-8," + encodeURIComponent(editorialBrief || briefText);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute(
      "download",
      `oaks-creative-brief-${p1.toLowerCase()}-${p2.toLowerCase()}.txt`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="min-h-[100dvh] bg-[#FAF8F5] text-[#1A1A1A] safe-bottom pb-20">
      {/* Top Bar */}
      <header className="bg-white border-b border-[#E5DDD2] sticky top-0 z-30 shadow-2xs print:hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between gap-3">
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

          {/* Action buttons: Download & Print */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportToPdf(submissionRecord)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#1A1A1A] hover:text-white border border-[#E5DDD2] transition-colors cursor-pointer"
              title="Download submission as PDF"
            >
              <FileText className="w-3.5 h-3.5 text-red-600" />
              <span className="hidden sm:inline">Download PDF</span>
            </button>

            {/* Download Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDownloadOpen(!isDownloadOpen)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium text-[#8C7043] bg-[#FAF7F2] hover:bg-[#F2ECE4] border border-[#E8DFD3] transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>

              {isDownloadOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-[#E5DDD2] rounded-xl shadow-lg py-1.5 z-20 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDownloadOpen(false);
                      exportToPdf(submissionRecord);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-[#1A1A1A] hover:bg-[#FAF7F2] flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-red-600" />
                    <span>PDF (Brief + Cheat Sheet)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsDownloadOpen(false);
                      exportToDocx(submissionRecord);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-[#1A1A1A] hover:bg-[#FAF7F2] flex items-center gap-2 cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5 text-blue-600" />
                    <span>Word Document (.docx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsDownloadOpen(false);
                      downloadBriefTxt();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-[#1A1A1A] hover:bg-[#FAF7F2] flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#8C7043]" />
                    <span>Editorial Brief (.txt)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsDownloadOpen(false);
                      downloadJson();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-[#1A1A1A] hover:bg-[#FAF7F2] flex items-center gap-2 cursor-pointer border-t border-[#F2ECE4] mt-1 pt-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Raw JSON Data</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* Warm Confirmation Hero */}
        <section className="bg-white border border-[#E5DDD2] rounded-3xl p-6 sm:p-10 shadow-xs text-center space-y-4 print:hidden">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#FAF7F2] border border-[#E8DFD3] text-[#B08D57]">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="font-cormorant text-3xl sm:text-4xl text-[#1A1A1A] font-semibold leading-tight">
              Thank you, {coupleTitle}
            </h1>
            <p className="text-sm sm:text-base text-[#5F5F5F] max-w-lg mx-auto leading-relaxed">
              Your questionnaire responses have been received and saved. Our editorial team
              has synthesized your story into the creative formats below.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-xs font-medium text-[#065F46]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Transmitted directly to OAKS WEDDING production crew</span>
          </div>
        </section>

        {/* View Mode Navigation Tabs */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-[#E5DDD2] pb-3 print:hidden overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab("brief")}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "brief"
                  ? "bg-[#1A1A1A] text-white shadow-xs"
                  : "text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#F2ECE4]"
              }`}
            >
              <Sparkles className="w-4 h-4 text-[#B08D57]" />
              <span>Editorial Creative Brief</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("interview")}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "interview"
                  ? "bg-[#1A1A1A] text-white shadow-xs"
                  : "text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#F2ECE4]"
              }`}
            >
              <Mic className="w-4 h-4 text-[#B08D57]" />
              <span>Couple Interview (11 Qs)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("cheatsheet")}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "cheatsheet"
                  ? "bg-[#1A1A1A] text-white shadow-xs"
                  : "text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#F2ECE4]"
              }`}
            >
              <Printer className="w-4 h-4 text-[#8C7043]" />
              <span>Shoot Day Cheat Sheet</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("full")}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "full"
                  ? "bg-[#1A1A1A] text-white shadow-xs"
                  : "text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#F2ECE4]"
              }`}
            >
              <FileText className="w-4 h-4 text-[#7A756D]" />
              <span>Full Responses (Q1–28)</span>
            </button>
          </div>

          {/* TAB 1: EDITORIAL CREATIVE BRIEF */}
          {activeTab === "brief" && (
            <div className="space-y-4">
              <EditorialBriefView
                brief={editorialBrief}
                answers={answers}
                coupleNames={coupleTitle}
                weddingDate={answers.weddingDate}
                readOnly={true}
              />
            </div>
          )}

          {/* TAB 2: COUPLE INTERVIEW & TESTIMONIAL QUESTIONS (11 QUESTIONS) */}
          {activeTab === "interview" && (
            <div className="space-y-4">
              <CoupleInterviewView
                questionsText={interviewQuestions}
                answers={answers}
                coupleNames={coupleTitle}
                readOnly={true}
              />
            </div>
          )}

          {/* TAB 2: SHOOT DAY CHEAT SHEET */}
          {activeTab === "cheatsheet" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between print:hidden">
                <h3 className="font-cormorant text-2xl font-semibold text-[#1A1A1A]">
                  Shoot Day Cheat Sheet
                </h3>
                <button
                  type="button"
                  onClick={() => exportToPdf(submissionRecord)}
                  className="text-xs text-[#8C7043] hover:underline font-medium cursor-pointer inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF →</span>
                </button>
              </div>
              <ShootDayCheatSheet submission={submissionRecord} />
            </div>
          )}

          {/* TAB 3: FULL RESPONSE DETAILS */}
          {activeTab === "full" && (
            <div className="bg-white border border-[#E5DDD2] rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
              <div className="border-b border-[#E8DFD3] pb-3">
                <h3 className="font-cormorant text-2xl font-semibold text-[#1A1A1A]">
                  Complete Submitted Responses
                </h3>
                <p className="text-xs text-[#7A756D] mt-0.5">
                  All 28 questionnaire answers recorded for {coupleTitle}
                </p>
              </div>

              <div className="divide-y divide-[#F2ECE4] space-y-4">
                {/* Story details */}
                <div className="pt-3 space-y-2">
                  <h4 className="text-xs uppercase tracking-wider font-semibold text-[#8C7043]">
                    Chapter 1: Your Story
                  </h4>
                  <p className="text-sm">
                    <strong>What you call each other:</strong> {p1} calls {p2} "{answers.q1_calls?.aCallsB || "—"}", {p2} calls {p1} "{answers.q1_calls?.bCallsA || "—"}"
                  </p>
                  <p className="text-sm">
                    <strong>First meet:</strong> {answers.q3_firstMeet || "—"}
                  </p>
                  <p className="text-sm">
                    <strong>Three words:</strong> {(answers.q5_threeWords || []).filter(Boolean).join(", ") || "—"}
                  </p>
                  <p className="text-sm">
                    <strong>Inside joke / funny moment:</strong> {answers.q8_funnyStory || "—"}
                  </p>
                </div>

                {/* People */}
                <div className="pt-4 space-y-2">
                  <h4 className="text-xs uppercase tracking-wider font-semibold text-[#8C7043]">
                    Chapter 2: Your People
                  </h4>
                  <p className="text-sm">
                    <strong>VIPs &amp; Family:</strong>{" "}
                    {(answers.q10_people?.familyMembers || [])
                      .map((m) => `${m.name} (${m.relationship})${m.mustCapture ? " [MUST]" : ""}`)
                      .join("; ") || "None specified"}
                  </p>
                  {answers.q10_people?.treeNotes && (
                    <p className="text-sm">
                      <strong>Family Notes:</strong> {answers.q10_people.treeNotes}
                    </p>
                  )}
                </div>

                {/* Look & Feel */}
                <div className="pt-4 space-y-2">
                  <h4 className="text-xs uppercase tracking-wider font-semibold text-[#8C7043]">
                    Chapter 3: Look and Feel
                  </h4>
                  <p className="text-sm">
                    <strong>Photo &amp; Film Feel:</strong>{" "}
                    {(answers.q11_filmFeel?.selected || []).join(", ") || "—"}
                  </p>
                  {answers.weddingOutfits?.notes && (
                    <p className="text-sm">
                      <strong>Wedding Outfits:</strong> {answers.weddingOutfits.notes}
                    </p>
                  )}
                  {answers.decorMoodBoard?.notes && (
                    <p className="text-sm">
                      <strong>Decor Mood Board:</strong> {answers.decorMoodBoard.notes}
                    </p>
                  )}
                  <p className="text-sm">
                    <strong>Wedding Tone:</strong>{" "}
                    {(answers.q13_tone?.selected || []).join(", ") || "—"}
                  </p>
                </div>

                {/* Working Together */}
                <div className="pt-4 space-y-2">
                  <h4 className="text-xs uppercase tracking-wider font-semibold text-[#8C7043]">
                    Chapter 4 &amp; 5: Working Together &amp; Your Day
                  </h4>
                  <p className="text-sm">
                    <strong>Key Moments:</strong> {(answers.q14_moments?.selected || []).join("; ") || "—"}
                  </p>
                  <p className="text-sm">
                    <strong>Definite captures:</strong> {answers.q15_captureAvoid?.definitelyCapture || "—"}
                  </p>
                  <p className="text-sm">
                    <strong>Please avoid:</strong> {answers.q15_captureAvoid?.pleaseAvoid || "—"}
                  </p>
                  <p className="text-sm">
                    <strong>Camera Comfort:</strong> {answers.q18_cameraVersatility || "—"}
                  </p>
                  <p className="text-sm">
                    <strong>Why OAKS Wedding:</strong> {answers.choosingOaks || "—"}
                  </p>
                  <p className="text-sm">
                    <strong>Future feeling:</strong> {answers.q22_futureFeeling || "—"}
                  </p>
                  <p className="text-sm">
                    <strong>Primary Point of Contact:</strong>{" "}
                    {answers.primaryContact?.role
                      ? `${answers.primaryContact.role}${
                          answers.primaryContact.role === "Someone else" &&
                          (answers.primaryContact.side || answers.primaryContact.gender)
                            ? ` (${[answers.primaryContact.side, answers.primaryContact.gender].filter(Boolean).join(", ")})`
                            : ""
                        } — ${answers.primaryContact.name || "—"} (${answers.primaryContact.phone || "—"})`
                      : "—"}
                  </p>
                  {answers.loveStoryNarrative && (
                    <p className="text-sm">
                      <strong>Your Story &amp; Journey:</strong> {answers.loveStoryNarrative}
                    </p>
                  )}
                  {answers.q23_oneLastThing?.notes && (
                    <p className="text-sm">
                      <strong>One Last Thing:</strong> {answers.q23_oneLastThing.notes}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Footer actions */}
        <div className="pt-8 border-t border-[#E8DFD3] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#5F5F5F] print:hidden">
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
      </main>
    </div>
  );
};
