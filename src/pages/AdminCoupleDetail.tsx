/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Printer,
  Download,
  FileText,
  FileCode,
  ExternalLink,
  Star,
  CheckCircle2,
  X,
  Lock,
  Sparkles,
  Mic,
  Trash2,
  AlertTriangle,
  Users,
  HeartHandshake,
} from "lucide-react";
import { SubmissionRecord, SubmissionStatus } from "../types/questionnaire.ts";
import {
  getSubmissionById,
  updateSubmissionStatus,
  updateSubmissionNotes,
  updateSubmissionEditorialBrief,
  updateSubmissionInterviewQuestions,
  updateSubmissionCheatSheet,
  updateSubmissionCoupleLetter,
  deleteSubmission,
} from "../lib/submissions.ts";
import { ShootDayCheatSheet } from "../components/ShootDayCheatSheet.tsx";
import { EditorialBriefView } from "../components/EditorialBriefView.tsx";
import { CoupleInterviewView } from "../components/CoupleInterviewView.tsx";
import { CoupleLetterView } from "../components/CoupleLetterView.tsx";
import { synthesizeCoupleLetter } from "../utils/coupleLetterGenerator.ts";
import { exportToPdf, exportToDocx } from "../utils/exportBrief.ts";
import {
  LightboxModal,
  LightboxImage,
  SafeImageThumbnail,
  ThumbnailGallery,
  ReferenceLinksList,
} from "../components/MediaGallery.tsx";

interface AdminCoupleDetailProps {
  submissionId: string;
  onBack: () => void;
}

export const AdminCoupleDetail: React.FC<AdminCoupleDetailProps> = ({
  submissionId,
  onBack,
}) => {
  const [submission, setSubmission] = useState<SubmissionRecord | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Private notes autosave state
  const [notes, setNotes] = useState<string>("");
  const [notesSaveStatus, setNotesSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const notesDebounceRef = useRef<any>(null);

  // Download menu
  const [isDownloadOpen, setIsDownloadOpen] = useState<boolean>(false);

  // Active view tab: "letter" | "brief" | "cheatsheet" | "interview" | "full" | "all"
  const [activeTab, setActiveTab] = useState<"letter" | "brief" | "cheatsheet" | "interview" | "full" | "all">("letter");

  // Multi-image Lightbox modal state
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);

  const openLightbox = (images: LightboxImage[], startIndex: number = 0) => {
    setLightboxImages(images);
    setLightboxIndex(startIndex);
    setIsLightboxOpen(true);
  };

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Load submission on mount
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const record = await getSubmissionById(submissionId);
        if (isMounted) {
          if (record) {
            setSubmission(record);
            setNotes(record.privateNotes || "");
          } else {
            setError("Submission not found.");
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Failed to load submission.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [submissionId]);

  // Handle status update
  const handleStatusChange = async (newStatus: SubmissionStatus) => {
    if (!submission) return;
    setSubmission({ ...submission, status: newStatus });
    try {
      await updateSubmissionStatus(submission.id, newStatus);
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  // Handle private notes autosave
  const handleNotesChange = (text: string) => {
    setNotes(text);
    setNotesSaveStatus("saving");

    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
    notesDebounceRef.current = setTimeout(async () => {
      try {
        await updateSubmissionNotes(submissionId, text);
        setNotesSaveStatus("saved");
        setTimeout(() => setNotesSaveStatus("idle"), 2000);
      } catch (err) {
        console.error("Failed to save private notes:", err);
        setNotesSaveStatus("idle");
      }
    }, 800);
  };

  // Handle saving regenerated or edited editorial brief
  const handleSaveBrief = async (newBrief: string) => {
    if (!submission) return;
    setSubmission({ ...submission, editorialBrief: newBrief });
    try {
      await updateSubmissionEditorialBrief(submission.id, newBrief);
    } catch (err) {
      console.error("Failed to save editorial brief:", err);
    }
  };

  // Handle saving regenerated or edited interview questions
  const handleSaveInterview = async (newInterview: string) => {
    if (!submission) return;
    setSubmission({ ...submission, interviewQuestions: newInterview });
    try {
      await updateSubmissionInterviewQuestions(submission.id, newInterview);
    } catch (err) {
      console.error("Failed to save interview questions:", err);
    }
  };

  // Handle saving regenerated or edited shoot day cheat sheet
  const handleSaveCheatSheet = async (newCheatSheet: string) => {
    if (!submission) return;
    setSubmission({ ...submission, cheatSheet: newCheatSheet });
    try {
      await updateSubmissionCheatSheet(submission.id, newCheatSheet);
    } catch (err) {
      console.error("Failed to save shoot day cheat sheet:", err);
    }
  };

  // Handle saving regenerated or edited couple letter
  const handleSaveLetter = async (newLetter: string) => {
    if (!submission) return;
    setSubmission({ ...submission, coupleLetter: newLetter });
    try {
      await updateSubmissionCoupleLetter(submission.id, newLetter);
    } catch (err) {
      console.error("Failed to save couple letter:", err);
    }
  };

  // Permanently delete submission after confirmation
  const handleConfirmDelete = async () => {
    if (!submission) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteSubmission(submission.id);
      onBack();
    } catch (err: any) {
      console.error("Failed to delete submission:", err);
      setDeleteError(err?.message || "Failed to delete submission. Please try again.");
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#FAF8F5] text-[#1A1A1A] safe-bottom pb-16 animate-pulse">
        {/* Skeleton Top Bar */}
        <header className="bg-white border-b border-[#E5DDD2] sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#FAF7F2]" />
              <div className="w-12 h-6 rounded bg-[#FAF7F2]" />
              <div className="w-48 h-6 rounded bg-[#F2ECE1]" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-20 h-7 rounded-full bg-[#FAF7F2]" />
              <div className="w-24 h-7 rounded-xl bg-[#FAF7F2]" />
            </div>
          </div>
        </header>

        {/* Skeleton Content Area */}
        <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
          <div className="h-10 w-full max-w-md bg-white border border-[#E5DDD2] rounded-xl" />
          <div className="bg-white border border-[#E5DDD2] rounded-2xl p-6 sm:p-8 space-y-4 shadow-2xs">
            <div className="w-64 h-7 bg-[#F2ECE1] rounded-md" />
            <div className="space-y-2 pt-2">
              <div className="w-full h-4 bg-[#FAF7F2] rounded" />
              <div className="w-5/6 h-4 bg-[#FAF7F2] rounded" />
              <div className="w-3/4 h-4 bg-[#FAF7F2] rounded" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="min-h-[100dvh] bg-[#FAF8F5] p-6 flex flex-col items-center justify-center text-center space-y-4">
        <p className="text-red-700 font-medium">{error || "Couple not found."}</p>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-[#1A1A1A] text-white rounded-xl text-sm"
        >
          ← Back to Couples
        </button>
      </div>
    );
  }

  const ans = submission.answers;
  const p1 = submission.partner1 || "Partner 1";
  const p2 = submission.partner2 || "Partner 2";
  const familyMembers = ans.q10_people?.familyMembers || [];

  return (
    <div className="min-h-[100dvh] bg-[#FAF8F5] text-[#1A1A1A] safe-bottom pb-16">
      {/* Top Bar - Hidden when printing */}
      <header className="bg-white border-b border-[#E5DDD2] sticky top-0 z-30 shadow-2xs print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between gap-3">
          {/* Back button & Title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2 -ml-2 rounded-xl text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#FAF7F2] transition-colors cursor-pointer"
              title="Back to Couples"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-[#8C7043] bg-[#FAF7F2] px-2 py-1 rounded border border-[#E8DFD3]">
                {submission.displayId}
              </span>
              <h1 className="font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A]">
                {p1} &amp; {p2}
              </h1>
            </div>
          </div>

          {/* Actions: Status, Download, Print */}
          <div className="flex items-center gap-2.5">
            {/* Status Dropdown */}
            <select
              value={submission.status}
              onChange={(e) => handleStatusChange(e.target.value as SubmissionStatus)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer focus:outline-hidden ${
                submission.status === "new"
                  ? "bg-[#FFF9EE] text-[#B08D57] border-[#E5C388]"
                  : submission.status === "reviewed"
                  ? "bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]"
                  : "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]"
              }`}
            >
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="shared">Shared with team</option>
            </select>

            {/* Print Cheat Sheet */}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#1A1A1A] hover:text-white border border-[#E5DDD2] transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print Cheat Sheet</span>
            </button>

            {/* Download Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDownloadOpen(!isDownloadOpen)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-[#8C7043] bg-white hover:bg-[#FAF7F2] border border-[#E8DFD3] transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download</span>
              </button>

              {isDownloadOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-36 bg-white border border-[#E5DDD2] rounded-xl shadow-lg py-1 z-20 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDownloadOpen(false);
                      exportToPdf(submission);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-[#1A1A1A] hover:bg-[#FAF7F2] flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-red-600" />
                    <span>PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDownloadOpen(false);
                      exportToDocx(submission);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-[#1A1A1A] hover:bg-[#FAF7F2] flex items-center gap-2 cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5 text-blue-600" />
                    <span>Word (.docx)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Delete Submission */}
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setShowDeleteModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-red-600 bg-red-50/70 hover:bg-red-100 hover:text-red-700 border border-red-200/70 transition-colors cursor-pointer"
              title="Delete this submission"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-8">
        {/* View Mode Switcher Tabs */}
        <div className="flex items-center gap-2 border-b border-[#E5DDD2] pb-3 print:hidden overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab("letter")}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "letter"
                ? "bg-[#1A1A1A] text-white shadow-xs"
                : "text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#F2ECE4]"
            }`}
          >
            <HeartHandshake className="w-4 h-4 text-[#B08D57]" />
            <span>The Couple Letter</span>
          </button>

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
            <span>Full Responses (Q1–23)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ml-auto ${
              activeTab === "all"
                ? "bg-[#F2ECE4] text-[#1A1A1A] font-semibold"
                : "text-[#8C7043] hover:text-[#1A1A1A]"
            }`}
          >
            <span>Show All</span>
          </button>
        </div>

        {/* 0. THE COUPLE LETTER — Our Understanding of Your Wedding */}
        {(activeTab === "letter" || activeTab === "all") && (
          <section className="space-y-4">
            <CoupleLetterView
              letter={submission.coupleLetter || synthesizeCoupleLetter(submission.answers)}
              answers={submission.answers}
              coupleNames={`${p1} & ${p2}`}
              displayId={submission.displayId}
              weddingDate={submission.weddingDate}
              onSaveLetter={handleSaveLetter}
            />
          </section>
        )}

        {/* 1. EDITORIAL CREATIVE BRIEF */}
        {(activeTab === "brief" || activeTab === "all") && (
          <section className="space-y-4">
            <EditorialBriefView
              brief={submission.editorialBrief}
              answers={submission.answers}
              coupleNames={`${p1} & ${p2}`}
              weddingDate={submission.weddingDate}
              displayId={submission.displayId}
              onSaveBrief={handleSaveBrief}
            />
          </section>
        )}

        {/* 2. COUPLE INTERVIEW & TESTIMONIAL QUESTIONS (11 QUESTIONS) */}
        {(activeTab === "interview" || activeTab === "all") && (
          <section className="space-y-4">
            <CoupleInterviewView
              questionsText={submission.interviewQuestions}
              answers={submission.answers}
              coupleNames={`${p1} & ${p2}`}
              displayId={submission.displayId}
              onSaveInterview={handleSaveInterview}
            />
          </section>
        )}

        {/* 2. SHOOT DAY CHEAT SHEET */}
        {(activeTab === "cheatsheet" || activeTab === "all") && (
          <section className="space-y-3">
            <div className="flex items-center justify-between print:hidden">
              <h2 className="font-cormorant text-2xl font-semibold text-[#1A1A1A] flex items-center gap-2">
                <span>Shoot Day Cheat Sheet</span>
                <span className="text-xs font-sans font-normal text-[#8C7043] bg-[#FAF7F2] px-2 py-0.5 rounded-md border border-[#E8DFD3]">
                  1-Page Quick Summary
                </span>
              </h2>
              <button
                type="button"
                onClick={() => window.print()}
                className="text-xs text-[#8C7043] hover:underline font-medium cursor-pointer"
              >
                Print Clean A4 Page →
              </button>
            </div>

            <ShootDayCheatSheet
              submission={submission}
              cheatSheetText={submission.cheatSheet}
              onSaveCheatSheet={handleSaveCheatSheet}
            />
          </section>
        )}

        {/* 2. PRIVATE TEAM NOTES (Auto-saving) */}
        <section className="bg-white border border-[#E5DDD2] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-3 print:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#8C7043]" />
              <h3 className="font-cormorant text-xl font-semibold text-[#1A1A1A]">
                Private Team Notes
              </h3>
              <span className="text-xs text-[#7A756D]">
                (Only visible to our studio team)
              </span>
            </div>
            <div className="text-xs text-[#7A756D]">
              {notesSaveStatus === "saving" && <span>Saving...</span>}
              {notesSaveStatus === "saved" && (
                <span className="text-emerald-600 font-medium">✓ Saved</span>
              )}
            </div>
          </div>

          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            rows={3}
            placeholder="Add internal notes, shoot reminders, mehendi contact, or coordinator details..."
            className="w-full p-3.5 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-xl focus:outline-hidden focus:border-[#1A1A1A] focus:ring-1 focus:ring-[#B08D57] leading-relaxed"
          />
        </section>

        {/* 3. FULL ANSWERS GROUPED BY CHAPTER */}
        {(activeTab === "full" || activeTab === "all") && (
          <section className="space-y-8 print:hidden">
            <div className="border-b border-[#E5DDD2] pb-3">
            <h2 className="font-cormorant text-3xl font-semibold text-[#1A1A1A]">
              Full Questionnaire Responses
            </h2>
            <p className="text-sm text-[#7A756D] mt-0.5">
              Exact questions and complete answers provided by {p1} &amp; {p2}
            </p>
          </div>

          {/* CHAPTER 1: YOUR STORY */}
          <ChapterSection
            chapter="Chapter 1"
            title="Your Story"
            range="Questions 1–9"
          >
            {/* Q1 */}
            <AnswerBlock
              num={1}
              question="What do you call each other?"
              content={
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs text-[#7A756D] font-medium block mb-0.5">
                      {p1} calls {p2}:
                    </span>
                    <span className="font-medium text-[#1A1A1A]">
                      {ans.q1_calls?.aCallsB || <NotAnswered />}
                    </span>
                  </div>
                  <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs text-[#7A756D] font-medium block mb-0.5">
                      {p2} calls {p1}:
                    </span>
                    <span className="font-medium text-[#1A1A1A]">
                      {ans.q1_calls?.bCallsA || <NotAnswered />}
                    </span>
                  </div>
                </div>
              }
            />

            {/* Q2 */}
            <AnswerBlock
              num={2}
              question="What do you both do for living and what are you truly passionate about doing?"
              content={
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs text-[#7A756D] font-medium block mb-0.5">
                      {p1}'s work &amp; passions:
                    </span>
                    <p className="text-[#1A1A1A]">
                      {ans.q2_workPassion?.partnerA || <NotAnswered />}
                    </p>
                  </div>
                  <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs text-[#7A756D] font-medium block mb-0.5">
                      {p2}'s work &amp; passions:
                    </span>
                    <p className="text-[#1A1A1A]">
                      {ans.q2_workPassion?.partnerB || <NotAnswered />}
                    </p>
                  </div>
                </div>
              }
            />

            {/* Q3 */}
            <AnswerBlock
              num={3}
              question="How did you first meet?"
              content={<TextAnswer text={ans.q3_firstMeet} />}
            />

            {/* Q4 */}
            <AnswerBlock
              num={4}
              question="What was your first impression of each other?"
              content={
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs text-[#7A756D] font-medium block mb-0.5">
                      {p1}'s first impression of {p2}:
                    </span>
                    <p className="text-[#1A1A1A]">
                      {ans.q4_firstImpression?.partnerA || <NotAnswered />}
                    </p>
                  </div>
                  <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs text-[#7A756D] font-medium block mb-0.5">
                      {p2}'s first impression of {p1}:
                    </span>
                    <p className="text-[#1A1A1A]">
                      {ans.q4_firstImpression?.partnerB || <NotAnswered />}
                    </p>
                  </div>
                </div>
              }
            />

            {/* Q5 */}
            <AnswerBlock
              num={5}
              question="How would you describe yourselves as a couple in three words?"
              content={
                ans.q5_threeWords?.filter(Boolean).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {ans.q5_threeWords.map(
                      (w, idx) =>
                        w && (
                          <span
                            key={idx}
                            className="bg-[#FAF7F2] border border-[#E8DFD3] text-[#8C7043] px-3.5 py-1.5 rounded-full text-sm font-medium font-serif italic"
                          >
                            "{w}"
                          </span>
                        )
                    )}
                  </div>
                ) : (
                  <NotAnswered />
                )
              }
            />

            {/* Q6 */}
            <AnswerBlock
              num={6}
              question="What do you enjoy doing together?"
              content={
                <div className="space-y-2">
                  <ChipList items={ans.q6_activities?.selected || []} />
                  {ans.q6_activities?.other && (
                    <p className="text-sm text-[#4A453E]">
                      <span className="font-medium text-[#1A1A1A]">Also:</span>{" "}
                      {ans.q6_activities.other}
                    </p>
                  )}
                </div>
              }
            />

            {/* Q7 */}
            <AnswerBlock
              num={7}
              question="What do you love most about each other?"
              content={
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs text-[#7A756D] font-medium block mb-0.5">
                      What {p1} loves most about {p2}:
                    </span>
                    <p className="text-[#1A1A1A]">
                      {ans.q7_loveMost?.partnerA || <NotAnswered />}
                    </p>
                  </div>
                  <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs text-[#7A756D] font-medium block mb-0.5">
                      What {p2} loves most about {p1}:
                    </span>
                    <p className="text-[#1A1A1A]">
                      {ans.q7_loveMost?.partnerB || <NotAnswered />}
                    </p>
                  </div>
                </div>
              }
            />

            {/* Q8 */}
            <AnswerBlock
              num={8}
              question="Is there a funny story, inside joke, or special moment that defines your relationship?"
              content={<TextAnswer text={ans.q8_funnyStory} />}
            />

            {/* Q9 */}
            <AnswerBlock
              num={9}
              question="How did the proposal happen? (If applicable.)"
              content={<TextAnswer text={ans.q9_proposal?.story} />}
            />
          </ChapterSection>

          {/* CHAPTER 2: YOUR PEOPLE */}
          <ChapterSection
            chapter="Chapter 2"
            title="Your People"
            range="Question 10"
          >
            <AnswerBlock
              num={10}
              question="Who are the most important people you want us to capture please give a family tree?"
              content={
                <div className="space-y-5">
                  {familyMembers.length > 0 ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#4A453E] flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-[#8C7043]" />
                          <span>VIP Family Members &amp; Friends</span>
                        </span>
                        <span className="text-[11px] font-semibold text-[#8C7043] bg-[#FAF7F2] px-2 py-0.5 rounded-full border border-[#E8DFD3]">
                          {familyMembers.length} {familyMembers.length === 1 ? "person" : "people"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {familyMembers.map((m, mIdx) => (
                          <div
                            key={m.id || mIdx}
                            className={`p-3 rounded-xl border text-sm flex gap-3 items-center transition-all ${
                              m.mustCapture
                                ? "bg-[#FFFDF7] border-[#D4AF37] ring-1 ring-[#D4AF37]/30 shadow-2xs"
                                : "bg-[#FAF8F5] border-[#E8DFD3]"
                            }`}
                          >
                            {/* Member Photo or Initial Avatar */}
                            {m.photoUrl ? (
                              <SafeImageThumbnail
                                src={m.photoUrl}
                                alt={m.name}
                                onClick={() => {
                                  const memberImages: LightboxImage[] = familyMembers
                                    .filter((mem) => Boolean(mem.photoUrl))
                                    .map((mem) => ({
                                      url: mem.photoUrl!,
                                      title: mem.name,
                                      subtitle: `${mem.relationship} · ${
                                        mem.side === "sideA"
                                          ? `${p1}'s side`
                                          : mem.side === "sideB"
                                          ? `${p2}'s side`
                                          : "Both sides"
                                      }${mem.mustCapture ? " (★ Must Capture)" : ""}`,
                                    }));
                                  const targetIdx = memberImages.findIndex(
                                    (item) => item.url === m.photoUrl
                                  );
                                  openLightbox(memberImages, targetIdx >= 0 ? targetIdx : 0);
                                }}
                                className="w-14 h-14 shrink-0 rounded-lg"
                              />
                            ) : (
                              <div className="w-14 h-14 shrink-0 rounded-lg bg-[#F0EBE1] border border-[#E8DFD3] flex items-center justify-center font-cormorant font-semibold text-lg text-[#8C7043]">
                                {m.name ? m.name.charAt(0).toUpperCase() : "?"}
                              </div>
                            )}

                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-semibold text-[#1A1A1A] truncate text-sm">
                                  {m.name}
                                </span>
                              </div>
                              <div className="text-xs text-[#5F5F5F] truncate">
                                {m.relationship}
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                <span className="text-[10px] text-[#7A756D] bg-white px-1.5 py-0.5 rounded border border-[#E8DFD3]">
                                  {m.side === "sideA"
                                    ? `${p1}'s side`
                                    : m.side === "sideB"
                                    ? `${p2}'s side`
                                    : "Both"}
                                </span>
                                {m.mustCapture && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#8C7043] bg-[#FAF7F2] px-1.5 py-0.5 rounded border border-[#E8DFD3]">
                                    <Star className="w-2.5 h-2.5 fill-[#8C7043]" />
                                    Must capture
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <NotAnswered text="No individual VIP family members listed." />
                  )}

                  {/* Family Tree Sketch Preview */}
                  <div className="space-y-2 pt-2 border-t border-[#E8DFD3]/60">
                    <span className="text-xs font-semibold text-[#4A453E] block">
                      Uploaded Family Tree / Sketch:
                    </span>
                    {ans.q10_people?.treePhotoUrl ? (
                      <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3] inline-block">
                        <SafeImageThumbnail
                          src={ans.q10_people.treePhotoUrl}
                          alt="Uploaded Family Tree Sketch"
                          onClick={() =>
                            openLightbox([
                              {
                                url: ans.q10_people!.treePhotoUrl!,
                                title: "Family Tree Sketch",
                                subtitle: `Provided by ${p1} & ${p2}`,
                              },
                            ])
                          }
                          className="max-h-60 w-auto min-w-[200px]"
                        />
                        <div className="mt-2 flex items-center justify-between text-[11px] text-[#7A756D]">
                          <span>Click sketch to view full screen</span>
                          <span className="font-semibold text-[#8C7043]">1 image</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl border border-[#E8DFD3] bg-[#FAF8F5] text-xs text-[#7A756D] italic">
                        No family tree sketch uploaded.
                      </div>
                    )}
                  </div>

                  {/* Family Dynamics & Tree Notes */}
                  {ans.q10_people?.treeNotes && (
                    <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3] text-sm">
                      <span className="text-xs text-[#7A756D] font-medium block mb-1">
                        Family Dynamics &amp; Tree Notes:
                      </span>
                      <p className="text-[#1A1A1A] leading-relaxed">{ans.q10_people.treeNotes}</p>
                    </div>
                  )}
                </div>
              }
            />
          </ChapterSection>

          {/* CHAPTER 3: THE LOOK AND FEEL */}
          <ChapterSection
            chapter="Chapter 3"
            title="The Look and Feel"
            range="Questions 11–13"
          >
            {/* Q11 */}
            <AnswerBlock
              num={11}
              question="How do you want your wedding photographs and films to feel?"
              content={
                Array.isArray((ans.q11_filmFeel as any)?.selected) &&
                (ans.q11_filmFeel as any).selected.length > 0 ? (
                  <div className="space-y-2">
                    <ChipList items={(ans.q11_filmFeel as any).selected} />
                    {(ans.q11_filmFeel as any).other && (
                      <p className="text-sm text-[#4A453E]">
                        <span className="font-medium text-[#1A1A1A]">Other:</span>{" "}
                        {(ans.q11_filmFeel as any).other}
                      </p>
                    )}
                  </div>
                ) : typeof ans.q11_filmFeel === "string" && ans.q11_filmFeel ? (
                  <TextAnswer text={ans.q11_filmFeel} />
                ) : (
                  <NotAnswered />
                )
              }
            />


            {/* Q12 */}
            <AnswerBlock
              num={12}
              question="Are there any photographers, films, or Pinterest references you love?"
              content={
                <div className="space-y-4">
                  {ans.q12_references?.notes && (
                    <TextAnswer text={ans.q12_references.notes} />
                  )}

                  {/* Links as clickable chips opening in new tabs */}
                  {ans.q12_references?.links && ans.q12_references.links.length > 0 && (
                    <ReferenceLinksList links={ans.q12_references.links} />
                  )}

                  {/* Mood inspiration images */}
                  <ThumbnailGallery
                    images={ans.q12_references?.images || []}
                    titlePrefix="Reference Inspiration"
                    categoryLabel="Inspiration Photos &amp; Screenshots"
                    emptyLabel="No reference photos or screenshots uploaded."
                    onOpenImage={(idx) => {
                      const list: LightboxImage[] = (ans.q12_references?.images || []).map(
                        (img, i) => ({
                          url: img,
                          title: `Reference Mood Image ${i + 1}`,
                          subtitle: `Inspiration reference for ${p1} & ${p2}`,
                        })
                      );
                      openLightbox(list, idx);
                    }}
                  />
                </div>
              }
            />

            {/* Q13 */}
            <AnswerBlock
              num={13}
              question="What tone are you expecting to set for your wedding day"
              content={
                Array.isArray((ans.q13_tone as any)?.selected) &&
                (ans.q13_tone as any).selected.length > 0 ? (
                  <div className="space-y-2">
                    <ChipList items={(ans.q13_tone as any).selected} />
                    {(ans.q13_tone as any).other && (
                      <p className="text-sm text-[#4A453E]">
                        <span className="font-medium text-[#1A1A1A]">Other:</span>{" "}
                        {(ans.q13_tone as any).other}
                      </p>
                    )}
                  </div>
                ) : typeof ans.q13_tone === "string" && ans.q13_tone ? (
                  <TextAnswer text={ans.q13_tone} />
                ) : (
                  <NotAnswered />
                )
              }
            />
          </ChapterSection>

          {/* CHAPTER 4: YOUR DAY */}
          <ChapterSection
            chapter="Chapter 4"
            title="Your Day"
            range="Questions 14–17"
          >
            {/* Q14 */}
            <AnswerBlock
              num={14}
              question="What are the moments you are most looking forward to during your wedding?"
              content={
                <div className="space-y-2">
                  <ChipList items={ans.q14_moments?.selected || []} />
                  {ans.q14_moments?.other && (
                    <p className="text-sm text-[#4A453E]">
                      <span className="font-medium text-[#1A1A1A]">Other:</span>{" "}
                      {ans.q14_moments.other}
                    </p>
                  )}
                </div>
              }
            />

            {/* Q15 */}
            <AnswerBlock
              num={15}
              question="Is there anything you definitely want us to capture or avoid?"
              content={
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs text-[#059669] font-semibold block mb-0.5">
                      ✓ Definitely Capture:
                    </span>
                    <p className="text-[#1A1A1A]">
                      {ans.q15_captureAvoid?.definitelyCapture || <NotAnswered />}
                    </p>
                  </div>
                  <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs text-red-600 font-semibold block mb-0.5">
                      ✗ Please Avoid:
                    </span>
                    <p className="text-[#1A1A1A]">
                      {ans.q15_captureAvoid?.pleaseAvoid || <NotAnswered />}
                    </p>
                  </div>
                </div>
              }
            />

            {/* Q16 */}
            <AnswerBlock
              num={16}
              question="Please mention your non negotiables in your films and photographs?"
              content={<TextAnswer text={ans.q16_nonNegotiables} />}
            />

            {/* Q17 */}
            <AnswerBlock
              num={17}
              question="Who do you think is going to be more emotional during wedding?"
              content={<TextAnswer text={ans.q17_emotional} />}
            />
          </ChapterSection>

          {/* CHAPTER 5: WORKING TOGETHER */}
          <ChapterSection
            chapter="Chapter 5"
            title="Working Together"
            range="Questions 18–22"
          >
            {/* Q18 */}
            <AnswerBlock
              num={18}
              question="How versatile are you with the camera?"
              content={<TextAnswer text={ans.q18_cameraVersatility} />}
            />

            {/* Q19 */}
            <AnswerBlock
              num={19}
              question="What matters most to you when choosing a wedding photography and filmmaking team?"
              content={
                <div className="space-y-2">
                  <ChipList items={ans.q19_whatMattersMost?.selected || []} />
                  {ans.q19_whatMattersMost?.other && (
                    <p className="text-sm text-[#4A453E]">
                      <span className="font-medium text-[#1A1A1A]">Other:</span>{" "}
                      {ans.q19_whatMattersMost.other}
                    </p>
                  )}
                </div>
              }
            />

            {/* Q20 */}
            <AnswerBlock
              num={20}
              question="How comfortable are you with being guided or directed during portraits and filming?"
              content={<TextAnswer text={ans.q20_guidanceComfort} />}
            />

            {/* Q21 */}
            <AnswerBlock
              num={21}
              question="Is there anything that would help you feel more comfortable in front of the camera?"
              content={
                <div className="space-y-2">
                  <ChipList items={ans.q21_comfortTips?.selected || []} />
                  {ans.q21_comfortTips?.notes && (
                    <p className="text-sm text-[#4A453E]">
                      <span className="font-medium text-[#1A1A1A]">In their words:</span>{" "}
                      {ans.q21_comfortTips.notes}
                    </p>
                  )}
                </div>
              }
            />

            {/* Q22 */}
            <AnswerBlock
              num={22}
              question="What do you hope to feel when you watch your wedding film years from now?"
              content={<TextAnswer text={ans.q22_futureFeeling} />}
            />
          </ChapterSection>

          {/* CHAPTER 6: ONE LAST THING */}
          <ChapterSection
            chapter="Chapter 6"
            title="One Last Thing"
            range="Question 23"
          >
            <AnswerBlock
              num={23}
              question="Is there anything else you would love us to know about you, your story, or your wedding?"
              content={
                <div className="space-y-4">
                  {ans.q23_oneLastThing?.notes && (
                    <TextAnswer text={ans.q23_oneLastThing.notes} />
                  )}

                  {/* Attached Photos */}
                  <ThumbnailGallery
                    images={ans.q23_oneLastThing?.images || []}
                    titlePrefix="Attached Photo"
                    categoryLabel="Attached Photos"
                    emptyLabel="No additional photos attached."
                    onOpenImage={(idx) => {
                      const list: LightboxImage[] = (ans.q23_oneLastThing?.images || []).map(
                        (img, i) => ({
                          url: img,
                          title: `Attached Photo ${i + 1}`,
                          subtitle: `Shared by ${p1} & ${p2}`,
                        })
                      );
                      openLightbox(list, idx);
                    }}
                  />
                </div>
              }
            />
          </ChapterSection>
        </section>
        )}
      </main>

      {/* Full-Screen Multi-Image Lightbox Modal */}
      <LightboxModal
        images={lightboxImages}
        currentIndex={lightboxIndex}
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        onNavigate={(idx) => setLightboxIndex(idx)}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => {
            if (!isDeleting) {
              setShowDeleteModal(false);
              setDeleteError(null);
            }
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full border border-[#E5DDD2] shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isDeleting) {
                    setShowDeleteModal(false);
                    setDeleteError(null);
                  }
                }}
                disabled={isDeleting}
                className="p-1.5 rounded-lg text-[#7A756D] hover:text-[#1A1A1A] hover:bg-[#FAF7F2] transition-colors cursor-pointer disabled:opacity-50"
                title="Cancel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <h3 className="font-cormorant text-2xl font-semibold text-[#1A1A1A]">
                Delete Submission?
              </h3>
              <p className="text-xs text-[#5F5F5F] leading-relaxed">
                Are you sure you want to permanently delete the submission for{" "}
                <strong className="text-[#1A1A1A] font-semibold">
                  {p1} &amp; {p2}
                </strong>{" "}
                (<span className="font-mono text-[#8C7043] font-bold">{submission.displayId}</span>)?
              </p>
            </div>

            <div className="bg-red-50/80 border border-red-200 rounded-xl p-3 text-xs text-red-900 leading-relaxed flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>
                <strong>Warning:</strong> This cannot be undone. All questionnaire responses, editorial briefs, interview questions, cheat sheets, and uploaded images will be permanently removed.
              </span>
            </div>

            {deleteError && (
              <div className="p-2.5 bg-red-100 text-red-800 text-xs rounded-xl font-medium">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#F0EBE1]">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-medium text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#FAF7F2] rounded-xl border border-[#E5DDD2] transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// UI Helpers
const ChapterSection: React.FC<{
  chapter: string;
  title: string;
  range: string;
  children: React.ReactNode;
}> = ({ chapter, title, range, children }) => (
  <div className="bg-white border border-[#E5DDD2] rounded-2xl p-6 sm:p-8 shadow-2xs space-y-6">
    <div className="border-b border-[#E8DFD3] pb-3 flex items-center justify-between">
      <div>
        <span className="text-xs uppercase tracking-widest font-semibold text-[#8C7043]">
          {chapter}
        </span>
        <h3 className="font-cormorant text-2xl font-semibold text-[#1A1A1A]">
          {title}
        </h3>
      </div>
      <span className="text-xs text-[#7A756D]">{range}</span>
    </div>
    <div className="space-y-6">{children}</div>
  </div>
);

const AnswerBlock: React.FC<{
  num: number;
  question: string;
  content: React.ReactNode;
}> = ({ num, question, content }) => (
  <div className="space-y-2">
    <div className="text-sm font-semibold text-[#1A1A1A]">
      <span className="text-[#8C7043] mr-1.5">{num}.</span>
      {question}
    </div>
    <div>{content}</div>
  </div>
);

const TextAnswer: React.FC<{ text?: string }> = ({ text }) => {
  if (!text || !text.trim()) return <NotAnswered />;
  return (
    <p className="text-sm text-[#2A2A2A] leading-relaxed whitespace-pre-wrap">
      {text}
    </p>
  );
};

const ChipList: React.FC<{ items: string[] }> = ({ items }) => {
  if (!items || items.length === 0) return <NotAnswered />;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, idx) => (
        <span
          key={idx}
          className="inline-flex items-center gap-1 bg-[#FAF8F5] border border-[#E8DFD3] px-3 py-1 rounded-full text-xs font-medium text-[#2A2A2A]"
        >
          <CheckCircle2 className="w-3 h-3 text-[#8C7043]" />
          {item}
        </span>
      ))}
    </div>
  );
};

const NotAnswered: React.FC<{ text?: string }> = ({ text = "Not answered" }) => (
  <span className="text-xs text-[#9E988F] italic font-light">{text}</span>
);
