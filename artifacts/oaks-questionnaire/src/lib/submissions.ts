/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  runTransaction,
  serverTimestamp,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { ref, getDownloadURL, listAll } from "firebase/storage";
import { db, storage, auth } from "./firebase.ts";
import {
  QuestionnaireAnswers,
  SubmissionRecord,
  SubmissionStatus,
  SubmissionDeliveryState,
  SubmissionErrorRecord,
  DraftRecord,
  OrphanedStorageFolder,
  PhotoStatusEntry,
  ProductionChecklistData,
  CustomProductionEvent,
  EventSubmissionRecord,
  ChecklistItemStatus,
  FileDetailEntry,
  FillMode,
  PartnerProgressMap,
} from "../types/questionnaire.ts";
import {
  buildCustomEventDeleteChecklistData,
  buildCustomEventUpsertChecklistData,
} from "../constants/productionChecklist.ts";
import { synthesizeEditorialBrief } from "../utils/editorialBriefGenerator.ts";
import { synthesizeInterviewQuestions } from "../utils/interviewQuestionsGenerator.ts";
import { synthesizeCheatSheet } from "../utils/cheatSheetGenerator.ts";
import {
  synthesizeCoupleLetter,
  upgradeCoupleLetterIfNeeded,
} from "../utils/coupleLetterGenerator.ts";
import {
  countAllPhotosInAnswers,
  kickOffPendingPhotoRetries,
  resetDraftUploadFolder,
  resumePendingUploadsFromIndexedDb,
  sanitizeAnswersForFirestore,
  subscribePhotoUploadComplete,
  waitBrieflyForActiveUploads,
} from "./photoUploadManager.ts";
import {
  clearPendingPostSubmitState,
  PendingPostSubmitState,
  savePendingPostSubmitState,
} from "./photoIndexedDb.ts";
import { assertNoBase64Images } from "../utils/submissionSizeGuard.ts";
import {
  buildResumeUrl,
  ensureCoupleAnonymousAuth,
  generateResumeToken,
  getOrCreateCoupleSession,
  resetActiveCoupleSession,
} from "./coupleSession.ts";
import { logSubmissionError } from "./errorLogger.ts";
import { markDraftSubmitted } from "./drafts.ts";
import { buildNormalizedPhotoReport } from "../utils/photoStatusSummary.ts";
import { LINK_EXPIRY_MS } from "../config/splitMode.ts";
import {
  buildMissingSummaryForPartner,
  getPartnerDisplayName,
} from "../utils/splitModeHelpers.ts";
import {
  hydrateSubmissionsWithAdminMeta,
  loadAdminMetaForSubmission,
  mergeAdminMetaIntoSubmission,
  saveAdminMetaNotes,
  saveAdminMetaStatus,
} from "./adminMeta.ts";

/**
 * In-memory + sessionStorage cache for resolved Firebase Storage download URLs
 * and deduplicated in-flight promises so identical paths never hit Storage twice.
 */
const MEDIA_URL_CACHE_KEY = "oaks_media_urls_v1";
const resolvedUrlCache = new Map<string, string>();
const inFlightUrlPromises = new Map<string, Promise<string>>();
let hasHydratedUrlCache = false;

function hydrateResolvedUrlCache() {
  if (hasHydratedUrlCache) return;
  hasHydratedUrlCache = true;
  try {
    const raw = sessionStorage.getItem(MEDIA_URL_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string" && v.startsWith("https://")) {
          resolvedUrlCache.set(k, v);
        }
      }
    }
  } catch {
    // ignore
  }
}

function persistResolvedUrlCache() {
  try {
    const entries = Array.from(resolvedUrlCache.entries()).slice(-400);
    sessionStorage.setItem(MEDIA_URL_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // ignore sessionStorage quota errors
  }
}

export function getCachedResolvedMediaUrl(
  pathOrUrl: string | undefined | null
): string | undefined {
  if (!pathOrUrl) return undefined;
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return undefined;
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }
  hydrateResolvedUrlCache();
  return resolvedUrlCache.get(trimmed);
}

/**
 * Resolves a storage path ("submissions/...") or URI to an accessible signed download URL.
 * Signed-in admins have read permissions on Firebase Storage.
 */
export async function resolveMediaUrl(pathOrUrl: string | undefined | null): Promise<string> {
  if (!pathOrUrl) return "";
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return "";

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }

  hydrateResolvedUrlCache();

  if (resolvedUrlCache.has(trimmed)) {
    return resolvedUrlCache.get(trimmed)!;
  }

  const existing = inFlightUrlPromises.get(trimmed);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      let cleanPath = trimmed;
      if (cleanPath.startsWith("gs://")) {
        const parts = cleanPath.split("/").slice(3);
        cleanPath = parts.join("/");
      }
      const storageRef = ref(storage, cleanPath);
      const url = await getDownloadURL(storageRef);
      resolvedUrlCache.set(trimmed, url);
      persistResolvedUrlCache();
      return url;
    } catch (err) {
      console.warn(`Could not resolve storage path "${trimmed}":`, err);
      return "";
    } finally {
      inFlightUrlPromises.delete(trimmed);
    }
  })();

  inFlightUrlPromises.set(trimmed, promise);
  return promise;
}

/**
 * Collects all unique Storage paths referenced in a SubmissionRecord and resolves them
 * concurrently in one parallel batch (`Promise.all`), instead of sequentially one-by-one.
 */
export function hasUnresolvedMediaPaths(record: SubmissionRecord | null | undefined): boolean {
  if (!record?.answers) return false;
  hydrateResolvedUrlCache();
  const ans = record.answers;
  const isPending = (v?: string) =>
    Boolean(v && (v.startsWith("submissions/") || v.startsWith("gs://")) && !resolvedUrlCache.has(v.trim()));

  if (isPending(ans.couplePhotoUrl)) return true;
  if (isPending(ans.q10_people?.treePhotoUrl)) return true;
  if (ans.q10_people?.familyMembers?.some((m) => isPending(m.photoUrl))) return true;
  if (ans.q10_people?.brideSide?.photos?.some((p) => isPending(p.url))) return true;
  if (ans.q10_people?.groomSide?.photos?.some((p) => isPending(p.url))) return true;
  if (ans.q12_references?.images?.some((img) => isPending(img))) return true;
  if (ans.wardrobe?.bride?.photos?.some((img) => isPending(img))) return true;
  if (ans.wardrobe?.groom?.photos?.some((img) => isPending(img))) return true;
  if (ans.weddingOutfits?.images?.some((img) => isPending(img))) return true;
  if (ans.decorEvents?.some((ev) => ev?.images?.some((img) => isPending(img)))) return true;
  if (ans.decorMoodBoard?.images?.some((img) => isPending(img))) return true;
  if (ans.q23_oneLastThing?.images?.some((img) => isPending(img))) return true;
  if (ans.partnerAnswers?.partnerA?.q23_oneLastThing?.images?.some((img) => isPending(img))) return true;
  if (ans.partnerAnswers?.partnerB?.q23_oneLastThing?.images?.some((img) => isPending(img))) return true;
  return false;
}

async function resolveMediaListParallel(list: string[]): Promise<string[]> {
  if (!Array.isArray(list) || list.length === 0) return [];
  return Promise.all(list.map(async (item) => (await resolveMediaUrl(item)) || item));
}

/**
 * Resolves all image paths in a SubmissionRecord IN PARALLEL and auto-upgrades legacy
 * couple letters without blocking the main thread on sequential network requests.
 */
export async function resolveSubmissionMedia(record: SubmissionRecord): Promise<SubmissionRecord> {
  if (!record || !record.answers) return record;

  const cloned: SubmissionRecord = JSON.parse(JSON.stringify(record));
  const ans = cloned.answers;

  await Promise.all([
    ans.couplePhotoUrl
      ? resolveMediaUrl(ans.couplePhotoUrl).then((url) => {
          ans.couplePhotoUrl = url;
        })
      : Promise.resolve(),
    ans.q10_people?.treePhotoUrl
      ? resolveMediaUrl(ans.q10_people.treePhotoUrl).then((url) => {
          ans.q10_people.treePhotoUrl = url;
        })
      : Promise.resolve(),
    Array.isArray(ans.q10_people?.familyMembers)
      ? Promise.all(
          ans.q10_people.familyMembers.map(async (m) => {
            if (m.photoUrl) m.photoUrl = await resolveMediaUrl(m.photoUrl);
          })
        )
      : Promise.resolve(),
    Array.isArray(ans.q10_people?.brideSide?.photos)
      ? Promise.all(
          ans.q10_people.brideSide!.photos.map(async (p) => {
            if (p.url) p.url = await resolveMediaUrl(p.url);
          })
        )
      : Promise.resolve(),
    Array.isArray(ans.q10_people?.groomSide?.photos)
      ? Promise.all(
          ans.q10_people.groomSide!.photos.map(async (p) => {
            if (p.url) p.url = await resolveMediaUrl(p.url);
          })
        )
      : Promise.resolve(),
    Array.isArray(ans.q12_references?.images)
      ? resolveMediaListParallel(ans.q12_references.images).then((res) => {
          ans.q12_references.images = res;
        })
      : Promise.resolve(),
    Array.isArray(ans.wardrobe?.bride?.photos)
      ? resolveMediaListParallel(ans.wardrobe!.bride.photos).then((res) => {
          ans.wardrobe!.bride.photos = res;
        })
      : Promise.resolve(),
    Array.isArray(ans.wardrobe?.groom?.photos)
      ? resolveMediaListParallel(ans.wardrobe!.groom.photos).then((res) => {
          ans.wardrobe!.groom.photos = res;
        })
      : Promise.resolve(),
    Array.isArray(ans.weddingOutfits?.images)
      ? resolveMediaListParallel(ans.weddingOutfits!.images).then((res) => {
          ans.weddingOutfits!.images = res;
        })
      : Promise.resolve(),
    Array.isArray(ans.decorEvents)
      ? Promise.all(
          ans.decorEvents.map(async (ev) => {
            if (Array.isArray(ev?.images)) {
              ev.images = await resolveMediaListParallel(ev.images);
            }
          })
        )
      : Promise.resolve(),
    Array.isArray(ans.decorMoodBoard?.images)
      ? resolveMediaListParallel(ans.decorMoodBoard!.images).then((res) => {
          ans.decorMoodBoard!.images = res;
        })
      : Promise.resolve(),
    Array.isArray(ans.q23_oneLastThing?.images)
      ? resolveMediaListParallel(ans.q23_oneLastThing.images).then((res) => {
          ans.q23_oneLastThing.images = res;
        })
      : Promise.resolve(),
    Array.isArray(ans.partnerAnswers?.partnerA?.q23_oneLastThing?.images)
      ? resolveMediaListParallel(ans.partnerAnswers!.partnerA!.q23_oneLastThing!.images).then((res) => {
          ans.partnerAnswers!.partnerA!.q23_oneLastThing!.images = res;
        })
      : Promise.resolve(),
    Array.isArray(ans.partnerAnswers?.partnerB?.q23_oneLastThing?.images)
      ? resolveMediaListParallel(ans.partnerAnswers!.partnerB!.q23_oneLastThing!.images).then((res) => {
          ans.partnerAnswers!.partnerB!.q23_oneLastThing!.images = res;
        })
      : Promise.resolve(),
  ]);

  // Auto-synthesize or upgrade legacy couple letter on open
  if (cloned.answers) {
    try {
      const { letter, wasUpgraded } = upgradeCoupleLetterIfNeeded(
        cloned.coupleLetter,
        cloned.answers
      );
      if (wasUpgraded) {
        cloned.coupleLetter = letter;
        if (cloned.id) {
          updateLocalCacheRecord(cloned.id, (rec) => ({ ...rec, coupleLetter: letter }));
          const submissionRef = doc(db, "submissions", cloned.id);
          updateDoc(submissionRef, { coupleLetter: letter }).catch(() => {});
        }
      }
    } catch {
      // ignore
    }
  }

  return cloned;
}

/**
 * Prefetches Storage download URLs in parallel when hovering a couple row.
 */
export async function prefetchSubmissionMedia(record: SubmissionRecord): Promise<void> {
  if (!record || !hasUnresolvedMediaPaths(record)) return;
  try {
    const resolved = await resolveSubmissionMedia(record);
    if (resolved?.id) {
      updateLocalCacheRecord(resolved.id, () => resolved);
    }
  } catch {
    // non-blocking prefetch
  }
}

export interface SubmissionResult {
  id: string;
  displayId?: string;
  sequenceNumber?: number;
  uploadedPhotoCount: number;
  totalPhotoCount: number;
  pendingPhotoCount: number;
  failedPhotoCount: number;
}

/**
 * Pure helper returning every plain-English reason why a submission needs attention.
 * Returns an empty array once all issues are resolved so the badge clears back to "Submitted".
 */
export function getSubmissionAttentionReasons(
  record: Partial<SubmissionRecord>,
  submissionErrors?: SubmissionErrorRecord[]
): string[] {
  const reasons: string[] = [];
  const photoReport = buildNormalizedPhotoReport(record.answers, record.photoStatuses);

  if (photoReport.failedCount === 1) {
    reasons.push("1 photo failed to upload");
  } else if (photoReport.failedCount > 1) {
    reasons.push(`${photoReport.failedCount} photos failed to upload`);
  }

  if (!record.displayId || typeof record.sequenceNumber !== "number") {
    reasons.push("Missing submission number");
  }

  if (!record.status) {
    reasons.push("Missing status");
  }

  const hasLoggedEmailError = Boolean(
    record.id &&
      Array.isArray(submissionErrors) &&
      submissionErrors.some(
        (err) => err.submissionId === record.id && err.step === "post_save_notify_email"
      )
  );
  if (
    record.emailNotificationStatus !== "sent" &&
    (record.emailNotificationStatus === "failed" || hasLoggedEmailError)
  ) {
    reasons.push("Email not sent");
  }

  return reasons;
}

/**
 * Pure helper computing the delivery/health label for any submission in the Admin Dashboard:
 * - "photos_pending": one or more photos are still uploading
 * - "needs_attention": one or more concrete reasons from getSubmissionAttentionReasons()
 * - "submitted": normal complete submission (auto-clears once issues are resolved)
 */
export function getSubmissionDeliveryState(
  record: Partial<SubmissionRecord>,
  submissionErrors?: SubmissionErrorRecord[]
): SubmissionDeliveryState {
  const photoReport = buildNormalizedPhotoReport(record.answers, record.photoStatuses);
  const hasPhotoStatusEntries =
    Boolean(record.photoStatuses) && Object.keys(record.photoStatuses!).length > 0;
  const hasPendingPhotos =
    photoReport.uploadingCount > 0 ||
    (!hasPhotoStatusEntries &&
      typeof record.pendingPhotoCount === "number" &&
      record.pendingPhotoCount > 0);

  const reasons = getSubmissionAttentionReasons(record, submissionErrors);
  if (reasons.length > 0) {
    return "needs_attention";
  }
  if (hasPendingPhotos) {
    return "photos_pending";
  }
  return "submitted";
}

/**
 * Finds the best resumeToken for a submission (from the submission record itself or from drafts).
 */
export function findResumeTokenForSubmission(
  record: Partial<SubmissionRecord>,
  drafts?: DraftRecord[]
): string | null {
  if (record.resumeToken && record.resumeToken.length >= 22) {
    return record.resumeToken;
  }
  if (record.id && Array.isArray(drafts)) {
    const match = drafts.find((d) => d.submissionId === record.id && d.id.length >= 22);
    if (match) return match.id;
  }
  return null;
}

/**
 * Admin-only helper: returns a working resume URL for any submission that ANY client
 * can open on ANY phone/browser with zero email login required.
 * - Always re-opens the linked draft (`status: "draft"`, synced answers & photoStatuses)
 *   and unlocks the submission (`finalized: false` + `resumeToken`) so the couple can open
 *   their saved form, edit answers or add photos on any device, and save right back into
 *   the exact same submission without creating duplicates or burning a new ticket number.
 */
export async function ensureResumeLinkForSubmission(
  record: SubmissionRecord,
  existingDrafts?: DraftRecord[]
): Promise<{ token: string; url: string }> {
  const existingToken = findResumeTokenForSubmission(record, existingDrafts);
  const now = new Date().toISOString();
  const expiresAtMs = Date.now() + LINK_EXPIRY_MS;
  const sanitized = sanitizeAnswersForFirestore(record.answers);
  const token = existingToken || generateResumeToken();
  const adminUid = auth.currentUser?.uid || "admin";

  const draftRef = doc(db, "drafts", token);
  const draftPayload = stripUndefinedDeep({
    id: token,
    submissionId: record.id,
    ownerUid: adminUid,
    participantUids: record.participantUids || [adminUid],
    status: "draft" as const,
    linkLocked: false,
    revoked: false,
    linkExpiresAtIso: new Date(expiresAtMs).toISOString(),
    ...(record.fillMode ? { fillMode: record.fillMode } : {}),
    ...(record.partnerProgress ? { partnerProgress: record.partnerProgress } : {}),
    currentStep: 28,
    furthestStep: 28,
    partner1: record.partner1 || "",
    partner2: record.partner2 || "",
    weddingDate: record.weddingDate || "",
    phone: record.phone || "",
    email: record.email || "",
    answers: sanitized.answers,
    photoStatuses: record.photoStatuses || sanitized.photoStatuses,
    answeredCount: 27,
    mandatoryRemaining: 0,
    createdAt: record.submittedAt || now,
    updatedAt: now,
  });

  await setDoc(draftRef, {
    ...draftPayload,
    linkExpiresAt: Timestamp.fromMillis(expiresAtMs),
  });

  await updateDoc(doc(db, "submissions", record.id), {
    resumeToken: token,
    finalized: false,
    linkLocked: false,
    updatedAt: now,
  });

  updateLocalCacheRecord(record.id, (rec) => ({
    ...rec,
    resumeToken: token,
    finalized: false,
    linkLocked: false,
    updatedAt: now,
  }));

  return { token, url: buildResumeUrl(token) };
}

/**
 * Admin-only helper: Locks a submission's resume link immediately so anyone opening
 * the old link sees only "This link is no longer active. Please contact the studio."
 */
export async function lockSubmissionLinkNow(
  record: SubmissionRecord,
  existingDrafts?: DraftRecord[]
): Promise<void> {
  const now = new Date().toISOString();
  const existingToken = findResumeTokenForSubmission(record, existingDrafts);

  if (existingToken) {
    try {
      await updateDoc(doc(db, "drafts", existingToken), {
        linkLocked: true,
        updatedAt: now,
      });
    } catch {
      // draft may not exist for older records
    }
  }

  await updateDoc(doc(db, "submissions", record.id), {
    linkLocked: true,
    finalized: true,
    updatedAt: now,
  });

  updateLocalCacheRecord(record.id, (rec) => ({
    ...rec,
    linkLocked: true,
    finalized: true,
    updatedAt: now,
  }));
}

/**
 * Admin-only helper: Permanently kills the old resume link (`revoked: true, linkLocked: true`)
 * and creates a brand-new 192-bit resume link valid for 7 days.
 */
export async function resetSubmissionResumeLink(
  record: SubmissionRecord,
  existingDrafts?: DraftRecord[]
): Promise<{ token: string; url: string }> {
  const now = new Date().toISOString();
  const expiresAtMs = Date.now() + LINK_EXPIRY_MS;
  const oldToken = findResumeTokenForSubmission(record, existingDrafts);
  const newToken = generateResumeToken();
  const adminUid = auth.currentUser?.uid || "admin";
  const sanitized = sanitizeAnswersForFirestore(record.answers);

  // Create the fresh active draft first
  const newDraftPayload = stripUndefinedDeep({
    id: newToken,
    submissionId: record.id,
    ownerUid: adminUid,
    participantUids: [adminUid],
    status: "draft" as const,
    linkLocked: false,
    revoked: false,
    linkExpiresAtIso: new Date(expiresAtMs).toISOString(),
    ...(record.fillMode ? { fillMode: record.fillMode } : {}),
    ...(record.partnerProgress ? { partnerProgress: record.partnerProgress } : {}),
    currentStep: 28,
    furthestStep: 28,
    partner1: record.partner1 || "",
    partner2: record.partner2 || "",
    weddingDate: record.weddingDate || "",
    phone: record.phone || "",
    email: record.email || "",
    answers: sanitized.answers,
    photoStatuses: record.photoStatuses || sanitized.photoStatuses,
    answeredCount: 27,
    mandatoryRemaining: 0,
    createdAt: record.submittedAt || now,
    updatedAt: now,
  });

  await setDoc(doc(db, "drafts", newToken), {
    ...newDraftPayload,
    linkExpiresAt: Timestamp.fromMillis(expiresAtMs),
  });

  // Kill the old link permanently
  if (oldToken && oldToken !== newToken) {
    try {
      await updateDoc(doc(db, "drafts", oldToken), {
        revoked: true,
        linkLocked: true,
        updatedAt: now,
      });
    } catch {
      // old draft may not exist
    }
  }

  await updateDoc(doc(db, "submissions", record.id), {
    resumeToken: newToken,
    finalized: false,
    linkLocked: false,
    updatedAt: now,
  });

  updateLocalCacheRecord(record.id, (rec) => ({
    ...rec,
    resumeToken: newToken,
    finalized: false,
    linkLocked: false,
    updatedAt: now,
  }));

  return { token: newToken, url: buildResumeUrl(newToken) };
}

/**
 * Parses and validates the response from `/api/notify`, catching HTML rewrite responses
 * and Resend API errors even if an endpoint returned HTTP 200.
 */
export async function parseNotifyApiResponse(res: {
  ok: boolean;
  status: number;
  headers?: { get?: (name: string) => string | null };
  text: () => Promise<string>;
}): Promise<{ notified: boolean; coupleReceiptSent: boolean }> {
  const contentType = res.headers?.get?.("content-type") || "";
  const rawText = await res.text();

  let parsed: any = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }

  if (!parsed || (!contentType.includes("application/json") && rawText.trim().startsWith("<"))) {
    const htmlErr: any = new Error(
      `Notify endpoint returned non-JSON response (HTTP ${res.status}). Check vercel.json /api rewrite.`
    );
    htmlErr.code = "email/invalid-response";
    throw htmlErr;
  }

  const errorsList: string[] = Array.isArray(parsed.errors) ? parsed.errors : [];
  // Only the studio alert decides success; a couple-receipt-only issue is not a studio failure.
  const studioFailed = Boolean(parsed.studio && parsed.studio.sent === false);
  const failed =
    !res.ok ||
    parsed.success === false ||
    parsed.notified === false ||
    studioFailed ||
    (errorsList.length > 0 && !parsed.studio);

  if (failed) {
    const detail =
      errorsList.length > 0
        ? errorsList.join(" | ")
        : parsed.error || `Notify endpoint returned HTTP ${res.status}`;
    const resendErr: any = new Error(`HTTP ${res.status}: ${detail}`.slice(0, 300));
    resendErr.code = `email/http-${res.status}`;
    throw resendErr;
  }

  return {
    notified: Boolean(parsed.notified),
    coupleReceiptSent: Boolean(parsed.coupleReceiptSent),
  };
}

function getRecordTimestampMs(record: Partial<SubmissionRecord> & { createdAt?: any }): number {
  if (record.submittedAt) {
    const t = Date.parse(record.submittedAt);
    if (!Number.isNaN(t)) return t;
  }
  if (record.updatedAt) {
    const t = Date.parse(record.updatedAt);
    if (!Number.isNaN(t)) return t;
  }
  if (record.createdAt && typeof record.createdAt.toMillis === "function") {
    return record.createdAt.toMillis();
  }
  if (typeof record.createdAt === "string") {
    const t = Date.parse(record.createdAt);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

/**
 * Sorts submissions newest-first by submittedAt / updatedAt / createdAt so records
 * WITHOUT a sequenceNumber are never hidden and always sort chronologically.
 */
export function sortSubmissionsNewestFirst(
  records: SubmissionRecord[]
): SubmissionRecord[] {
  return [...records].sort((a, b) => {
    const timeDiff = getRecordTimestampMs(b) - getRecordTimestampMs(a);
    if (timeDiff !== 0) return timeDiff;
    return (b.sequenceNumber || 0) - (a.sequenceNumber || 0);
  });
}

export interface CoreSubmitDeps {
  writeSubmissionDoc: (submissionId: string, payload: Record<string, unknown>) => Promise<void>;
  assignDisplayNumber?: (submissionId: string) => Promise<{ sequenceNumber: number; displayId: string } | null>;
  markDraftDone?: (resumeToken: string | undefined, submissionId: string, submittedAt: string) => Promise<void>;
  notifyStudioAndCouple?: (payload: Record<string, unknown>) => Promise<void>;
  updateEmailStatus?: (submissionId: string, status: "sent" | "failed") => Promise<void>;
  logError?: (step: string, err: unknown, submissionId: string, photoCount: number) => Promise<void>;
  retryDelaysMs?: number[];
}

/**
 * Core save-main-record-first orchestrator (injectable for deterministic automated tests):
 * 1. Reuses ONE stable `submissionId` across up to 3 attempts (no duplicates, no burned numbers).
 * 2. Writes the main submission record to Firestore FIRST without deep-merging stale photoStatuses.
 * 3. Immediately resolves success once Firestore confirms the main write.
 * 4. Runs post-save tasks (studio + couple emails right away with "Photos: X of Y uploaded",
 *    display number transaction, and draft completion) quietly afterwards; any post-save failure
 *    is logged to `submissionErrors` and NEVER turns a saved submission into an error.
 */
export async function executeBulletproofSubmit(
  params: {
    submissionId: string;
    resumeToken?: string;
    ownerUid: string;
    answers: QuestionnaireAnswers;
    existingDisplayId?: string;
    fillMode?: FillMode;
    partnerProgress?: PartnerProgressMap;
    participantUids?: string[];
    submittedIncompletePartner?: string;
  },
  deps: CoreSubmitDeps
): Promise<SubmissionResult> {
  const {
    submissionId,
    resumeToken,
    ownerUid,
    answers,
    existingDisplayId,
    fillMode,
    partnerProgress,
    participantUids,
    submittedIncompletePartner,
  } = params;
  const sanitized = sanitizeAnswersForFirestore(answers);
  assertNoBase64Images(sanitized.answers);

  const submittedAt = new Date().toISOString();
  const photoReport = buildNormalizedPhotoReport(sanitized.answers, sanitized.photoStatuses);
  const editorialBrief = synthesizeEditorialBrief(sanitized.answers);
  const interviewQuestions = synthesizeInterviewQuestions(sanitized.answers);
  const cheatSheet = synthesizeCheatSheet(sanitized.answers);
  const coupleLetter = synthesizeCoupleLetter(sanitized.answers);

  // Note: `privateNotes` is intentionally omitted from couple-written submission docs so
  // studio notes stay isolated in admin-only `submissions/{id}/adminMeta/main`.
  const submissionData: SubmissionRecord = stripUndefinedDeep({
    id: submissionId,
    ownerUid,
    ...(participantUids && participantUids.length > 0 ? { participantUids } : {}),
    ...(resumeToken ? { resumeToken } : {}),
    ...(fillMode ? { fillMode } : {}),
    ...(partnerProgress ? { partnerProgress } : {}),
    ...(submittedIncompletePartner ? { submittedIncompletePartner } : {}),
    ...(submittedIncompletePartner
      ? (() => {
          const slot = (["partnerA", "partnerB"] as const).find(
            (sl) =>
              getPartnerDisplayName(sanitized.answers, sl) === submittedIncompletePartner
          );
          const summary = slot
            ? buildMissingSummaryForPartner(sanitized.answers, slot)
            : null;
          return summary ? { missingSummary: summary } : {};
        })()
      : {}),
    finalized: false, // Flipped to true after post-save numbering & any pending photo sync finish
    linkLocked: false, // Locked automatically on draft markDraftSubmitted + after post-submit sync
    submissionState:
      photoReport.failedCount > 0
        ? "needs_attention"
        : photoReport.uploadingCount > 0
        ? "photos_pending"
        : "submitted",
    submittedAt,
    updatedAt: submittedAt,
    status: "new",
    partner1: (answers.partner1 || "Partner 1").trim(),
    partner2: (answers.partner2 || "Partner 2").trim(),
    weddingDate: answers.weddingDate || "",
    phone: answers.phone || "",
    email: answers.email || "",
    answers: sanitized.answers,
    photoStatuses: sanitized.photoStatuses,
    pendingPhotoCount: sanitized.pendingCount,
    coupleLetter,
    editorialBrief,
    interviewQuestions,
    cheatSheet,
  });

  const retryDelays = deps.retryDelaysMs ?? [1000, 2200];
  const maxAttempts = retryDelays.length + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await deps.writeSubmissionDoc(submissionId, {
        ...submissionData,
        createdAt: serverTimestamp(),
      });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, retryDelays[attempt - 1]));
      }
    }
  }

  if (lastError) {
    await deps.logError?.("send_main_save", lastError, submissionId, sanitized.totalCount);
    throw lastError;
  }

  // MAIN RECORD IS NOW CONFIRMED SAVED!
  // Fire studio alert + couple receipt immediately, alongside display numbering & draft completion.
  // None of these can EVER turn a saved submission into an error for the couple.
  const runPostSave = async () => {
    const emailTask = (async () => {
      if (!deps.notifyStudioAndCouple) return;
      try {
        await deps.notifyStudioAndCouple({
          submissionId,
          displayId: existingDisplayId || "",
          partner1: submissionData.partner1,
          partner2: submissionData.partner2,
          weddingDate: submissionData.weddingDate,
          phone: submissionData.phone,
          email: submissionData.email,
          submittedAt,
          uploadedPhotoCount: photoReport.uploadedCount,
          notAddedPhotoSlotCount: photoReport.notAddedCount,
          failedPhotoCount: photoReport.failedCount,
          uploadingPhotoCount: photoReport.uploadingCount,
          totalPhotoCount: sanitized.totalCount,
          pendingPhotoCount: photoReport.uploadingCount,
        });
        await deps.updateEmailStatus?.(submissionId, "sent").catch(() => {});
      } catch (err) {
        await deps.logError?.("post_save_notify_email", err, submissionId, sanitized.totalCount);
        await deps.updateEmailStatus?.(submissionId, "failed").catch(() => {});
      }
    })();

    const numberingTask = (async () => {
      if (!deps.assignDisplayNumber) return;
      try {
        await deps.assignDisplayNumber(submissionId);
      } catch (err) {
        await deps.logError?.("post_save_assign_number", err, submissionId, sanitized.totalCount);
      }
    })();

    const draftTask = (async () => {
      if (!deps.markDraftDone) return;
      try {
        await deps.markDraftDone(resumeToken, submissionId, submittedAt);
      } catch (err) {
        await deps.logError?.("post_save_mark_draft", err, submissionId, sanitized.totalCount);
      }
    })();

    await Promise.allSettled([emailTask, numberingTask, draftTask]);
  };

  void runPostSave();

  return {
    id: submissionId,
    uploadedPhotoCount: sanitized.uploadedCount,
    totalPhotoCount: sanitized.totalCount,
    pendingPhotoCount: sanitized.pendingCount,
    failedPhotoCount: sanitized.failedCount,
  };
}

let activePostSubmitPhotoUnsub: (() => void) | null = null;
let activePostSubmitSyncSubmissionId: string | null = null;

/**
 * Watches any photos that were still uploading/retrying when Send was tapped (or after a reload).
 * As each photo finishes in the background, replaces `answers` and `photoStatuses` cleanly
 * (no deep-merge that could leave stale "failed" keys behind). Once every photo finishes,
 * clears pending post-submit state and resets the couple session so the next submission starts fresh.
 */
export function watchPendingPhotosAfterSubmit(
  submissionId: string,
  originalAnswers: QuestionnaireAnswers,
  onSyncUpdated?: (counts: { uploaded: number; pending: number; failed: number }) => void
): void {
  if (activePostSubmitPhotoUnsub) {
    activePostSubmitPhotoUnsub();
    activePostSubmitPhotoUnsub = null;
  }
  activePostSubmitSyncSubmissionId = submissionId;

  const pushLatestSnapshotToFirestore = () => {
    const nextSanitized = sanitizeAnswersForFirestore(originalAnswers);
    const allDone = nextSanitized.pendingCount === 0 && nextSanitized.failedCount === 0;
    const now = new Date().toISOString();

    onSyncUpdated?.({
      uploaded: nextSanitized.uploadedCount,
      pending: nextSanitized.pendingCount,
      failed: nextSanitized.failedCount,
    });

    void updateDoc(doc(db, "submissions", submissionId), {
      answers: stripUndefinedDeep(nextSanitized.answers),
      photoStatuses: stripUndefinedDeep(nextSanitized.photoStatuses),
      pendingPhotoCount: nextSanitized.pendingCount,
      submissionState:
        nextSanitized.failedCount > 0
          ? "needs_attention"
          : nextSanitized.pendingCount > 0
          ? "photos_pending"
          : "submitted",
      finalized: allDone,
      updatedAt: now,
    })
      .then(() => {
        if (allDone) {
          if (activePostSubmitPhotoUnsub) {
            activePostSubmitPhotoUnsub();
            activePostSubmitPhotoUnsub = null;
          }
          activePostSubmitSyncSubmissionId = null;
          clearPendingPostSubmitState();
          resetActiveCoupleSession();
          resetDraftUploadFolder(submissionId);
        }
      })
      .catch((err) => {
        void logSubmissionError({
          step: "post_save_pending_photo_sync",
          error: err,
          photoCount: countAllPhotosInAnswers(originalAnswers),
          submissionId,
        });
      });
  };

  activePostSubmitPhotoUnsub = subscribePhotoUploadComplete(() => {
    pushLatestSnapshotToFirestore();
  });

  // Also check immediately in case resumed IndexedDB uploads already finished
  const immediate = sanitizeAnswersForFirestore(originalAnswers);
  if (immediate.pendingCount === 0 && immediate.failedCount === 0) {
    pushLatestSnapshotToFirestore();
  }
}

/**
 * Called on app mount if the couple refreshed the page while ThankYouScreen was still uploading photos.
 * Restores blobs from IndexedDB, restarts uploads, and re-attaches the Firestore watcher so every
 * uploaded Storage path still attaches cleanly to the submitted Firestore record.
 */
export async function resumePostSubmitPhotoSync(
  state: PendingPostSubmitState
): Promise<{ resumedCount: number; missingCount: number }> {
  await ensureCoupleAnonymousAuth();
  const { resumedCount, missingSlots } = await resumePendingUploadsFromIndexedDb(
    state.submissionId,
    state.answers
  );

  if (activePostSubmitSyncSubmissionId !== state.submissionId) {
    watchPendingPhotosAfterSubmit(state.submissionId, state.answers);
  }

  return {
    resumedCount,
    missingCount: missingSlots.length,
  };
}

/**
 * Assigns the next sequential submission number (#001, #002...) inside a Firestore transaction
 * AFTER the main record has already been saved. Never falls back to a clock-based number.
 */
async function assignSequentialDisplayNumber(
  submissionId: string,
  shouldFinalize: boolean
): Promise<{ sequenceNumber: number; displayId: string } | null> {
  const counterRef = doc(db, "counters", "submissions");
  const nextSeq = await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const current = counterDoc.exists() ? Number(counterDoc.data()?.current || 0) : 0;
    const next = current + 1;
    transaction.set(counterRef, { current: next }, { merge: true });
    return next;
  });

  const displayId = `#${String(nextSeq).padStart(3, "0")}`;
  await updateDoc(doc(db, "submissions", submissionId), {
    sequenceNumber: nextSeq,
    displayId,
    finalized: shouldFinalize,
    updatedAt: new Date().toISOString(),
  });

  return { sequenceNumber: nextSeq, displayId };
}

/**
 * Public entry point called by ReviewScreen when the couple taps "Send".
 * - Uses anonymous auth + stable submissionId
 * - Gives almost-finished photos a brief 2.5s window without ever blocking
 * - Saves main record first WITHOUT merging stale photoStatuses
 * - Fires studio + couple emails right away (validating full JSON response & logging Resend errors)
 * - Resets couple session once fully finished so a second submission in the same browser never reuses old IDs/photoStatuses
 */
export interface CreateSubmissionOptions {
  fillMode?: FillMode;
  partnerProgress?: PartnerProgressMap;
  participantUids?: string[];
  submittedIncompletePartner?: string;
}

export async function createSubmission(
  answers: QuestionnaireAnswers,
  options?: CreateSubmissionOptions
): Promise<SubmissionResult> {
  const session = getOrCreateCoupleSession();
  const authRes = await ensureCoupleAnonymousAuth();
  if (!authRes?.uid) {
    const authErr: any = new Error(
      "Could not start a secure session. Please make sure Anonymous Sign-In is enabled."
    );
    authErr.code = "auth/anonymous-disabled";
    void logSubmissionError({
      step: "send_auth",
      error: authErr,
      photoCount: countAllPhotosInAnswers(answers),
      submissionId: session.submissionId,
    });
    throw authErr;
  }

  // Give almost-finished uploads a brief window, and trigger background retries for any paused ones
  kickOffPendingPhotoRetries();
  await waitBrieflyForActiveUploads(2500);

  const sanitizedPreview = sanitizeAnswersForFirestore(answers);
  const hasPendingOrFailed =
    sanitizedPreview.pendingCount > 0 || sanitizedPreview.failedCount > 0;

  // Check if this submission already exists (e.g., couple reopened resume link OR partner just auto-sent at the same second)
  const docRef = doc(db, "submissions", session.submissionId);
  let existingDocSnap: Awaited<ReturnType<typeof getDoc>> | null = null;
  try {
    existingDocSnap = await getDoc(docRef);
  } catch {
    existingDocSnap = null;
  }
  const existingSubmissionData = existingDocSnap?.exists()
    ? (existingDocSnap.data() as Partial<SubmissionRecord>)
    : null;
  const alreadyExistsWithNumber = Boolean(
    existingSubmissionData &&
      typeof existingSubmissionData.sequenceNumber === "number"
  );

  const mergedParticipants = Array.from(
    new Set([
      ...(existingSubmissionData?.participantUids || []),
      ...(options?.participantUids || []),
      authRes.uid,
    ].filter(Boolean))
  ).slice(0, 4);

  const result = await executeBulletproofSubmit(
    {
      submissionId: session.submissionId,
      resumeToken: session.resumeToken,
      ownerUid: existingSubmissionData?.ownerUid || authRes.uid,
      answers,
      existingDisplayId: existingSubmissionData?.displayId,
      fillMode: options?.fillMode || answers.fillMode,
      partnerProgress: options?.partnerProgress,
      participantUids: mergedParticipants,
      submittedIncompletePartner: options?.submittedIncompletePartner,
    },
    {
      writeSubmissionDoc: async (id, payload) => {
        const targetRef = doc(db, "submissions", id);
        if (existingSubmissionData) {
          // Explicitly replace answers & photoStatuses via updateDoc so stale "failed" entries are wiped cleanly,
          // while preserving admin-managed fields (displayId, sequenceNumber, status, privateNotes, original submittedAt).
          const { createdAt: _ignoredCreatedAt, privateNotes: _ignoredNotes, ...updateFields } = payload;
          await updateDoc(targetRef, {
            ...updateFields,
            ...(existingSubmissionData.displayId
              ? { displayId: existingSubmissionData.displayId }
              : {}),
            ...(typeof existingSubmissionData.sequenceNumber === "number"
              ? { sequenceNumber: existingSubmissionData.sequenceNumber }
              : {}),
            ...(existingSubmissionData.status
              ? { status: existingSubmissionData.status }
              : {}),
            ...(existingSubmissionData.submittedAt
              ? { submittedAt: existingSubmissionData.submittedAt }
              : {}),
            ...(existingSubmissionData.resumeToken
              ? { resumeToken: existingSubmissionData.resumeToken }
              : {}),
            finalized: !hasPendingOrFailed,
            linkLocked: !hasPendingOrFailed,
          });
        } else {
          // Brand new document — full overwrite (NO { merge: true } that could inherit old photoStatuses)
          await setDoc(targetRef, payload);
        }
      },
      assignDisplayNumber: alreadyExistsWithNumber
        ? undefined
        : async (id) => assignSequentialDisplayNumber(id, !hasPendingOrFailed),
      markDraftDone: async (token, id, submittedAt) => {
        await markDraftSubmitted(token, id, submittedAt);
      },
      // Every submission (together, or each partner separately) alerts the studio.
      notifyStudioAndCouple: async (body) => {
        const res = await fetch(`${import.meta.env.BASE_URL}api/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await parseNotifyApiResponse(res);
      },
      updateEmailStatus: async (id, emailNotificationStatus) => {
        await updateDoc(doc(db, "submissions", id), {
          emailNotificationStatus,
          updatedAt: new Date().toISOString(),
        });
      },
      logError: async (step, err, id, photoCount) => {
        await logSubmissionError({ step, error: err, submissionId: id, photoCount });
      },
    }
  );

  if (result.pendingPhotoCount > 0 || result.failedPhotoCount > 0) {
    savePendingPostSubmitState({
      submissionId: session.submissionId,
      resumeToken: session.resumeToken,
      answers,
      submittedAt: new Date().toISOString(),
    });
    watchPendingPhotosAfterSubmit(session.submissionId, answers);
  } else {
    // Fully complete: clear pending sync, IndexedDB queue, and reset session so the next
    // submission in this browser ALWAYS gets a brand new submissionId & resumeToken.
    clearPendingPostSubmitState();
    resetActiveCoupleSession();
    resetDraftUploadFolder(session.submissionId);
  }

  return result;
}

const SESSION_CACHE_KEY = "oaks_submissions_cache_v1";
let memorySubmissionsCache: SubmissionRecord[] | null = null;

function saveToSessionCache(records: SubmissionRecord[]) {
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(records));
  } catch {
    // sessionStorage quota or disabled
  }
}

function loadFromSessionCache(): SubmissionRecord[] | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return null;
}

function updateLocalCacheRecord(id: string, updater: (record: SubmissionRecord) => SubmissionRecord) {
  if (memorySubmissionsCache) {
    memorySubmissionsCache = memorySubmissionsCache.map((rec) => (rec.id === id ? updater(rec) : rec));
    saveToSessionCache(memorySubmissionsCache);
  }
}

function removeFromLocalCache(id: string) {
  if (memorySubmissionsCache) {
    memorySubmissionsCache = memorySubmissionsCache.filter((rec) => rec.id !== id);
    saveToSessionCache(memorySubmissionsCache);
  }
}

/**
 * Fetches EVERY submission document in Firestore WITHOUT `orderBy("sequenceNumber")`
 * so no submission missing `sequenceNumber` or `status` is ever silently hidden.
 */
async function fetchSubmissionsFromServer(): Promise<SubmissionRecord[]> {
  const submissionsRef = collection(db, "submissions");
  const snapshot = await getDocs(submissionsRef);

  const results: SubmissionRecord[] = [];
  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data() as SubmissionRecord;
    results.push({
      ...data,
      id: docSnapshot.id,
    });
  });
  const hydrated = await hydrateSubmissionsWithAdminMeta(results);
  return sortSubmissionsNewestFirst(hydrated);
}

/**
 * Synchronous cache getter so AdminDashboard & AdminWeddingChecklist can render at 0ms
 * with zero skeleton flash when navigating between admin routes.
 */
export function getCachedSubmissions(): SubmissionRecord[] | null {
  if (memorySubmissionsCache && memorySubmissionsCache.length > 0) {
    return memorySubmissionsCache;
  }
  const sessionData = loadFromSessionCache();
  if (sessionData && sessionData.length > 0) {
    memorySubmissionsCache = sessionData;
    return sessionData;
  }
  return null;
}

/**
 * Synchronous single-couple cache lookup so AdminCoupleDetail opens at 0ms from Dashboard.
 */
export function getCachedSubmissionById(id: string): SubmissionRecord | null {
  if (!id) return null;
  const cachedList = getCachedSubmissions();
  if (cachedList) {
    return cachedList.find((r) => r.id === id) ?? null;
  }
  return null;
}

/**
 * Admin: Fetch all submissions ordered by newest timestamp first.
 * Employs SWR (Stale-While-Revalidate) with in-memory & sessionStorage caching
 * so repeat visits and back navigation appear in 0ms without blank screens.
 */
export async function getSubmissions(
  forceRefresh = false,
  onRevalidated?: (fresh: SubmissionRecord[]) => void
): Promise<SubmissionRecord[]> {
  // 1. In-memory cache hit (fastest, 0ms)
  if (!forceRefresh && memorySubmissionsCache && memorySubmissionsCache.length > 0) {
    fetchSubmissionsFromServer()
      .then((fresh) => {
        memorySubmissionsCache = fresh;
        saveToSessionCache(fresh);
        onRevalidated?.(fresh);
      })
      .catch(() => {});
    return memorySubmissionsCache;
  }

  // 2. SessionStorage cache hit (preserves data across page reloads/tab navigation)
  if (!forceRefresh && !memorySubmissionsCache) {
    const sessionData = loadFromSessionCache();
    if (sessionData && sessionData.length > 0) {
      memorySubmissionsCache = sessionData;
      fetchSubmissionsFromServer()
        .then((fresh) => {
          memorySubmissionsCache = fresh;
          saveToSessionCache(fresh);
          onRevalidated?.(fresh);
        })
        .catch(() => {});
      return sessionData;
    }
  }

  // 3. Network fetch
  const fresh = await fetchSubmissionsFromServer();
  memorySubmissionsCache = fresh;
  saveToSessionCache(fresh);
  return fresh;
}

/**
 * Admin: Lists orphaned Firebase Storage folders under `submissions/` that do not
 * have a matching Firestore submission document (e.g. failed submits whose photos uploaded).
 */
export async function listOrphanedStorageFolders(
  existingSubmissions: SubmissionRecord[]
): Promise<OrphanedStorageFolder[]> {
  const knownIds = new Set(existingSubmissions.map((s) => s.id));
  const referencedFolders = new Set<string>();

  // Also collect any Storage folder names referenced inside existing submission answers
  for (const sub of existingSubmissions) {
    const rawJson = JSON.stringify(sub.answers || {});
    const matches = rawJson.matchAll(/submissions\/([^/"\\]+)\//g);
    for (const m of matches) {
      if (m[1]) referencedFolders.add(m[1]);
    }
  }

  const rootRef = ref(storage, "submissions");
  const rootListing = await listAll(rootRef);
  const orphaned: OrphanedStorageFolder[] = [];

  await Promise.all(
    rootListing.prefixes.map(async (folderRef) => {
      const folderName = folderRef.name;
      if (knownIds.has(folderName) || referencedFolders.has(folderName)) {
        return;
      }

      const photoPaths: string[] = [];
      try {
        const level1 = await listAll(folderRef);
        level1.items.forEach((item) => photoPaths.push(item.fullPath));
        // Also check one nested level for `submissions/{submissionId}/{ownerUid}/{file}`
        await Promise.all(
          level1.prefixes.map(async (subPrefix) => {
            try {
              const level2 = await listAll(subPrefix);
              level2.items.forEach((item) => photoPaths.push(item.fullPath));
            } catch {
              // ignore subfolder listing error
            }
          })
        );
      } catch {
        // ignore folder listing error
      }

      // Extract estimated timestamp from folder name (e.g. sub_010_1794830537946 or draft_179...)
      let estimatedDate: string | undefined;
      const tsMatch = folderName.match(/(\d{13})/);
      if (tsMatch) {
        const ms = Number(tsMatch[1]);
        if (!Number.isNaN(ms) && ms > 1_600_000_000_000) {
          estimatedDate = new Date(ms).toISOString();
        }
      }

      orphaned.push({
        folderName,
        fullPath: folderRef.fullPath,
        photoPaths,
        estimatedDate,
      });
    })
  );

  return orphaned.sort((a, b) =>
    (b.estimatedDate || b.folderName).localeCompare(a.estimatedDate || a.folderName)
  );
}

/**
 * Admin: One-time recovery action that creates a visible Firestore submission record
 * from an orphaned Firebase Storage folder so the studio can inspect and download its photos.
 */
export async function recoverOrphanedStorageFolder(
  folder: OrphanedStorageFolder,
  partner1 = "Recovered Couple",
  partner2 = "(Photos Only)"
): Promise<SubmissionRecord> {
  const now = new Date().toISOString();
  const submissionId = folder.folderName;
  const answers: QuestionnaireAnswers = {
    partner1: partner1.trim() || "Recovered Couple",
    partner2: partner2.trim() || "(Photos Only)",
    weddingDate: "",
    phone: "",
    email: "",
    q1_calls: { aCallsB: "", bCallsA: "" },
    q2_workPassion: { partnerA: "", partnerB: "" },
    q3_firstMeet: "",
    q4_firstImpression: { partnerA: "", partnerB: "" },
    q5_threeWords: ["", "", ""],
    q6_activities: { selected: [], other: "" },
    q7_loveMost: { partnerA: "", partnerB: "" },
    q8_funnyStory: "",
    q9_proposal: { choice: "", story: "" },
    q10_people: {
      familyMembers: [],
      treeNotes: "",
      brideSide: { photos: [], notes: "" },
      groomSide: { photos: [], notes: "" },
    },
    q11_filmFeel: { selected: [], other: "" },
    q12_references: { links: [], images: [], notes: "" },
    wardrobe: {
      bride: { notes: "", links: [], photos: [] },
      groom: { notes: "", links: [], photos: [] },
    },
    weddingOutfits: { links: [], images: [], notes: "" },
    decorMoodBoard: { links: [], images: [], notes: "" },
    q13_tone: { selected: [], other: "" },
    q14_moments: { selected: [], other: "" },
    q15_captureAvoid: { definitelyCapture: "", pleaseAvoid: "" },
    q16_nonNegotiables: "",
    q17_emotional: "",
    q18_cameraVersatility: "",
    choosingOaks: "",
    q19_whatMattersMost: { selected: [], other: "" },
    q20_guidanceComfort: "",
    q21_comfortTips: { selected: [], notes: "" },
    q22_futureFeeling: "",
    q23_oneLastThing: {
      notes: `Recovered ${folder.photoPaths.length} photo(s) from orphaned Storage folder "${folder.folderName}".`,
      images: folder.photoPaths,
    },
  };

  const photoStatuses: Record<string, PhotoStatusEntry> = {};
  folder.photoPaths.forEach((p, idx) => {
    photoStatuses[`recovered_${idx + 1}`] = {
      id: `recovered_${idx + 1}`,
      category: "recovered",
      status: "uploaded",
      storagePath: p,
      updatedAt: now,
    };
  });

  const record: SubmissionRecord = stripUndefinedDeep({
    id: submissionId,
    submittedAt: folder.estimatedDate || now,
    updatedAt: now,
    status: "new",
    submissionState: "needs_attention",
    recoveredFromStorage: true,
    finalized: true,
    partner1: answers.partner1,
    partner2: answers.partner2,
    weddingDate: "",
    phone: "",
    email: "",
    answers,
    photoStatuses,
    pendingPhotoCount: 0,
    privateNotes: `Recovered from orphaned Firebase Storage folder: ${folder.folderName}`,
  });

  await setDoc(doc(db, "submissions", submissionId), {
    ...record,
    createdAt: serverTimestamp(),
  });

  if (memorySubmissionsCache) {
    memorySubmissionsCache = sortSubmissionsNewestFirst([record, ...memorySubmissionsCache]);
    saveToSessionCache(memorySubmissionsCache);
  }
  return record;
}

/**
 * Admin: Converts an unfinished online draft into a full SubmissionRecord in Firestore
 * (helpful when a couple answered all questions in their draft but never tapped Send).
 */
export async function recoverDraftAsSubmission(
  draft: DraftRecord
): Promise<SubmissionRecord> {
  const now = new Date().toISOString();
  const sanitized = sanitizeAnswersForFirestore(draft.answers);
  assertNoBase64Images(sanitized.answers);

  const submissionId = draft.submissionId || `rec_${Date.now()}`;
  const editorialBrief = synthesizeEditorialBrief(sanitized.answers);
  const interviewQuestions = synthesizeInterviewQuestions(sanitized.answers);
  const cheatSheet = synthesizeCheatSheet(sanitized.answers);
  const coupleLetter = synthesizeCoupleLetter(sanitized.answers);

  const record: SubmissionRecord = stripUndefinedDeep({
    id: submissionId,
    ownerUid: draft.ownerUid,
    resumeToken: draft.id,
    submittedAt: draft.updatedAt || now,
    updatedAt: now,
    status: "new",
    submissionState: "needs_attention",
    recoveredFromDraft: true,
    finalized: true,
    partner1: (draft.partner1 || draft.answers.partner1 || "Partner 1").trim(),
    partner2: (draft.partner2 || draft.answers.partner2 || "Partner 2").trim(),
    weddingDate: draft.weddingDate || draft.answers.weddingDate || "",
    phone: draft.phone || draft.answers.phone || "",
    email: draft.email || draft.answers.email || "",
    answers: sanitized.answers,
    photoStatuses: draft.photoStatuses || sanitized.photoStatuses,
    pendingPhotoCount: 0,
    coupleLetter,
    editorialBrief,
    interviewQuestions,
    cheatSheet,
    privateNotes: "Recovered from unfinished online draft by studio admin.",
  });

  await setDoc(doc(db, "submissions", submissionId), {
    ...record,
    createdAt: serverTimestamp(),
  });

  await markDraftSubmitted(draft.id, submissionId, now);

  if (memorySubmissionsCache) {
    const withoutOld = memorySubmissionsCache.filter((r) => r.id !== submissionId);
    memorySubmissionsCache = sortSubmissionsNewestFirst([record, ...withoutOld]);
    saveToSessionCache(memorySubmissionsCache);
  }

  return record;
}

/**
 * Fast single-couple loader: returns cached or Firestore record immediately WITHOUT
 * blocking on Firebase Storage getDownloadURL requests.
 */
export async function getSubmissionRecordFast(id: string): Promise<SubmissionRecord | null> {
  const cached = getCachedSubmissionById(id);
  if (cached) return cached;

  const submissionRef = doc(db, "submissions", id);
  const snapshot = await getDoc(submissionRef);
  if (!snapshot.exists()) return null;

  const rawRecord = { ...(snapshot.data() as SubmissionRecord), id: snapshot.id };
  const adminMeta = await loadAdminMetaForSubmission(id);
  const record = mergeAdminMetaIntoSubmission(rawRecord, adminMeta);

  if (memorySubmissionsCache) {
    const idx = memorySubmissionsCache.findIndex((r) => r.id === id);
    if (idx >= 0) memorySubmissionsCache[idx] = record;
    else memorySubmissionsCache.push(record);
    saveToSessionCache(memorySubmissionsCache);
  }
  return record;
}

/**
 * Admin: Fetch a single couple submission by ID with parallel media resolution.
 */
export async function getSubmissionById(id: string): Promise<SubmissionRecord | null> {
  const raw = await getSubmissionRecordFast(id);
  if (!raw) return null;
  const resolved = await resolveSubmissionMedia(raw);
  updateLocalCacheRecord(id, () => resolved);
  return resolved;
}

/**
 * Admin: Update submission review status ('new' | 'reviewed' | 'shared').
 * Stored in admin-only subcollection `submissions/{id}/adminMeta/main` so link holders
 * can never read or modify internal status.
 */
export async function updateSubmissionStatus(
  id: string,
  status: SubmissionStatus
): Promise<void> {
  updateLocalCacheRecord(id, (rec) => ({ ...rec, status }));
  await saveAdminMetaStatus(id, status);
}

/**
 * Admin: Update private team notes for a couple.
 * Stored exclusively in admin-only subcollection `submissions/{id}/adminMeta/main` so
 * couples and resume-link holders can NEVER read private team notes.
 */
export async function updateSubmissionNotes(
  id: string,
  privateNotes: string
): Promise<void> {
  updateLocalCacheRecord(id, (rec) => ({ ...rec, privateNotes }));
  await saveAdminMetaNotes(id, privateNotes);
}

/**
 * Admin: Update or save newly generated editorial brief for a couple.
 */
export async function updateSubmissionEditorialBrief(
  id: string,
  editorialBrief: string
): Promise<void> {
  updateLocalCacheRecord(id, (rec) => ({ ...rec, editorialBrief }));
  const submissionRef = doc(db, "submissions", id);
  await updateDoc(submissionRef, { editorialBrief });
}

/**
 * Admin: Update or save newly generated interview questions for a couple.
 */
export async function updateSubmissionInterviewQuestions(
  id: string,
  interviewQuestions: string
): Promise<void> {
  updateLocalCacheRecord(id, (rec) => ({ ...rec, interviewQuestions }));
  const submissionRef = doc(db, "submissions", id);
  await updateDoc(submissionRef, { interviewQuestions });
}

/**
 * Admin: Update or save newly generated couple letter for a couple.
 */
export async function updateSubmissionCoupleLetter(
  id: string,
  coupleLetter: string
): Promise<void> {
  updateLocalCacheRecord(id, (rec) => ({ ...rec, coupleLetter }));
  const submissionRef = doc(db, "submissions", id);
  await updateDoc(submissionRef, { coupleLetter });
}

/**
 * Admin: Update or save newly generated shoot day cheat sheet for a couple.
 */
export async function updateSubmissionCheatSheet(
  id: string,
  cheatSheet: string
): Promise<void> {
  updateLocalCacheRecord(id, (rec) => ({ ...rec, cheatSheet }));
  const submissionRef = doc(db, "submissions", id);
  await updateDoc(submissionRef, { cheatSheet });
}

/**
 * Admin: Permanently delete a submission.
 */
export async function deleteSubmission(id: string): Promise<void> {
  removeFromLocalCache(id);
  const submissionRef = doc(db, "submissions", id);
  await deleteDoc(submissionRef);
}

function stripUndefinedDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function logAndThrowFirestoreError(
  error: unknown,
  operationType: "create" | "update" | "delete" | "get" | "write",
  path: string,
  fallbackMessage: string
): never {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
    },
  };
  console.error("Firestore Error:", JSON.stringify(errInfo));
  throw new Error(error instanceof Error ? error.message : fallbackMessage);
}

function isPermissionDeniedError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "permission-denied") return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("missing or insufficient permissions");
}

async function canFallbackToMainChecklistCustomEvents(
  submissionId: string,
  eventId: string
): Promise<boolean> {
  try {
    const snap = await getDoc(
      doc(db, "submissions", submissionId, "productionEvents", eventId)
    );
    // If subcollection read succeeds and doc exists, subcollection rules ARE deployed.
    // Never fall back if the subcollection doc is already locked.
    if (snap.exists()) {
      const data = snap.data() as Partial<CustomProductionEvent> | undefined;
      if (data?.submitted || data?.submission) {
        return false;
      }
    }
    return !snap.exists();
  } catch (readErr) {
    // Subcollection read itself denied -> subcollection rules are not yet published
    return isPermissionDeniedError(readErr);
  }
}

/**
 * Admin: Save updated Wedding Production Checklist status map for a couple.
 */
export async function updateSubmissionChecklist(
  id: string,
  productionChecklist: ProductionChecklistData
): Promise<void> {
  const cleanChecklist = stripUndefinedDeep(productionChecklist);
  updateLocalCacheRecord(id, (rec) => ({ ...rec, productionChecklist: cleanChecklist }));
  const path = `submissions/${id}`;
  try {
    const submissionRef = doc(db, "submissions", id);
    await updateDoc(submissionRef, { productionChecklist: cleanChecklist });
  } catch (error) {
    logAndThrowFirestoreError(
      error,
      "update",
      path,
      "Failed to save checklist changes to Firestore."
    );
  }
}

/**
 * Admin: Submit and permanently lock a standard production event
 * ('sangeet' | 'wedding' | 'reception').
 * Writes the lock & complete submission metadata onto the primary couple submission
 * document first so submission succeeds immediately under live admin rules, then
 * mirrors a write-once archival copy to eventSubmissions when subcollection rules allow.
 */
export async function submitStandardChecklistEvent(
  id: string,
  nextChecklist: ProductionChecklistData,
  submissionRecord: EventSubmissionRecord
): Promise<void> {
  const cleanChecklist = stripUndefinedDeep(nextChecklist);
  const cleanRecord = stripUndefinedDeep(submissionRecord);
  const path = `submissions/${id}`;

  try {
    await updateDoc(doc(db, "submissions", id), {
      productionChecklist: cleanChecklist,
    });
    updateLocalCacheRecord(id, (rec) => ({
      ...rec,
      productionChecklist: cleanChecklist,
    }));
  } catch (error) {
    logAndThrowFirestoreError(
      error,
      "update",
      path,
      "Failed to submit and lock event in Firestore."
    );
  }

  // Secondary write-once archive mirror (non-blocking if subcollection rules are pending deployment)
  try {
    await setDoc(
      doc(db, "submissions", id, "eventSubmissions", submissionRecord.eventId),
      cleanRecord
    );
  } catch (archiveErr) {
    if (!isPermissionDeniedError(archiveErr)) {
      console.warn("Non-blocking eventSubmissions archive write failed:", archiveErr);
    }
  }
}

/**
 * Admin: Subscribe to real-time updates for a couple's production checklist.
 */
export function subscribeSubmissionChecklist(
  id: string,
  onUpdate: (checklist: ProductionChecklistData | undefined) => void,
  onError: (err: Error) => void
): () => void {
  const path = `submissions/${id}`;
  const submissionRef = doc(db, "submissions", id);
  return onSnapshot(
    submissionRef,
    (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as SubmissionRecord;
      updateLocalCacheRecord(id, (rec) => ({
        ...rec,
        productionChecklist: data.productionChecklist,
      }));
      onUpdate(data.productionChecklist);
    },
    (error) => {
      const errInfo = {
        error: error instanceof Error ? error.message : String(error),
        operationType: "get",
        path,
        authInfo: {
          userId: auth.currentUser?.uid ?? null,
          email: auth.currentUser?.email ?? null,
          emailVerified: auth.currentUser?.emailVerified ?? null,
        },
      };
      console.error("Firestore Listener Error:", JSON.stringify(errInfo));
      onError(
        error instanceof Error
          ? error
          : new Error("Failed to sync checklist updates.")
      );
    }
  );
}

/**
 * Admin: Subscribe to custom production events created for a couple.
 * Gracefully degrades to empty list if subcollection rules are not yet deployed.
 */
export function subscribeCustomProductionEvents(
  submissionId: string,
  onUpdate: (events: CustomProductionEvent[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = `submissions/${submissionId}/productionEvents`;
  const q = query(
    collection(db, "submissions", submissionId, "productionEvents"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: CustomProductionEvent[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...(docSnap.data() as CustomProductionEvent), id: docSnap.id });
      });
      onUpdate(list);
    },
    (error) => {
      if (isPermissionDeniedError(error)) {
        onUpdate([]);
        return;
      }
      console.error("Firestore Custom Events Listener Error:", path, error);
      onError(
        error instanceof Error
          ? error
          : new Error("Failed to sync custom wedding events.")
      );
    }
  );
}

/**
 * Admin: Subscribe to immutable archived event submission receipts.
 * Gracefully degrades to empty map if subcollection rules are not yet deployed.
 */
export function subscribeEventSubmissions(
  submissionId: string,
  onUpdate: (archivedByEventId: Record<string, EventSubmissionRecord>) => void,
  onError: (err: Error) => void
): () => void {
  const path = `submissions/${submissionId}/eventSubmissions`;
  return onSnapshot(
    collection(db, "submissions", submissionId, "eventSubmissions"),
    (snapshot) => {
      const map: Record<string, EventSubmissionRecord> = {};
      snapshot.forEach((docSnap) => {
        map[docSnap.id] = docSnap.data() as EventSubmissionRecord;
      });
      onUpdate(map);
    },
    (error) => {
      if (isPermissionDeniedError(error)) {
        onUpdate({});
        return;
      }
      console.error("Firestore Event Submissions Listener Error:", path, error);
      onError(
        error instanceof Error
          ? error
          : new Error("Failed to sync submitted event records.")
      );
    }
  );
}

/**
 * Admin: Create a new unsubmitted custom production event for a couple.
 */
export async function createCustomProductionEvent(
  submissionId: string,
  eventId: string,
  name: string,
  createdBy: string,
  previousChecklist?: ProductionChecklistData
): Promise<{ event: CustomProductionEvent; fallbackChecklist?: ProductionChecklistData }> {
  const now = new Date().toISOString();
  const payload: CustomProductionEvent = stripUndefinedDeep({
    id: eventId,
    name: name.trim(),
    isCustom: true,
    items: {},
    fileDetails: [],
    submitted: false,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,
  });
  const path = `submissions/${submissionId}/productionEvents/${eventId}`;
  try {
    await setDoc(doc(db, "submissions", submissionId, "productionEvents", eventId), payload);
    return { event: payload };
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      const fallbackChecklist = stripUndefinedDeep(
        buildCustomEventUpsertChecklistData(previousChecklist, payload, createdBy)
      );
      await updateSubmissionChecklist(submissionId, fallbackChecklist);
      return { event: payload, fallbackChecklist };
    }
    logAndThrowFirestoreError(error, "create", path, "Failed to create custom event.");
  }
}

/**
 * Admin: Update an unsubmitted custom event's checklist items and/or file details.
 * Firestore security rules reject this automatically once submitted == true.
 */
export async function updateCustomProductionEvent(
  submissionId: string,
  event: CustomProductionEvent,
  updates: {
    items?: Record<string, ChecklistItemStatus>;
    fileDetails?: FileDetailEntry[];
    updatedBy?: string;
  },
  previousChecklist?: ProductionChecklistData
): Promise<{ fallbackChecklist?: ProductionChecklistData }> {
  const now = new Date().toISOString();
  const cleanUpdates = stripUndefinedDeep({
    ...updates,
    updatedAt: now,
  });
  const path = `submissions/${submissionId}/productionEvents/${event.id}`;

  if (previousChecklist?.customEvents?.[event.id]) {
    const updatedEvent: CustomProductionEvent = stripUndefinedDeep({
      ...event,
      ...cleanUpdates,
    });
    const fallbackChecklist = stripUndefinedDeep(
      buildCustomEventUpsertChecklistData(
        previousChecklist,
        updatedEvent,
        updates.updatedBy || "Admin"
      )
    );
    await updateSubmissionChecklist(submissionId, fallbackChecklist);
    return { fallbackChecklist };
  }

  try {
    await updateDoc(
      doc(db, "submissions", submissionId, "productionEvents", event.id),
      cleanUpdates
    );
    return {};
  } catch (error) {
    if (
      isPermissionDeniedError(error) &&
      (await canFallbackToMainChecklistCustomEvents(submissionId, event.id))
    ) {
      const updatedEvent: CustomProductionEvent = stripUndefinedDeep({
        ...event,
        ...cleanUpdates,
      });
      const fallbackChecklist = stripUndefinedDeep(
        buildCustomEventUpsertChecklistData(
          previousChecklist,
          updatedEvent,
          updates.updatedBy || "Admin"
        )
      );
      await updateSubmissionChecklist(submissionId, fallbackChecklist);
      return { fallbackChecklist };
    }
    logAndThrowFirestoreError(
      error,
      "update",
      path,
      "Failed to update custom event. Submitted events cannot be modified."
    );
  }
}

/**
 * Admin: Submit and permanently lock a custom event and mirror its immutable archive doc.
 */
export async function submitCustomProductionEvent(
  submissionId: string,
  nextCustomEvent: CustomProductionEvent,
  submissionRecord: EventSubmissionRecord,
  previousChecklist?: ProductionChecklistData
): Promise<{ fallbackChecklist?: ProductionChecklistData }> {
  const cleanEvent = stripUndefinedDeep(nextCustomEvent);
  const cleanRecord = stripUndefinedDeep(submissionRecord);
  const path = `submissions/${submissionId}/productionEvents/${nextCustomEvent.id}`;
  let fallbackChecklistResult: ProductionChecklistData | undefined;

  if (previousChecklist?.customEvents?.[nextCustomEvent.id]) {
    const fallbackChecklist = stripUndefinedDeep(
      buildCustomEventUpsertChecklistData(
        previousChecklist,
        cleanEvent,
        cleanEvent.updatedBy || cleanRecord.submittedBy
      )
    );
    await updateSubmissionChecklist(submissionId, fallbackChecklist);
    fallbackChecklistResult = fallbackChecklist;
  } else {
    try {
      await updateDoc(
        doc(db, "submissions", submissionId, "productionEvents", nextCustomEvent.id),
        {
          items: cleanEvent.items,
          fileDetails: cleanEvent.fileDetails,
          submitted: true,
          submission: cleanRecord,
          updatedAt: cleanRecord.submittedAt,
          updatedBy: cleanEvent.updatedBy || cleanRecord.submittedBy,
        }
      );
    } catch (error) {
      if (
        isPermissionDeniedError(error) &&
        (await canFallbackToMainChecklistCustomEvents(submissionId, nextCustomEvent.id))
      ) {
        const fallbackChecklist = stripUndefinedDeep(
          buildCustomEventUpsertChecklistData(
            previousChecklist,
            cleanEvent,
            cleanEvent.updatedBy || cleanRecord.submittedBy
          )
        );
        await updateSubmissionChecklist(submissionId, fallbackChecklist);
        fallbackChecklistResult = fallbackChecklist;
      } else {
        logAndThrowFirestoreError(
          error,
          "write",
          path,
          "Failed to submit and permanently lock custom event."
        );
      }
    }
  }

  // Secondary write-once archive mirror (non-blocking if subcollection rules are pending)
  try {
    await setDoc(
      doc(db, "submissions", submissionId, "eventSubmissions", nextCustomEvent.id),
      cleanRecord
    );
  } catch (archiveErr) {
    if (!isPermissionDeniedError(archiveErr)) {
      console.warn("Non-blocking eventSubmissions archive write failed:", archiveErr);
    }
  }

  return { fallbackChecklist: fallbackChecklistResult };
}

/**
 * Admin: Delete an unsubmitted custom event. Submitted or standard events cannot be deleted.
 */
export async function deleteCustomProductionEvent(
  submissionId: string,
  eventId: string,
  updatedBy: string = "Admin",
  previousChecklist?: ProductionChecklistData
): Promise<{ fallbackChecklist?: ProductionChecklistData }> {
  const path = `submissions/${submissionId}/productionEvents/${eventId}`;

  if (previousChecklist?.customEvents?.[eventId]) {
    const fallbackChecklist = stripUndefinedDeep(
      buildCustomEventDeleteChecklistData(previousChecklist, eventId, updatedBy)
    );
    await updateSubmissionChecklist(submissionId, fallbackChecklist);
    return { fallbackChecklist };
  }

  try {
    await deleteDoc(doc(db, "submissions", submissionId, "productionEvents", eventId));
    return {};
  } catch (error) {
    if (
      isPermissionDeniedError(error) &&
      (await canFallbackToMainChecklistCustomEvents(submissionId, eventId))
    ) {
      const fallbackChecklist = stripUndefinedDeep(
        buildCustomEventDeleteChecklistData(previousChecklist, eventId, updatedBy)
      );
      await updateSubmissionChecklist(submissionId, fallbackChecklist);
      return { fallbackChecklist };
    }
    logAndThrowFirestoreError(
      error,
      "delete",
      path,
      "Failed to delete custom event. Submitted events cannot be deleted."
    );
  }
}





