/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
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
} from "lucide-react";
import { SubmissionRecord, SubmissionStatus } from "../types/questionnaire.ts";
import {
  getSubmissions,
  updateSubmissionStatus,
  deleteSubmission,
} from "../lib/submissions.ts";
import { exportToPdf, exportToDocx } from "../utils/exportBrief.ts";
import { STUDIO_NAME, STUDIO_LOGO_URL } from "../constants.ts";

interface AdminDashboardProps {
  onSelectCouple: (id: string) => void;
  onSignOut: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onSelectCouple,
  onSignOut,
}) => {
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | SubmissionStatus>("all");
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

  // Fetch submissions on mount
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const records = await getSubmissions();
        if (isMounted) {
          setSubmissions(records);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(
            err?.message ||
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

  // Update status handler
  const handleStatusChange = async (id: string, newStatus: SubmissionStatus) => {
    // Optimistic UI update
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
      // Remove from local list
      setSubmissions((prev) => prev.filter((item) => item.id !== submissionToDelete.id));
      setSubmissionToDelete(null);
    } catch (err: any) {
      console.error("Failed to delete submission:", err);
      setDeleteError(err?.message || "Failed to delete submission. Please try again.");
    } finally {
      setIsDeleting(false);
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

  // Summary counts
  const totalCount = submissions.length;
  const newCount = submissions.filter((s) => s.status === "new").length;
  const reviewedCount = submissions.filter((s) => s.status === "reviewed").length;
  const sharedCount = submissions.filter((s) => s.status === "shared").length;

  // Filtered & Sorted submissions
  const filteredSubmissions = useMemo(() => {
    return submissions
      .filter((sub) => {
        // Status filter
        if (statusFilter !== "all" && sub.status !== statusFilter) {
          return false;
        }
        // Search query (either partner's name or displayId)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchP1 = sub.partner1?.toLowerCase().includes(q);
          const matchP2 = sub.partner2?.toLowerCase().includes(q);
          const matchBoth = `${sub.partner1} & ${sub.partner2}`
            .toLowerCase()
            .includes(q);
          const matchId = sub.displayId?.toLowerCase().includes(q);
          if (!matchP1 && !matchP2 && !matchBoth && !matchId) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "wedding_soonest") {
          const dateA = a.weddingDate ? new Date(a.weddingDate).getTime() : Infinity;
          const dateB = b.weddingDate ? new Date(b.weddingDate).getTime() : Infinity;
          return dateA - dateB;
        }
        // Default: newest submitted (by sequenceNumber desc or submittedAt)
        return (b.sequenceNumber || 0) - (a.sequenceNumber || 0);
      });
  }, [submissions, searchQuery, statusFilter, sortBy]);

  return (
    <div className="min-h-[100dvh] bg-[#FAF8F5] text-[#1A1A1A] safe-bottom pb-12">
      {/* Admin Header */}
      <header className="bg-white border-b border-[#E5DDD2] sticky top-0 z-30 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={
                STUDIO_LOGO_URL ||
                "https://res.cloudinary.com/pcodbmuo/image/upload/v1792483927/Black_OAKS_uctgsb.webp"
              }
              alt={STUDIO_NAME}
              className="h-9 w-auto object-contain"
            />
            <div className="h-5 w-px bg-[#E5DDD2]" />
            <h1 className="font-cormorant text-2xl font-semibold text-[#1A1A1A]">
              Couples <span className="text-[#8C7043] font-normal text-lg">({totalCount})</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#FAF7F2] border border-[#E5DDD2] transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-[#8C7043]" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-6">
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

              return (
                <div
                  key={couple.id}
                  className="bg-white border border-[#E5DDD2] hover:border-[#C4A474] rounded-2xl p-4 sm:p-5 shadow-2xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left: ID & Names */}
                  <div className="flex items-start sm:items-center gap-3.5">
                    <span className="font-mono text-xs font-bold text-[#8C7043] bg-[#FAF7F2] px-2.5 py-1.5 rounded-lg border border-[#E8DFD3] shrink-0">
                      {couple.displayId}
                    </span>
                    <div>
                      <h2 className="font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A] leading-tight">
                        {couple.partner1} &amp; {couple.partner2}
                      </h2>
                      <div className="text-xs text-[#7A756D] flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Submitted{" "}
                          {new Date(couple.submittedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        {couple.phone && <span>· 📞 {couple.phone}</span>}
                      </div>
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

                  {/* Right: Status Dropdown & Action Buttons */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-[#F0EBE1]">
                    {/* Status Dropdown */}
                    <div className="relative">
                      <select
                        value={couple.status}
                        onChange={(e) =>
                          handleStatusChange(couple.id, e.target.value as SubmissionStatus)
                        }
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer focus:outline-hidden ${
                          couple.status === "new"
                            ? "bg-[#FFF9EE] text-[#B08D57] border-[#E5C388]"
                            : couple.status === "reviewed"
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
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#1A1A1A] hover:text-white border border-[#E5DDD2] transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>

                    {/* Download Dropdown Menu */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveDownloadMenuId(
                            activeDownloadMenuId === couple.id ? null : couple.id
                          )
                        }
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-[#8C7043] bg-white hover:bg-[#FAF7F2] border border-[#E8DFD3] transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>

                      {activeDownloadMenuId === couple.id && (
                        <div className="absolute right-0 top-full mt-1.5 w-36 bg-white border border-[#E5DDD2] rounded-xl shadow-lg py-1 z-20 animate-in fade-in zoom-in-95 duration-100">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveDownloadMenuId(null);
                              exportToPdf(couple);
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-[#1A1A1A] hover:bg-[#FAF7F2] flex items-center gap-2 cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 text-red-600" />
                            <span>PDF</span>
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
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-red-600 bg-red-50/70 hover:bg-red-100 hover:text-red-700 border border-red-200/70 transition-colors cursor-pointer"
                      title={`Delete ${couple.partner1} & ${couple.partner2}'s submission`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Delete</span>
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
                  Load more couples ({filteredSubmissions.length - visibleCount} remaining)
                </button>
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
                  (<span className="font-mono text-[#8C7043] font-bold">{submissionToDelete.displayId}</span>)?
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
