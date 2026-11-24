/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  LogOut,
  AlertCircle,
  ClipboardList,
  UserCheck,
  X,
  HardDrive,
  Edit3,
  ArrowRight,
  Lock,
  CheckCircle2,
  Plus,
  Trash2,
  Clock,
  User,
  Star,
} from "lucide-react";
import {
  CameraStarredStatus,
  ChecklistEventKey,
  ChecklistItemStatus,
  CrewFileRole,
  CustomProductionEvent,
  EventSubmissionRecord,
  FileDetailEntry,
  FileSizeUnit,
  ProductionChecklistData,
  SubmissionRecord,
} from "../types/questionnaire.ts";
import {
  CHECKLIST_EVENTS,
  getChecklistSectionsForEvent,
  getTotalChecklistItemsForEvent,
  buildSubmittedCustomEventData,
  buildSubmittedStandardEventData,
  buildUpdatedChecklistData,
  buildUpdatedManagersChecklistData,
  canDeleteEvent,
  countChecklistProgress,
  createCustomEventId,
  getEventChecklistItems,
  getEventFileDetails,
  getEventUpdatedAt,
  getStandardEventSubmission,
  isStandardEventKey,
  isStandardEventLocked,
  mergeCustomEvents,
  summarizeFileDetails,
} from "../constants/productionChecklist.ts";
import {
  createCustomProductionEvent,
  deleteCustomProductionEvent,
  getCachedSubmissions,
  getSubmissions,
  subscribeCustomProductionEvents,
  subscribeEventSubmissions,
  subscribeSubmissionChecklist,
  submitCustomProductionEvent,
  submitStandardChecklistEvent,
  updateCustomProductionEvent,
  updateSubmissionChecklist,
} from "../lib/submissions.ts";
import { STUDIO_LOGO_URL, STUDIO_NAME } from "../constants.ts";

function pickInitialCoupleId(records: SubmissionRecord[] | null): string {
  if (!records || records.length === 0) return "";
  try {
    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("coupleId");
    const matching = requestedId ? records.find((r) => r.id === requestedId) : undefined;
    return matching ? matching.id : records[0].id;
  } catch {
    return records[0].id;
  }
}

interface AdminWeddingChecklistProps {
  onBack: () => void;
  onSignOut: () => void;
  userEmail?: string;
  userName?: string;
}

interface UnifiedEventItem {
  id: string;
  label: string;
  isCustom: boolean;
  items: Record<string, ChecklistItemStatus>;
  fileDetails: FileDetailEntry[];
  isSubmitted: boolean;
  submission?: EventSubmissionRecord;
  updatedAt?: string;
  customDoc?: CustomProductionEvent;
}

export const AdminWeddingChecklist: React.FC<AdminWeddingChecklistProps> = ({
  onBack,
  onSignOut,
  userEmail,
  userName,
}) => {
  const initialCached = useMemo(() => getCachedSubmissions(), []);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>(
    () => initialCached ?? []
  );
  const [selectedCoupleId, setSelectedCoupleId] = useState<string>(
    () => pickInitialCoupleId(initialCached)
  );
  const [isLoading, setIsLoading] = useState<boolean>(() => !initialCached);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [managerInput, setManagerInput] = useState<string>("");
  const [managerNotice, setManagerNotice] = useState<string | null>(null);

  // Real-time custom events & immutable event submission archive for active couple
  const [subcollectionCustomEvents, setSubcollectionCustomEvents] = useState<
    CustomProductionEvent[]
  >([]);
  const [archivedSubmissions, setArchivedSubmissions] = useState<
    Record<string, EventSubmissionRecord>
  >({});

  // Top-level page tabs: Production Checklist vs File Details
  const [activeTab, setActiveTab] = useState<"checklist" | "files">("checklist");
  // Active event ID: standard ('sangeet' | 'wedding' | 'reception') or custom event doc ID
  const [activeEventId, setActiveEventId] = useState<string>("wedding");

  // Add Custom Event modal state
  const [addEventModalOpen, setAddEventModalOpen] = useState<boolean>(false);
  const [newEventName, setNewEventName] = useState<string>("");
  const [addEventError, setAddEventError] = useState<string | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState<boolean>(false);

  // Delete Custom Event modal state (only for unsubmitted custom events)
  const [eventToDelete, setEventToDelete] = useState<UnifiedEventItem | null>(null);
  const [isDeletingEvent, setIsDeletingEvent] = useState<boolean>(false);
  const [deleteEventError, setDeleteEventError] = useState<string | null>(null);

  // Submit Event confirmation modal & file entry prerequisite notice state
  const [submitModalOpen, setSubmitModalOpen] = useState<boolean>(false);
  const [submitterNameInput, setSubmitterNameInput] = useState<string>("");
  const [submitModalError, setSubmitModalError] = useState<string | null>(null);
  const [isSubmittingEvent, setIsSubmittingEvent] = useState<boolean>(false);
  const [submitBlockedNotice, setSubmitBlockedNotice] = useState<string | null>(null);

  // File Details form state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [fileMemberName, setFileMemberName] = useState<string>("");
  const [fileRole, setFileRole] = useState<CrewFileRole>("Photographer");
  const [fileCustomRole, setFileCustomRole] = useState<string>("");
  const [fileCameraStarred, setFileCameraStarred] = useState<
    CameraStarredStatus | ""
  >("");
  const [fileSizeInput, setFileSizeInput] = useState<string>("");
  const [fileSizeUnit, setFileSizeUnit] = useState<FileSizeUnit>("GB");
  const [fileCountInput, setFileCountInput] = useState<string>("");
  const [fileDriveName, setFileDriveName] = useState<string>("");
  const [fileFormError, setFileFormError] = useState<string | null>(null);

  // Load couples for the selector (0ms from cache + background SWR refresh)
  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!getCachedSubmissions()) {
        setIsLoading(true);
      }
      setLoadError(null);
      try {
        const records = await getSubmissions(false, (fresh) => {
          if (!isMounted) return;
          setSubmissions(fresh);
          setSelectedCoupleId((prev) =>
            prev && fresh.some((r) => r.id === prev) ? prev : pickInitialCoupleId(fresh)
          );
        });
        if (!isMounted) return;
        setSubmissions(records);

        if (records.length > 0) {
          setSelectedCoupleId((prev) =>
            prev && records.some((r) => r.id === prev)
              ? prev
              : pickInitialCoupleId(records)
          );
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

  // Subscribe to real-time updates for checklist, custom events, and immutable submission archives
  useEffect(() => {
    if (!selectedCoupleId) return;
    setSubcollectionCustomEvents([]);
    setArchivedSubmissions({});

    const unsubChecklist = subscribeSubmissionChecklist(
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

    const unsubCustom = subscribeCustomProductionEvents(
      selectedCoupleId,
      (eventsList) => {
        setSubcollectionCustomEvents(eventsList);
      },
      (err) => {
        setSaveError(err.message);
        setSaveState("error");
      }
    );

    const unsubArchives = subscribeEventSubmissions(
      selectedCoupleId,
      (archivesMap) => {
        setArchivedSubmissions(archivesMap);
      },
      (err) => {
        setSaveError(err.message);
        setSaveState("error");
      }
    );

    return () => {
      unsubChecklist();
      unsubCustom();
      unsubArchives();
    };
  }, [selectedCoupleId]);

  const selectedCouple = useMemo(
    () => submissions.find((s) => s.id === selectedCoupleId) ?? null,
    [submissions, selectedCoupleId]
  );

  const customEvents = useMemo(
    () =>
      mergeCustomEvents(
        subcollectionCustomEvents,
        selectedCouple?.productionChecklist?.customEvents
      ),
    [subcollectionCustomEvents, selectedCouple?.productionChecklist?.customEvents]
  );

  const productionManagers: string[] =
    selectedCouple?.productionChecklist?.productionManagers ?? [];

  // Unified list of Standard Events + Custom Events for this couple
  const allEvents = useMemo<UnifiedEventItem[]>(() => {
    const checklist = selectedCouple?.productionChecklist;

    const standardItems: UnifiedEventItem[] = CHECKLIST_EVENTS.map((ev) => {
      const submitted = isStandardEventLocked(checklist, ev.id, archivedSubmissions);
      const submission = getStandardEventSubmission(checklist, ev.id, archivedSubmissions);
      const items =
        submitted && submission?.items
          ? submission.items
          : getEventChecklistItems(checklist, ev.id);
      const fileDetails =
        submitted && Array.isArray(submission?.fileDetails)
          ? submission.fileDetails
          : getEventFileDetails(checklist, ev.id);

      return {
        id: ev.id,
        label: ev.label,
        isCustom: false,
        items,
        fileDetails,
        isSubmitted: submitted,
        submission,
        updatedAt: submission?.submittedAt ?? getEventUpdatedAt(checklist, ev.id),
      };
    });

    const customItems: UnifiedEventItem[] = customEvents.map((ev) => {
      const archive = archivedSubmissions[ev.id];
      const submission = archive ?? ev.submission;
      const submitted = Boolean(ev.submitted || submission);
      return {
        id: ev.id,
        label: ev.name,
        isCustom: true,
        items: submitted && submission?.items ? submission.items : ev.items ?? {},
        fileDetails:
          submitted && Array.isArray(submission?.fileDetails)
            ? submission.fileDetails
            : ev.fileDetails ?? [],
        isSubmitted: submitted,
        submission,
        updatedAt: submission?.submittedAt ?? ev.updatedAt,
        customDoc: ev,
      };
    });

    return [...standardItems, ...customItems];
  }, [selectedCouple?.productionChecklist, customEvents, archivedSubmissions]);

  // Keep activeEventId valid if custom events change or couple changes (always defaults to Wedding Day)
  useEffect(() => {
    if (!allEvents.some((ev) => ev.id === activeEventId)) {
      setActiveEventId("wedding");
    }
  }, [allEvents, activeEventId]);

  const activeEventObj = useMemo<UnifiedEventItem>(
    () =>
      allEvents.find((ev) => ev.id === activeEventId) ??
      allEvents.find((ev) => ev.id === "wedding") ??
      allEvents[0],
    [allEvents, activeEventId]
  );

  const checklistItems = activeEventObj.items;
  const fileDetails = activeEventObj.fileDetails;
  const isLocked = activeEventObj.isSubmitted;
  const activeSubmission = activeEventObj.submission;

  const eventProgressById = useMemo(() => {
    const map: Record<
      string,
      { gotIt: number; missed: number; remaining: number; total: number }
    > = {};
    for (const ev of allEvents) {
      map[ev.id] = countChecklistProgress(ev.items, ev.id);
    }
    return map;
  }, [allEvents]);

  const activeChecklistSections = useMemo(
    () => getChecklistSectionsForEvent(activeEventObj.id),
    [activeEventObj.id]
  );

  const activeTotalItems = useMemo(
    () => getTotalChecklistItemsForEvent(activeEventObj.id),
    [activeEventObj.id]
  );

  const counts = eventProgressById[activeEventObj.id] ?? {
    gotIt: 0,
    missed: 0,
    remaining: activeTotalItems,
    total: activeTotalItems,
  };

  const fileTotals = useMemo(() => summarizeFileDetails(fileDetails), [fileDetails]);

  const combinedFileTotals = useMemo(
    () => summarizeFileDetails(allEvents.flatMap((ev) => ev.fileDetails)),
    [allEvents]
  );

  const resetFileForm = () => {
    setEditingEntryId(null);
    setFileMemberName("");
    setFileRole("Photographer");
    setFileCustomRole("");
    setFileCameraStarred("");
    setFileSizeInput("");
    setFileSizeUnit("GB");
    setFileCountInput("");
    setFileDriveName("");
    setFileFormError(null);
  };

  const persistActiveEventChanges = async (
    nextEventItems: Record<string, ChecklistItemStatus>,
    nextEventFileDetails: FileDetailEntry[]
  ) => {
    if (!selectedCouple) return;
    if (activeEventObj.isSubmitted) {
      setSaveState("error");
      setSaveError(
        `${activeEventObj.label} has already been submitted and is permanently locked.`
      );
      return;
    }

    const updatedBy = userEmail || userName || "Admin";
    setSaveState("saving");
    setSaveError(null);

    if (activeEventObj.isCustom && activeEventObj.customDoc) {
      const previousSubcollectionCustom = subcollectionCustomEvents;
      const previousChecklist = selectedCouple.productionChecklist;
      const nowIso = new Date().toISOString();
      const updatedCustomEvent: CustomProductionEvent = {
        ...activeEventObj.customDoc,
        items: nextEventItems,
        fileDetails: nextEventFileDetails,
        updatedAt: nowIso,
        updatedBy,
      };

      setSubcollectionCustomEvents((prev) =>
        prev.some((ev) => ev.id === activeEventObj.id)
          ? prev.map((ev) => (ev.id === activeEventObj.id ? updatedCustomEvent : ev))
          : prev
      );
      if (previousChecklist?.customEvents?.[activeEventObj.id]) {
        setSubmissions((prev) =>
          prev.map((rec) =>
            rec.id === selectedCouple.id && rec.productionChecklist
              ? {
                  ...rec,
                  productionChecklist: {
                    ...rec.productionChecklist,
                    customEvents: {
                      ...rec.productionChecklist.customEvents,
                      [activeEventObj.id]: updatedCustomEvent,
                    },
                  },
                }
              : rec
          )
        );
      }

      try {
        const { fallbackChecklist } = await updateCustomProductionEvent(
          selectedCouple.id,
          activeEventObj.customDoc,
          {
            items: nextEventItems,
            fileDetails: nextEventFileDetails,
            updatedBy,
          },
          previousChecklist
        );
        if (fallbackChecklist) {
          setSubmissions((prev) =>
            prev.map((rec) =>
              rec.id === selectedCouple.id
                ? { ...rec, productionChecklist: fallbackChecklist }
                : rec
            )
          );
        }
        setSaveState("saved");
      } catch (err: any) {
        setSubcollectionCustomEvents(previousSubcollectionCustom);
        setSubmissions((prev) =>
          prev.map((rec) =>
            rec.id === selectedCouple.id
              ? { ...rec, productionChecklist: previousChecklist }
              : rec
          )
        );
        setSaveState("error");
        setSaveError(
          err?.message || "Failed to update custom event. Locked events cannot be edited."
        );
      }
      return;
    }

    const eventKey = activeEventObj.id as ChecklistEventKey;
    const previousChecklist = selectedCouple.productionChecklist;

    let nextChecklist: ProductionChecklistData;
    try {
      nextChecklist = buildUpdatedChecklistData(
        previousChecklist,
        eventKey,
        nextEventItems,
        productionManagers,
        nextEventFileDetails,
        updatedBy,
        archivedSubmissions
      );
    } catch (err: any) {
      setSaveState("error");
      setSaveError(err?.message || "This event is permanently locked.");
      return;
    }

    setSubmissions((prev) =>
      prev.map((rec) =>
        rec.id === selectedCouple.id
          ? { ...rec, productionChecklist: nextChecklist }
          : rec
      )
    );

    try {
      await updateSubmissionChecklist(selectedCouple.id, nextChecklist);
      setSaveState("saved");
    } catch (err: any) {
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

  const persistManagersOnly = async (nextManagers: string[]) => {
    if (!selectedCouple) return;
    const previousChecklist = selectedCouple.productionChecklist;
    const updatedBy = userEmail || userName || "Admin";
    const nextChecklist = buildUpdatedManagersChecklistData(
      previousChecklist,
      nextManagers,
      updatedBy
    );

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
      setSubmissions((prev) =>
        prev.map((rec) =>
          rec.id === selectedCouple.id
            ? { ...rec, productionChecklist: previousChecklist }
            : rec
        )
      );
      setSaveState("error");
      setSaveError(err?.message || "Failed to update production managers.");
    }
  };

  const handleToggleItem = (itemId: string, targetStatus: ChecklistItemStatus) => {
    if (isLocked) return;
    const nextItems = { ...checklistItems };
    if (nextItems[itemId] === targetStatus) {
      delete nextItems[itemId];
    } else {
      nextItems[itemId] = targetStatus;
    }

    void persistActiveEventChanges(nextItems, fileDetails);
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
    void persistManagersOnly(nextManagers);
  };

  const handleRemoveManager = (indexToRemove: number) => {
    setManagerNotice(null);
    const nextManagers = productionManagers.filter((_, idx) => idx !== indexToRemove);
    void persistManagersOnly(nextManagers);
  };

  const handleSaveFileEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

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
    if (fileRole === "Photographer" && !fileCameraStarred) {
      setFileFormError(
        "Please select whether the photographer has starred the main images in their camera."
      );
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
      ...(fileRole === "Photographer" && fileCameraStarred
        ? { cameraStarredStatus: fileCameraStarred }
        : {}),
      fileSize: Number(parsedSize.toFixed(2)),
      sizeUnit: fileSizeUnit,
      fileCount: parsedCount,
      ...(cleanDrive ? { driveName: cleanDrive } : {}),
      updatedAt: new Date().toISOString(),
    };

    const nextFileDetails = editingEntryId
      ? fileDetails.map((item) => (item.id === editingEntryId ? nextEntry : item))
      : [...fileDetails, nextEntry];

    if (nextFileDetails.length > 0 && submitBlockedNotice) {
      setSubmitBlockedNotice(null);
    }

    resetFileForm();
    void persistActiveEventChanges(checklistItems, nextFileDetails);
  };

  const handleStartEditFileEntry = (entry: FileDetailEntry) => {
    if (isLocked) return;
    setEditingEntryId(entry.id);
    setFileMemberName(entry.memberName);
    setFileRole(entry.role);
    setFileCustomRole(entry.customRole || "");
    setFileCameraStarred(
      entry.role === "Photographer" && entry.cameraStarredStatus
        ? entry.cameraStarredStatus
        : ""
    );
    setFileSizeInput(String(entry.fileSize));
    setFileSizeUnit(entry.sizeUnit);
    setFileCountInput(String(entry.fileCount));
    setFileDriveName(entry.driveName || "");
    setFileFormError(null);
  };

  const handleRemoveFileEntry = (entryId: string) => {
    if (isLocked) return;
    if (editingEntryId === entryId) {
      resetFileForm();
    }
    const nextFileDetails = fileDetails.filter((item) => item.id !== entryId);
    void persistActiveEventChanges(checklistItems, nextFileDetails);
  };

  // Add Custom Event Handler
  const handleCreateCustomEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCouple) return;
    const cleaned = newEventName.trim().replace(/\s+/g, " ");
    if (!cleaned) {
      setAddEventError("Please enter an event name.");
      return;
    }
    if (cleaned.length > 60) {
      setAddEventError("Event name must be 60 characters or fewer.");
      return;
    }
    const lower = cleaned.toLowerCase();
    const duplicateExists =
      lower === "wedding" ||
      allEvents.some((ev) => ev.label.trim().toLowerCase() === lower);
    if (duplicateExists) {
      setAddEventError(`An event named "${cleaned}" already exists for this couple.`);
      return;
    }

    setIsCreatingEvent(true);
    setAddEventError(null);
    const newId = createCustomEventId(cleaned);
    try {
      const { event: created, fallbackChecklist } = await createCustomProductionEvent(
        selectedCouple.id,
        newId,
        cleaned,
        userEmail || userName || "Admin",
        selectedCouple.productionChecklist
      );
      if (fallbackChecklist) {
        setSubmissions((prev) =>
          prev.map((rec) =>
            rec.id === selectedCouple.id
              ? { ...rec, productionChecklist: fallbackChecklist }
              : rec
          )
        );
      } else {
        setSubcollectionCustomEvents((prev) =>
          prev.some((ev) => ev.id === created.id) ? prev : [...prev, created]
        );
      }
      setActiveEventId(created.id);
      setNewEventName("");
      setAddEventModalOpen(false);
      setSubmitBlockedNotice(null);
      resetFileForm();
    } catch (err: any) {
      setAddEventError(err?.message || "Failed to add custom event.");
    } finally {
      setIsCreatingEvent(false);
    }
  };

  // Delete Custom Event Handler (enforced unsubmitted + custom only)
  const handleConfirmDeleteEvent = async () => {
    if (!selectedCouple || !eventToDelete) return;
    if (
      !canDeleteEvent(
        eventToDelete.id,
        eventToDelete.isCustom,
        eventToDelete.isSubmitted
      )
    ) {
      setDeleteEventError("Standard events and submitted events cannot be deleted.");
      return;
    }

    setIsDeletingEvent(true);
    setDeleteEventError(null);
    const targetId = eventToDelete.id;
    try {
      const { fallbackChecklist } = await deleteCustomProductionEvent(
        selectedCouple.id,
        targetId,
        userEmail || userName || "Admin",
        selectedCouple.productionChecklist
      );
      if (fallbackChecklist) {
        setSubmissions((prev) =>
          prev.map((rec) =>
            rec.id === selectedCouple.id
              ? { ...rec, productionChecklist: fallbackChecklist }
              : rec
          )
        );
      }
      setSubcollectionCustomEvents((prev) => prev.filter((ev) => ev.id !== targetId));
      setEventToDelete(null);
      if (activeEventId === targetId) {
        setActiveEventId("wedding");
        setSubmitBlockedNotice(null);
      }
      resetFileForm();
    } catch (err: any) {
      setDeleteEventError(
        err?.message || "Could not delete this event. Submitted events are locked."
      );
    } finally {
      setIsDeletingEvent(false);
    }
  };

  // Open Submit Event confirmation dialog (requires at least 1 crew file entry; never blocks on Missed or unmarked checklist items)
  const handleOpenSubmitModal = () => {
    if (isLocked) return;

    if (fileDetails.length === 0) {
      setSubmitBlockedNotice(
        `Please log at least one crew file entry in File Details for ${activeEventObj.label} before submitting this event.`
      );
      if (activeTab === "files") {
        window.requestAnimationFrame(() => {
          const inputEl = document.getElementById("file-member-name");
          inputEl?.scrollIntoView({ behavior: "smooth", block: "center" });
          inputEl?.focus();
        });
      }
      return;
    }

    setSubmitBlockedNotice(null);
    const defaultSubmitter =
      userName?.trim() ||
      productionManagers[0] ||
      userEmail?.trim() ||
      "Production Manager";
    setSubmitterNameInput(defaultSubmitter);
    setSubmitModalError(null);
    setSubmitModalOpen(true);
  };

  // Confirm & Permanently Lock Event
  const handleConfirmSubmitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCouple) return;
    const cleanSubmitter = submitterNameInput.trim().replace(/\s+/g, " ");
    if (!cleanSubmitter) {
      setSubmitModalError("Please enter the name of the person submitting this event.");
      return;
    }

    setIsSubmittingEvent(true);
    setSubmitModalError(null);

    try {
      if (activeEventObj.isCustom && activeEventObj.customDoc) {
        const { nextCustomEvent, submissionRecord } = buildSubmittedCustomEventData(
          {
            ...activeEventObj.customDoc,
            items: checklistItems,
            fileDetails,
          },
          cleanSubmitter,
          userEmail,
          productionManagers
        );
        const { fallbackChecklist } = await submitCustomProductionEvent(
          selectedCouple.id,
          nextCustomEvent,
          submissionRecord,
          selectedCouple.productionChecklist
        );
        if (fallbackChecklist) {
          setSubmissions((prev) =>
            prev.map((rec) =>
              rec.id === selectedCouple.id
                ? { ...rec, productionChecklist: fallbackChecklist }
                : rec
            )
          );
        }
        setSubcollectionCustomEvents((prev) =>
          prev.map((ev) => (ev.id === nextCustomEvent.id ? nextCustomEvent : ev))
        );
        setArchivedSubmissions((prev) => ({
          ...prev,
          [submissionRecord.eventId]: submissionRecord,
        }));
      } else if (isStandardEventKey(activeEventObj.id)) {
        const { nextChecklist, submissionRecord } = buildSubmittedStandardEventData(
          selectedCouple.productionChecklist,
          activeEventObj.id,
          cleanSubmitter,
          userEmail,
          archivedSubmissions
        );
        await submitStandardChecklistEvent(
          selectedCouple.id,
          nextChecklist,
          submissionRecord
        );
        setSubmissions((prev) =>
          prev.map((rec) =>
            rec.id === selectedCouple.id
              ? { ...rec, productionChecklist: nextChecklist }
              : rec
          )
        );
        setArchivedSubmissions((prev) => ({
          ...prev,
          [submissionRecord.eventId]: submissionRecord,
        }));
      }

      setSubmitModalOpen(false);
      setSubmitBlockedNotice(null);
      resetFileForm();
      setSaveState("saved");
    } catch (err: any) {
      setSubmitModalError(
        err?.message || "Failed to submit and lock event. Please try again."
      );
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  const renderEventSubTabs = (ariaLabel: string, mode: "checklist" | "files") => (
    <div className="bg-white border border-[#E5DDD2] rounded-2xl p-2 flex flex-wrap items-center justify-between gap-2">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex items-center gap-2 flex-wrap w-full lg:w-auto"
      >
        {allEvents.map((ev) => {
          const isActive = activeEventObj.id === ev.id;
          const evTotal = getTotalChecklistItemsForEvent(ev.id);
          const evProgress = eventProgressById[ev.id] ?? {
            gotIt: 0,
            missed: 0,
            remaining: evTotal,
            total: evTotal,
          };
          const evCountLabel =
            mode === "checklist"
              ? `${evProgress.gotIt + evProgress.missed}/${evProgress.total}`
              : `${ev.fileDetails.length}`;

          return (
            <button
              key={ev.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setActiveEventId(ev.id);
                setSubmitBlockedNotice(null);
                resetFileForm();
                setSaveError(null);
              }}
              className={`min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                isActive
                  ? "bg-[#1A1A1A] text-white"
                  : "bg-[#FAF8F5] text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#F2ECE1]"
              }`}
            >
              {ev.isSubmitted && (
                <Lock
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isActive ? "text-emerald-400" : "text-emerald-700"
                  }`}
                  aria-label="Submitted"
                />
              )}
              <span>{ev.label}</span>
              <span
                className={`text-xs tabular-nums ${
                  isActive ? "text-[#D4B47C]" : "text-[#8C7043]"
                }`}
              >
                {evCountLabel}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            setNewEventName("");
            setAddEventError(null);
            setAddEventModalOpen(true);
          }}
          className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-[#8C7043] hover:text-[#1A1A1A] bg-white hover:bg-[#FAF7F2] border border-dashed border-[#D6C7B2] transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Event</span>
        </button>
      </div>

      <div className="flex items-center gap-2 px-2 ml-auto">
        {canDeleteEvent(activeEventObj.id, activeEventObj.isCustom, isLocked) && (
          <button
            type="button"
            onClick={() => {
              setDeleteEventError(null);
              setEventToDelete(activeEventObj);
            }}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 hover:bg-red-50 border border-red-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Event</span>
          </button>
        )}
        <p className="text-xs text-[#7A756D] hidden md:block whitespace-nowrap">
          {mode === "checklist"
            ? isLocked
              ? `${activeEventObj.label} record locked`
              : `Tracking ${activeEventObj.label} event checklist`
            : isLocked
            ? `${activeEventObj.label} file details locked`
            : `Logging ${activeEventObj.label} file transfers`}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-[#FAF8F5] text-[#1A1A1A] safe-bottom pb-16">
      {/* Header Bar */}
      <header className="bg-white border-b border-[#E5DDD2] sticky top-0 z-30 shadow-2xs">
        {/* Desktop Header */}
        <div className="hidden sm:flex max-w-5xl mx-auto px-6 h-18 items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#FAF7F2] border border-[#E5DDD2] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#8C7043]" />
              <span>Back to Couples</span>
            </button>
            <div className="h-5 w-px bg-[#E5DDD2] shrink-0" />
            <img
              src={
                STUDIO_LOGO_URL ||
                "https://res.cloudinary.com/pcodbmuo/image/upload/v1792483927/Black_OAKS_uctgsb.webp"
              }
              alt={STUDIO_NAME}
              className="h-8 w-auto object-contain shrink-0"
            />
            <div className="h-5 w-px bg-[#E5DDD2] shrink-0" />
            <h1 className="font-cormorant text-2xl font-semibold text-[#1A1A1A] truncate">
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

        {/* Mobile Header (2 clean non-overlapping rows) */}
        <div className="sm:hidden px-4 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#FAF7F2] border border-[#E5DDD2] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#8C7043]" />
              <span>Back to Couples</span>
            </button>

            <button
              type="button"
              onClick={onSignOut}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#FAF7F2] border border-[#E5DDD2] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 text-[#8C7043]" />
              <span>Sign out</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 pt-2 border-t border-[#F0E9DF]">
            <img
              src={
                STUDIO_LOGO_URL ||
                "https://res.cloudinary.com/pcodbmuo/image/upload/v1792483927/Black_OAKS_uctgsb.webp"
              }
              alt={STUDIO_NAME}
              className="h-7 w-auto object-contain shrink-0"
            />
            <div className="h-4 w-px bg-[#E5DDD2] shrink-0" />
            <h1 className="font-cormorant text-xl font-semibold text-[#1A1A1A] whitespace-nowrap">
              Wedding Checklist
            </h1>
          </div>
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
            {/* Couple Selector & Event Submit Strip */}
            <section className="bg-white border border-[#E5DDD2] rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                  <label
                    htmlFor="checklist-couple-select"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#8C7043]"
                  >
                    Production Checklist · {activeEventObj.label}
                  </label>
                  <select
                    id="checklist-couple-select"
                    value={selectedCoupleId}
                    onChange={(e) => {
                      setSelectedCoupleId(e.target.value);
                      setActiveEventId("wedding");
                      setManagerInput("");
                      setManagerNotice(null);
                      setSubmitBlockedNotice(null);
                      resetFileForm();
                      setSaveState("idle");
                      setSaveError(null);
                    }}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E5DDD2] text-sm sm:text-base font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#8C7043] cursor-pointer"
                  >
                    {submissions.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.displayId || "Unnumbered"} · {sub.partner1} &amp; {sub.partner2}
                        {sub.weddingDate ? ` (${sub.weddingDate})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Per-Event Submit Control or Permanent Submitted Status */}
                <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                  {!isLocked ? (
                    <button
                      type="button"
                      onClick={handleOpenSubmitModal}
                      className="w-full md:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#1A1A1A] hover:bg-[#333333] text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#B08D57]" />
                      <span>Submit Event</span>
                    </button>
                  ) : (
                    <div className="w-full md:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0">
                      <Lock className="w-4 h-4 text-emerald-700" />
                      <span>Submitted</span>
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
                    Remaining: {counts.remaining} / {activeTotalItems}
                  </span>
                </div>

                <div className="text-xs text-[#7A756D]">
                  {isLocked && activeSubmission ? (
                    <span className="text-emerald-800 font-medium">
                      Locked on {activeSubmission.submissionDate} at{" "}
                      {activeSubmission.submissionTime}
                    </span>
                  ) : (
                    <>
                      {saveState === "saving" && <span>Saving changes...</span>}
                      {saveState === "saved" && (
                        <span className="text-emerald-700">Synced with team</span>
                      )}
                      {saveState === "idle" && activeEventObj.updatedAt && (
                        <span>
                          {activeEventObj.label} updated{" "}
                          {new Date(activeEventObj.updatedAt).toLocaleString(
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
                    </>
                  )}
                </div>
              </div>

              {saveError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{saveError}</span>
                </div>
              )}

              {submitBlockedNotice && !isLocked && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start sm:items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-amber-700" />
                    <span>{submitBlockedNotice}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                    {activeTab === "checklist" && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("files");
                          window.requestAnimationFrame(() => {
                            const inputEl =
                              document.getElementById("file-member-name");
                            inputEl?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            });
                            inputEl?.focus();
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#1A1A1A] hover:bg-[#333333] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Open File Details
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSubmitBlockedNotice(null)}
                      aria-label="Dismiss notice"
                      className="p-1 rounded-lg text-amber-800 hover:bg-amber-100 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Permanent Locked Event Status Record */}
            {isLocked && activeSubmission && (
              <section
                aria-label={`${activeEventObj.label} Submission Record`}
                className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 sm:p-6 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 text-emerald-950">
                    <Lock className="w-4 h-4 text-emerald-700 shrink-0" />
                    <h2 className="font-cormorant text-xl sm:text-2xl font-semibold">
                      {activeEventObj.label} — Submitted &amp; Permanently Locked
                    </h2>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                    Read-only archive
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm text-emerald-900 tabular-nums">
                  <span className="inline-flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-700" />
                    <span>
                      Submitted by{" "}
                      <strong className="font-semibold">
                        {activeSubmission.submittedBy}
                      </strong>
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                    <span>
                      Date:{" "}
                      <strong className="font-semibold">
                        {activeSubmission.submissionDate}
                      </strong>
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-700" />
                    <span>
                      Time:{" "}
                      <strong className="font-semibold">
                        {activeSubmission.submissionTime}
                      </strong>
                    </span>
                  </span>
                </div>

                <p className="text-xs text-emerald-800/90">
                  This event record is permanently locked at the database level. Checklist items, file transfers, and event details cannot be altered or deleted.
                </p>
              </section>
            )}

            {/* Top Page Tab Switcher: Production Checklist vs File Details */}
            <div
              role="tablist"
              aria-label="Wedding Checklist Sections"
              className="flex flex-wrap sm:flex-nowrap items-center gap-2 border-b border-[#E5DDD2] pb-3"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "checklist"}
                onClick={() => setActiveTab("checklist")}
                className={`flex-1 sm:flex-initial min-h-[44px] inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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
                  ({counts.gotIt + counts.missed}/{activeTotalItems})
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "files"}
                onClick={() => setActiveTab("files")}
                className={`flex-1 sm:flex-initial min-h-[44px] inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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
                <span className="tabular-nums opacity-80">
                  ({combinedFileTotals.entries})
                </span>
              </button>
            </div>

            {activeTab === "checklist" && (
              <>
                {/* Event Sub-Tabs inside Production Checklist */}
                {renderEventSubTabs("Wedding Events", "checklist")}

                {/* Production Manager(s) Assignment (Shared across Wedding Events) */}
                <section className="bg-white border border-[#E5DDD2] rounded-2xl overflow-hidden">
                  <div className="px-5 sm:px-6 py-4 bg-[#FAF8F5] border-b border-[#E5DDD2] flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserCheck className="w-4 h-4 text-[#8C7043] shrink-0" />
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 min-w-0">
                        <h2 className="font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A]">
                          Production Manager(s)
                        </h2>
                        <span className="text-xs text-[#7A756D]">
                          Shared across Wedding Events
                        </span>
                      </div>
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
                  {activeChecklistSections.map((section) => {
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
                            <span>
                              {sectionGotIt} / {section.items.length} got it
                            </span>
                            {sectionMissed > 0 && (
                              <span className="text-red-700 ml-2">
                                · {sectionMissed} missed
                              </span>
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
                                    : isLocked
                                    ? "bg-white"
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

                                {/* Separate Got It (✅) and Missed (❌) Buttons (Disabled when locked) */}
                                <div className="flex items-center gap-2 sm:shrink-0 pl-8 sm:pl-0">
                                  <button
                                    type="button"
                                    disabled={isLocked}
                                    aria-pressed={isGotIt}
                                    onClick={() => handleToggleItem(item.id, "got_it")}
                                    className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-all inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                                      isGotIt
                                        ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                                        : isLocked
                                        ? "bg-[#FAF8F5] text-[#9A948C] border-[#E5DDD2] opacity-60 cursor-not-allowed"
                                        : "bg-white text-[#1A1A1A] border-[#E5DDD2] hover:border-emerald-500 hover:bg-emerald-50 cursor-pointer"
                                    } ${isLocked ? "cursor-not-allowed" : ""}`}
                                  >
                                    <span aria-hidden="true">✅</span>
                                    <span>Got it</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isLocked}
                                    aria-pressed={isMissed}
                                    onClick={() => handleToggleItem(item.id, "missed")}
                                    className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-all inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                                      isMissed
                                        ? "bg-red-600 text-white border-red-600 shadow-2xs"
                                        : isLocked
                                        ? "bg-[#FAF8F5] text-[#9A948C] border-[#E5DDD2] opacity-60 cursor-not-allowed"
                                        : "bg-white text-[#1A1A1A] border-[#E5DDD2] hover:border-red-500 hover:bg-red-50 cursor-pointer"
                                    } ${isLocked ? "cursor-not-allowed" : ""}`}
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
                      {isLocked
                        ? `View the permanently locked ${activeEventObj.label} file transfer records.`
                        : `Log or verify ${activeEventObj.label} crew backups in File Details before submitting this event.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("files");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-[#FAF7F2] border border-[#E5DDD2] text-[#1A1A1A] text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Open File Details</span>
                    <ArrowRight className="w-4 h-4 text-[#8C7043]" />
                  </button>
                </div>
              </>
            )}

            {/* TAB 2: FILE DETAILS */}
            {activeTab === "files" && (
              <div className="space-y-6">
                {/* Event Sub-Tabs inside File Details */}
                {renderEventSubTabs("File Details Events", "files")}

                {/* Summary Totals Card: Active Event + Combined Events Total */}
                <section className="bg-white border border-[#E5DDD2] rounded-2xl p-5 sm:p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 divide-y sm:divide-y-0 sm:divide-x divide-[#F0E9DF]">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#8C7043]">
                        {activeEventObj.label} Transfers Logged
                      </p>
                      <p className="font-cormorant text-3xl font-semibold text-[#1A1A1A] tabular-nums">
                        {fileTotals.entries}
                      </p>
                    </div>
                    <div className="pt-3 sm:pt-0 sm:pl-6 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#8C7043]">
                        {activeEventObj.label} File Count
                      </p>
                      <p className="font-cormorant text-3xl font-semibold text-[#1A1A1A] tabular-nums">
                        {fileTotals.totalFiles.toLocaleString()}
                      </p>
                    </div>
                    <div className="pt-3 sm:pt-0 sm:pl-6 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#8C7043]">
                        {activeEventObj.label} Copied Size
                      </p>
                      <p className="font-cormorant text-3xl font-semibold text-[#1A1A1A] tabular-nums">
                        {fileTotals.formattedSize}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#F0E9DF] flex flex-wrap items-center justify-between gap-2 text-xs text-[#7A756D] tabular-nums">
                    <span className="font-medium text-[#5F5F5F]">
                      All {allEvents.length} events combined
                    </span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>{combinedFileTotals.entries} transfers</span>
                      <span aria-hidden="true">·</span>
                      <span>{combinedFileTotals.totalFiles.toLocaleString()} files</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-[#1A1A1A]">
                        {combinedFileTotals.formattedSize}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Add / Edit Crew File Entry Form (Strictly hidden when event is submitted/locked) */}
                {!isLocked && (
                  <section className="bg-white border border-[#E5DDD2] rounded-2xl overflow-hidden">
                    <div className="px-5 sm:px-6 py-4 bg-[#FAF8F5] border-b border-[#E5DDD2] flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <HardDrive className="w-4 h-4 text-[#8C7043] shrink-0" />
                        <h2 className="font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A]">
                          {editingEntryId
                            ? `Edit ${activeEventObj.label} Crew File Entry`
                            : `Add ${activeEventObj.label} Crew File Entry`}
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
                              const nextRole = e.target.value as CrewFileRole;
                              setFileRole(nextRole);
                              if (nextRole !== "Photographer") {
                                setFileCameraStarred("");
                              }
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
                              onChange={(e) =>
                                setFileSizeUnit(e.target.value as FileSizeUnit)
                              }
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

                      {fileRole === "Photographer" && (
                        <div className="rounded-xl bg-[#FAF8F5] border border-[#E5DDD2] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <label className="text-xs sm:text-sm font-semibold text-[#1A1A1A]">
                            Have you starred the main images in your camera?
                          </label>
                          <div
                            role="radiogroup"
                            aria-label="Have you starred the main images in your camera?"
                            className="flex items-center gap-2 shrink-0"
                          >
                            {(["Starred", "Not Starred"] as const).map((option) => {
                              const isSelected = fileCameraStarred === option;
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  role="radio"
                                  aria-checked={isSelected}
                                  onClick={() => {
                                    setFileCameraStarred(option);
                                    if (fileFormError) setFileFormError(null);
                                  }}
                                  className={`min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                                    isSelected
                                      ? option === "Starred"
                                        ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                                        : "bg-[#1A1A1A] text-white border-[#1A1A1A] shadow-2xs"
                                      : "bg-white text-[#1A1A1A] border-[#E5DDD2] hover:border-[#8C7043] hover:bg-[#FAF7F2]"
                                  }`}
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      isSelected && option === "Starred"
                                        ? "fill-current"
                                        : option === "Starred"
                                        ? "text-[#8C7043]"
                                        : "text-[#9A948C]"
                                    }`}
                                  />
                                  <span>{option}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

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
                )}

                {/* Recorded File Transfers List */}
                <section className="bg-white border border-[#E5DDD2] rounded-2xl overflow-hidden">
                  <div className="px-5 sm:px-6 py-4 bg-[#FAF8F5] border-b border-[#E5DDD2] flex items-center justify-between gap-4">
                    <h2 className="font-cormorant text-xl sm:text-2xl font-semibold text-[#1A1A1A]">
                      Recorded {activeEventObj.label} Crew File Transfers
                    </h2>
                    <span className="text-xs text-[#7A756D] tabular-nums whitespace-nowrap">
                      {fileDetails.length}{" "}
                      {fileDetails.length === 1 ? "entry" : "entries"}
                    </span>
                  </div>

                  {fileDetails.length === 0 ? (
                    <div className="p-10 text-center space-y-2">
                      <p className="text-sm font-medium text-[#1A1A1A]">
                        No {activeEventObj.label.toLowerCase()} file transfers recorded
                      </p>
                      <p className="text-xs sm:text-sm text-[#7A756D] max-w-md mx-auto">
                        {isLocked
                          ? `This event was submitted without file transfer entries and is permanently read-only.`
                          : `Add each photographer, videographer, drone pilot, or editor above once their ${activeEventObj.label.toLowerCase()} files are copied to record exact file sizes and counts.`}
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
                                  <span
                                    className="text-xs text-[#8C7043]"
                                    aria-hidden="true"
                                  >
                                    ·
                                  </span>
                                  <span className="text-xs sm:text-sm text-[#5F5F5F]">
                                    {displayRole}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#7A756D] tabular-nums">
                                  {entry.role === "Photographer" &&
                                    entry.cameraStarredStatus && (
                                      <>
                                        <span
                                          className={`inline-flex items-center gap-1 font-medium ${
                                            entry.cameraStarredStatus === "Starred"
                                              ? "text-emerald-700"
                                              : "text-[#5F5F5F]"
                                          }`}
                                        >
                                          <Star
                                            className={`w-3 h-3 shrink-0 ${
                                              entry.cameraStarredStatus === "Starred"
                                                ? "fill-emerald-600 text-emerald-600"
                                                : "text-[#9A948C]"
                                            }`}
                                          />
                                          <span>
                                            Camera images: {entry.cameraStarredStatus}
                                          </span>
                                        </span>
                                        <span aria-hidden="true">·</span>
                                      </>
                                    )}
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

                              {!isLocked && (
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
                              )}
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

      {/* Confirmation Dialog Before Submitting Event */}
      {submitModalOpen && selectedCouple && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-event-modal-title"
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border border-[#E5DDD2] rounded-2xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-xl">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="submit-event-modal-title"
                  className="font-cormorant text-2xl font-semibold text-[#1A1A1A]"
                >
                  Submit {activeEventObj.label}
                </h2>
                <button
                  type="button"
                  disabled={isSubmittingEvent}
                  onClick={() => setSubmitModalOpen(false)}
                  aria-label="Close confirmation"
                  className="p-1.5 rounded-lg text-[#7A756D] hover:text-[#1A1A1A] hover:bg-[#FAF8F5] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-[#4A4640] leading-relaxed">
                Are you sure you want to submit this event? Please make sure all checklist items and file details are complete. Once submitted, you will no longer be able to make changes to this event.
              </p>
            </div>

            <div className="bg-[#FAF8F5] border border-[#E5DDD2] rounded-xl p-4 space-y-1.5 text-xs sm:text-sm tabular-nums">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#7A756D]">Event</span>
                <span className="font-semibold text-[#1A1A1A]">
                  {activeEventObj.label}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#7A756D]">Checklist progress</span>
                <span className="font-medium text-[#1A1A1A]">
                  {counts.gotIt} got it · {counts.missed} missed
                  {counts.remaining > 0 ? ` · ${counts.remaining} unmarked` : ""} (
                  {counts.gotIt + counts.missed}/{activeTotalItems})
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#7A756D]">File transfers</span>
                <span className="font-medium text-[#1A1A1A]">
                  {fileTotals.entries}{" "}
                  {fileTotals.entries === 1 ? "entry" : "entries"} ·{" "}
                  {fileTotals.totalFiles.toLocaleString()} files (
                  {fileTotals.formattedSize})
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmSubmitEvent} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="event-submitted-by-input"
                  className="block text-xs font-semibold text-[#1A1A1A]"
                >
                  Submitted by
                </label>
                <input
                  id="event-submitted-by-input"
                  type="text"
                  value={submitterNameInput}
                  onChange={(e) => {
                    setSubmitterNameInput(e.target.value);
                    if (submitModalError) setSubmitModalError(null);
                  }}
                  placeholder="Enter your name or assigned production manager"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E5DDD2] text-sm text-[#1A1A1A] placeholder:text-[#9A948C] focus:outline-hidden focus:border-[#8C7043]"
                />
                {productionManagers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-[#7A756D]">
                      Assigned managers:
                    </span>
                    {productionManagers.map((mgr) => (
                      <button
                        key={mgr}
                        type="button"
                        onClick={() => setSubmitterNameInput(mgr)}
                        className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] hover:bg-[#F2ECE1] border border-[#E5DDD2] text-[11px] font-medium text-[#5F5F5F] hover:text-[#1A1A1A] cursor-pointer transition-colors"
                      >
                        {mgr}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {submitModalError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{submitModalError}</span>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={isSubmittingEvent}
                  onClick={() => setSubmitModalOpen(false)}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl border border-[#E5DDD2] bg-white hover:bg-[#FAF8F5] text-xs sm:text-sm font-medium text-[#1A1A1A] transition-colors cursor-pointer whitespace-nowrap"
                >
                  Go Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEvent}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#1A1A1A] hover:bg-[#333333] text-white text-xs sm:text-sm font-medium disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Lock className="w-4 h-4 text-[#B08D57]" />
                  <span>
                    {isSubmittingEvent ? "Submitting..." : "Confirm & Submit"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Custom Event Modal */}
      {addEventModalOpen && selectedCouple && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-event-modal-title"
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border border-[#E5DDD2] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2
                id="add-event-modal-title"
                className="font-cormorant text-2xl font-semibold text-[#1A1A1A]"
              >
                Add Custom Event
              </h2>
              <button
                type="button"
                disabled={isCreatingEvent}
                onClick={() => setAddEventModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-[#7A756D] hover:text-[#1A1A1A] hover:bg-[#FAF8F5] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-[#5F5F5F] leading-relaxed">
              Create an independent Production Checklist and File Details log for another wedding celebration (such as Haldi, Mehendi, or Engagement).
            </p>

            <form onSubmit={handleCreateCustomEvent} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="custom-event-name-input"
                  className="block text-xs font-semibold text-[#1A1A1A]"
                >
                  Event Name
                </label>
                <input
                  id="custom-event-name-input"
                  type="text"
                  value={newEventName}
                  onChange={(e) => {
                    setNewEventName(e.target.value);
                    if (addEventError) setAddEventError(null);
                  }}
                  placeholder="e.g. Haldi"
                  autoFocus
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E5DDD2] text-sm text-[#1A1A1A] placeholder:text-[#9A948C] focus:outline-hidden focus:border-[#8C7043]"
                />
              </div>

              {addEventError && (
                <p className="text-xs text-red-700 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{addEventError}</span>
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={isCreatingEvent}
                  onClick={() => setAddEventModalOpen(false)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#E5DDD2] bg-white hover:bg-[#FAF8F5] text-xs sm:text-sm font-medium text-[#5F5F5F] hover:text-[#1A1A1A] transition-colors cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingEvent || !newEventName.trim()}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#1A1A1A] hover:bg-[#333333] text-white text-xs sm:text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
                >
                  {isCreatingEvent ? "Adding..." : "Create Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Unsubmitted Custom Event Confirmation Modal */}
      {eventToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-event-modal-title"
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border border-[#E5DDD2] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-xl">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="delete-event-modal-title"
                  className="font-cormorant text-2xl font-semibold text-[#1A1A1A]"
                >
                  Delete {eventToDelete.label}?
                </h2>
                <button
                  type="button"
                  disabled={isDeletingEvent}
                  onClick={() => setEventToDelete(null)}
                  aria-label="Close modal"
                  className="p-1.5 rounded-lg text-[#7A756D] hover:text-[#1A1A1A] hover:bg-[#FAF8F5] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs sm:text-sm text-[#5F5F5F] leading-relaxed">
                This will permanently remove the custom event{" "}
                <strong className="text-[#1A1A1A]">{eventToDelete.label}</strong>{" "}
                along with its unsubmitted checklist marks and file transfer entries. Standard events such as Wedding Day, Sangeet, and Reception remain preserved.
              </p>
            </div>

            {deleteEventError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{deleteEventError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeletingEvent}
                onClick={() => setEventToDelete(null)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#E5DDD2] bg-white hover:bg-[#FAF8F5] text-xs sm:text-sm font-medium text-[#1A1A1A] transition-colors cursor-pointer whitespace-nowrap"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={isDeletingEvent}
                onClick={handleConfirmDeleteEvent}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-medium disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                {isDeletingEvent ? "Deleting..." : "Delete Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
