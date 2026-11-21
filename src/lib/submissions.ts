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
} from "firebase/firestore";
import { ref, getDownloadURL, listAll } from "firebase/storage";
import { db, storage, auth } from "./firebase.ts";
import {
  QuestionnaireAnswers,
  SubmissionRecord,
  SubmissionStatus,
  SubmissionDeliveryState,
  DraftRecord,
  OrphanedStorageFolder,
  PhotoStatusEntry,
  ProductionChecklistData,
  CustomProductionEvent,
  EventSubmissionRecord,
  ChecklistItemStatus,
  FileDetailEntry,
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
  sanitizeAnswersForFirestore,
  subscribePhotoUploadComplete,
  waitBrieflyForActiveUploads,
} from "./photoUploadManager.ts";
import { assertNoBase64Images } from "../utils/submissionSizeGuard.ts";
import {
  ensureCoupleAnonymousAuth,
  getOrCreateCoupleSession,
} from "./coupleSession.ts";
import { logSubmissionError } from "./errorLogger.ts";
import { markDraftSubmitted } from "./drafts.ts";

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
  return false;
}

async function resolveMediaListParallel(list: string[]): Promise<string[]> {
  if (!Array.isArray(list) || list.length === 0) return [];
  const resolved = await Promise.all(list.map((item) => resolveMediaUrl(item)));
  return resolved.filter(Boolean);
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
  pendingPhotoCount: number;
  failedPhotoCount: number;
}

/**
 * Pure helper computing the delivery/health label for any submission in the Admin Dashboard:
 * - "photos_pending": one or more photos were still uploading at Send time
 * - "needs_attention": missing display number/sequenceNumber, missing status, or failed photos
 * - "submitted": normal complete submission
 */
export function getSubmissionDeliveryState(
  record: Partial<SubmissionRecord>
): SubmissionDeliveryState {
  const statuses = record.photoStatuses ? Object.values(record.photoStatuses) : [];
  const hasFailedPhotos = statuses.some((s) => s.status === "failed");
  const hasPendingPhotos =
    (typeof record.pendingPhotoCount === "number" && record.pendingPhotoCount > 0) ||
    statuses.some((s) => s.status === "pending");

  if (hasPendingPhotos) return "photos_pending";
  if (
    hasFailedPhotos ||
    !record.displayId ||
    typeof record.sequenceNumber !== "number" ||
    !record.status
  ) {
    return "needs_attention";
  }
  return "submitted";
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
  logError?: (step: string, err: unknown, submissionId: string, photoCount: number) => Promise<void>;
  retryDelaysMs?: number[];
}

/**
 * Core save-main-record-first orchestrator (injectable for deterministic automated tests):
 * 1. Reuses ONE stable `submissionId` across up to 3 attempts (no duplicates, no burned numbers).
 * 2. Writes the main submission record to Firestore FIRST (with verified uploaded photos only;
 *    pending/failed photos NEVER block submission).
 * 3. Immediately resolves success once Firestore confirms the main write.
 * 4. Runs post-save tasks (display number transaction, draft status update, studio + couple emails)
 *    quietly afterwards; any post-save failure is logged to `submissionErrors` and NEVER turns
 *    a saved submission into an error.
 */
export async function executeBulletproofSubmit(
  params: {
    submissionId: string;
    resumeToken?: string;
    ownerUid: string;
    answers: QuestionnaireAnswers;
  },
  deps: CoreSubmitDeps
): Promise<SubmissionResult> {
  const { submissionId, resumeToken, ownerUid, answers } = params;
  const sanitized = sanitizeAnswersForFirestore(answers);
  assertNoBase64Images(sanitized.answers);

  const submittedAt = new Date().toISOString();
  const pendingOrFailed = sanitized.pendingCount + sanitized.failedCount;
  const editorialBrief = synthesizeEditorialBrief(sanitized.answers);
  const interviewQuestions = synthesizeInterviewQuestions(sanitized.answers);
  const cheatSheet = synthesizeCheatSheet(sanitized.answers);
  const coupleLetter = synthesizeCoupleLetter(sanitized.answers);

  const submissionData: SubmissionRecord = stripUndefinedDeep({
    id: submissionId,
    ownerUid,
    finalized: false, // Flipped to true after post-save numbering & any pending photo sync finish
    submissionState:
      sanitized.pendingCount > 0
        ? "photos_pending"
        : sanitized.failedCount > 0
        ? "needs_attention"
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
    privateNotes: "",
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
  // Everything below runs quietly without EVER causing Send to report an error.
  const runPostSave = async () => {
    let assignedDisplayId: string | undefined;

    if (deps.assignDisplayNumber) {
      try {
        const assigned = await deps.assignDisplayNumber(submissionId);
        if (assigned) {
          assignedDisplayId = assigned.displayId;
        }
      } catch (err) {
        await deps.logError?.("post_save_assign_number", err, submissionId, sanitized.totalCount);
      }
    }

    if (deps.markDraftDone) {
      try {
        await deps.markDraftDone(resumeToken, submissionId, submittedAt);
      } catch (err) {
        await deps.logError?.("post_save_mark_draft", err, submissionId, sanitized.totalCount);
      }
    }

    if (deps.notifyStudioAndCouple) {
      try {
        await deps.notifyStudioAndCouple({
          submissionId,
          displayId: assignedDisplayId || "",
          partner1: submissionData.partner1,
          partner2: submissionData.partner2,
          weddingDate: submissionData.weddingDate,
          phone: submissionData.phone,
          email: submissionData.email,
          submittedAt,
          pendingPhotoCount: pendingOrFailed,
        });
      } catch (err) {
        await deps.logError?.("post_save_notify_email", err, submissionId, sanitized.totalCount);
      }
    }
  };

  void runPostSave();

  return {
    id: submissionId,
    pendingPhotoCount: sanitized.pendingCount,
    failedPhotoCount: sanitized.failedCount,
  };
}

let activePostSubmitPhotoUnsub: (() => void) | null = null;

/**
 * Watches any photos that were still uploading/retrying when Send was tapped.
 * As each photo finishes in the background, quietly patches the verified Storage path
 * into the already-saved submission record (while finalized == false).
 */
function watchPendingPhotosAfterSubmit(
  submissionId: string,
  originalAnswers: QuestionnaireAnswers
): void {
  if (activePostSubmitPhotoUnsub) {
    activePostSubmitPhotoUnsub();
    activePostSubmitPhotoUnsub = null;
  }

  activePostSubmitPhotoUnsub = subscribePhotoUploadComplete(() => {
    const nextSanitized = sanitizeAnswersForFirestore(originalAnswers);
    const allDone = nextSanitized.pendingCount === 0 && nextSanitized.failedCount === 0;
    const now = new Date().toISOString();

    void updateDoc(doc(db, "submissions", submissionId), {
      answers: stripUndefinedDeep(nextSanitized.answers),
      photoStatuses: stripUndefinedDeep(nextSanitized.photoStatuses),
      pendingPhotoCount: nextSanitized.pendingCount,
      submissionState:
        nextSanitized.pendingCount > 0
          ? "photos_pending"
          : nextSanitized.failedCount > 0
          ? "needs_attention"
          : "submitted",
      finalized: allDone,
      updatedAt: now,
    })
      .then(() => {
        if (allDone && activePostSubmitPhotoUnsub) {
          activePostSubmitPhotoUnsub();
          activePostSubmitPhotoUnsub = null;
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
  });
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
 * - Saves main record first with up to 3 automatic retries
 * - Runs numbering, draft completion, and emails quietly after save
 */
export async function createSubmission(
  answers: QuestionnaireAnswers
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

  const result = await executeBulletproofSubmit(
    {
      submissionId: session.submissionId,
      resumeToken: session.resumeToken,
      ownerUid: authRes.uid,
      answers,
    },
    {
      writeSubmissionDoc: async (id, payload) => {
        await setDoc(doc(db, "submissions", id), payload, { merge: true });
      },
      assignDisplayNumber: async (id) =>
        assignSequentialDisplayNumber(id, !hasPendingOrFailed),
      markDraftDone: async (token, id, submittedAt) => {
        await markDraftSubmitted(token, id, submittedAt);
      },
      notifyStudioAndCouple: async (body) => {
        const res = await fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(`Notify endpoint returned ${res.status}`);
        }
      },
      logError: async (step, err, id, photoCount) => {
        await logSubmissionError({ step, error: err, submissionId: id, photoCount });
      },
    }
  );

  if (result.pendingPhotoCount > 0 || result.failedPhotoCount > 0) {
    watchPendingPhotosAfterSubmit(session.submissionId, answers);
  } else {
    resetDraftUploadFolder();
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
  return sortSubmissionsNewestFirst(results);
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

  await setDoc(
    doc(db, "submissions", submissionId),
    {
      ...record,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

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

  const record = { ...(snapshot.data() as SubmissionRecord), id: snapshot.id };
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
 */
export async function updateSubmissionStatus(
  id: string,
  status: SubmissionStatus
): Promise<void> {
  updateLocalCacheRecord(id, (rec) => ({ ...rec, status }));
  const submissionRef = doc(db, "submissions", id);
  await updateDoc(submissionRef, { status });
}

/**
 * Admin: Update private team notes for a couple.
 */
export async function updateSubmissionNotes(
  id: string,
  privateNotes: string
): Promise<void> {
  updateLocalCacheRecord(id, (rec) => ({ ...rec, privateNotes }));
  const submissionRef = doc(db, "submissions", id);
  await updateDoc(submissionRef, { privateNotes });
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





