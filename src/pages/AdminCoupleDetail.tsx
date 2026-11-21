/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ArrowLeft,
  Printer,
  Download,
  FileText,
  FileCode,
  Star,
  CheckCircle2,
  X,
  Lock,
  Sparkles,
  Mic,
  Trash2,
  AlertTriangle,
  HeartHandshake,
  Link2,
  Check,
  Clock,
  Image as ImageIcon,
  AlertCircle,
  CircleDashed,
} from "lucide-react";
import {
  DraftRecord,
  SubmissionErrorRecord,
  SubmissionRecord,
  SubmissionStatus,
} from "../types/questionnaire.ts";
import {
  getCachedSubmissionById,
  getSubmissionRecordFast,
  hasUnresolvedMediaPaths,
  resolveSubmissionMedia,
  updateSubmissionStatus,
  updateSubmissionNotes,
  updateSubmissionEditorialBrief,
  updateSubmissionInterviewQuestions,
  updateSubmissionCheatSheet,
  updateSubmissionCoupleLetter,
  deleteSubmission,
  getSubmissionDeliveryState,
  getSubmissionAttentionReasons,
  ensureResumeLinkForSubmission,
} from "../lib/submissions.ts";
import { getSubmissionErrors } from "../lib/errorLogger.ts";
import { getAllAdminDrafts } from "../lib/drafts.ts";
import { isPrivatePreviewOrigin } from "../lib/coupleSession.ts";
import { buildNormalizedPhotoReport } from "../utils/photoStatusSummary.ts";
import { ShootDayCheatSheet } from "../components/ShootDayCheatSheet.tsx";
import { EditorialBriefView } from "../components/EditorialBriefView.tsx";
import { CoupleInterviewView } from "../components/CoupleInterviewView.tsx";
import { CoupleLetterView } from "../components/CoupleLetterView.tsx";
import { synthesizeCoupleLetter } from "../utils/coupleLetterGenerator.ts";
import { exportToPdf, exportToDocx } from "../utils/exportBrief.ts";
import { getGroupedQ10People } from "../utils/familyPeople.ts";
import { getGroupedWardrobe } from "../utils/wardrobe.ts";
import { getGroupedDecorEvents } from "../utils/decorEvents.ts";
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
  type DetailTab = "letter" | "brief" | "cheatsheet" | "interview" | "full" | "all";
  const initialCached = useMemo(
    () => getCachedSubmissionById(submissionId),
    [submissionId]
  );

  const [submission, setSubmission] = useState<SubmissionRecord | null>(
    () => initialCached
  );
  const [isLoading, setIsLoading] = useState<boolean>(() => !initialCached);
  const [error, setError] = useState<string | null>(null);

  // Private notes autosave state
  const [notes, setNotes] = useState<string>(() => initialCached?.privateNotes || "");
  const [notesSaveStatus, setNotesSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const notesDebounceRef = useRef<any>(null);

  // Download menu
  const [isDownloadOpen, setIsDownloadOpen] = useState<boolean>(false);

  // Active view tab & visited tab cache so switching back/forth is 0ms
  const [activeTab, setActiveTab] = useState<DetailTab>("letter");
  const [visitedTabs, setVisitedTabs] = useState<Set<DetailTab>>(
    () => new Set(["letter"])
  );

  const selectTab = (tab: DetailTab) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => {
      if (tab === "all") {
        if (
          prev.has("letter") &&
          prev.has("brief") &&
          prev.has("interview") &&
          prev.has("cheatsheet") &&
          prev.has("full")
        ) {
          return prev;
        }
        return new Set(["letter", "brief", "interview", "cheatsheet", "full"]);
      }
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  };

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

  // Delivery health diagnostics, error log & admin resume-link copy state
  const [errorLogs, setErrorLogs] = useState<SubmissionErrorRecord[]>([]);
  const [allDrafts, setAllDrafts] = useState<DraftRecord[]>([]);
  const [copyingResume, setCopyingResume] = useState<boolean>(false);
  const [copiedResume, setCopiedResume] = useState<boolean>(false);
  const [resumeCopyNotice, setResumeCopyNotice] = useState<string | null>(null);
  const [showAllPhotoStatuses, setShowAllPhotoStatuses] = useState<boolean>(true);

  // Load submission fast without blocking UI on Firebase Storage getDownloadURL calls
  useEffect(() => {
    let isMounted = true;
    const cached = getCachedSubmissionById(submissionId);
    setActiveTab("letter");
    setVisitedTabs(new Set(["letter"]));

    if (cached) {
      setSubmission(cached);
      setNotes(cached.privateNotes || "");
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    setError(null);

    async function loadData() {
      try {
        const raw = await getSubmissionRecordFast(submissionId);
        if (!isMounted) return;
        if (!raw) {
          setError("Submission not found.");
          setIsLoading(false);
          return;
        }
        setSubmission(raw);
        setNotes(raw.privateNotes || "");
        setIsLoading(false);

        if (hasUnresolvedMediaPaths(raw)) {
          resolveSubmissionMedia(raw)
            .then((resolved) => {
              if (isMounted && resolved) {
                setSubmission((prev) =>
                  prev && prev.id === resolved.id ? { ...resolved, status: prev.status, privateNotes: prev.privateNotes } : resolved
                );
              }
            })
            .catch(() => {});
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Failed to load submission.");
          setIsLoading(false);
        }
      }
    }
    loadData();
    getSubmissionErrors(100)
      .then((list) => {
        if (isMounted) setErrorLogs(list);
      })
      .catch(() => {});
    getAllAdminDrafts()
      .then((list) => {
        if (isMounted) setAllDrafts(list);
      })
      .catch(() => {});
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

  // Admin-only: copy working resume link for this couple (works on any phone/browser, no login required)
  const handleCopyResumeLink = async () => {
    if (!submission) return;
    setCopyingResume(true);
    try {
      const { token, url } = await ensureResumeLinkForSubmission(submission, allDrafts);
      setSubmission((prev) => (prev ? { ...prev, resumeToken: token, finalized: false } : prev));
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedResume(true);
      setResumeCopyNotice(
        isPrivatePreviewOrigin(url)
          ? "Link copied. Tip: Copy from your live Vercel dashboard when sharing with clients (AI Studio preview URLs only open for your Google account)."
          : "Resume link copied — this couple can open it on any phone or browser with no email login needed to edit answers or add photos."
      );
      window.setTimeout(() => setCopiedResume(false), 2800);
    } catch (err) {
      console.error("Could not copy resume link:", err);
    } finally {
      setCopyingResume(false);
    }
  };

  const groupedQ10 = useMemo(
    () => (submission?.answers ? getGroupedQ10People(submission.answers.q10_people) : null),
    [submission?.answers]
  );
  const groupedWardrobe = useMemo(
    () => (submission?.answers ? getGroupedWardrobe(submission.answers) : null),
    [submission?.answers]
  );
  const groupedDecor = useMemo(
    () => (submission?.answers ? getGroupedDecorEvents(submission.answers) : null),
    [submission?.answers]
  );
  const photoReport = useMemo(
    () => buildNormalizedPhotoReport(submission?.answers, submission?.photoStatuses),
    [submission?.answers, submission?.photoStatuses]
  );

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
  const deliveryState = getSubmissionDeliveryState(submission, errorLogs);
  const attentionReasons = getSubmissionAttentionReasons(submission, errorLogs);

  return (
    <div className="min-h-[100dvh] bg-[#FAF8F5] text-[#1A1A1A] safe-bottom pb-16">
      {/* Top Bar - Hidden when printing */}
      <header className="bg-white border-b border-[#E5DDD2] sticky top-0 z-30 shadow-2xs print:hidden">
        {/* Desktop Header */}
        <div className="hidden sm:flex max-w-6xl mx-auto px-6 h-18 items-center justify-between gap-3">
          {/* Back button & Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="p-2 -ml-2 rounded-xl text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#FAF7F2] transition-colors cursor-pointer shrink-0"
              title="Back to Couples"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-xs font-bold text-[#8C7043] bg-[#FAF7F2] px-2 py-1 rounded border border-[#E8DFD3] shrink-0">
                {submission.displayId || "Unnumbered"}
              </span>
              <h1 className="font-cormorant text-2xl font-semibold text-[#1A1A1A] truncate">
                {p1} &amp; {p2}
              </h1>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                  deliveryState === "needs_attention"
                    ? "bg-red-50 text-red-800 border-red-200"
                    : deliveryState === "photos_pending"
                    ? "bg-amber-50 text-amber-900 border-amber-200"
                    : "bg-emerald-50 text-emerald-800 border-emerald-200"
                }`}
              >
                {deliveryState === "needs_attention"
                  ? "Needs attention"
                  : deliveryState === "photos_pending"
                  ? "Photos pending"
                  : "Submitted"}
              </span>
            </div>
          </div>

          {/* Desktop Actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Status Dropdown */}
            <select
              value={submission.status || "new"}
              onChange={(e) => handleStatusChange(e.target.value as SubmissionStatus)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer focus:outline-hidden ${
                (submission.status || "new") === "new"
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

            {/* Admin-only Copy Resume Link */}
            <button
              type="button"
              disabled={copyingResume}
              onClick={() => void handleCopyResumeLink()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#5C492A] bg-[#FAF7F2] hover:bg-[#F2ECE1] border border-[#E5DDD2] transition-colors cursor-pointer disabled:opacity-60"
              title="Copy resume link to send to this couple"
            >
              {copiedResume ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Link copied</span>
                </>
              ) : (
                <>
                  <Link2 className="w-3.5 h-3.5 text-[#8C7043]" />
                  <span>Copy resume link</span>
                </>
              )}
            </button>

            {/* Download Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDownloadOpen(!isDownloadOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#8C7043] bg-white hover:bg-[#FAF7F2] border border-[#E8DFD3] transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Brief</span>
              </button>

              {isDownloadOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-[#E5DDD2] rounded-xl shadow-lg py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDownloadOpen(false);
                      exportToPdf(submission);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-[#1A1A1A] hover:bg-[#FAF7F2] flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-red-600" />
                    <span>PDF (Full Brief)</span>
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
              <span>Delete</span>
            </button>
          </div>
        </div>

        {/* Mobile Header (Zero text clipping, perfect 2-row layout) */}
        <div className="sm:hidden px-4 py-3 space-y-2">
          {/* Mobile Row 1: Back + ID + Status + Download + Delete */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                className="p-1.5 -ml-1 rounded-xl text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#FAF7F2] transition-colors cursor-pointer"
                title="Back to Couples"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <span className="font-mono text-xs font-bold text-[#8C7043] bg-[#FAF7F2] px-2 py-0.5 rounded border border-[#E8DFD3]">
                {submission.displayId || "Unnumbered"}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Status Dropdown */}
              <select
                value={submission.status || "new"}
                onChange={(e) => handleStatusChange(e.target.value as SubmissionStatus)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer focus:outline-hidden ${
                  (submission.status || "new") === "new"
                    ? "bg-[#FFF9EE] text-[#B08D57] border-[#E5C388]"
                    : submission.status === "reviewed"
                    ? "bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]"
                    : "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]"
                }`}
              >
                <option value="new">New</option>
                <option value="reviewed">Reviewed</option>
                <option value="shared">Shared</option>
              </select>

              {/* Download Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsDownloadOpen(!isDownloadOpen)}
                  className="p-1.5 rounded-lg text-[#8C7043] bg-white border border-[#E8DFD3] hover:bg-[#FAF7F2] transition-colors cursor-pointer"
                  title="Download Brief"
                >
                  <Download className="w-4 h-4" />
                </button>

                {isDownloadOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-40 bg-white border border-[#E5DDD2] rounded-xl shadow-lg py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
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

              {/* Admin-only Copy Resume Link (Mobile) */}
              <button
                type="button"
                disabled={copyingResume}
                onClick={() => void handleCopyResumeLink()}
                className="p-1.5 rounded-lg text-[#5C492A] bg-[#FAF7F2] border border-[#E5DDD2] hover:bg-[#F2ECE1] transition-colors cursor-pointer disabled:opacity-60"
                title="Copy resume link for couple"
              >
                {copiedResume ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Link2 className="w-4 h-4 text-[#8C7043]" />
                )}
              </button>

              {/* Delete Button */}
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setShowDeleteModal(true);
                }}
                className="p-1.5 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer"
                title="Delete this submission"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile Row 2: Full-width Couple Names and Wedding Date */}
          <div className="pt-0.5">
            <h1 className="font-cormorant text-2xl font-semibold text-[#1A1A1A] leading-tight truncate">
              {p1} &amp; {p2}
            </h1>
            <p className="text-xs text-[#7A756D] mt-0.5">
              {submission.weddingDate ? `Wedding: ${submission.weddingDate}` : "Wedding date: TBD"}
              {submission.phone ? ` · 📞 ${submission.phone}` : ""}
            </p>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-8">
        {resumeCopyNotice && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-emerald-900 print:hidden">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium">{resumeCopyNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setResumeCopyNotice(null)}
              className="text-emerald-700 hover:text-emerald-950 cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Needs Attention / Pending Photos Diagnostic Banner */}
        {deliveryState === "needs_attention" && attentionReasons.length > 0 && (
          <div className="bg-red-50/80 border border-red-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 print:hidden">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-red-900">
                  Needs attention
                </h2>
                <ul className="text-xs text-red-800 space-y-1 list-disc pl-4">
                  {attentionReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            </div>
            <button
              type="button"
              disabled={copyingResume}
              onClick={() => void handleCopyResumeLink()}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#1A1A1A] bg-white hover:bg-[#FAF7F2] border border-red-200 transition-colors cursor-pointer shrink-0 disabled:opacity-60"
            >
              {copiedResume ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Resume link copied</span>
                </>
              ) : (
                <>
                  <Link2 className="w-3.5 h-3.5 text-[#8C7043]" />
                  <span>Copy resume link for couple</span>
                </>
              )}
            </button>
          </div>
        )}

        {deliveryState === "photos_pending" && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-amber-900 print:hidden">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Photos pending:</strong>{" "}
                {photoReport.uploadingCount || submission.pendingPhotoCount || 1} photo(s) are still uploading from the couple's device.
              </span>
            </div>
            <button
              type="button"
              disabled={copyingResume}
              onClick={() => void handleCopyResumeLink()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-amber-950 font-semibold hover:bg-amber-100/60 cursor-pointer shrink-0"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>{copiedResume ? "Copied" : "Copy resume link"}</span>
            </button>
          </div>
        )}

        {/* View Mode Switcher Tabs */}
        <div className="flex items-center gap-2 border-b border-[#E5DDD2] pb-3 print:hidden overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => selectTab("letter")}
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
            onClick={() => selectTab("brief")}
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
            onClick={() => selectTab("interview")}
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
            onClick={() => selectTab("cheatsheet")}
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
            onClick={() => selectTab("full")}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "full"
                ? "bg-[#1A1A1A] text-white shadow-xs"
                : "text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#F2ECE4]"
            }`}
          >
            <FileText className="w-4 h-4 text-[#7A756D]" />
            <span>Full Responses (Q1–27)</span>
          </button>

          <button
            type="button"
            onClick={() => selectTab("all")}
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
        {(visitedTabs.has("letter") || activeTab === "letter" || activeTab === "all") && (
          <section
            className={
              activeTab === "letter" || activeTab === "all"
                ? "space-y-4"
                : "hidden print:hidden"
            }
          >
            <CoupleLetterView
              letter={submission.coupleLetter || synthesizeCoupleLetter(submission.answers)}
              answers={submission.answers}
              coupleNames={`${p1} & ${p2}`}
              displayId={submission.displayId || "Unnumbered"}
              weddingDate={submission.weddingDate}
              onSaveLetter={handleSaveLetter}
            />
          </section>
        )}

        {/* 1. EDITORIAL CREATIVE BRIEF */}
        {(visitedTabs.has("brief") || activeTab === "brief" || activeTab === "all") && (
          <section
            className={
              activeTab === "brief" || activeTab === "all"
                ? "space-y-4"
                : "hidden print:hidden"
            }
          >
            <EditorialBriefView
              brief={submission.editorialBrief}
              answers={submission.answers}
              coupleNames={`${p1} & ${p2}`}
              weddingDate={submission.weddingDate}
              displayId={submission.displayId || "Unnumbered"}
              onSaveBrief={handleSaveBrief}
            />
          </section>
        )}

        {/* 2. COUPLE INTERVIEW & TESTIMONIAL QUESTIONS (11 QUESTIONS) */}
        {(visitedTabs.has("interview") || activeTab === "interview" || activeTab === "all") && (
          <section
            className={
              activeTab === "interview" || activeTab === "all"
                ? "space-y-4"
                : "hidden print:hidden"
            }
          >
            <CoupleInterviewView
              questionsText={submission.interviewQuestions}
              answers={submission.answers}
              coupleNames={`${p1} & ${p2}`}
              displayId={submission.displayId || "Unnumbered"}
              onSaveInterview={handleSaveInterview}
            />
          </section>
        )}

        {/* 2. SHOOT DAY CHEAT SHEET */}
        {(visitedTabs.has("cheatsheet") || activeTab === "cheatsheet" || activeTab === "all") && (
          <section
            className={
              activeTab === "cheatsheet" || activeTab === "all"
                ? "space-y-3"
                : "hidden print:hidden"
            }
          >
            <div className="flex items-center justify-between print:hidden">
              <h2 className="font-cormorant text-2xl font-semibold text-[#1A1A1A] flex items-center gap-2">
                <span>Shoot Day Cheat Sheet</span>
                <span className="text-xs font-sans font-normal text-[#8C7043] bg-[#FAF7F2] px-2 py-0.5 rounded-md border border-[#E8DFD3]">
                  1-Page Quick Summary
                </span>
              </h2>
              <button
                type="button"
                onClick={() => exportToPdf(submission)}
                className="text-xs text-[#8C7043] hover:underline font-medium cursor-pointer inline-flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF →</span>
              </button>
            </div>

            <ShootDayCheatSheet
              submission={submission}
              cheatSheetText={submission.cheatSheet}
              onSaveCheatSheet={handleSaveCheatSheet}
            />
          </section>
        )}

        {/* 2A. PHOTO UPLOAD STATUS BREAKDOWN (4 clear states: Uploaded / Still uploading / Not added by couple / Upload failed) */}
        {photoReport.items.length > 0 && (
          <section className="bg-white border border-[#E5DDD2] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-3 print:hidden">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-[#8C7043]" />
                  <h3 className="font-cormorant text-xl font-semibold text-[#1A1A1A]">
                    Photo Upload Status
                  </h3>
                </div>
                <p className="text-xs font-medium text-[#5F5F5F] tabular-nums">
                  {photoReport.summaryLine}
                </p>
              </div>

              {photoReport.failedCount === 0 && photoReport.uploadingCount === 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllPhotoStatuses((v) => !v)}
                  className="text-xs font-medium text-[#8C7043] hover:text-[#1A1A1A] cursor-pointer"
                >
                  {showAllPhotoStatuses ? "Hide list" : `Show list (${photoReport.items.length})`}
                </button>
              )}
            </div>

            {(showAllPhotoStatuses ||
              photoReport.failedCount > 0 ||
              photoReport.uploadingCount > 0) && (
              <div className="divide-y divide-[#F0E9DF] border border-[#EFE9E0] rounded-xl overflow-hidden">
                {photoReport.items.map((entry) => (
                  <div
                    key={entry.id}
                    className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs bg-[#FAF8F5]/50"
                  >
                    <div className="min-w-0">
                      <p
                        className={`font-medium truncate ${
                          entry.status === "not_added"
                            ? "text-[#7A756D]"
                            : "text-[#1A1A1A]"
                        }`}
                      >
                        {entry.label}
                      </p>
                      {entry.status === "failed" && entry.errorCode && (
                        <p className="text-[11px] font-mono text-red-700 mt-0.5">
                          Error code: {entry.errorCode}
                        </p>
                      )}
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${
                        entry.status === "uploaded"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : entry.status === "uploading"
                          ? "bg-amber-50 text-amber-900 border-amber-200"
                          : entry.status === "not_added"
                          ? "bg-[#F4F2EE] text-[#6B655D] border-[#E2DDD5]"
                          : "bg-red-50 text-red-800 border-red-200"
                      }`}
                    >
                      {entry.status === "uploaded" && <CheckCircle2 className="w-3 h-3" />}
                      {entry.status === "uploading" && <Clock className="w-3 h-3" />}
                      {entry.status === "not_added" && <CircleDashed className="w-3 h-3" />}
                      {entry.status === "failed" && <AlertCircle className="w-3 h-3" />}
                      <span>{entry.statusLabel}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
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
        {(visitedTabs.has("full") || activeTab === "full" || activeTab === "all") && (
          <section
            className={
              activeTab === "full" || activeTab === "all"
                ? "space-y-8 print:hidden"
                : "hidden print:hidden"
            }
          >
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
                <div className="space-y-4">
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

                  {ans.couplePhotoUrl && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-[#4A453E] block">
                        Couple Photo:
                      </span>
                      <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3] inline-block">
                        <SafeImageThumbnail
                          src={ans.couplePhotoUrl}
                          alt={`${p1} & ${p2}`}
                          onClick={() =>
                            openLightbox([
                              {
                                url: ans.couplePhotoUrl!,
                                title: `${p1} & ${p2}`,
                                subtitle: "Couple photo uploaded with Question 1",
                              },
                            ])
                          }
                          className="max-h-56 w-auto min-w-[180px]"
                        />
                        <div className="mt-2 flex items-center justify-between text-[11px] text-[#7A756D]">
                          <span>Click photo to view full screen</span>
                          <span className="font-semibold text-[#8C7043]">1 image</span>
                        </div>
                      </div>
                    </div>
                  )}
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
              question="Who are the most important people you want us to capture?"
              content={(() => {
                const grouped = groupedQ10!;
                const renderAdminSideBlock = (
                  sideLabel: string,
                  sideData: typeof grouped.bride
                ) => {
                  const hasContent =
                    sideData.photos.length > 0 ||
                    sideData.members.length > 0 ||
                    Boolean(sideData.notes.trim());

                  const sideLightboxImages: LightboxImage[] = [
                    ...sideData.photos.map((ph, idx) => ({
                      url: ph.url,
                      title: ph.caption?.trim() || `${sideLabel} — Photo ${idx + 1}`,
                      subtitle: `${sideLabel}${ph.mustCapture ? " · ★ Must capture" : ""}`,
                    })),
                    ...sideData.members
                      .filter((m) => Boolean(m.photoUrl))
                      .map((m) => ({
                        url: m.photoUrl!,
                        title: m.name,
                        subtitle: `${m.relationship} · ${sideLabel}${
                          m.mustCapture ? " · ★ Must capture" : ""
                        }`,
                      })),
                  ];

                  return (
                    <div className="bg-[#FAF8F5] border border-[#E8DFD3] rounded-2xl p-4 sm:p-5 space-y-4">
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#E8DFD3]">
                        <span className="font-cormorant text-xl font-semibold text-[#1A1A1A]">
                          {sideLabel}
                        </span>
                        <span className="text-xs text-[#7A756D] tabular-nums">
                          {[
                            sideData.photos.length > 0
                              ? `${sideData.photos.length} ${
                                  sideData.photos.length === 1 ? "photo" : "photos"
                                }`
                              : null,
                            sideData.members.length > 0
                              ? `${sideData.members.length} VIP`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No entries"}
                        </span>
                      </div>

                      {!hasContent ? (
                        <NotAnswered text={`No ${sideLabel.toLowerCase()} details provided.`} />
                      ) : (
                        <div className="space-y-4">
                          {/* Uploaded Family Tree / Important People Photos */}
                          {sideData.photos.length > 0 && (
                            <div className="space-y-2">
                              <span className="text-xs font-medium text-[#5F5F5F] block">
                                Family tree &amp; VIP photos ({sideData.photos.length})
                              </span>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                {sideData.photos.map((ph, pIdx) => (
                                  <div
                                    key={ph.id || pIdx}
                                    className="bg-white border border-[#E8DFD3] rounded-xl overflow-hidden flex flex-col"
                                  >
                                    <SafeImageThumbnail
                                      src={ph.url}
                                      alt={ph.caption?.trim() || `${sideLabel} photo ${pIdx + 1}`}
                                      onClick={() => {
                                        const targetIdx = sideLightboxImages.findIndex(
                                          (item) => item.url === ph.url
                                        );
                                        openLightbox(
                                          sideLightboxImages,
                                          targetIdx >= 0 ? targetIdx : 0
                                        );
                                      }}
                                      className="aspect-4/3 w-full"
                                    />
                                    {(ph.caption?.trim() || ph.mustCapture) && (
                                      <div className="px-2.5 py-2 border-t border-[#E8DFD3]/70 space-y-0.5">
                                        {ph.caption?.trim() && (
                                          <p className="text-xs font-medium text-[#1A1A1A] truncate">
                                            {ph.caption}
                                          </p>
                                        )}
                                        {ph.mustCapture && (
                                          <p className="text-[11px] font-medium text-[#8C7043] inline-flex items-center gap-1">
                                            <Star className="w-3 h-3 fill-[#8C7043]" />
                                            <span>Must capture</span>
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Named VIP Members */}
                          {sideData.members.length > 0 && (
                            <div className="space-y-2">
                              <span className="text-xs font-medium text-[#5F5F5F] block">
                                Listed VIPs ({sideData.members.length})
                              </span>
                              <div className="space-y-2">
                                {sideData.members.map((m, mIdx) => (
                                  <div
                                    key={m.id || mIdx}
                                    className="p-2.5 rounded-xl border border-[#E8DFD3] bg-white flex gap-3 items-center"
                                  >
                                    {m.photoUrl ? (
                                      <SafeImageThumbnail
                                        src={m.photoUrl}
                                        alt={m.name}
                                        onClick={() => {
                                          const targetIdx = sideLightboxImages.findIndex(
                                            (item) => item.url === m.photoUrl
                                          );
                                          openLightbox(
                                            sideLightboxImages,
                                            targetIdx >= 0 ? targetIdx : 0
                                          );
                                        }}
                                        className="w-12 h-12 shrink-0 rounded-lg"
                                      />
                                    ) : (
                                      <div className="w-12 h-12 shrink-0 rounded-lg bg-[#FAF8F5] border border-[#E8DFD3] flex items-center justify-center font-cormorant font-semibold text-base text-[#8C7043]">
                                        {m.name ? m.name.charAt(0).toUpperCase() : "?"}
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="font-semibold text-[#1A1A1A] truncate text-sm">
                                        {m.name}
                                      </div>
                                      <div className="text-xs text-[#5F5F5F] flex items-center gap-1.5 flex-wrap">
                                        <span>{m.relationship}</span>
                                        {m.mustCapture && (
                                          <>
                                            <span aria-hidden="true">·</span>
                                            <span className="text-[#8C7043] font-medium">
                                              ★ Must capture
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Side Notes */}
                          {sideData.notes.trim() && (
                            <div className="bg-white p-3 rounded-xl border border-[#E8DFD3] text-sm">
                              <span className="text-xs text-[#7A756D] font-medium block mb-1">
                                {sideLabel} Notes
                              </span>
                              <p className="text-[#1A1A1A] leading-relaxed">{sideData.notes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                };

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {renderAdminSideBlock("Bride's Side", grouped.bride)}
                      {renderAdminSideBlock("Groom's Side", grouped.groom)}
                    </div>

                    {/* Legacy Shared / Tree Sketch fallback for older submissions */}
                    {(grouped.sharedMembers.length > 0 ||
                      grouped.legacyTreePhotoUrl ||
                      grouped.legacyTreeNotes) && (
                      <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E8DFD3] space-y-3">
                        <span className="text-xs font-semibold text-[#4A453E] block">
                          Shared / Legacy Family Details
                        </span>
                        {grouped.sharedMembers.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {grouped.sharedMembers.map((m, idx) => (
                              <div
                                key={m.id || idx}
                                className="p-2.5 bg-white rounded-xl border border-[#E8DFD3] text-xs"
                              >
                                <span className="font-semibold text-[#1A1A1A]">{m.name}</span>{" "}
                                <span className="text-[#5F5F5F]">({m.relationship})</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {grouped.legacyTreePhotoUrl && (
                          <div className="inline-block">
                            <SafeImageThumbnail
                              src={grouped.legacyTreePhotoUrl}
                              alt="Uploaded Family Tree Sketch"
                              onClick={() =>
                                openLightbox([
                                  {
                                    url: grouped.legacyTreePhotoUrl!,
                                    title: "Family Tree Sketch",
                                    subtitle: `Provided by ${p1} & ${p2}`,
                                  },
                                ])
                              }
                              className="max-h-52 w-auto min-w-[180px]"
                            />
                          </div>
                        )}
                        {grouped.legacyTreeNotes && (
                          <p className="text-sm text-[#1A1A1A] leading-relaxed">
                            {grouped.legacyTreeNotes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            />
          </ChapterSection>

          {/* CHAPTER 3: THE LOOK AND FEEL */}
          <ChapterSection
            chapter="Chapter 3"
            title="The Look and Feel"
            range="Questions 11–15"
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

            {/* Q13: WEDDING OUTFITS */}
            <AnswerBlock
              num={13}
              question="Have you finalised your wedding wardrobe? Share your outfit plans, colour preferences, and styling ideas. Knowing these details helps us plan your photography and films more thoughtfully."
              content={(() => {
                const groupedWardrobeData = groupedWardrobe!;
                const renderWardrobeSide = (
                  sideHeading: string,
                  sideData: typeof groupedWardrobeData.bride
                ) => {
                  const hasSide =
                    Boolean(sideData.notes.trim()) ||
                    sideData.links.length > 0 ||
                    sideData.photos.length > 0;

                  return (
                    <div className="bg-[#FAF8F5] border border-[#E8DFD3] rounded-2xl p-4 sm:p-5 space-y-3.5">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#E8DFD3]">
                        <h4 className="font-cormorant text-xl font-semibold text-[#1A1A1A]">
                          {sideHeading}
                        </h4>
                        <span className="text-xs text-[#7A756D] tabular-nums">
                          {[
                            sideData.photos.length > 0
                              ? `${sideData.photos.length} ${
                                  sideData.photos.length === 1 ? "photo" : "photos"
                                }`
                              : null,
                            sideData.links.length > 0
                              ? `${sideData.links.length} ${
                                  sideData.links.length === 1 ? "link" : "links"
                                }`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || (hasSide ? "Notes added" : "Empty")}
                        </span>
                      </div>

                      {!hasSide ? (
                        <NotAnswered text={`No ${sideHeading.toLowerCase()} details provided yet.`} />
                      ) : (
                        <div className="space-y-3">
                          {sideData.notes.trim() && (
                            <TextAnswer text={sideData.notes} />
                          )}

                          {sideData.links.length > 0 && (
                            <ReferenceLinksList links={sideData.links} />
                          )}

                          <ThumbnailGallery
                            images={sideData.photos}
                            titlePrefix={sideHeading}
                            categoryLabel={`${sideHeading} — Photos &amp; References`}
                            emptyLabel={`No ${sideHeading.toLowerCase()} photos uploaded.`}
                            onOpenImage={(idx) => {
                              const list: LightboxImage[] = sideData.photos.map(
                                (img, i) => ({
                                  url: img,
                                  title: `${sideHeading} Reference ${i + 1}`,
                                  subtitle: `Wardrobe plans for ${p1} & ${p2}`,
                                })
                              );
                              openLightbox(list, idx);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                };

                if (groupedWardrobeData.legacyShared) {
                  return (
                    <div className="space-y-4">
                      {groupedWardrobeData.legacyShared.notes ? (
                        <TextAnswer text={groupedWardrobeData.legacyShared.notes} />
                      ) : null}
                      {groupedWardrobeData.legacyShared.links.length > 0 && (
                        <ReferenceLinksList links={groupedWardrobeData.legacyShared.links} />
                      )}
                      <ThumbnailGallery
                        images={groupedWardrobeData.legacyShared.photos}
                        titlePrefix="Wedding Outfit Reference"
                        categoryLabel="Outfit Photos &amp; Styling References"
                        emptyLabel="No outfit photos or references uploaded."
                        onOpenImage={(idx) => {
                          const list: LightboxImage[] =
                            groupedWardrobeData.legacyShared!.photos.map((img, i) => ({
                              url: img,
                              title: `Outfit Reference ${i + 1}`,
                              subtitle: `Wardrobe plans for ${p1} & ${p2}`,
                            }));
                          openLightbox(list, idx);
                        }}
                      />
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {renderWardrobeSide("Bride's wardrobe", groupedWardrobeData.bride)}
                    {renderWardrobeSide("Groom's wardrobe", groupedWardrobeData.groom)}
                  </div>
                );
              })()}
            />

            {/* Q14: DECOR MOOD BOARD (BY EVENT) */}
            <AnswerBlock
              num={14}
              question="Do you have a wedding decor mood board or any visual references for your celebration?"
              content={(() => {
                const groupedDecorData = groupedDecor!;
                if (!groupedDecorData.hasAnyContent) {
                  return <NotAnswered />;
                }

                return (
                  <div className="space-y-4">
                    {groupedDecorData.populatedEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-4 rounded-xl bg-[#FAFAFA] border border-[#E8E8E8] space-y-3"
                      >
                        <h4 className="text-xs font-semibold text-[#8C7043]">
                          {ev.name}
                        </h4>

                        {ev.notes.trim() ? (
                          <TextAnswer text={ev.notes} />
                        ) : !ev.links.length && !ev.images.length ? (
                          <NotAnswered />
                        ) : null}

                        {ev.links.length > 0 && (
                          <ReferenceLinksList links={ev.links} />
                        )}

                        {ev.images.length > 0 && (
                          <ThumbnailGallery
                            images={ev.images}
                            titlePrefix={`${ev.name} Decor`}
                            categoryLabel={`${ev.name} Mood Board &amp; Colour References`}
                            emptyLabel="No decor mood board images uploaded."
                            onOpenImage={(idx) => {
                              const list: LightboxImage[] = ev.images.map(
                                (img, i) => ({
                                  url: img,
                                  title: `${ev.name} Decor Image ${i + 1}`,
                                  subtitle: `Decor reference for ${p1} & ${p2}`,
                                })
                              );
                              openLightbox(list, idx);
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            />

            {/* Q15 (previously Q13) */}
            <AnswerBlock
              num={15}
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
            range="Questions 16–19"
          >
            {/* Q16 (previously Q14) */}
            <AnswerBlock
              num={16}
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

            {/* Q17 (previously Q15) */}
            <AnswerBlock
              num={17}
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

            {/* Q18 (previously Q16) */}
            <AnswerBlock
              num={18}
              question="Please mention your non negotiables in your films and photographs?"
              content={<TextAnswer text={ans.q16_nonNegotiables} />}
            />

            {/* Q19 (previously Q17) */}
            <AnswerBlock
              num={19}
              question="Who do you think is going to be more emotional during wedding?"
              content={<TextAnswer text={ans.q17_emotional} />}
            />
          </ChapterSection>

          {/* CHAPTER 5: WORKING TOGETHER */}
          <ChapterSection
            chapter="Chapter 5"
            title="Working Together"
            range="Questions 20–25"
          >
            {/* Q20 (previously Q18) */}
            <AnswerBlock
              num={20}
              question="How versatile are you with the camera?"
              content={<TextAnswer text={ans.q18_cameraVersatility} />}
            />

            {/* Q21 (previously Q19) */}
            <AnswerBlock
              num={21}
              question="What mattered most to you when choosing OAKS Wedding to capture your wedding?"
              content={<TextAnswer text={ans.choosingOaks} />}
            />

            {/* Q22 (previously Q23) */}
            <AnswerBlock
              num={22}
              question="How comfortable are you with being guided or directed during portraits and filming?"
              content={<TextAnswer text={ans.q20_guidanceComfort} />}
            />

            {/* Q23 (previously Q24) */}
            <AnswerBlock
              num={23}
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

            {/* Q24 (previously Q25) */}
            <AnswerBlock
              num={24}
              question="What do you hope to feel when you watch your wedding film years from now?"
              content={<TextAnswer text={ans.q22_futureFeeling} />}
            />

            {/* Q25 (previously Q26): YOUR PRIMARY POINT OF CONTACT */}
            <AnswerBlock
              num={25}
              question="Who should be our primary point of contact for wedding-related communication and coordination?"
              content={
                ans.primaryContact?.role ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#FAF7F2] border border-[#E8DFD3] text-[#1A1A1A] font-medium">
                        {ans.primaryContact.role}
                      </span>
                      {ans.primaryContact.role === "Someone else" &&
                        ans.primaryContact.side && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-[#E8DFD3] text-[#5F5F5F]">
                            {ans.primaryContact.side}
                          </span>
                        )}
                      {ans.primaryContact.role === "Someone else" &&
                        (ans.primaryContact.designation || ans.primaryContact.gender) && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-[#E8DFD3] text-[#5F5F5F]">
                            {ans.primaryContact.designation || ans.primaryContact.gender}
                          </span>
                        )}
                    </div>
                    <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFD3] space-y-1">
                      <p className="text-[#1A1A1A]">
                        <span className="text-xs text-[#7A756D] font-medium">Name: </span>
                        {ans.primaryContact.name || "—"}
                      </p>
                      <p className="text-[#1A1A1A]">
                        <span className="text-xs text-[#7A756D] font-medium">Phone / WhatsApp: </span>
                        {ans.primaryContact.phone || "—"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <NotAnswered />
                )
              }
            />
          </ChapterSection>

          {/* CHAPTER 6: ONE LAST THING */}
          <ChapterSection
            chapter="Chapter 6"
            title="One Last Thing"
            range="Questions 26–27"
          >
            <AnswerBlock
              num={26}
              question="Last but not least, we'd love to hear your story. How did your journey begin, and what would you love us to know about the two of you?"
              content={<TextAnswer text={ans.loveStoryNarrative} />}
            />

            <AnswerBlock
              num={27}
              question="Is there anything else you'd like to let us know?"
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
                (<span className="font-mono text-[#8C7043] font-bold">{submission.displayId || "Unnumbered"}</span>)?
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
