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
  AlertTriangle,
  X,
  ClipboardList,
  RefreshCw,
  FolderSearch,
  CheckCircle2,
  Image as ImageIcon,
  FileWarning,
  FileClock,
} from "lucide-react";
import {
  DraftRecord,
  OrphanedStorageFolder,
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
  sortSubmissionsNewestFirst,
  listOrphanedStorageFolders,
  recoverOrphanedStorageFolder,
  recoverDraftAsSubmission,
} from "../lib/submissions.ts";
import { getAdminDrafts, deleteAdminDraft } from "../lib/drafts.ts";
import { getSubmissionErrors } from "../lib/errorLogger.ts";
import { exportToPdf, exportToDocx } from "../utils/exportBrief.ts";
import { STUDIO_NAME, STUDIO_LOGO_URL } from "../constants.ts";

interface AdminDashboardProps {
  onSelectCouple: (id: string) => void;
  onOpenChecklist: () => void;
  onSignOut: () => void;
}

type DashboardView = "submissions" | "unfinished" | "errors" | "recovery";
type ExtendedStatusFilter =
  | "all"
  | SubmissionStatus
  | "needs_attention"
  | "photos_pending";

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

  // Online drafts ("Missing or unfinished")
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [draftsLoading, setDraftsLoading] = useState<boolean>(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [recoveringDraftId, setRecoveringDraftId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);

  // Error log ("Errors")
  const [errorLogs, setErrorLogs] = useState<SubmissionErrorRecord[]>([]);
  const [errorsLoading, setErrorsLoading] = useState<boolean>(false);
  const [errorsFetchError, setErrorsFetchError] = useState<string | null>(null);

  // Storage Recovery ("Orphaned Storage Folders")
  const [orphanedFolders, setOrphanedFolders] = useState<OrphanedStorageFolder[] | null>(
    null
  );
  const [scanningStorage, setScanningStorage] = useState<boolean>(false);
  const [storageScanError, setStorageScanError] = useState<string | null>(null);
  const [recoveringFolder, setRecoveringFolder] = useState<string | null>(null);
  const [folderNameDrafts, setFolderNameDrafts] = useState<
    Record<string, { partner1: string; partner2: string }>
  >({});
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

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
    return () => {
      isMounted = false;
    };
  }, []);

  const loadDrafts = useCallback(async () => {
    setDraftsLoading(true);
    setDraftsError(null);
    try {
      const list = await getAdminDrafts();
      setDrafts(list);
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

  const loadErrorLogs = useCallback(async () => {
    setErrorsLoading(true);
    setErrorsFetchError(null);
    try {
      const list = await getSubmissionErrors(100);
      setErrorLogs(list);
    } catch (err: any) {
      setErrorsFetchError(
        err?.code === "permission-denied"
          ? "Could not read error log. Publish the updated firestore.rules in Firebase Console first."
          : err?.message || "Failed to load submission errors."
      );
    } finally {
      setErrorsLoading(false);
    }
  }, []);

  // Quietly pre-load draft & error counts in background after submissions finish
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      getAdminDrafts()
        .then((list) => {
          if (active) setDrafts(list);
        })
        .catch(() => {});
      getSubmissionErrors(100)
        .then((list) => {
          if (active) setErrorLogs(list);
        })
        .catch(() => {});
    }, 600);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  // Refresh secondary views when switched to
  useEffect(() => {
    if (activeView === "unfinished") {
      void loadDrafts();
    } else if (activeView === "errors") {
      void loadErrorLogs();
    }
  }, [activeView, loadDrafts, loadErrorLogs]);

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

  // Permanently delete a submission after user confirmation
  const handleConfirmDelete = async () => {
    if (!submissionToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteSubmission(submissionToDelete.id);
      setSubmissions((prev) => prev.filter((item) => item.id !== submissionToDelete.id));
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

  // Scan Firebase Storage for folders with no matching Firestore submission
  const handleScanOrphanedStorage = async () => {
    setScanningStorage(true);
    setStorageScanError(null);
    setRecoveryNotice(null);
    try {
      const freshSubs = await getSubmissions(true);
      setSubmissions(freshSubs);
      const found = await listOrphanedStorageFolders(freshSubs);
      setOrphanedFolders(found);
      setFolderNameDrafts((prev) => {
        const next = { ...prev };
        for (const folder of found) {
          if (!next[folder.folderName]) {
            next[folder.folderName] = {
              partner1: "Recovered Couple",
              partner2: "(Photos Only)",
            };
          }
        }
        return next;
      });
    } catch (err: any) {
      setStorageScanError(
        err?.code === "storage/unauthorized"
          ? "Storage denied folder listing. Publish the updated storage.rules in Firebase Console first."
          : err?.message || "Could not scan Firebase Storage."
      );
    } finally {
      setScanningStorage(false);
    }
  };

  // Recover an orphaned Storage folder into a visible couple record
  const handleRecoverStorageFolder = async (folder: OrphanedStorageFolder) => {
    setRecoveringFolder(folder.folderName);
    setStorageScanError(null);
    setRecoveryNotice(null);
    try {
      const names = folderNameDrafts[folder.folderName] || {
        partner1: "Recovered Couple",
        partner2: "(Photos Only)",
      };
      const recovered = await recoverOrphanedStorageFolder(
        folder,
        names.partner1,
        names.partner2
      );
      setSubmissions((prev) =>
        sortSubmissionsNewestFirst([
          recovered,
          ...prev.filter((item) => item.id !== recovered.id),
        ])
      );
      setOrphanedFolders((prev) =>
        prev ? prev.filter((item) => item.folderName !== folder.folderName) : null
      );
      setRecoveryNotice(
        `Created couple record "${recovered.partner1} & ${recovered.partner2}" with ${folder.photoPaths.length} photo(s).`
      );
    } catch (err: any) {
      setStorageScanError(err?.message || "Could not recover this Storage folder.");
    } finally {
      setRecoveringFolder(null);
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

      const deliveryState = getSubmissionDeliveryState(s);
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
  }, [submissions]);

  const completedDraftsCount = useMemo(
    () => drafts.filter((d) => d.mandatoryRemaining === 0).length,
    [drafts]
  );

  // Filtered & Sorted submissions (NEVER hides records missing sequenceNumber or status)
  const filteredSubmissions = useMemo(() => {
    const filtered = submissions.filter((sub) => {
      const effectiveStatus = sub.status || "new";
      const deliveryState = getSubmissionDeliveryState(sub);

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
  }, [submissions, searchQuery, statusFilter, sortBy]);

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

            <button
              type="button"
              onClick={() => setActiveView("errors")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                activeView === "errors"
                  ? "bg-white text-[#1A1A1A] shadow-2xs"
                  : "text-[#6A655D] hover:text-[#1A1A1A]"
              }`}
            >
              <FileWarning className="w-3.5 h-3.5 text-[#8C7043]" />
              <span>Errors</span>
              {errorLogs.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 tabular-nums">
                  {errorLogs.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView("recovery")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                activeView === "recovery"
                  ? "bg-white text-[#1A1A1A] shadow-2xs"
                  : "text-[#6A655D] hover:text-[#1A1A1A]"
              }`}
            >
              <FolderSearch className="w-3.5 h-3.5 text-[#8C7043]" />
              <span>Storage Recovery</span>
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
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-[#7A756D] shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="text-xs bg-[#FAF8F5] border border-[#E8DFD3] rounded-xl px-3 py-2 text-[#1A1A1A] font-medium focus:outline-hidden"
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

            {/* Submissions List: Table on desktop, Cards on mobile */}
            {!isLoading && !error && filteredSubmissions.length > 0 && (
              <div className="space-y-3">
                {filteredSubmissions.slice(0, visibleCount).map((couple) => {
                  const countdown = getWeddingCountdown(couple.weddingDate);
                  const effectiveStatus: SubmissionStatus = couple.status || "new";
                  const deliveryState = getSubmissionDeliveryState(couple);
                  const deliveryBadge = DELIVERY_BADGE_MAP[deliveryState];

                  return (
                    <div
                      key={couple.id}
                      className="bg-white border border-[#E5DDD2] hover:border-[#C4A474] rounded-2xl p-4 sm:p-5 shadow-2xs transition-all space-y-3.5 md:space-y-0 md:flex md:items-center md:justify-between md:gap-4"
                    >
                      {/* Card Top / Left: ID, Names, and Status Dropdown on mobile */}
                      <div className="flex items-start justify-between gap-3 md:items-center">
                        <div className="flex items-start sm:items-center gap-3">
                          <span className="font-mono text-xs font-bold text-[#8C7043] bg-[#FAF7F2] px-2.5 py-1.5 rounded-lg border border-[#E8DFD3] shrink-0">
                            {couple.displayId || "Unnumbered"}
                          </span>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A] leading-tight">
                                {couple.partner1 || "Partner 1"} &amp;{" "}
                                {couple.partner2 || "Partner 2"}
                              </h2>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${deliveryBadge.className}`}
                              >
                                {deliveryBadge.label}
                              </span>
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
                        <div className="shrink-0 md:hidden">
                          <select
                            value={effectiveStatus}
                            onChange={(e) =>
                              handleStatusChange(
                                couple.id,
                                e.target.value as SubmissionStatus
                              )
                            }
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer focus:outline-hidden ${
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
                      <div className="flex flex-wrap items-center gap-2 text-xs">
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

                      {/* Actions: Balanced full-width on mobile, flex on desktop */}
                      <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-[#F0EBE1]">
                        {/* Status Dropdown (Desktop only) */}
                        <div className="hidden md:block relative shrink-0">
                          <select
                            value={effectiveStatus}
                            onChange={(e) =>
                              handleStatusChange(
                                couple.id,
                                e.target.value as SubmissionStatus
                              )
                            }
                            className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer focus:outline-hidden ${
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
                          className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#1A1A1A] hover:text-white border border-[#E5DDD2] transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>

                        {/* Download Dropdown Menu */}
                        <div className="relative flex-1 md:flex-initial">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveDownloadMenuId(
                                activeDownloadMenuId === couple.id ? null : couple.id
                              )
                            }
                            className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#8C7043] bg-white hover:bg-[#FAF7F2] border border-[#E8DFD3] transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
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

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setSubmissionToDelete(couple);
                          }}
                          className="p-2 md:px-3 md:py-2 rounded-xl text-xs font-medium text-red-600 bg-red-50/70 hover:bg-red-100 hover:text-red-700 border border-red-200/70 transition-colors cursor-pointer shrink-0"
                          title={`Delete ${couple.partner1} & ${couple.partner2}'s submission`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline ml-1">Delete</span>
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
                          <span>
                            Progress: Step {Math.max(1, draft.currentStep || 1)} of 27
                          </span>
                          <span>· Last saved {formatDateTimeShort(draft.updatedAt)}</span>
                          {draft.weddingDate && <span>· Wedding: {draft.weddingDate}</span>}
                          {draft.phone && <span>· 📞 {draft.phone}</span>}
                          {draft.email && <span>· ✉️ {draft.email}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
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

        {/* ==================== VIEW 3: ERRORS ==================== */}
        {activeView === "errors" && (
          <div className="space-y-4">
            <div className="bg-white border border-[#E5DDD2] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-cormorant text-2xl font-semibold text-[#1A1A1A]">
                  Submission Error Log
                </h2>
                <p className="text-xs text-[#6A655D] mt-0.5">
                  Quiet technical diagnostics captured when a couple hits a save, photo upload, or network error. Never stores personal answers or resume links.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadErrorLogs()}
                disabled={errorsLoading}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#F2ECE1] border border-[#E5DDD2] cursor-pointer shrink-0 disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${errorsLoading ? "animate-spin" : ""}`}
                />
                <span>Refresh</span>
              </button>
            </div>

            {errorsFetchError && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-800">
                {errorsFetchError}
              </div>
            )}

            {errorsLoading && errorLogs.length === 0 && (
              <div className="bg-white border border-[#E5DDD2] rounded-2xl p-8 text-center text-xs text-[#7A756D]">
                Loading error log…
              </div>
            )}

            {!errorsLoading && !errorsFetchError && errorLogs.length === 0 && (
              <div className="bg-white border border-[#E5DDD2] rounded-2xl p-10 text-center space-y-2">
                <h3 className="font-cormorant text-2xl text-[#1A1A1A]">
                  No errors recorded
                </h3>
                <p className="text-xs text-[#7A756D] max-w-sm mx-auto">
                  Everything is running smoothly. Any future save or upload hiccups will appear here.
                </p>
              </div>
            )}

            {errorLogs.length > 0 && (
              <div className="space-y-2.5">
                {errorLogs.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-[#E5DDD2] rounded-2xl p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-red-50 text-red-800 border border-red-200">
                          {item.errorCode}
                        </span>
                        <span className="text-xs font-semibold text-[#1A1A1A]">
                          {item.step}
                        </span>
                        {item.submissionId && (
                          <span className="font-mono text-[11px] text-[#8C7043] bg-[#FAF7F2] px-2 py-0.5 rounded border border-[#E8DFD3]">
                            {item.submissionId}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#7A756D]">
                        {formatDateTimeShort(item.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-[#4A4640] leading-relaxed break-words">
                      {item.message}
                    </p>
                    <div className="text-[11px] text-[#7A756D] flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>Device: {item.deviceBrowser}</span>
                      {typeof item.photoCount === "number" && (
                        <span>· Photos: {item.photoCount}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== VIEW 4: STORAGE RECOVERY ==================== */}
        {activeView === "recovery" && (
          <div className="space-y-4">
            <div className="bg-white border border-[#E5DDD2] rounded-2xl p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-cormorant text-2xl font-semibold text-[#1A1A1A]">
                    Recover Missing Photo Folders
                  </h2>
                  <p className="text-xs text-[#6A655D] mt-0.5">
                    Checks Firebase Storage for uploaded couple photo folders that do not have a matching couple record in Firestore (for example, if an older submission failed after photos uploaded).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleScanOrphanedStorage()}
                  disabled={scanningStorage}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#1A1A1A] hover:bg-[#333333] transition-colors cursor-pointer shrink-0 disabled:opacity-60"
                >
                  <FolderSearch className="w-4 h-4 text-[#B08D57]" />
                  <span>
                    {scanningStorage
                      ? "Scanning Storage…"
                      : "Scan Storage for missing folders"}
                  </span>
                </button>
              </div>

              {storageScanError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800">
                  {storageScanError}
                </div>
              )}
            </div>

            {orphanedFolders && orphanedFolders.length === 0 && (
              <div className="bg-white border border-[#E5DDD2] rounded-2xl p-10 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h3 className="font-cormorant text-2xl text-[#1A1A1A]">
                  All Storage folders are matched
                </h3>
                <p className="text-xs text-[#7A756D] max-w-sm mx-auto">
                  Every photo folder in Firebase Storage already belongs to a visible couple submission in your dashboard.
                </p>
              </div>
            )}

            {orphanedFolders && orphanedFolders.length > 0 && (
              <div className="space-y-3">
                {orphanedFolders.map((folder) => {
                  const draftNames = folderNameDrafts[folder.folderName] || {
                    partner1: "Recovered Couple",
                    partner2: "(Photos Only)",
                  };

                  return (
                    <div
                      key={folder.folderName}
                      className="bg-white border border-amber-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs font-bold text-[#8C7043] bg-[#FAF7F2] px-2.5 py-1 rounded-lg border border-[#E8DFD3]">
                            {folder.folderName}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1A1A1A]">
                            <ImageIcon className="w-3.5 h-3.5 text-[#8C7043]" />
                            {folder.photoPaths.length} photo
                            {folder.photoPaths.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        {folder.estimatedDate && (
                          <span className="text-xs text-[#7A756D]">
                            Uploaded around {formatDateTimeShort(folder.estimatedDate)}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                        <div>
                          <label className="block text-[11px] font-medium text-[#6A655D] mb-1">
                            Partner 1 Name
                          </label>
                          <input
                            type="text"
                            value={draftNames.partner1}
                            onChange={(e) =>
                              setFolderNameDrafts((prev) => ({
                                ...prev,
                                [folder.folderName]: {
                                  ...draftNames,
                                  partner1: e.target.value,
                                },
                              }))
                            }
                            className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E5DDD2] rounded-xl focus:outline-hidden focus:border-[#1A1A1A]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#6A655D] mb-1">
                            Partner 2 Name
                          </label>
                          <input
                            type="text"
                            value={draftNames.partner2}
                            onChange={(e) =>
                              setFolderNameDrafts((prev) => ({
                                ...prev,
                                [folder.folderName]: {
                                  ...draftNames,
                                  partner2: e.target.value,
                                },
                              }))
                            }
                            className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E5DDD2] rounded-xl focus:outline-hidden focus:border-[#1A1A1A]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRecoverStorageFolder(folder)}
                          disabled={recoveringFolder === folder.folderName}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#1A1A1A] hover:bg-[#333333] transition-colors cursor-pointer disabled:opacity-60"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#B08D57]" />
                          <span>
                            {recoveringFolder === folder.folderName
                              ? "Recovering…"
                              : "Recover into Submissions"}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {submissionToDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => {
              if (!isDeleting) {
                setSubmissionToDelete(null);
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
                      setSubmissionToDelete(null);
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
                  Are you sure you want to permanently delete the submitted form for{" "}
                  <strong className="text-[#1A1A1A] font-semibold">
                    {submissionToDelete.partner1} &amp; {submissionToDelete.partner2}
                  </strong>{" "}
                  (
                  <span className="font-mono text-[#8C7043] font-bold">
                    {submissionToDelete.displayId || "Unnumbered"}
                  </span>
                  )?
                </p>
              </div>

              <div className="bg-red-50/80 border border-red-200 rounded-xl p-3 text-xs text-red-900 leading-relaxed flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Warning:</strong> This cannot be undone. All questionnaire responses, editorial briefs, interview questions, cheat sheets, and media will be permanently removed.
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
                    setSubmissionToDelete(null);
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
      </main>
    </div>
  );
};
