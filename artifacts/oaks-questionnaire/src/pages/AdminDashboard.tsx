/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  ArrowUpDown,
  Download,
  Eye,
  LogOut,
  FileText,
  FileCode,
  Calendar,
  Clock,
  Sparkles,
  Trash2,
  X,
  ClipboardList,
  RefreshCw,
  CheckCircle2,
  FileClock,
  Link2,
  Check,
  Info,
  Lock,
  RotateCcw,
  Send,
} from "lucide-react";
import { ShareLinkMenu } from "../components/ShareLinkMenu.tsx";
import { DeleteSubmissionDialog } from "../components/DeleteSubmissionDialog.tsx";
import {
  DraftRecord,
  SubmissionDeliveryState,
  SubmissionErrorRecord,
  SubmissionRecord,
  SubmissionStatus,
} from "../types/questionnaire.ts";
import {
  getCachedSubmissions,
  getSubmissions,
  prefetchSubmissionMedia,
  updateSubmissionStatus,
  deleteSubmission,
  getSubmissionDeliveryState,
  getSubmissionAttentionReasons,
  ensureResumeLinkForSubmission,
  sortSubmissionsNewestFirst,
  recoverDraftAsSubmission,
} from "../lib/submissions.ts";
import {
  getAllAdminDrafts,
  deleteAdminDraft,
  lockDraftLinkNow,
  resetDraftResumeLink,
} from "../lib/drafts.ts";
import {
  describeDraftPartnerStatus,
  getDraftLinkInactiveReason,
} from "../utils/splitModeHelpers.ts";
import type { SubmissionNumberChange } from "../lib/submissionNumbering.ts";
import { getSubmissionErrors } from "../lib/errorLogger.ts";
import { buildResumeUrl, isPrivatePreviewOrigin } from "../lib/coupleSession.ts";
import { exportToPdf, exportToDocx } from "../utils/exportBrief.ts";
import { STUDIO_NAME, STUDIO_LOGO_URL } from "../constants.ts";

interface AdminDashboardProps {
  onSelectCouple: (id: string) => void;
  onOpenChecklist: () => void;
  onSignOut: () => void;
}

type DashboardView = "submissions" | "unfinished";
type ExtendedStatusFilter =
  | "all"
  | SubmissionStatus
  | "needs_attention"
  | "photos_pending";

function applyNumberChanges(
  submissions: SubmissionRecord[],
  changes: SubmissionNumberChange[]
): SubmissionRecord[] {
  const changeById = new Map(changes.map((change) => [change.id, change]));
  return submissions.map((submission) => {
    const change = changeById.get(submission.id);
    if (!change) return submission;
    return {
      ...submission,
      sequenceNumber: change.toSequenceNumber ?? undefined,
      displayId: change.toDisplayId ?? undefined,
    };
  });
}

const DELIVERY_BADGE_MAP: Record<
  SubmissionDeliveryState,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-[#FAF7F2] text-[#7A756D] border-[#E5DDD2]",
  },
  submitted: {
    label: "Submitted",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  photos_pending: {
    label: "Photos pending",
    className: "bg-amber-50 text-amber-900 border-amber-200",
  },
  needs_attention: {
    label: "Needs attention",
    className: "bg-red-50 text-red-800 border-red-200",
  },
};

function formatDateTimeShort(iso?: string): string {
  if (!iso) return "Unknown time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown time";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onSelectCouple,
  onOpenChecklist,
  onSignOut,
}) => {
  const initialCached = useMemo(() => getCachedSubmissions(), []);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>(
    () => initialCached ?? []
  );
  const [isLoading, setIsLoading] = useState<boolean>(() => !initialCached);
  const [error, setError] = useState<string | null>(null);

  // Active dashboard view tab
  const [activeView, setActiveView] = useState<DashboardView>("submissions");

  // Online drafts ("Missing or unfinished") + all drafts for admin resume-link lookup
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [allDrafts, setAllDrafts] = useState<DraftRecord[]>([]);
  const [draftsLoading, setDraftsLoading] = useState<boolean>(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [recoveringDraftId, setRecoveringDraftId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [lockingDraftId, setLockingDraftId] = useState<string | null>(null);
  const [resettingDraftId, setResettingDraftId] = useState<string | null>(null);

  // "Needs attention" click/hover reasons popover & admin Copy Resume Link feedback
  const [openReasonsId, setOpenReasonsId] = useState<string | null>(null);
  const [copyingResumeId, setCopyingResumeId] = useState<string | null>(null);
  const [copiedResumeId, setCopiedResumeId] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<{
    url: string;
    names: string;
    phone?: string;
    email?: string;
  } | null>(null);
  const [preparingShareId, setPreparingShareId] = useState<string | null>(null);

  // Team share menu for a finished couple: make sure a working link exists first.
  const handleShareCoupleLink = async (couple: SubmissionRecord) => {
    setPreparingShareId(couple.id);
    try {
      const { token, url } = await ensureResumeLinkForSubmission(couple, allDrafts);
      setSubmissions((prev) =>
        prev.map((item) =>
          item.id === couple.id ? { ...item, resumeToken: token, finalized: false } : item
        )
      );
      setShareTarget({
        url,
        names: `${couple.partner1} & ${couple.partner2}`,
        phone: couple.phone,
        email: couple.email,
      });
    } catch (err: any) {
      setError(err?.message || "Could not prepare resume link for this couple.");
    } finally {
      setPreparingShareId(null);
    }
  };

  // Background error log records (used only to flag "Email not sent" on Needs attention badges)
  const [errorLogs, setErrorLogs] = useState<SubmissionErrorRecord[]>([]);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const notice = sessionStorage.getItem("oaks_submission_delete_notice");
      if (notice) {
        setRecoveryNotice(notice);
        sessionStorage.removeItem("oaks_submission_delete_notice");
      }
    } catch {
      // The delete confirmation remains available if session storage is disabled.
    }
  }, []);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<ExtendedStatusFilter>("all");
  const [sortBy, setSortBy] = useState<"newest_submitted" | "wedding_soonest">(
    "newest_submitted"
  );
  const [visibleCount, setVisibleCount] = useState<number>(20);

  // Active download dropdown for a row
  const [activeDownloadMenuId, setActiveDownloadMenuId] = useState<string | null>(
    null
  );

  // Delete confirmation state
  const [submissionToDelete, setSubmissionToDelete] = useState<SubmissionRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Warm lazy chunks for AdminCoupleDetail and AdminWeddingChecklist during browser idle
  useEffect(() => {
    const warmChunks = () => {
      void import("./AdminCoupleDetail.tsx");
      void import("./AdminWeddingChecklist.tsx");
    };
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const idleId = w.requestIdleCallback(warmChunks, { timeout: 1500 });
      return () => w.cancelIdleCallback?.(idleId);
    }
    const timer = window.setTimeout(warmChunks, 350);
    return () => window.clearTimeout(timer);
  }, []);

  // Fetch submissions on mount (0ms from cache + SWR background refresh)
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!getCachedSubmissions()) {
        setIsLoading(true);
      }
      setError(null);
      try {
        const records = await getSubmissions(false, (fresh) => {
          if (isMounted) {
            setSubmissions(fresh);
          }
        });
        if (isMounted) {
          setSubmissions(records);
        }
      } catch (err: any) {
        if (isMounted) {
          const isPermissionDenied =
            err?.code === "permission-denied" ||
            String(err?.message || "").toLowerCase().includes("insufficient permissions");
          setError(
            isPermissionDenied
              ? "Firestore denied read access for this account. Make sure the updated firestore.rules are published in Firebase Console (or sign in once as rahulratna88@gmail.com to sync team admin permissions automatically)."
              : err?.message ||
                  "Could not load submissions. Please check your Firestore security rules and network connection."
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadData();
    // Other admins can delete/renumber while this dashboard is open.
    const refreshNumbers = () => {
      if (document.visibilityState === "hidden") return;
      void getSubmissions(true).then((fresh) => {
        if (isMounted) setSubmissions(fresh);
      }).catch(() => {});
    };
    window.addEventListener("focus", refreshNumbers);
    const refreshTimer = window.setInterval(refreshNumbers, 30_000);
    return () => {
      isMounted = false;
      window.removeEventListener("focus", refreshNumbers);
      window.clearInterval(refreshTimer);
    };
  }, []);

  const loadDrafts = useCallback(async () => {
    setDraftsLoading(true);
    setDraftsError(null);
    try {
      const all = await getAllAdminDrafts();
      setAllDrafts(all);
      setDrafts(all.filter((d) => d.status !== "submitted"));
    } catch (err: any) {
      setDraftsError(
        err?.code === "permission-denied"
          ? "Could not read online drafts. Publish the updated firestore.rules in Firebase Console first."
          : err?.message || "Failed to load unfinished drafts."
      );
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  // Quietly pre-load draft & error records in background after submissions finish
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      getAllAdminDrafts()
        .then((all) => {
          if (active) {
            setAllDrafts(all);
            setDrafts(all.filter((d) => d.status !== "submitted"));
          }
        })
        .catch(() => {});
      getSubmissionErrors(100)
        .then((list) => {
          if (active) setErrorLogs(list);
        })
        .catch(() => {});
    }, 450);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  // Refresh drafts when switching to Missing or unfinished
  useEffect(() => {
    if (activeView === "unfinished") {
      void loadDrafts();
    }
  }, [activeView, loadDrafts]);

  // Update status handler
  const handleStatusChange = async (id: string, newStatus: SubmissionStatus) => {
    setSubmissions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
    try {
      await updateSubmissionStatus(id, newStatus);
    } catch (err) {
      console.error("Failed to update status on server:", err);
    }
  };

  // Helper to copy text cleanly across desktop & mobile browsers
  const copyTextToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  // Admin-only: copy a working resume link for a submitted couple (works on any phone/browser, no login required)
  const handleCopyCoupleResumeLink = async (couple: SubmissionRecord) => {
    setCopyingResumeId(couple.id);
    try {
      const { token, url } = await ensureResumeLinkForSubmission(couple, allDrafts);
      setSubmissions((prev) =>
        prev.map((item) =>
          item.id === couple.id ? { ...item, resumeToken: token, finalized: false } : item
        )
      );
      await copyTextToClipboard(url);
      setCopiedResumeId(couple.id);
      const isPrivatePreview = isPrivatePreviewOrigin(url);
      setRecoveryNotice(
        isPrivatePreview
          ? `Copied link for ${couple.partner1} & ${couple.partner2}. Note: Open your live Vercel dashboard to copy a public link for clients (AI Studio preview URLs only open for your Google account).`
          : `Copied resume link for ${couple.partner1} & ${couple.partner2} — any client can open it on any phone or browser with no email login needed.`
      );
      window.setTimeout(() => {
        setCopiedResumeId((cur) => (cur === couple.id ? null : cur));
      }, 2800);
    } catch (err: any) {
      setError(err?.message || "Could not prepare resume link for this couple.");
    } finally {
      setCopyingResumeId(null);
    }
  };

  // Admin-only: copy a working resume link for an unfinished draft so the couple can finish on any device
  const handleCopyDraftResumeLink = async (draft: DraftRecord) => {
    const url = buildResumeUrl(draft.id);
    await copyTextToClipboard(url);
    setCopiedResumeId(draft.id);
    const coupleTitle =
      draft.partner1 || draft.partner2
        ? `${draft.partner1 || "Partner 1"} & ${draft.partner2 || "Partner 2"}`
        : "this couple";
    const isPrivatePreview = isPrivatePreviewOrigin(url);
    setRecoveryNotice(
      isPrivatePreview
        ? `Copied link for ${coupleTitle}. Note: Open your live Vercel dashboard to copy a public link for clients (AI Studio preview URLs only open for your Google account).`
        : `Copied resume link for ${coupleTitle} — send it via WhatsApp or email so they can continue right where they left off on any phone.`
    );
    window.setTimeout(() => {
      setCopiedResumeId((cur) => (cur === draft.id ? null : cur));
    }, 2800);
  };

  // Admin-only: immediately lock an unfinished draft's resume link
  const handleLockDraftLink = async (draft: DraftRecord) => {
    setLockingDraftId(draft.id);
    setDraftsError(null);
    try {
      await lockDraftLinkNow(draft.id);
      setDrafts((prev) =>
        prev.map((d) =>
          d.id === draft.id ? { ...d, linkLocked: true } : d
        )
      );
      setAllDrafts((prev) =>
        prev.map((d) =>
          d.id === draft.id ? { ...d, linkLocked: true } : d
        )
      );
      const coupleTitle =
        draft.partner1 || draft.partner2
          ? `${draft.partner1 || "Partner 1"} & ${draft.partner2 || "Partner 2"}`
          : "this draft";
      setRecoveryNotice(`Locked resume link for ${coupleTitle}. The old link will no longer open.`);
    } catch (err: any) {
      setDraftsError(err?.message || "Could not lock this draft link.");
    } finally {
      setLockingDraftId(null);
    }
  };

  // Admin-only: revoke old draft link and create + copy a fresh 7-day link
  const handleResetDraftLink = async (draft: DraftRecord) => {
    setResettingDraftId(draft.id);
    setDraftsError(null);
    try {
      const { token: newToken, url } = await resetDraftResumeLink(draft);
      await copyTextToClipboard(url);
      await loadDrafts();
      setCopiedResumeId(newToken);
      const coupleTitle =
        draft.partner1 || draft.partner2
          ? `${draft.partner1 || "Partner 1"} & ${draft.partner2 || "Partner 2"}`
          : "this draft";
      const isPrivatePreview = isPrivatePreviewOrigin(url);
      setRecoveryNotice(
        isPrivatePreview
          ? `Reset link for ${coupleTitle} and copied new link. Old link is disabled. Tip: Open your live Vercel dashboard to copy a public client URL.`
          : `Reset link for ${coupleTitle} — the old link is now disabled and the new 7-day link is copied to your clipboard.`
      );
      window.setTimeout(() => {
        setCopiedResumeId((cur) => (cur === newToken ? null : cur));
      }, 2800);
    } catch (err: any) {
      setDraftsError(err?.message || "Could not reset this draft link.");
    } finally {
      setResettingDraftId(null);
    }
  };

  // Permanently delete a submission after user confirmation
  const handleConfirmDelete = async () => {
    if (!submissionToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteSubmission(
        submissionToDelete.id,
        submissionToDelete
      );
      setSubmissions((prev) =>
        applyNumberChanges(
          prev.filter((item) => item.id !== submissionToDelete.id),
          result.renumberedSubmissions
        )
      );
      setAllDrafts((prev) =>
        prev.filter(
          (draft) =>
            draft.submissionId !== submissionToDelete.id &&
            draft.id !== submissionToDelete.resumeToken
        )
      );
      setDrafts((prev) =>
        prev.filter(
          (draft) =>
            draft.submissionId !== submissionToDelete.id &&
            draft.id !== submissionToDelete.resumeToken
        )
      );
      setErrorLogs((prev) =>
        prev.filter((log) => log.submissionId !== submissionToDelete.id)
      );
      const submissionLabel =
        result.deletedDisplayId ||
        submissionToDelete.displayId ||
        submissionToDelete.id;
      setRecoveryNotice(
        `Deleted submission ${submissionLabel}, moved ${result.renumberedCount} later number${result.renumberedCount === 1 ? "" : "s"} into place, and removed ${result.deletedPhotoCount} photo${result.deletedPhotoCount === 1 ? "" : "s"}.`
      );
      setSubmissionToDelete(null);
    } catch (err: any) {
      console.error("Failed to delete submission:", err);
      setDeleteError(err?.message || "Failed to delete submission. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Recover unfinished draft as a full submission
  const handleRecoverDraft = async (draft: DraftRecord) => {
    setRecoveringDraftId(draft.id);
    setRecoveryNotice(null);
    try {
      const recovered = await recoverDraftAsSubmission(draft);
      setSubmissions((prev) =>
        sortSubmissionsNewestFirst([
          recovered,
          ...prev.filter((item) => item.id !== recovered.id),
        ])
      );
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      setRecoveryNotice(
        `Recovered "${recovered.partner1} & ${recovered.partner2}" into Submissions.`
      );
    } catch (err: any) {
      setDraftsError(err?.message || "Could not recover this draft.");
    } finally {
      setRecoveringDraftId(null);
    }
  };

  // Delete an unfinished draft
  const handleDeleteDraft = async (draftId: string) => {
    setDeletingDraftId(draftId);
    try {
      await deleteAdminDraft(draftId);
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    } catch (err: any) {
      setDraftsError(err?.message || "Could not delete draft.");
    } finally {
      setDeletingDraftId(null);
    }
  };

  // Helper for wedding countdown
  const getWeddingCountdown = (weddingDateStr: string) => {
    if (!weddingDateStr) return null;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weddingDate = new Date(weddingDateStr);
      weddingDate.setHours(0, 0, 0, 0);

      const diffTime = weddingDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return { label: "Today", isUrgent: true };
      if (diffDays === 1) return { label: "Tomorrow", isUrgent: true };
      if (diffDays > 1) {
        return {
          label: `in ${diffDays} days`,
          isUrgent: diffDays <= 14,
        };
      }
      return {
        label: `${Math.abs(diffDays)} days ago`,
        isUrgent: false,
      };
    } catch {
      return null;
    }
  };

  // Memoized summary counts
  const {
    totalCount,
    newCount,
    reviewedCount,
    sharedCount,
    photosPendingCount,
    needsAttentionCount,
  } = useMemo(() => {
    let nextNew = 0;
    let nextReviewed = 0;
    let nextShared = 0;
    let nextPendingPhotos = 0;
    let nextNeedsAttention = 0;
    for (const s of submissions) {
      const effectiveStatus = s.status || "new";
      if (effectiveStatus === "new") nextNew++;
      else if (effectiveStatus === "reviewed") nextReviewed++;
      else if (effectiveStatus === "shared") nextShared++;

      const deliveryState = getSubmissionDeliveryState(s, errorLogs);
      if (deliveryState === "photos_pending") nextPendingPhotos++;
      if (deliveryState === "needs_attention") nextNeedsAttention++;
    }
    return {
      totalCount: submissions.length,
      newCount: nextNew,
      reviewedCount: nextReviewed,
      sharedCount: nextShared,
      photosPendingCount: nextPendingPhotos,
      needsAttentionCount: nextNeedsAttention,
    };
  }, [submissions, errorLogs]);

  const completedDraftsCount = useMemo(
    () => drafts.filter((d) => d.mandatoryRemaining === 0).length,
    [drafts]
  );

  // Filtered & Sorted submissions (NEVER hides records missing sequenceNumber or status)
  const filteredSubmissions = useMemo(() => {
    const filtered = submissions.filter((sub) => {
      const effectiveStatus = sub.status || "new";
      const deliveryState = getSubmissionDeliveryState(sub, errorLogs);

      if (statusFilter === "needs_attention") {
        if (deliveryState !== "needs_attention") return false;
      } else if (statusFilter === "photos_pending") {
        if (deliveryState !== "photos_pending") return false;
      } else if (statusFilter !== "all" && effectiveStatus !== statusFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchP1 = sub.partner1?.toLowerCase().includes(q);
        const matchP2 = sub.partner2?.toLowerCase().includes(q);
        const matchBoth = `${sub.partner1 || ""} & ${sub.partner2 || ""}`
          .toLowerCase()
          .includes(q);
        const matchId = (sub.displayId || "unnumbered").toLowerCase().includes(q);
        const matchDocId = sub.id.toLowerCase().includes(q);
        if (!matchP1 && !matchP2 && !matchBoth && !matchId && !matchDocId) {
          return false;
        }
      }
      return true;
    });

    if (sortBy === "wedding_soonest") {
      return [...filtered].sort((a, b) => {
        const dateA = a.weddingDate ? new Date(a.weddingDate).getTime() : Infinity;
        const dateB = b.weddingDate ? new Date(b.weddingDate).getTime() : Infinity;
        return dateA - dateB;
      });
    }
    return sortSubmissionsNewestFirst(filtered);
  }, [submissions, errorLogs, searchQuery, statusFilter, sortBy]);

  return (
    <div className="min-h-[100dvh] bg-[#FAF8F5] text-[#1A1A1A] safe-bottom pb-12">
      {/* Admin Header */}
      <header className="bg-white border-b border-[#E5DDD2] sticky top-0 z-30 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 sm:py-0 sm:h-18 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <img
              src={
                STUDIO_LOGO_URL ||
                "https://res.cloudinary.com/pcodbmuo/image/upload/v1792483927/Black_OAKS_uctgsb.webp"
              }
              alt={STUDIO_NAME}
              className="h-7 sm:h-9 w-auto object-contain shrink-0"
            />
            <div className="h-5 w-px bg-[#E5DDD2] shrink-0" />
            <h1 className="font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A] whitespace-nowrap">
              Couples{" "}
              <span className="text-[#8C7043] font-normal text-base sm:text-lg tabular-nums">
                ({totalCount})
              </span>
            </h1>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-[#F0E9DF]">
            <button
              type="button"
              onClick={onOpenChecklist}
              onMouseEnter={() => {
                void import("./AdminWeddingChecklist.tsx");
              }}
              onFocus={() => {
                void import("./AdminWeddingChecklist.tsx");
              }}
              className="flex-1 sm:flex-initial min-h-[40px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 sm:py-1.5 rounded-xl sm:rounded-full text-xs font-medium text-[#1A1A1A] bg-[#FAF7F2] hover:bg-[#F2ECE1] border border-[#E5DDD2] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ClipboardList className="w-3.5 h-3.5 text-[#8C7043] shrink-0" />
              <span>Wedding Checklist</span>
            </button>

            <button
              type="button"
              onClick={onSignOut}
              className="min-h-[40px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-3 py-2 sm:py-1.5 rounded-xl sm:rounded-full text-xs font-medium text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#FAF7F2] border border-[#E5DDD2] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 text-[#8C7043] shrink-0" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-6">
        {/* Top Admin View Switcher */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <div className="inline-flex items-center bg-[#F3EFE8] border border-[#E5DDD2] p-1 rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => setActiveView("submissions")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                activeView === "submissions"
                  ? "bg-white text-[#1A1A1A] shadow-2xs"
                  : "text-[#6A655D] hover:text-[#1A1A1A]"
              }`}
            >
              <span>Submissions</span>
              <span className="text-[11px] font-normal text-[#8C7043] tabular-nums">
                ({totalCount})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("unfinished")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                activeView === "unfinished"
                  ? "bg-white text-[#1A1A1A] shadow-2xs"
                  : "text-[#6A655D] hover:text-[#1A1A1A]"
              }`}
            >
              <FileClock className="w-3.5 h-3.5 text-[#8C7043]" />
              <span>Missing or unfinished</span>
              <span className="text-[11px] font-normal text-[#8C7043] tabular-nums">
                ({drafts.length})
              </span>
              {completedDraftsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                  {completedDraftsCount} ready
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Recovery Success Notice */}
        {recoveryNotice && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium">{recoveryNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setRecoveryNotice(null)}
              className="text-emerald-700 hover:text-emerald-950 cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ==================== VIEW 1: SUBMISSIONS ==================== */}
        {activeView === "submissions" && (
          <>
            {/* Summary Filter Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === "all"
                    ? "bg-[#1A1A1A] text-white"
                    : "bg-white text-[#5F5F5F] hover:bg-[#F2ECE1] border border-[#E5DDD2]"
                }`}
              >
                Total ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("new")}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === "new"
                    ? "bg-[#B08D57] text-white font-semibold"
                    : "bg-white text-[#8C7043] hover:bg-[#FAF7F2] border border-[#E8DFD3]"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#B08D57]" />
                <span>New ({newCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("reviewed")}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === "reviewed"
                    ? "bg-[#2563EB] text-white font-semibold"
                    : "bg-white text-[#2563EB] hover:bg-blue-50 border border-blue-200"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
                <span>Reviewed ({reviewedCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("shared")}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === "shared"
                    ? "bg-[#059669] text-white font-semibold"
                    : "bg-white text-[#059669] hover:bg-emerald-50 border border-emerald-200"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#059669]" />
                <span>Shared with team ({sharedCount})</span>
              </button>

              {photosPendingCount > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter("photos_pending")}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    statusFilter === "photos_pending"
                      ? "bg-amber-600 text-white font-semibold"
                      : "bg-white text-amber-800 hover:bg-amber-50 border border-amber-200"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Photos pending ({photosPendingCount})</span>
                </button>
              )}

              {needsAttentionCount > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter("needs_attention")}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    statusFilter === "needs_attention"
                      ? "bg-red-600 text-white font-semibold"
                      : "bg-white text-red-700 hover:bg-red-50 border border-red-200"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span>Needs attention ({needsAttentionCount})</span>
                </button>
              )}
            </div>

            {/* Search & Sort Controls Bar */}
            <div className="bg-white border border-[#E5DDD2] rounded-2xl p-3 sm:p-4 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#7A756D] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by couple names or #number..."
                  className="w-full pl-10 pr-4 py-2 text-sm bg-[#FAF8F5] border border-[#E8DFD3] rounded-xl focus:outline-hidden focus:border-[#1A1A1A] focus:ring-1 focus:ring-[#B08D57]"
                />
              </div>

              {/* Sort Dropdown */}
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                <ArrowUpDown className="w-4 h-4 text-[#7A756D] shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="min-w-0 max-w-full flex-1 text-xs bg-[#FAF8F5] border border-[#E8DFD3] rounded-xl px-3 py-2 text-[#1A1A1A] font-medium focus:outline-hidden sm:flex-none"
                >
                  <option value="newest_submitted">Sort: Newest submitted</option>
                  <option value="wedding_soonest">Sort: Wedding date (soonest)</option>
                </select>
              </div>
            </div>

            {/* Loading State - Skeleton Cards */}
            {isLoading && (
              <div className="space-y-3 animate-pulse" aria-label="Loading submissions">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="bg-white border border-[#E5DDD2] rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className="w-12 h-7 bg-[#FAF7F2] rounded-lg border border-[#E8DFD3]" />
                      <div className="space-y-2">
                        <div className="w-48 h-5 bg-[#F2ECE1] rounded-md" />
                        <div className="w-28 h-3 bg-[#F2ECE1]/60 rounded-md" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-7 bg-[#FAF8F5] border border-[#E5DDD2] rounded-xl" />
                      <div className="w-20 h-6 bg-[#FAF7F2] rounded-full" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-8 bg-[#FAF8F5] rounded-xl" />
                      <div className="w-24 h-8 bg-[#1A1A1A]/10 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-800 text-sm">
                <p className="font-semibold mb-1">Failed to load submissions</p>
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && filteredSubmissions.length === 0 && (
              <div className="bg-white border border-[#E5DDD2] rounded-2xl p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#FAF7F2] border border-[#E8DFD3] flex items-center justify-center mx-auto text-[#8C7043]">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="font-cormorant text-2xl text-[#1A1A1A]">No couples found</h3>
                <p className="text-sm text-[#7A756D] max-w-sm mx-auto">
                  {searchQuery || statusFilter !== "all"
                    ? "No submissions matched your current search or filter."
                    : "No couples yet. Submissions will appear here."}
                </p>
              </div>
            )}

            {/* Submission cards */}
            {!isLoading && !error && filteredSubmissions.length > 0 && (
              <div className="space-y-3">
                {filteredSubmissions.slice(0, visibleCount).map((couple) => {
                  const countdown = getWeddingCountdown(couple.weddingDate);
                  const effectiveStatus: SubmissionStatus = couple.status || "new";
                  const deliveryState = getSubmissionDeliveryState(couple, errorLogs);
                  const attentionReasons = getSubmissionAttentionReasons(couple, errorLogs);
                  const deliveryBadge = DELIVERY_BADGE_MAP[deliveryState];
                  const isReasonsOpen = openReasonsId === couple.id;

                  return (
                    <div
                      key={couple.id}
                      className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-[#E5DDD2] bg-white p-4 shadow-2xs transition-all hover:border-[#C4A474] sm:p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:gap-x-5"
                    >
                      {/* Card Top / Left: ID, Names, and Status Dropdown on mobile */}
                      <div className="flex min-w-0 items-start justify-between gap-3 xl:col-start-1 xl:row-start-1 xl:items-center">
                        <div className="flex min-w-0 items-start gap-3 sm:items-center">
                          <span className="font-mono text-xs font-bold text-[#8C7043] bg-[#FAF7F2] px-2.5 py-1.5 rounded-lg border border-[#E8DFD3] shrink-0">
                            {couple.displayId || "Unnumbered"}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="break-words font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A] leading-tight">
                                {couple.partner1 || "Partner 1"} &amp;{" "}
                                {couple.partner2 || "Partner 2"}
                              </h2>
                              {deliveryState === "needs_attention" && attentionReasons.length > 0 ? (
                                <div className="relative group inline-flex min-w-0 items-center gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOpenReasonsId(isReasonsOpen ? null : couple.id)
                                    }
                                    title={attentionReasons.join(" · ")}
                                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer ${deliveryBadge.className}`}
                                  >
                                    <span>{deliveryBadge.label}</span>
                                    <Info className="w-3 h-3" />
                                  </button>
                                  <span className="min-w-0 break-words text-[11px] font-medium text-red-700">
                                    {attentionReasons.join(" · ")}
                                  </span>

                                  <div
                                    className={`absolute left-0 top-full mt-1.5 z-30 w-64 max-w-[calc(100vw-3rem)] bg-white border border-red-200 rounded-xl shadow-lg p-3 text-left ${
                                      isReasonsOpen
                                        ? "block"
                                        : "hidden group-hover:block"
                                    }`}
                                  >
                                    <p className="text-[11px] font-semibold text-red-800 mb-1.5">
                                      Why this needs attention:
                                    </p>
                                    <ul className="space-y-1 text-xs text-[#4A453E] list-disc pl-4">
                                      {attentionReasons.map((reason) => (
                                        <li key={reason}>{reason}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              ) : (
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${deliveryBadge.className}`}
                                >
                                  {deliveryBadge.label}
                                </span>
                              )}
                              {couple.submittedIncompletePartner && (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-[#F4F2EE] text-[#6B655D] border-[#E2DDD5]">
                                  Sent without {couple.submittedIncompletePartner}&apos;s part
                                </span>
                              )}
                              {couple.submittedIncompletePartner && couple.missingSummary && (
                                <span
                                  className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-[#FFF6E5] text-[#7A5A12] border-[#EBD9A8]"
                                  title="Missing or unfinished"
                                >
                                  Missing or unfinished: {couple.missingSummary}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#7A756D] flex flex-wrap items-center gap-2 mt-0.5">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Submitted{" "}
                                {couple.submittedAt
                                  ? new Date(couple.submittedAt).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                    })
                                  : "Date unknown"}
                              </span>
                              {couple.phone && <span>· 📞 {couple.phone}</span>}
                              {couple.recoveredFromStorage && (
                                <span className="text-[11px] text-[#8C7043] font-medium">
                                  · Recovered from Storage
                                </span>
                              )}
                              {couple.recoveredFromDraft && (
                                <span className="text-[11px] text-[#8C7043] font-medium">
                                  · Recovered from Draft
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status Dropdown (Top right on mobile) */}
                        <div className="max-w-[6.5rem] shrink-0 md:hidden">
                          <select
                            value={effectiveStatus}
                            onChange={(e) =>
                              handleStatusChange(
                                couple.id,
                                e.target.value as SubmissionStatus
                              )
                            }
                            className={`w-full min-w-0 text-[11px] font-semibold px-2 py-1 rounded-full border cursor-pointer focus:outline-hidden ${
                              effectiveStatus === "new"
                                ? "bg-[#FFF9EE] text-[#B08D57] border-[#E5C388]"
                                : effectiveStatus === "reviewed"
                                ? "bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]"
                                : "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]"
                            }`}
                          >
                            <option value="new">New</option>
                            <option value="reviewed">Reviewed</option>
                            <option value="shared">Shared</option>
                          </select>
                        </div>
                      </div>

                      {/* Middle: Wedding Date & Countdown */}
                      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs xl:col-start-2 xl:row-start-1">
                        <div className="inline-flex items-center gap-1.5 bg-[#FAF8F5] border border-[#E5DDD2] px-3 py-1.5 rounded-xl">
                          <Calendar className="w-3.5 h-3.5 text-[#8C7043]" />
                          <span className="font-medium text-[#1A1A1A]">
                            {couple.weddingDate || "Date TBD"}
                          </span>
                        </div>

                        {countdown && (
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                              countdown.isUrgent
                                ? "bg-amber-100 text-amber-900 border border-amber-300"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {countdown.label}
                          </span>
                        )}
                      </div>

                      {/* Actions: Responsive grid keeps every control inside the card */}
                      <div className="grid min-w-0 grid-cols-2 gap-2 border-t border-[#F0EBE1] pt-3 sm:grid-cols-3 xl:col-span-2 xl:grid-cols-6 xl:pt-2">
                        {/* Status Dropdown (Desktop only) */}
                        <div className="relative hidden min-w-0 md:block">
                          <select
                            value={effectiveStatus}
                            onChange={(e) =>
                              handleStatusChange(
                                couple.id,
                                e.target.value as SubmissionStatus
                              )
                            }
                            className={`min-h-10 w-full min-w-0 text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer focus:outline-hidden ${
                              effectiveStatus === "new"
                                ? "bg-[#FFF9EE] text-[#B08D57] border-[#E5C388]"
                                : effectiveStatus === "reviewed"
                                ? "bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]"
                                : "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]"
                            }`}
                          >
                            <option value="new">New</option>
                            <option value="reviewed">Reviewed</option>
                            <option value="shared">Shared with team</option>
                          </select>
                        </div>

                        {/* View Button */}
                        <button
                          type="button"
                          onClick={() => onSelectCouple(couple.id)}
                          onMouseEnter={() => {
                            void import("./AdminCoupleDetail.tsx");
                            void prefetchSubmissionMedia(couple);
                          }}
                          onFocus={() => {
                            void import("./AdminCoupleDetail.tsx");
                            void prefetchSubmissionMedia(couple);
                          }}
                          className="inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-semibold text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#1A1A1A] hover:text-white border border-[#E5DDD2] transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 shrink-0" />
                          <span>View</span>
                        </button>

                        {/* Download Dropdown Menu */}
                        <div className="relative min-w-0 w-full">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveDownloadMenuId(
                                activeDownloadMenuId === couple.id ? null : couple.id
                              )
                            }
                            className="w-full min-h-10 min-w-0 inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-semibold text-[#8C7043] bg-white hover:bg-[#FAF7F2] border border-[#E8DFD3] transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 shrink-0" />
                            <span>Download</span>
                          </button>

                          {activeDownloadMenuId === couple.id && (
                            <div className="absolute right-0 top-full mt-1.5 w-40 bg-white border border-[#E5DDD2] rounded-xl shadow-lg py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDownloadMenuId(null);
                                  exportToPdf(couple);
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-[#1A1A1A] hover:bg-[#FAF7F2] flex items-center gap-2 cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5 text-red-600" />
                                <span>PDF (All Briefs)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDownloadMenuId(null);
                                  exportToDocx(couple);
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-[#1A1A1A] hover:bg-[#FAF7F2] flex items-center gap-2 cursor-pointer"
                              >
                                <FileCode className="w-3.5 h-3.5 text-blue-600" />
                                <span>Word (.docx)</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Admin-only: Copy resume link */}
                        <button
                          type="button"
                          disabled={copyingResumeId === couple.id}
                          onClick={() => void handleCopyCoupleResumeLink(couple)}
                          className="min-h-10 w-full min-w-0 rounded-xl px-2 py-2 text-xs font-medium text-[#5C492A] bg-[#FAF7F2] hover:bg-[#F2ECE1] border border-[#E5DDD2] transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                          title={`Copy resume link for ${couple.partner1} & ${couple.partner2}`}
                        >
                          {copiedResumeId === couple.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span className="text-emerald-700">Copied</span>
                            </>
                          ) : (
                            <>
                              <Link2 className="w-3.5 h-3.5 shrink-0 text-[#8C7043]" />
                              <span className="lg:hidden">Copy link</span>
                              <span className="hidden lg:inline">Copy resume link</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={preparingShareId === couple.id}
                          onClick={() => void handleShareCoupleLink(couple)}
                          className="min-h-10 w-full min-w-0 rounded-xl px-2 py-2 text-xs font-medium text-[#5C492A] bg-[#FAF7F2] hover:bg-[#F2ECE1] border border-[#E5DDD2] transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                          title={`Send link to ${couple.partner1} & ${couple.partner2} (WhatsApp, email)`}
                        >
                          <Send className="w-3.5 h-3.5 shrink-0 text-[#8C7043]" />
                          <span>Send link</span>
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setSubmissionToDelete(couple);
                          }}
                          className="col-span-2 sm:col-span-1 min-h-10 w-full min-w-0 inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium text-red-600 bg-red-50/70 hover:bg-red-100 hover:text-red-700 border border-red-200/70 transition-colors cursor-pointer"
                          title={`Delete ${couple.partner1} & ${couple.partner2}'s submission`}
                        >
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredSubmissions.length > visibleCount && (
                  <div className="pt-3 text-center">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((prev) => prev + 20)}
                      className="px-6 py-2.5 rounded-xl border border-[#E5DDD2] bg-white hover:bg-[#FAF7F2] text-xs font-semibold text-[#1A1A1A] transition-colors cursor-pointer shadow-2xs"
                    >
                      Load more couples ({filteredSubmissions.length - visibleCount}{" "}
                      remaining)
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ==================== VIEW 2: MISSING OR UNFINISHED (DRAFTS) ==================== */}
        {activeView === "unfinished" && (
          <div className="space-y-4">
            <div className="bg-white border border-[#E5DDD2] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-cormorant text-2xl font-semibold text-[#1A1A1A]">
                  Missing or Unfinished Questionnaires
                </h2>
                <p className="text-xs text-[#6A655D] mt-0.5">
                  Couples whose answers auto-saved online before they tapped Send. Drafts with all required questions answered are highlighted so you can recover them in one tap.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadDrafts()}
                disabled={draftsLoading}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#F2ECE1] border border-[#E5DDD2] cursor-pointer shrink-0 disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${draftsLoading ? "animate-spin" : ""}`}
                />
                <span>Refresh</span>
              </button>
            </div>

            {draftsError && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-800">
                {draftsError}
              </div>
            )}

            {draftsLoading && drafts.length === 0 && (
              <div className="bg-white border border-[#E5DDD2] rounded-2xl p-8 text-center text-xs text-[#7A756D]">
                Loading online drafts…
              </div>
            )}

            {!draftsLoading && !draftsError && drafts.length === 0 && (
              <div className="bg-white border border-[#E5DDD2] rounded-2xl p-10 text-center space-y-2">
                <h3 className="font-cormorant text-2xl text-[#1A1A1A]">
                  No unfinished drafts
                </h3>
                <p className="text-xs text-[#7A756D] max-w-sm mx-auto">
                  All started couple forms have either been submitted or none are currently in progress.
                </p>
              </div>
            )}

            {drafts.length > 0 && (
              <div className="space-y-3">
                {drafts.map((draft) => {
                  const isAllAnswered = draft.mandatoryRemaining === 0;
                  const coupleTitle =
                    draft.partner1 || draft.partner2
                      ? `${draft.partner1 || "Partner 1"} & ${draft.partner2 || "Partner 2"}`
                      : "Unnamed couple";
                  const partnerStatusText = describeDraftPartnerStatus(draft);
                  const inactiveReason = getDraftLinkInactiveReason(draft);
                  const isLockedOrExpired = inactiveReason !== null;

                  return (
                    <div
                      key={draft.id}
                      className={`bg-white rounded-2xl p-4 sm:p-5 border shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        isAllAnswered
                          ? "border-amber-300 ring-1 ring-amber-200/70"
                          : "border-[#E5DDD2]"
                      }`}
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-[#FAF7F2] text-[#7A756D] border-[#E5DDD2]">
                            Draft
                          </span>
                          {draft.fillMode === "separate" && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-[#FAF7F2] text-[#8C7043] border-[#E8DFD3]">
                              Separately
                            </span>
                          )}
                          {isLockedOrExpired && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-[#F4F2EE] text-[#6B655D] border-[#E2DDD5]">
                              {inactiveReason === "expired" ? "Link expired" : "Link locked"}
                            </span>
                          )}
                          {isAllAnswered && (
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                              All questions answered · Never tapped Send
                            </span>
                          )}
                          <h3 className="font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A]">
                            {coupleTitle}
                          </h3>
                        </div>

                        <div className="text-xs text-[#6A655D] flex flex-wrap items-center gap-x-3 gap-y-1">
                          {partnerStatusText ? (
                            <span className="font-medium text-[#4A453E]">
                              {partnerStatusText}
                            </span>
                          ) : (
                            <span>
                              Progress: Step {Math.max(1, draft.currentStep || 1)} of 27
                            </span>
                          )}
                          <span>· Last saved {formatDateTimeShort(draft.updatedAt)}</span>
                          {draft.weddingDate && <span>· Wedding: {draft.weddingDate}</span>}
                          {draft.phone && <span>· 📞 {draft.phone}</span>}
                          {draft.email && <span>· ✉️ {draft.email}</span>}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleCopyDraftResumeLink(draft)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-[#5C492A] bg-[#FAF7F2] hover:bg-[#F2ECE1] border border-[#E5DDD2] transition-colors cursor-pointer"
                          title={`Copy resume link for ${coupleTitle}`}
                        >
                          {copiedResumeId === draft.id ? (
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
                        <button
                          type="button"
                          onClick={() =>
                            setShareTarget({
                              url: buildResumeUrl(draft.id),
                              names: coupleTitle,
                              phone: draft.phone,
                              email: draft.email,
                            })
                          }
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-[#5C492A] bg-[#FAF7F2] hover:bg-[#F2ECE1] border border-[#E5DDD2] transition-colors cursor-pointer"
                          title={`Send link to ${coupleTitle} (WhatsApp, email)`}
                        >
                          <Send className="w-3.5 h-3.5 text-[#8C7043]" />
                          <span>Send link</span>
                        </button>
                        <button
                          type="button"
                          disabled={isLockedOrExpired || lockingDraftId === draft.id}
                          onClick={() => void handleLockDraftLink(draft)}
                          className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium text-[#5F5F5F] bg-white hover:bg-[#FAF7F2] border border-[#E5DDD2] transition-colors cursor-pointer disabled:opacity-50"
                          title={isLockedOrExpired ? "Link is already inactive" : "Lock this resume link immediately"}
                        >
                          <Lock className="w-3.5 h-3.5 text-[#8C7043]" />
                          <span>{lockingDraftId === draft.id ? "Locking…" : "Lock now"}</span>
                        </button>
                        <button
                          type="button"
                          disabled={resettingDraftId === draft.id}
                          onClick={() => void handleResetDraftLink(draft)}
                          className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium text-[#5F5F5F] bg-white hover:bg-[#FAF7F2] border border-[#E5DDD2] transition-colors cursor-pointer disabled:opacity-50"
                          title="Disable old link and create a brand-new 7-day link"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-[#8C7043]" />
                          <span>{resettingDraftId === draft.id ? "Resetting…" : "Reset link"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRecoverDraft(draft)}
                          disabled={recoveringDraftId === draft.id}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#1A1A1A] hover:bg-[#333333] transition-colors cursor-pointer disabled:opacity-60"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#B08D57]" />
                          <span>
                            {recoveringDraftId === draft.id
                              ? "Recovering…"
                              : "Recover as Submission"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDraft(draft.id)}
                          disabled={deletingDraftId === draft.id}
                          className="p-2 rounded-xl text-xs text-red-600 bg-red-50/70 hover:bg-red-100 border border-red-200/70 cursor-pointer disabled:opacity-60"
                          title="Delete draft"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DeleteSubmissionDialog
          submission={submissionToDelete}
          isDeleting={isDeleting}
          error={deleteError}
          onCancel={() => {
            if (!isDeleting) {
              setSubmissionToDelete(null);
              setDeleteError(null);
            }
          }}
          onConfirm={() => void handleConfirmDelete()}
        />
      </main>
      <ShareLinkMenu
        open={shareTarget !== null}
        onClose={() => setShareTarget(null)}
        url={shareTarget?.url ?? ""}
        kind="team"
        recipientName={shareTarget?.names ?? ""}
        knownPhone={shareTarget?.phone}
        knownEmail={shareTarget?.email}
      />
    </div>
  );
};