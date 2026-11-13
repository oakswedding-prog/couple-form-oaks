/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ChecklistEventKey,
  ChecklistItemStatus,
  CustomProductionEvent,
  EventChecklistState,
  EventSubmissionRecord,
  FileDetailEntry,
  ProductionChecklistData,
} from "../types/questionnaire.ts";

export interface ChecklistItemDef {
  id: string;
  label: string;
}

export interface ChecklistSectionDef {
  id: string;
  title: string;
  items: ChecklistItemDef[];
}

export interface ChecklistEventDef {
  id: ChecklistEventKey;
  label: string;
}

export const CHECKLIST_EVENTS: ChecklistEventDef[] = [
  { id: "sangeet", label: "Sangeet" },
  { id: "wedding", label: "Wedding Day" },
  { id: "reception", label: "Reception" },
];

export const WEDDING_PRODUCTION_CHECKLIST: ChecklistSectionDef[] = [
  {
    id: "tech_riders",
    title: "Tech riders",
    items: [
      { id: "tech_camera_time_reset", label: "Camera time reset" },
      { id: "tech_confirm_shooting_profile", label: "Confirm shooting profile" },
      { id: "tech_audio_on_track", label: "Audio recording devices on track" },
    ],
  },
  {
    id: "venue_details",
    title: "Venue & Details",
    items: [
      { id: "venue_establishing_shots", label: "Complete venue establishing shots." },
      { id: "venue_mandap_stage_wide", label: "Mandap / stage wide shots." },
      { id: "venue_floral_details", label: "Floral decorations and details." },
      { id: "venue_seating_ambience", label: "Seating arrangements and guest ambience." },
    ],
  },
  {
    id: "mandatory_family_portraits",
    title: "Mandatory Family Portraits",
    items: [
      { id: "portrait_bride_parents", label: "Bride with parents." },
      { id: "portrait_groom_parents", label: "Groom with parents." },
      { id: "portrait_couple_both_parents", label: "Bride and groom with both sets of parents." },
      { id: "portrait_bride_siblings", label: "Bride with siblings." },
      { id: "portrait_groom_siblings", label: "Groom with siblings." },
      { id: "portrait_couple_grandparents", label: "Couple with grandparents." },
      { id: "portrait_couple_immediate_family", label: "Couple with immediate family." },
      { id: "portrait_couple_extended_family", label: "Couple with extended family." },
      { id: "portrait_couple_friends", label: "Couple with friends." },
      { id: "portrait_complete_family_both_sides", label: "Complete family photograph from both sides." },
    ],
  },
];

export const TOTAL_CHECKLIST_ITEMS = WEDDING_PRODUCTION_CHECKLIST.reduce(
  (sum, section) => sum + section.items.length,
  0
);

export function isStandardEventKey(eventId: string): eventId is ChecklistEventKey {
  return eventId === "sangeet" || eventId === "wedding" || eventId === "reception";
}

export function getStandardEventLabel(eventId: ChecklistEventKey): string {
  return CHECKLIST_EVENTS.find((ev) => ev.id === eventId)?.label ?? "Wedding Day";
}

export function canDeleteEvent(
  eventId: string,
  isCustom: boolean,
  isSubmitted: boolean
): boolean {
  if (!isCustom) return false;
  if (isStandardEventKey(eventId)) return false;
  return !isSubmitted;
}

export function createCustomEventId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
  const rand = Math.random().toString(36).slice(2, 6);
  return `custom_${slug || "event"}_${Date.now().toString(36)}_${rand}`;
}

export function formatSubmissionDateTime(date: Date = new Date()): {
  submissionDate: string;
  submissionTime: string;
  submittedAt: string;
} {
  const submissionDate = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const submissionTime = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return {
    submissionDate,
    submissionTime,
    submittedAt: date.toISOString(),
  };
}

/**
 * Checks whether a standard event has been permanently submitted & locked.
 */
export function isStandardEventLocked(
  checklist: ProductionChecklistData | undefined,
  eventId: ChecklistEventKey,
  archivedSubmissions?: Record<string, EventSubmissionRecord>
): boolean {
  const state = checklist?.events?.[eventId];
  if (state?.submitted === true || Boolean(state?.submission?.submittedAt)) {
    return true;
  }
  if (archivedSubmissions && archivedSubmissions[eventId]) {
    return true;
  }
  return false;
}

export function getStandardEventSubmission(
  checklist: ProductionChecklistData | undefined,
  eventId: ChecklistEventKey,
  archivedSubmissions?: Record<string, EventSubmissionRecord>
): EventSubmissionRecord | undefined {
  return (
    archivedSubmissions?.[eventId] ?? checklist?.events?.[eventId]?.submission
  );
}

/**
 * Resolves the checklist items map for a given event, automatically falling back to
 * legacy top-level `items` for the `wedding` event so previously recorded progress is preserved.
 */
export function getEventChecklistItems(
  checklist: ProductionChecklistData | undefined,
  eventId: ChecklistEventKey
): Record<string, ChecklistItemStatus> {
  const eventItems = checklist?.events?.[eventId]?.items;
  if (eventItems) return eventItems;
  if (eventId === "wedding" && checklist?.items) {
    return checklist.items;
  }
  return {};
}

/**
 * Resolves the File Details array for a given event, automatically moving
 * legacy top-level `fileDetails` onto the `wedding` event so previously recorded transfers are preserved.
 */
export function getEventFileDetails(
  checklist: ProductionChecklistData | undefined,
  eventId: ChecklistEventKey
): FileDetailEntry[] {
  const eventFiles = checklist?.events?.[eventId]?.fileDetails;
  if (Array.isArray(eventFiles)) return eventFiles;
  if (eventId === "wedding" && Array.isArray(checklist?.fileDetails)) {
    return checklist.fileDetails;
  }
  return [];
}

export function getEventUpdatedAt(
  checklist: ProductionChecklistData | undefined,
  eventId: ChecklistEventKey
): string | undefined {
  const eventUpdatedAt = checklist?.events?.[eventId]?.updatedAt;
  if (eventUpdatedAt) return eventUpdatedAt;
  if (eventId === "wedding") return checklist?.updatedAt;
  return undefined;
}

export function countChecklistProgress(
  items: Record<string, ChecklistItemStatus>
): { gotIt: number; missed: number; remaining: number } {
  let gotIt = 0;
  let missed = 0;
  for (const section of WEDDING_PRODUCTION_CHECKLIST) {
    for (const item of section.items) {
      const status = items[item.id];
      if (status === "got_it") gotIt += 1;
      else if (status === "missed") missed += 1;
    }
  }
  return {
    gotIt,
    missed,
    remaining: Math.max(0, TOTAL_CHECKLIST_ITEMS - gotIt - missed),
  };
}

/**
 * Verifies every checklist item has been marked as either "got_it" OR "missed".
 * Any combination (all Got it, mix of Got it + Missed, or all Missed) passes;
 * only unmarked items prevent event submission.
 */
export function isChecklistCompleteForSubmission(
  items: Record<string, ChecklistItemStatus>
): {
  isComplete: boolean;
  gotIt: number;
  missed: number;
  completed: number;
  remaining: number;
} {
  const { gotIt, missed, remaining } = countChecklistProgress(items);
  return {
    isComplete: remaining === 0,
    gotIt,
    missed,
    completed: gotIt + missed,
    remaining,
  };
}

export function summarizeFileDetails(entries: FileDetailEntry[]): {
  entries: number;
  totalFiles: number;
  totalGb: number;
  formattedSize: string;
} {
  let totalFiles = 0;
  let totalGb = 0;
  for (const entry of entries) {
    totalFiles += Number.isFinite(entry.fileCount) ? entry.fileCount : 0;
    const size = Number.isFinite(entry.fileSize) ? entry.fileSize : 0;
    totalGb += entry.sizeUnit === "TB" ? size * 1000 : size;
  }
  const formattedSize =
    totalGb >= 1000
      ? `${(totalGb / 1000).toFixed(2)} TB`
      : `${Number(totalGb.toFixed(2))} GB`;
  return {
    entries: entries.length,
    totalFiles,
    totalGb,
    formattedSize,
  };
}

function buildPreservedWeddingEnvelope(
  previousChecklist: ProductionChecklistData | undefined,
  archivedSubmissions?: Record<string, EventSubmissionRecord>
) {
  const weddingLocked = isStandardEventLocked(
    previousChecklist,
    "wedding",
    archivedSubmissions
  );
  const previousWedding = previousChecklist?.events?.wedding;
  const weddingFallbackItems =
    previousWedding?.items ?? previousChecklist?.items ?? {};
  const weddingFallbackFiles =
    previousWedding?.fileDetails ?? previousChecklist?.fileDetails ?? [];

  const weddingState: EventChecklistState =
    weddingLocked && previousWedding
      ? previousWedding
      : {
          ...(previousWedding ?? {}),
          items: weddingFallbackItems,
          fileDetails: weddingFallbackFiles,
          ...(previousWedding?.updatedAt || previousChecklist?.updatedAt
            ? { updatedAt: previousWedding?.updatedAt ?? previousChecklist?.updatedAt }
            : {}),
          ...(previousWedding?.updatedBy || previousChecklist?.updatedBy
            ? { updatedBy: previousWedding?.updatedBy ?? previousChecklist?.updatedBy }
            : {}),
        };

  return {
    weddingLocked,
    weddingState,
    mirroredWeddingItems:
      weddingLocked && previousChecklist?.items !== undefined
        ? previousChecklist.items
        : weddingState.items ?? {},
    mirroredWeddingFiles:
      weddingLocked && previousChecklist?.fileDetails !== undefined
        ? previousChecklist.fileDetails
        : weddingState.fileDetails ?? [],
  };
}

/**
 * Updates Production Managers at the wedding level without mutating any submitted event data.
 */
export function buildUpdatedManagersChecklistData(
  previousChecklist: ProductionChecklistData | undefined,
  nextManagers: string[],
  updatedBy: string
): ProductionChecklistData {
  const now = new Date().toISOString();
  const { weddingState, mirroredWeddingItems, mirroredWeddingFiles } =
    buildPreservedWeddingEnvelope(previousChecklist);

  return {
    items: mirroredWeddingItems,
    events: {
      ...(previousChecklist?.events ?? {}),
      wedding: weddingState,
    },
    ...(previousChecklist?.customEvents
      ? { customEvents: previousChecklist.customEvents }
      : {}),
    productionManagers: nextManagers,
    fileDetails: mirroredWeddingFiles,
    updatedAt: now,
    updatedBy,
  };
}

/**
 * Builds the updated checklist document for a standard event while strictly refusing
 * to alter any submitted/locked event or its legacy wedding mirrors.
 */
export function buildUpdatedChecklistData(
  previousChecklist: ProductionChecklistData | undefined,
  activeEvent: ChecklistEventKey,
  nextEventItems: Record<string, ChecklistItemStatus>,
  nextManagers: string[],
  nextEventFileDetails: FileDetailEntry[],
  updatedBy: string,
  archivedSubmissions?: Record<string, EventSubmissionRecord>
): ProductionChecklistData {
  if (isStandardEventLocked(previousChecklist, activeEvent, archivedSubmissions)) {
    throw new Error(
      `${getStandardEventLabel(activeEvent)} has already been submitted and is permanently locked.`
    );
  }

  const now = new Date().toISOString();
  const { weddingLocked, weddingState } = buildPreservedWeddingEnvelope(
    previousChecklist,
    archivedSubmissions
  );

  const nextEvents: Partial<Record<ChecklistEventKey, EventChecklistState>> = {
    ...(previousChecklist?.events ?? {}),
    wedding: weddingState,
    [activeEvent]: {
      items: nextEventItems,
      fileDetails: nextEventFileDetails,
      updatedAt: now,
      updatedBy,
    },
  };

  const mirroredWeddingItems =
    weddingLocked && previousChecklist?.items !== undefined
      ? previousChecklist.items
      : nextEvents.wedding?.items ?? {};
  const mirroredWeddingFiles =
    weddingLocked && previousChecklist?.fileDetails !== undefined
      ? previousChecklist.fileDetails
      : nextEvents.wedding?.fileDetails ?? [];

  return {
    items: mirroredWeddingItems,
    events: nextEvents,
    ...(previousChecklist?.customEvents
      ? { customEvents: previousChecklist.customEvents }
      : {}),
    productionManagers: nextManagers,
    fileDetails: mirroredWeddingFiles,
    updatedAt: now,
    updatedBy,
  };
}

/**
 * Merges custom events from both the productionEvents subcollection and main-doc fallback map.
 */
export function mergeCustomEvents(
  subcollectionEvents: CustomProductionEvent[],
  checklistCustomMap: Record<string, CustomProductionEvent> | undefined
): CustomProductionEvent[] {
  const byId = new Map<string, CustomProductionEvent>();

  if (checklistCustomMap) {
    for (const [id, ev] of Object.entries(checklistCustomMap)) {
      if (ev) {
        byId.set(id, { ...ev, id: ev.id || id, isCustom: true });
      }
    }
  }

  for (const ev of subcollectionEvents) {
    const existing = byId.get(ev.id);
    if (!existing) {
      byId.set(ev.id, ev);
      continue;
    }
    // Always preserve locked submitted state if either copy is submitted
    if (existing.submitted && !ev.submitted) {
      byId.set(ev.id, existing);
    } else if (ev.submitted && !existing.submitted) {
      byId.set(ev.id, ev);
    } else {
      byId.set(
        ev.id,
        (ev.updatedAt || "") >= (existing.updatedAt || "") ? ev : existing
      );
    }
  }

  return Array.from(byId.values()).sort((a, b) =>
    (a.createdAt || "").localeCompare(b.createdAt || "")
  );
}

/**
 * Safely writes a custom event into productionChecklist.customEvents (fallback when subcollection rules are pending).
 */
export function buildCustomEventUpsertChecklistData(
  previousChecklist: ProductionChecklistData | undefined,
  customEvent: CustomProductionEvent,
  updatedBy: string
): ProductionChecklistData {
  const existingCustom = previousChecklist?.customEvents?.[customEvent.id];
  if (existingCustom?.submitted) {
    throw new Error(
      `${existingCustom.name} has already been submitted and is permanently locked.`
    );
  }

  const now = new Date().toISOString();
  const { weddingState, mirroredWeddingItems, mirroredWeddingFiles } =
    buildPreservedWeddingEnvelope(previousChecklist);

  return {
    items: mirroredWeddingItems,
    events: {
      ...(previousChecklist?.events ?? {}),
      wedding: weddingState,
    },
    customEvents: {
      ...(previousChecklist?.customEvents ?? {}),
      [customEvent.id]: customEvent,
    },
    productionManagers: previousChecklist?.productionManagers ?? [],
    fileDetails: mirroredWeddingFiles,
    updatedAt: now,
    updatedBy,
  };
}

/**
 * Removes an unsubmitted custom event from productionChecklist.customEvents fallback map.
 */
export function buildCustomEventDeleteChecklistData(
  previousChecklist: ProductionChecklistData | undefined,
  eventId: string,
  updatedBy: string
): ProductionChecklistData {
  const existing = previousChecklist?.customEvents?.[eventId];
  if (existing?.submitted) {
    throw new Error("Submitted events cannot be deleted.");
  }

  const now = new Date().toISOString();
  const { weddingState, mirroredWeddingItems, mirroredWeddingFiles } =
    buildPreservedWeddingEnvelope(previousChecklist);

  const nextCustomEvents = { ...(previousChecklist?.customEvents ?? {}) };
  delete nextCustomEvents[eventId];

  return {
    items: mirroredWeddingItems,
    events: {
      ...(previousChecklist?.events ?? {}),
      wedding: weddingState,
    },
    customEvents: nextCustomEvents,
    productionManagers: previousChecklist?.productionManagers ?? [],
    fileDetails: mirroredWeddingFiles,
    updatedAt: now,
    updatedBy,
  };
}

/**
 * Builds both the locked standard event checklist payload and immutable EventSubmissionRecord.
 * Allows any checklist state (Got it, Missed, or unmarked) and requires at least one crew file entry.
 */
export function buildSubmittedStandardEventData(
  previousChecklist: ProductionChecklistData | undefined,
  eventId: ChecklistEventKey,
  submittedBy: string,
  submittedByEmail?: string,
  archivedSubmissions?: Record<string, EventSubmissionRecord>,
  nowDate: Date = new Date()
): {
  nextChecklist: ProductionChecklistData;
  submissionRecord: EventSubmissionRecord;
} {
  const cleanSubmittedBy = submittedBy.trim();
  if (!cleanSubmittedBy) {
    throw new Error("Submitter name is required to lock this event.");
  }
  if (isStandardEventLocked(previousChecklist, eventId, archivedSubmissions)) {
    throw new Error(
      `${getStandardEventLabel(eventId)} has already been submitted and cannot be modified.`
    );
  }

  const eventName = getStandardEventLabel(eventId);
  const finalItems = { ...getEventChecklistItems(previousChecklist, eventId) };
  const finalFileDetails = [...getEventFileDetails(previousChecklist, eventId)];
  if (finalFileDetails.length === 0) {
    throw new Error(
      `Please log at least one crew file entry in File Details for ${eventName} before submitting.`
    );
  }

  const managers = [...(previousChecklist?.productionManagers ?? [])];
  const { submissionDate, submissionTime, submittedAt } =
    formatSubmissionDateTime(nowDate);

  const submissionRecord: EventSubmissionRecord = {
    eventId,
    eventName,
    isCustom: false,
    submittedBy: cleanSubmittedBy,
    ...(submittedByEmail ? { submittedByEmail } : {}),
    submissionDate,
    submissionTime,
    submittedAt,
    items: finalItems,
    fileDetails: finalFileDetails,
    productionManagersSnapshot: managers,
  };

  const { weddingLocked, weddingState } = buildPreservedWeddingEnvelope(
    previousChecklist,
    archivedSubmissions
  );

  const nextEvents: Partial<Record<ChecklistEventKey, EventChecklistState>> = {
    ...(previousChecklist?.events ?? {}),
    wedding: weddingState,
    [eventId]: {
      items: finalItems,
      fileDetails: finalFileDetails,
      submitted: true,
      submission: submissionRecord,
      updatedAt: submittedAt,
      updatedBy: submittedByEmail || cleanSubmittedBy,
    },
  };

  const mirroredWeddingItems =
    eventId === "wedding"
      ? finalItems
      : weddingLocked && previousChecklist?.items !== undefined
      ? previousChecklist.items
      : nextEvents.wedding?.items ?? {};
  const mirroredWeddingFiles =
    eventId === "wedding"
      ? finalFileDetails
      : weddingLocked && previousChecklist?.fileDetails !== undefined
      ? previousChecklist.fileDetails
      : nextEvents.wedding?.fileDetails ?? [];

  return {
    nextChecklist: {
      items: mirroredWeddingItems,
      events: nextEvents,
      ...(previousChecklist?.customEvents
        ? { customEvents: previousChecklist.customEvents }
        : {}),
      productionManagers: managers,
      fileDetails: mirroredWeddingFiles,
      updatedAt: submittedAt,
      updatedBy: submittedByEmail || cleanSubmittedBy,
    },
    submissionRecord,
  };
}

/**
 * Builds the immutable EventSubmissionRecord for a custom production event.
 * Allows any checklist state (Got it, Missed, or unmarked) and requires at least one crew file entry.
 */
export function buildSubmittedCustomEventData(
  event: CustomProductionEvent,
  submittedBy: string,
  submittedByEmail?: string,
  productionManagers: string[] = [],
  nowDate: Date = new Date()
): {
  nextCustomEvent: CustomProductionEvent;
  submissionRecord: EventSubmissionRecord;
} {
  const cleanSubmittedBy = submittedBy.trim();
  if (!cleanSubmittedBy) {
    throw new Error("Submitter name is required to lock this event.");
  }
  if (event.submitted || event.submission) {
    throw new Error(`${event.name} has already been submitted and cannot be modified.`);
  }

  const finalItems = { ...(event.items ?? {}) };
  const finalFileDetails = [...(event.fileDetails ?? [])];
  if (finalFileDetails.length === 0) {
    throw new Error(
      `Please log at least one crew file entry in File Details for ${event.name} before submitting.`
    );
  }

  const { submissionDate, submissionTime, submittedAt } =
    formatSubmissionDateTime(nowDate);

  const submissionRecord: EventSubmissionRecord = {
    eventId: event.id,
    eventName: event.name,
    isCustom: true,
    submittedBy: cleanSubmittedBy,
    ...(submittedByEmail ? { submittedByEmail } : {}),
    submissionDate,
    submissionTime,
    submittedAt,
    items: finalItems,
    fileDetails: finalFileDetails,
    productionManagersSnapshot: [...productionManagers],
  };

  return {
    nextCustomEvent: {
      ...event,
      items: finalItems,
      fileDetails: finalFileDetails,
      submitted: true,
      submission: submissionRecord,
      updatedAt: submittedAt,
      updatedBy: submittedByEmail || cleanSubmittedBy,
    },
    submissionRecord,
  };
}
