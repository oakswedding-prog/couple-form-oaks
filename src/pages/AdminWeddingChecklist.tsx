/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  LogOut,
  RotateCcw,
  AlertCircle,
  ClipboardList,
  UserCheck,
  X,
  HardDrive,
  Edit3,
  ArrowRight,
} from "lucide-react";
import {
  ChecklistItemStatus,
  CrewFileRole,
  FileDetailEntry,
  FileSizeUnit,
  ProductionChecklistData,
  SubmissionRecord,
} from "../types/questionnaire.ts";
import {
  WEDDING_PRODUCTION_CHECKLIST,
  TOTAL_CHECKLIST_ITEMS,
} from "../constants/productionChecklist.ts";
import {
  getSubmissions,
  subscribeSubmissionChecklist,
  updateSubmissionChecklist,
} from "../lib/submissions.ts";
import { STUDIO_LOGO_URL, STUDIO_NAME } from "../constants.ts";

interface AdminWeddingChecklistProps {
  onBack: () => void;
  onSignOut: () => void;
  userEmail?: string;
}

export const AdminWeddingChecklist: React.FC<AdminWeddingChecklistProps> = ({
  onBack,
  onSignOut,
  userEmail,
}) => {
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [selectedCoupleId, setSelectedCoupleId] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState<boolean>(false);
  const [managerInput, setManagerInput] = useState<string>("");
  const [managerNotice, setManagerNotice] = useState<string | null>(null);

  // Top-level page tabs: Production Checklist vs File Details
  const [activeTab, setActiveTab] = useState<"checklist" | "files">("checklist");

  // File Details form state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [fileMemberName, setFileMemberName] = useState<string>("");
  const [fileRole, setFileRole] = useState<CrewFileRole>("Photographer");
  const [fileCustomRole, setFileCustomRole] = useState<string>("");
  const [fileSizeInput, setFileSizeInput] = useState<string>("");
  const [fileSizeUnit, setFileSizeUnit] = useState<FileSizeUnit>("GB");
  const [fileCountInput, setFileCountInput] = useState<string>("");
  const [fileDriveName, setFileDriveName] = useState<string>("");
  const [fileFormError, setFileFormError] = useState<string | null>(null);

  // Load couples for the selector
  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const records = await getSubmissions();
        if (!isMounted) return;
        setSubmissions(records);

        if (records.length > 0) {
          const params = new URLSearchParams(window.location.search);
          const requestedId = params.get("coupleId");
          const matching = requestedId
            ? records.find((r) => r.id === requestedId)
            : undefined;
          setSelectedCoupleId(matching ? matching.id : records[0].id);
        }
      } catch (err: any) {
        if (isMounted) {
          setLoadError(
            err?.message ||
              "Could not load couples. Please check your connection and permissions."
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  // Keep URL query param synced with the selected couple
  useEffect(() => {
    if (!selectedCoupleId) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("coupleId") !== selectedCoupleId) {
        url.searchParams.set("coupleId", selectedCoupleId);
        window.history.replaceState({}, "", `${url.pathname}${url.search}`);
      }
    } catch {
      // ignore URL update issues
    }
  }, [selectedCoupleId]);

  // Subscribe to real-time updates for the active couple's checklist
  useEffect(() => {
    if (!selectedCoupleId) return;
    const unsubscribe = subscribeSubmissionChecklist(
      selectedCoupleId,
      (remoteChecklist) => {
        setSubmissions((prev) =>
          prev.map((rec) =>
            rec.id === selectedCoupleId
              ? { ...rec, productionChecklist: remoteChecklist }
              : rec
          )
        );
      },
      (err) => {
        setSaveError(err.message);
        setSaveState("error");
      }
    );
    return () => unsubscribe();
  }, [selectedCoupleId]);

  const selectedCouple = useMemo(
    () => submissions.find((s) => s.id === selectedCoupleId) ?? null,
    [submissions, selectedCoupleId]
  );

  const checklistItems: Record<string, ChecklistItemStatus> =
    selectedCouple?.productionChecklist?.items ?? {};
  const productionManagers: string[] =
    selectedCouple?.productionChecklist?.productionManagers ?? [];
  const fileDetails: FileDetailEntry[] =
    selectedCouple?.productionChecklist?.fileDetails ?? [];

  const counts = useMemo(() => {
    let gotIt = 0;
    let missed = 0;
    for (const section of WEDDING_PRODUCTION_CHECKLIST) {
      for (const item of section.items) {
        const st = checklistItems[item.id];
        if (st === "got_it") gotIt += 1;
        else if (st === "missed") missed += 1;
      }
    }
    return {
      gotIt,
      missed,
      remaining: Math.max(0, TOTAL_CHECKLIST_ITEMS - gotIt - missed),
    };
  }, [checklistItems]);

  const fileTotals = useMemo(() => {
    let totalFiles = 0;
    let totalGb = 0;
    for (const entry of fileDetails) {
      totalFiles += Number.isFinite(entry.fileCount) ? entry.fileCount : 0;
      const size = Number.isFinite(entry.fileSize) ? entry.fileSize : 0;
      totalGb += entry.sizeUnit === "TB" ? size * 1000 : size;
    }
    const formattedSize =
      totalGb >= 1000
        ? `${(totalGb / 1000).toFixed(2)} TB`
        : `${Number(totalGb.toFixed(2))} GB`;
    return {
      entries: fileDetails.length,
      totalFiles,
      formattedSize,
    };
  }, [fileDetails]);

  const resetFileForm = () => {
    setEditingEntryId(null);
    setFileMemberName("");
    setFileRole("Photographer");
    setFileCustomRole("");
    setFileSizeInput("");
    setFileSizeUnit("GB");
    setFileCountInput("");
    setFileDriveName("");
    setFileFormError(null);
  };

  const persistChecklist = async (
    nextItems: Record<string, ChecklistItemStatus>,
    nextManagers: string[] = productionManagers,
    nextFileDetails: FileDetailEntry[] = fileDetails
  ) => {
    if (!selectedCouple) return;
    const previousChecklist = selectedCouple.productionChecklist;
    const nextChecklist: ProductionChecklistData = {
      items: nextItems,
      productionManagers: nextManagers,
      fileDetails: nextFileDetails,
      updatedAt: new Date().toISOString(),
      updatedBy: userEmail || "Admin",
    };

    // Optimistic state update
    setSubmissions((prev) =>
      prev.map((rec) =>
        rec.id === selectedCouple.id
          ? { ...rec, productionChecklist: nextChecklist }
          : rec
      )
    );
    setSaveState("saving");
    setSaveError(null);

    try {
      await updateSubmissionChecklist(selectedCouple.id, nextChecklist);
      setSaveState("saved");
    } catch (err: any) {
      // Roll back optimistic state on failure
      setSubmissions((prev) =>
        prev.map((rec) =>
          rec.id === selectedCouple.id
            ? { ...rec, productionChecklist: previousChecklist }
            : rec
        )
      );
      setSaveState("error");
      setSaveError(
        err?.message || "Failed to save checklist update to Firestore."
      );
    }
  };

  const handleToggleItem = (itemId: string, targetStatus: ChecklistItemStatus) => {
    const nextItems = { ...checklistItems };
    if (nextItems[itemId] === targetStatus) {
      delete nextItems[itemId];
    } else {
      nextItems[itemId] = targetStatus;
    }
    setConfirmResetOpen(false);
    void persistChecklist(nextItems, productionManagers, fileDetails);
  };

  const handleResetChecklist = () => {
    setConfirmResetOpen(false);
    void persistChecklist({}, productionManagers, fileDetails);
  };

  const handleAddManager = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = managerInput.trim().replace(/\s+/g, " ");
    if (!cleaned) return;

    const exists = productionManagers.some(
      (name) => name.toLowerCase() === cleaned.toLowerCase()
    );
    if (exists) {
      setManagerNotice(`"${cleaned}" is already assigned to this wedding.`);
      return;
    }

    setManagerNotice(null);
    setManagerInput("");
    const nextManagers = [...productionManagers, cleaned];
    void persistChecklist(checklistItems, nextManagers, fileDetails);
  };

  const handleRemoveManager = (indexToRemove: number) => {
    setManagerNotice(null);
    const nextManagers = productionManagers.filter((_, idx) => idx !== indexToRemove);
    void persistChecklist(checklistItems, nextManagers, fileDetails);
  };

  const handleSaveFileEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = fileMemberName.trim().replace(/\s+/g, " ");
    const cleanCustomRole = fileCustomRole.trim().replace(/\s+/g, " ");
    const parsedSize = Number(fileSizeInput);
    const parsedCount = Number(fileCountInput);
    const cleanDrive = fileDriveName.trim().replace(/\s+/g, " ");

    if (!cleanName) {
      setFileFormError("Please enter the crew member's name.");
      return;
    }
    if (fileRole === "Custom" && !cleanCustomRole) {
      setFileFormError("Please specify the custom role.");
      return;
    }
    if (!fileSizeInput.trim() || !Number.isFinite(parsedSize) || parsedSize < 0) {
      setFileFormError("Please enter a valid file size.");
      return;
    }
    if (
      !fileCountInput.trim() ||
      !Number.isFinite(parsedCount) ||
      parsedCount < 0 ||
      !Number.isInteger(parsedCount)
    ) {
      setFileFormError("Please enter a valid whole-number file count.");
      return;
    }

    const entryId =
      editingEntryId ||
      `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const nextEntry: FileDetailEntry = {
      id: entryId,
      memberName: cleanName,
      role: fileRole,
      ...(fileRole === "Custom" ? { customRole: cleanCustomRole } : {}),
      fileSize: Number(parsedSize.toFixed(2)),
      sizeUnit: fileSizeUnit,
      fileCount: parsedCount,
      ...(cleanDrive ? { driveName: cleanDrive } : {}),
      updatedAt: new Date().toISOString(),
    };

    const nextFileDetails = editingEntryId
      ? fileDetails.map((item) => (item.id === editingEntryId ? nextEntry : item))
      : [...fileDetails, nextEntry];

    resetFileForm();
    void persistChecklist(checklistItems, productionManagers, nextFileDetails);
  };

  const handleStartEditFileEntry = (entry: FileDetailEntry) => {
    setEditingEntryId(entry.id);
    setFileMemberName(entry.memberName);
    setFileRole(entry.role);
    setFileCustomRole(entry.customRole || "");
    setFileSizeInput(String(entry.fileSize));
    setFileSizeUnit(entry.sizeUnit);
    setFileCountInput(String(entry.fileCount));
    setFileDriveName(entry.driveName || "");
    setFileFormError(null);
  };

  const handleRemoveFileEntry = (entryId: string) => {
    if (editingEntryId === entryId) {
      resetFileForm();
    }
    const nextFileDetails = fileDetails.filter((item) => item.id !== entryId);
    void persistChecklist(checklistItems, productionManagers, nextFileDetails);
  };

  return (
    <div className="min-h-[100dvh] bg-[#FAF8F5] text-[#1A1A1A] safe-bottom pb-16">
      {/* Header Bar */}
      <header className="bg-white border-b border-[#E5DDD2] sticky top-0 z-30 shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#FAF7F2] border border-[#E5DDD2] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#8C7043]" />
              <span>Back to Couples</span>
            </button>
            <div className="h-5 w-px bg-[#E5DDD2] hidden sm:block shrink-0" />
            <img
              src={
                STUDIO_LOGO_URL ||
                "https://res.cloudinary.com/pcodbmuo/image/upload/v1792483927/Black_OAKS_uctgsb.webp"
              }
              alt={STUDIO_NAME}
              className="h-8 w-auto object-contain hidden sm:block shrink-0"
            />
            <div className="h-5 w-px bg-[#E5DDD2] hidden md:block shrink-0" />
            <h1 className="font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A] truncate">
              Wedding Checklist
            </h1>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#FAF7F2] border border-[#E5DDD2] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 text-[#8C7043]" />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-6">
        {/* Loading State */}
        {isLoading && (
          <div className="bg-white border border-[#E5DDD2] rounded-2xl p-10 text-center space-y-3">
            <div className="w-7 h-7 border-2 border-[#B08D57] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-[#7A756D]">Loading production checklist...</p>
          </div>
        )}

        {/* Load Error State */}
        {!isLoading && loadError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3 text-red-900">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
            <div className="text-sm space-y-1">
              <p className="font-semibold">Unable to load couple submissions</p>
              <p className="text-red-700">{loadError}</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !loadError && submissions.length === 0 && (
          <div className="bg-white border border-[#E5DDD2] rounded-2xl p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF7F2] border border-[#E8DFD3] flex items-center justify-center mx-auto text-[#8C7043]">
              <ClipboardList className="w-6 h-6" />
            </div>
            <h2 className="font-cormorant text-2xl font-semibold text-[#1A1A1A]">
              No couple submissions yet
            </h2>
            <p className="text-sm text-[#7A756D] max-w-md mx-auto">
              Once a couple submits their questionnaire, you can select their wedding here and track every shoot-day checklist item.
            </p>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1A1A1A] text-white text-xs font-medium hover:bg-[#333333] transition-colors cursor-pointer"
            >
              Return to Couples
            </button>
          </div>
        )}

        {/* Active Checklist Workspace */}
        {!isLoading && !loadError && selectedCouple && (
          <>
            {/* Couple Selector & Summary Strip */}
            <section className="bg-white border border-[#E5DDD2] rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                  <label
                    htmlFor="checklist-couple-select"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#8C7043]"
                  >
                    Production Checklist · Wedding
                  </label>
                  <select
                    id="checklist-couple-select"
                    value={selectedCoupleId}
                    onChange={(e) => {
                      setSelectedCoupleId(e.target.value);
                      setConfirmResetOpen(false);
                      setManagerInput("");
                      setManagerNotice(null);
                      resetFileForm();
                      setSaveState("idle");
                      setSaveError(null);
                    }}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E5DDD2] text-sm sm:text-base font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#8C7043] cursor-pointer"
                  >
                    {submissions.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.displayId} · {sub.partner1} &amp; {sub.partner2}
                        {sub.weddingDate ? ` (${sub.weddingDate})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reset Controls */}
                <div className="flex items-center gap-2 shrink-0">
                  {!confirmResetOpen ? (
                    <button
                      type="button"
                      onClick={() => setConfirmResetOpen(true)}
                      disabled={counts.gotIt === 0 && counts.missed === 0}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-medium text-[#5F5F5F] hover:text-[#1A1A1A] bg-[#FAF8F5] hover:bg-[#F2ECE1] border border-[#E5DDD2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset checklist</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-[#FAF8F5] border border-[#E5DDD2] rounded-xl px-3 py-1.5">
                      <span className="text-xs text-[#5F5F5F] whitespace-nowrap">Clear all marks?</span>
                      <button
                        type="button"
                        onClick={handleResetChecklist}
                        className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 cursor-pointer whitespace-nowrap"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmResetOpen(false)}
                        className="px-2.5 py-1 rounded-lg text-xs text-[#5F5F5F] hover:text-[#1A1A1A] cursor-pointer whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata & Progress Counters */}
              <div className="pt-4 border-t border-[#F0E9DF] flex flex-wrap items-center justify-between gap-4 text-xs sm:text-sm">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 tabular-nums">
                  {selectedCouple.weddingDate && (
                    <span className="inline-flex items-center gap-1.5 text-[#5F5F5F]">
                      <Calendar className="w-3.5 h-3.5 text-[#8C7043]" />
                      <span>{selectedCouple.weddingDate}</span>
                    </span>
                  )}
                  <span className="text-emerald-700 font-medium">
                    ✅ Got it: {counts.gotIt}
                  </span>
                  <span className="text-red-700 font-medium">
                    ❌ Missed: {counts.missed}
                  </span>
                  <span className="text-[#7A756D]">
                    Remaining: {counts.remaining} / {TOTAL_CHECKLIST_ITEMS}
                  </span>
                </div>

                <div className="text-xs text-[#7A756D]">
                  {saveState === "saving" && <span>Saving changes...</span>}
                  {saveState === "saved" && (
                    <span className="text-emerald-700">Synced with team</span>
                  )}
                  {saveState === "idle" && selectedCouple.productionChecklist?.updatedAt && (
                    <span>
                      Last updated{" "}
                      {new Date(selectedCouple.productionChecklist.updatedAt).toLocaleString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        }
                      )}
                    </span>
                  )}
                </div>
              </div>

              {saveError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{saveError}</span>
                </div>
              )}
            </section>

            {/* Top Page Tab Switcher: Production Checklist vs File Details */}
            <div
              role="tablist"
              aria-label="Wedding Checklist Sections"
              className="flex items-center gap-2 border-b border-[#E5DDD2] pb-3 overflow-x-auto"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "checklist"}
                onClick={() => setActiveTab("checklist")}
                className={`min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === "checklist"
                    ? "bg-[#1A1A1A] text-white shadow-2xs"
                    : "bg-white text-[#5F5F5F] border border-[#E5DDD2] hover:text-[#1A1A1A] hover:bg-[#F2ECE1]"
                }`}
              >
                <ClipboardList
                  className={`w-4 h-4 ${
                    activeTab === "checklist" ? "text-[#B08D57]" : "text-[#8C7043]"
                  }`}
                />
                <span>Production Checklist</span>
                <span className="tabular-nums opacity-80">
                  ({counts.gotIt + counts.missed}/{TOTAL_CHECKLIST_ITEMS})
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "files"}
                onClick={() => setActiveTab("files")}
                className={`min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === "files"
                    ? "bg-[#1A1A1A] text-white shadow-2xs"
                    : "bg-white text-[#5F5F5F] border border-[#E5DDD2] hover:text-[#1A1A1A] hover:bg-[#F2ECE1]"
                }`}
              >
                <HardDrive
                  className={`w-4 h-4 ${
                    activeTab === "files" ? "text-[#B08D57]" : "text-[#8C7043]"
                  }`}
                />
                <span>File Details</span>
                <span className="tabular-nums opacity-80">({fileTotals.entries})</span>
              </button>
            </div>

            {activeTab === "checklist" && (
              <>
                {/* Production Manager(s) Assignment (Above Tech riders) */}
            <section className="bg-white border border-[#E5DDD2] rounded-2xl overflow-hidden">
              <div className="px-5 sm:px-6 py-4 bg-[#FAF8F5] border-b border-[#E5DDD2] flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-4 h-4 text-[#8C7043] shrink-0" />
                  <h2 className="font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A]">
                    Production Manager(s)
                  </h2>
                </div>
                <span className="text-xs text-[#7A756D] tabular-nums whitespace-nowrap">
                  {productionManagers.length} assigned
                </span>
              </div>

              <div className="p-5 sm:p-6 space-y-4">
                <form
                  onSubmit={handleAddManager}
                  className="flex flex-col sm:flex-row gap-2.5"
                >
                  <label htmlFor="production-manager-input" className="sr-only">
                    Production Manager Name
                  </label>
                  <input
                    id="production-manager-input"
                    type="text"
                    value={managerInput}
                    onChange={(e) => {
                      setManagerInput(e.target.value);
                      if (managerNotice) setManagerNotice(null);
                    }}
                    placeholder="Enter production manager name..."
                    className="w-full sm:flex-1 min-w-0 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E5DDD2] text-sm sm:text-[15px] text-[#1A1A1A] placeholder:text-[#9A948C] focus:outline-hidden focus:border-[#8C7043]"
                  />
                  <button
                    type="submit"
                    disabled={!managerInput.trim()}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#1A1A1A] hover:bg-[#333333] text-white text-xs sm:text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Save
                  </button>
                </form>

                {managerNotice && (
                  <p className="text-xs text-[#8C7043]">{managerNotice}</p>
                )}

                {productionManagers.length === 0 ? (
                  <p className="text-xs sm:text-sm text-[#7A756D]">
                    No production manager assigned yet for this wedding.
                  </p>
                ) : (
                  <div className="divide-y divide-[#F0E9DF] border-t border-[#F0E9DF]">
                    {productionManagers.map((managerName, idx) => (
                      <div
                        key={`${managerName}-${idx}`}
                        className="py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-medium text-[#8C7043] tabular-nums w-5 shrink-0">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span className="text-sm sm:text-[15px] font-medium text-[#1A1A1A] truncate">
                            {managerName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveManager(idx)}
                          aria-label={`Remove ${managerName}`}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs text-[#7A756D] hover:text-red-700 hover:bg-red-50 transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Checklist Sections */}
            <div className="space-y-6">
              {WEDDING_PRODUCTION_CHECKLIST.map((section) => {
                const sectionGotIt = section.items.filter(
                  (it) => checklistItems[it.id] === "got_it"
                ).length;
                const sectionMissed = section.items.filter(
                  (it) => checklistItems[it.id] === "missed"
                ).length;

                return (
                  <section
                    key={section.id}
                    className="bg-white border border-[#E5DDD2] rounded-2xl overflow-hidden"
                  >
                    {/* Section Header */}
                    <div className="px-5 sm:px-6 py-4 bg-[#FAF8F5] border-b border-[#E5DDD2] flex items-center justify-between gap-4">
                      <h2 className="font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A]">
                        {section.title}
                      </h2>
                      <div className="text-xs text-[#7A756D] tabular-nums whitespace-nowrap">
                        <span>{sectionGotIt} / {section.items.length} got it</span>
                        {sectionMissed > 0 && (
                          <span className="text-red-700 ml-2">· {sectionMissed} missed</span>
                        )}
                      </div>
                    </div>

                    {/* Section Items */}
                    <div className="divide-y divide-[#F0E9DF]">
                      {section.items.map((item, idx) => {
                        const status = checklistItems[item.id];
                        const isGotIt = status === "got_it";
                        const isMissed = status === "missed";

                        return (
                          <div
                            key={item.id}
                            className={`px-5 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                              isGotIt
                                ? "bg-emerald-50/40"
                                : isMissed
                                ? "bg-red-50/40"
                                : "hover:bg-[#FAF8F5]/70"
                            }`}
                          >
                            <div className="flex items-baseline gap-3 min-w-0">
                              <span className="text-xs font-medium text-[#8C7043] tabular-nums w-5 shrink-0">
                                {String(idx + 1).padStart(2, "0")}
                              </span>
                              <span className="text-sm sm:text-[15px] text-[#1A1A1A] leading-snug">
                                {item.label}
                              </span>
                            </div>

                            {/* Separate Got It (✅) and Missed (❌) Buttons */}
                            <div className="flex items-center gap-2 sm:shrink-0 pl-8 sm:pl-0">
                              <button
                                type="button"
                                aria-pressed={isGotIt}
                                onClick={() => handleToggleItem(item.id, "got_it")}
                                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                                  isGotIt
                                    ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                                    : "bg-white text-[#1A1A1A] border-[#E5DDD2] hover:border-emerald-500 hover:bg-emerald-50"
                                }`}
                              >
                                <span aria-hidden="true">✅</span>
                                <span>Got it</span>
                              </button>

                              <button
                                type="button"
                                aria-pressed={isMissed}
                                onClick={() => handleToggleItem(item.id, "missed")}
                                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                                  isMissed
                                    ? "bg-red-600 text-white border-red-600 shadow-2xs"
                                    : "bg-white text-[#1A1A1A] border-[#E5DDD2] hover:border-red-500 hover:bg-red-50"
                                }`}
                              >
                                <span aria-hidden="true">❌</span>
                                <span>Missed</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

                {/* Bottom quick switch to File Details */}
                <div className="bg-white border border-[#E5DDD2] rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-[#1A1A1A]">
                      Crew Drive Backups &amp; File Sizes
                    </p>
                    <p className="text-xs sm:text-sm text-[#7A756D]">
                      Log each photographer, videographer, drone, or editor&apos;s copied file size and count for post-production handoff.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("files");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#1A1A1A] hover:bg-[#333333] text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Open File Details</span>
                    <ArrowRight className="w-4 h-4 text-[#B08D57]" />
                  </button>
                </div>
              </>
            )}

            {/* TAB 2: FILE DETAILS */}
            {activeTab === "files" && (
              <div className="space-y-6">
                {/* Summary Totals Card */}
                <section className="bg-white border border-[#E5DDD2] rounded-2xl p-5 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 divide-y sm:divide-y-0 sm:divide-x divide-[#F0E9DF]">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#8C7043]">
                        Crew Transfers Logged
                      </p>
                      <p className="font-cormorant text-3xl font-semibold text-[#1A1A1A] tabular-nums">
                        {fileTotals.entries}
                      </p>
                    </div>
                    <div className="pt-3 sm:pt-0 sm:pl-6 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#8C7043]">
                        Total File Count
                      </p>
                      <p className="font-cormorant text-3xl font-semibold text-[#1A1A1A] tabular-nums">
                        {fileTotals.totalFiles.toLocaleString()}
                      </p>
                    </div>
                    <div className="pt-3 sm:pt-0 sm:pl-6 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#8C7043]">
                        Total Copied Size
                      </p>
                      <p className="font-cormorant text-3xl font-semibold text-[#1A1A1A] tabular-nums">
                        {fileTotals.formattedSize}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Add / Edit Crew File Entry Form */}
                <section className="bg-white border border-[#E5DDD2] rounded-2xl overflow-hidden">
                  <div className="px-5 sm:px-6 py-4 bg-[#FAF8F5] border-b border-[#E5DDD2] flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <HardDrive className="w-4 h-4 text-[#8C7043] shrink-0" />
                      <h2 className="font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A]">
                        {editingEntryId ? "Edit Crew File Entry" : "Add Crew File Entry"}
                      </h2>
                    </div>
                    {editingEntryId && (
                      <button
                        type="button"
                        onClick={resetFileForm}
                        className="text-xs font-medium text-[#7A756D] hover:text-[#1A1A1A] cursor-pointer whitespace-nowrap"
                      >
                        Cancel edit
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleSaveFileEntry} className="p-5 sm:p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="file-member-name"
                          className="block text-xs font-semibold text-[#1A1A1A]"
                        >
                          Crew Member Name
                        </label>
                        <input
                          id="file-member-name"
                          type="text"
                          value={fileMemberName}
                          onChange={(e) => {
                            setFileMemberName(e.target.value);
                            if (fileFormError) setFileFormError(null);
                          }}
                          placeholder="e.g. Arjun Nair"
                          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E5DDD2] text-sm text-[#1A1A1A] placeholder:text-[#9A948C] focus:outline-hidden focus:border-[#8C7043]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="file-member-role"
                          className="block text-xs font-semibold text-[#1A1A1A]"
                        >
                          Role
                        </label>
                        <select
                          id="file-member-role"
                          value={fileRole}
                          onChange={(e) => {
                            setFileRole(e.target.value as CrewFileRole);
                            if (fileFormError) setFileFormError(null);
                          }}
                          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E5DDD2] text-sm text-[#1A1A1A] focus:outline-hidden focus:border-[#8C7043] cursor-pointer"
                        >
                          <option value="Photographer">Photographer</option>
                          <option value="Videographer">Videographer</option>
                          <option value="Drone">Drone</option>
                          <option value="Editor">Editor</option>
                          <option value="Custom">Custom</option>
                        </select>
                      </div>
                    </div>

                    {fileRole === "Custom" && (
                      <div className="space-y-1.5">
                        <label
                          htmlFor="file-custom-role"
                          className="block text-xs font-semibold text-[#1A1A1A]"
                        >
                          Specify Custom Role
                        </label>
                        <input
                          id="file-custom-role"
                          type="text"
                          value={fileCustomRole}
                          onChange={(e) => {
                            setFileCustomRole(e.target.value);
                            if (fileFormError) setFileFormError(null);
                          }}
                          placeholder="e.g. Candid Photographer / Same-Day Editor"
                          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E5DDD2] text-sm text-[#1A1A1A] placeholder:text-[#9A948C] focus:outline-hidden focus:border-[#8C7043]"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="file-size-input"
                          className="block text-xs font-semibold text-[#1A1A1A]"
                        >
                          Copied File Size
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="file-size-input"
                            type="number"
                            step="0.01"
                            min="0"
                            value={fileSizeInput}
                            onChange={(e) => {
                              setFileSizeInput(e.target.value);
                              if (fileFormError) setFileFormError(null);
                            }}
                            placeholder="e.g. 245.5"
                            className="w-full min-w-0 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E5DDD2] text-sm text-[#1A1A1A] tabular-nums placeholder:text-[#9A948C] focus:outline-hidden focus:border-[#8C7043]"
                          />
                          <select
                            aria-label="File size unit"
                            value={fileSizeUnit}
                            onChange={(e) => setFileSizeUnit(e.target.value as FileSizeUnit)}
                            className="min-h-[44px] px-3 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E5DDD2] text-sm font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#8C7043] cursor-pointer shrink-0"
                          >
                            <option value="GB">GB</option>
                            <option value="TB">TB</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="file-count-input"
                          className="block text-xs font-semibold text-[#1A1A1A]"
                        >
                          File Count
                        </label>
                        <input
                          id="file-count-input"
                          type="number"
                          step="1"
                          min="0"
                          value={fileCountInput}
                          onChange={(e) => {
                            setFileCountInput(e.target.value);
                            if (fileFormError) setFileFormError(null);
                          }}
                          placeholder="e.g. 1840"
                          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E5DDD2] text-sm text-[#1A1A1A] tabular-nums placeholder:text-[#9A948C] focus:outline-hidden focus:border-[#8C7043]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="file-drive-input"
                          className="block text-xs font-semibold text-[#1A1A1A]"
                        >
                          Drive Name / Note (optional)
                        </label>
                        <input
                          id="file-drive-input"
                          type="text"
                          value={fileDriveName}
                          onChange={(e) => setFileDriveName(e.target.value)}
                          placeholder="e.g. SanDisk SSD 1"
                          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E5DDD2] text-sm text-[#1A1A1A] placeholder:text-[#9A948C] focus:outline-hidden focus:border-[#8C7043]"
                        />
                      </div>
                    </div>

                    {fileFormError && (
                      <p className="text-xs text-red-700 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{fileFormError}</span>
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-2.5 pt-1">
                      {editingEntryId && (
                        <button
                          type="button"
                          onClick={resetFileForm}
                          className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#E5DDD2] text-xs sm:text-sm font-medium text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#FAF8F5] transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="submit"
                        className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#1A1A1A] hover:bg-[#333333] text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {editingEntryId ? "Update Entry" : "Save Entry"}
                      </button>
                    </div>
                  </form>
                </section>

                {/* Recorded File Transfers List */}
                <section className="bg-white border border-[#E5DDD2] rounded-2xl overflow-hidden">
                  <div className="px-5 sm:px-6 py-4 bg-[#FAF8F5] border-b border-[#E5DDD2] flex items-center justify-between gap-4">
                    <h2 className="font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A]">
                      Recorded Crew File Transfers
                    </h2>
                    <span className="text-xs text-[#7A756D] tabular-nums whitespace-nowrap">
                      {fileDetails.length} {fileDetails.length === 1 ? "entry" : "entries"}
                    </span>
                  </div>

                  {fileDetails.length === 0 ? (
                    <div className="p-10 text-center space-y-2">
                      <p className="text-sm font-medium text-[#1A1A1A]">
                        No crew file transfers recorded yet
                      </p>
                      <p className="text-xs sm:text-sm text-[#7A756D] max-w-md mx-auto">
                        Add each photographer, videographer, drone pilot, or editor above once their files are copied to record exact file sizes and counts.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#F0E9DF]">
                      {fileDetails.map((entry, idx) => {
                        const displayRole =
                          entry.role === "Custom" && entry.customRole
                            ? entry.customRole
                            : entry.role;

                        return (
                          <div
                            key={entry.id}
                            className="px-5 sm:px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#FAF8F5]/70 transition-colors"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span className="text-xs font-medium text-[#8C7043] tabular-nums w-5 pt-0.5 shrink-0">
                                {String(idx + 1).padStart(2, "0")}
                              </span>
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                                  <span className="text-sm sm:text-[15px] font-semibold text-[#1A1A1A]">
                                    {entry.memberName}
                                  </span>
                                  <span className="text-xs text-[#8C7043]" aria-hidden="true">
                                    ·
                                  </span>
                                  <span className="text-xs sm:text-sm text-[#5F5F5F]">
                                    {displayRole}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#7A756D] tabular-nums">
                                  {entry.driveName && (
                                    <span>Drive: {entry.driveName}</span>
                                  )}
                                  {entry.driveName && (
                                    <span aria-hidden="true">·</span>
                                  )}
                                  <span>
                                    Logged{" "}
                                    {new Date(entry.updatedAt).toLocaleString(
                                      undefined,
                                      {
                                        month: "short",
                                        day: "numeric",
                                        hour: "numeric",
                                        minute: "2-digit",
                                      }
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between lg:justify-end gap-4 sm:gap-6 pl-8 lg:pl-0 shrink-0">
                              <div className="flex items-center gap-5 tabular-nums text-right">
                                <div>
                                  <p className="text-[11px] uppercase tracking-wider text-[#7A756D]">
                                    Size
                                  </p>
                                  <p className="text-sm sm:text-[15px] font-semibold text-[#1A1A1A]">
                                    {entry.fileSize} {entry.sizeUnit}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-wider text-[#7A756D]">
                                    Files
                                  </p>
                                  <p className="text-sm sm:text-[15px] font-semibold text-[#1A1A1A]">
                                    {entry.fileCount.toLocaleString()}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditFileEntry(entry)}
                                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E5DDD2] bg-white hover:bg-[#FAF7F2] text-xs font-medium text-[#1A1A1A] inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-[#8C7043]" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFileEntry(entry.id)}
                                  aria-label={`Remove ${entry.memberName}`}
                                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E5DDD2] bg-white hover:bg-red-50 hover:border-red-300 text-xs font-medium text-[#7A756D] hover:text-red-700 inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Remove</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
