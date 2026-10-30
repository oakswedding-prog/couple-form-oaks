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
} from "lucide-react";
import { SubmissionRecord, SubmissionStatus } from "../types/questionnaire.ts";
import {
  getSubmissionById,
  updateSubmissionStatus,
  updateSubmissionNotes,
} from "../lib/submissions.ts";
import { ShootDayCheatSheet } from "../components/ShootDayCheatSheet.tsx";
import { exportToPdf, exportToDocx } from "../utils/exportBrief.ts";

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

  // Image lightbox modal
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

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

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#FAF8F5] flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-2 border-[#B08D57] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#7A756D]">Loading couple's responses...</p>
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
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-10">
        {/* 1. SHOOT DAY CHEAT SHEET (Shown first as requested) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between print:hidden">
            <h2 className="font-cormorant text-2xl font-semibold text-[#1A1A1A] flex items-center gap-2">
              <span>Shoot Day Cheat Sheet</span>
              <span className="text-xs font-sans font-normal text-[#8C7043] bg-[#FAF7F2] px-2 py-0.5 rounded-md border border-[#E8DFD3]">
                1-Page Summary
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

          <ShootDayCheatSheet submission={submission} />
        </section>

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
                <div className="space-y-4">
                  {familyMembers.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {familyMembers.map((m) => (
                        <div
                          key={m.id}
                          className={`p-3.5 rounded-xl border text-sm space-y-1.5 ${
                            m.mustCapture
                              ? "bg-[#FFFDF7] border-[#D4AF37] ring-1 ring-[#D4AF37]/30"
                              : "bg-[#FAF8F5] border-[#E8DFD3]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#1A1A1A]">
                              {m.name}
                            </span>
                            {m.mustCapture && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#8C7043] bg-[#FAF7F2] px-2 py-0.5 rounded-full border border-[#E8DFD3]">
                                <Star className="w-3 h-3 fill-[#8C7043]" />
                                Must Capture
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[#5F5F5F]">
                            {m.relationship} ·{" "}
                            {m.side === "sideA"
                              ? `${p1}'s side`
                              : m.side === "sideB"
                              ? `${p2}'s side`
                              : "Both"}
                          </div>
                          {m.photoUrl && (
                            <img
                              src={m.photoUrl}
                              alt={m.name}
                              onClick={() => setEnlargedImage(m.photoUrl!)}
                              className="w-12 h-12 object-cover rounded-lg border border-[#E8DFD3] cursor-pointer mt-1"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <NotAnswered text="No individual family members listed." />
                  )}

                  {ans.q10_people?.treeNotes && (
                    <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3] text-sm">
                      <span className="text-xs text-[#7A756D] font-medium block mb-1">
                        Family Dynamics &amp; Tree Notes:
                      </span>
                      <p className="text-[#1A1A1A]">{ans.q10_people.treeNotes}</p>
                    </div>
                  )}

                  {ans.q10_people?.treePhotoUrl && (
                    <div>
                      <span className="text-xs text-[#7A756D] font-medium block mb-1.5">
                        Uploaded Family Tree / Sketch:
                      </span>
                      <img
                        src={ans.q10_people.treePhotoUrl}
                        alt="Family Tree"
                        onClick={() => setEnlargedImage(ans.q10_people!.treePhotoUrl!)}
                        className="max-h-48 rounded-xl border border-[#E8DFD3] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                      />
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
              content={<TextAnswer text={ans.q11_filmFeel} />}
            />

            {/* Q12 */}
            <AnswerBlock
              num={12}
              question="Are there any photographers, films, or Pinterest references you love?"
              content={
                <div className="space-y-3">
                  {ans.q12_references?.notes && (
                    <TextAnswer text={ans.q12_references.notes} />
                  )}

                  {/* Links as clickable chips */}
                  {ans.q12_references?.links?.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs text-[#7A756D] font-medium block">
                        Reference Links:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {ans.q12_references.links.map((lnk, idx) => (
                          <a
                            key={idx}
                            href={lnk}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-[#FAF7F2] border border-[#E8DFD3] text-[#8C7043] hover:text-[#1A1A1A] hover:bg-[#F2ECE1] transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span className="truncate max-w-xs">{lnk}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mood images */}
                  {ans.q12_references?.images?.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-xs text-[#7A756D] font-medium block">
                        Inspiration Photos:
                      </span>
                      <div className="flex flex-wrap gap-3">
                        {ans.q12_references.images.map((img, idx) => (
                          <img
                            key={idx}
                            src={img}
                            alt={`Reference ${idx + 1}`}
                            onClick={() => setEnlargedImage(img)}
                            className="w-24 h-24 object-cover rounded-xl border border-[#E8DFD3] cursor-pointer hover:opacity-90"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              }
            />

            {/* Q13 */}
            <AnswerBlock
              num={13}
              question="What tone are you expecting to set for your wedding day"
              content={<TextAnswer text={ans.q13_tone} />}
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
                <div className="space-y-3">
                  <TextAnswer text={ans.q23_oneLastThing?.notes} />
                  {ans.q23_oneLastThing?.images?.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-xs text-[#7A756D] font-medium block">
                        Attached Photos:
                      </span>
                      <div className="flex flex-wrap gap-3">
                        {ans.q23_oneLastThing.images.map((img, idx) => (
                          <img
                            key={idx}
                            src={img}
                            alt={`Photo ${idx + 1}`}
                            onClick={() => setEnlargedImage(img)}
                            className="w-24 h-24 object-cover rounded-xl border border-[#E8DFD3] cursor-pointer hover:opacity-90"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              }
            />
          </ChapterSection>
        </section>
      </main>

      {/* Lightbox Image Modal */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setEnlargedImage(null)}
        >
          <button
            type="button"
            onClick={() => setEnlargedImage(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 p-2"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={enlargedImage}
            alt="Enlarged reference"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
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
