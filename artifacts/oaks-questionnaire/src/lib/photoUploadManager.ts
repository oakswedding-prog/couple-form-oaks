/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase.ts";
import { preparePhotoForUpload } from "../utils/imageCompressor.ts";
import {
  ensureCoupleAnonymousAuth,
  getOrCreateCoupleSession,
} from "./coupleSession.ts";
import { extractShortErrorCode, logSubmissionError } from "./errorLogger.ts";
import {
  clearPendingPhotosForSubmissionIdb,
  deletePendingPhotoFromIdb,
  getAllPendingPhotosFromIdb,
  savePendingPhotoToIdb,
} from "./photoIndexedDb.ts";
import type {
  PhotoStatusEntry,
  QuestionnaireAnswers,
} from "../types/questionnaire.ts";
import {
  isLegacyNonFailurePhotoError,
  normalizeMediaPathKey,
} from "../utils/photoStatusSummary.ts";

export const PENDING_PHOTO_PREFIX = "pending_photo:";
export const PHOTO_UPLOAD_TIMEOUT_MS = 60_000; // 60 seconds per attempt

export type PhotoUploadStatus = "uploading" | "uploaded" | "error";

export interface PhotoUploadEntry {
  localToken: string;
  submissionId?: string;
  targetStoragePath: string;
  uploadedStoragePath?: string; // Set ONLY after Firebase Storage upload succeeds
  category: string;
  fileName?: string;
  extension?: string;
  previewUrl: string;
  blob: Blob;
  contentType: string;
  status: PhotoUploadStatus;
  waitingForAuth?: boolean;
  progress: number;
  attempts: number;
  error?: string;
  errorCode?: string;
  downloadUrl?: string;
  updatedAt: string;
}

export interface MissingPhotoSlot {
  id: string;
  category: string;
  label: string;
  stepNumber: number;
  status: "pending" | "failed";
  errorCode?: string;
}

const entriesMap = new Map<string, PhotoUploadEntry>();
const activePromisesMap = new Map<string, Promise<string>>();
const listeners = new Set<() => void>();
const completionListeners = new Set<(entry: PhotoUploadEntry) => void>();

export function getPhotoCategoryLabel(category: string): string {
  const slug = (category || "").toLowerCase();
  if (slug === "couple_photo") return "Couple Photo (Q1)";
  if (slug === "family_tree") return "Family Tree Photo (Q10)";
  if (slug.startsWith("bride_vip")) return "Bride's Side VIP Photo (Q10)";
  if (slug.startsWith("groom_vip")) return "Groom's Side VIP Photo (Q10)";
  if (slug === "family_member") return "VIP Reference Photo (Q10)";
  if (slug.startsWith("bride_family")) return "Bride's Side Family Photo (Q10)";
  if (slug.startsWith("groom_family")) return "Groom's Side Family Photo (Q10)";
  if (slug === "reference") return "Visual Reference (Q12)";
  if (slug === "bride_outfit") return "Bride's Wardrobe Photo (Q13)";
  if (slug === "groom_outfit") return "Groom's Wardrobe Photo (Q13)";
  if (slug === "outfit" || slug === "wardrobe") return "Wardrobe Photo (Q13)";
  if (slug.startsWith("decor_")) {
    const rawEvent = slug.replace(/^decor_/, "").replace(/_/g, " ").trim();
    const prettyEvent = rawEvent
      ? rawEvent.replace(/\b\w/g, (c) => c.toUpperCase())
      : "Decor";
    return `${prettyEvent} Decor Photo (Q14)`;
  }
  if (slug === "decor") return "Decor Mood Board Photo (Q14)";
  if (slug === "last_thing") return "One Last Thing Photo (Q27)";
  return "Uploaded Photo";
}

export function getPhotoStepNumber(category: string): number {
  const slug = (category || "").toLowerCase();
  if (slug === "couple_photo") return 1;
  if (
    slug === "family_tree" ||
    slug === "family_member" ||
    slug.startsWith("bride_vip") ||
    slug.startsWith("groom_vip") ||
    slug.startsWith("bride_family") ||
    slug.startsWith("groom_family")
  ) {
    return 10;
  }
  if (slug === "reference") return 12;
  if (slug === "bride_outfit" || slug === "groom_outfit" || slug === "outfit" || slug === "wardrobe") {
    return 13;
  }
  if (slug === "decor" || slug.startsWith("decor_")) return 14;
  if (slug === "last_thing") return 27;
  return 1;
}

function notifyListeners() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore
    }
  });
}

function notifyCompletion(entry: PhotoUploadEntry) {
  completionListeners.forEach((cb) => {
    try {
      cb(entry);
    } catch {
      // ignore
    }
  });
}

export function isPendingPhotoToken(value: string | undefined | null): boolean {
  return Boolean(value && value.startsWith(PENDING_PHOTO_PREFIX));
}

export function subscribePhotoUploads(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function subscribePhotoUploadComplete(
  listener: (entry: PhotoUploadEntry) => void
): () => void {
  completionListeners.add(listener);
  return () => {
    completionListeners.delete(listener);
  };
}

export function getPhotoUploadEntry(
  tokenOrPath: string | undefined | null
): PhotoUploadEntry | undefined {
  if (!tokenOrPath) return undefined;
  const direct = entriesMap.get(tokenOrPath);
  if (direct) return direct;
  for (const entry of entriesMap.values()) {
    if (entry.uploadedStoragePath === tokenOrPath || entry.targetStoragePath === tokenOrPath) {
      return entry;
    }
  }
  return undefined;
}

export function getAllTrackedPhotoEntries(): PhotoUploadEntry[] {
  return Array.from(entriesMap.values());
}

/**
 * Returns the fastest previewable URL during the couple's current session
 * (in-memory blob preview or resolved downloadUrl), while Firestore only ever
 * receives verified Firebase Storage paths ("submissions/...").
 */
export function getPhotoPreviewSrc(
  tokenOrPath: string | undefined | null
): string | undefined {
  if (!tokenOrPath) return undefined;
  const entry = getPhotoUploadEntry(tokenOrPath);
  if (entry) {
    return entry.downloadUrl || entry.previewUrl;
  }
  return tokenOrPath;
}

export function usePhotoUploadStatus(
  tokenOrPath: string | undefined | null
): PhotoUploadEntry | undefined {
  const [, setVersion] = useState(0);

  useEffect(() => {
    return subscribePhotoUploads(() => {
      setVersion((v) => v + 1);
    });
  }, []);

  return getPhotoUploadEntry(tokenOrPath);
}

/**
 * Clears in-memory tracked photo entries (and optional IndexedDB queue for a submission)
 * when starting a brand new questionnaire.
 */
export function resetDraftUploadFolder(submissionIdToClear?: string): void {
  entriesMap.forEach((entry) => {
    try {
      URL.revokeObjectURL(entry.previewUrl);
    } catch {
      // ignore
    }
  });
  entriesMap.clear();
  activePromisesMap.clear();
  if (submissionIdToClear) {
    void clearPendingPhotosForSubmissionIdb(submissionIdToClear);
  }
  notifyListeners();
}

export function getActivePendingOrFailedCount(): {
  uploading: number;
  failed: number;
  uploaded: number;
} {
  let uploading = 0;
  let failed = 0;
  let uploaded = 0;
  entriesMap.forEach((e) => {
    if (e.status === "uploading") uploading++;
    else if (e.status === "error") failed++;
    else if (e.status === "uploaded") uploaded++;
  });
  return { uploading, failed, uploaded };
}

/**
 * Strictly waits for anonymous sign-in to complete before ANY Storage upload begins.
 * Never returns "anon_pending". If sign-in fails transiently (e.g., offline), retries
 * with backoff while keeping the photo cleanly queued instead of failing it immediately.
 */
export async function waitForCoupleUidBeforeUpload(
  authProvider: () => Promise<{ uid: string } | null> = ensureCoupleAnonymousAuth,
  retryDelaysMs: number[] = [1000, 2500, 5000, 8000]
): Promise<string | null> {
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    try {
      const res = await authProvider();
      if (res?.uid && res.uid !== "anon_pending") {
        return res.uid;
      }
    } catch {
      // retry below
    }
    if (attempt < retryDelaysMs.length) {
      await new Promise((r) => setTimeout(r, retryDelaysMs[attempt]));
    }
  }
  return null;
}

function buildFinalStoragePath(
  submissionId: string,
  ownerUid: string,
  localToken: string,
  extension: string
): string {
  const tokenSuffix = localToken.replace(PENDING_PHOTO_PREFIX, "");
  const cleanExt = (extension || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  return `submissions/${submissionId}/${ownerUid}/${tokenSuffix}.${cleanExt}`;
}

async function performSingleUploadWithTimeout(
  entry: PhotoUploadEntry,
  timeoutMs = PHOTO_UPLOAD_TIMEOUT_MS
): Promise<string> {
  // Strictly wait for anonymous auth BEFORE touching Firebase Storage — never upload to "anon_pending"
  const curBeforeAuth = entriesMap.get(entry.localToken);
  if (curBeforeAuth) {
    entriesMap.set(entry.localToken, {
      ...curBeforeAuth,
      status: "uploading",
      waitingForAuth: true,
      updatedAt: new Date().toISOString(),
    });
    notifyListeners();
  }

  const uid = await waitForCoupleUidBeforeUpload();
  if (!uid) {
    // Keep queued — do NOT upload under anon_pending!
    const curQueued = entriesMap.get(entry.localToken);
    if (curQueued) {
      entriesMap.set(entry.localToken, {
        ...curQueued,
        status: "uploading",
        waitingForAuth: true,
        error: undefined,
        errorCode: undefined,
        updatedAt: new Date().toISOString(),
      });
      notifyListeners();
    }
    const authWaitErr: any = new Error("Waiting for secure sign-in before uploading photo.");
    authWaitErr.code = "auth/waiting-for-signin";
    authWaitErr.keepQueued = true;
    throw authWaitErr;
  }

  const submissionId = entry.submissionId || getOrCreateCoupleSession().submissionId;
  const uploadPath = buildFinalStoragePath(
    submissionId,
    uid,
    entry.localToken,
    entry.extension || "jpg"
  );

  const curReady = entriesMap.get(entry.localToken);
  if (curReady) {
    entriesMap.set(entry.localToken, {
      ...curReady,
      submissionId,
      targetStoragePath: uploadPath,
      waitingForAuth: false,
      progress: Math.max(curReady.progress, 5),
      updatedAt: new Date().toISOString(),
    });
    notifyListeners();
  }

  const storageRef = ref(storage, uploadPath);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, entry.blob, {
      contentType: entry.contentType,
    });

    let settled = false;
    let lastActivityAt = Date.now();

    const timer = setInterval(() => {
      if (settled) return;
      if (Date.now() - lastActivityAt >= timeoutMs) {
        settled = true;
        clearInterval(timer);
        try {
          task.cancel();
        } catch {
          // ignore
        }
        const timeoutErr: any = new Error("Photo upload timed out.");
        timeoutErr.code = "storage/upload-timeout";
        reject(timeoutErr);
      }
    }, 3000);

    task.on(
      "state_changed",
      (snapshot) => {
        if (snapshot.bytesTransferred > 0) {
          lastActivityAt = Date.now();
        }
        if (snapshot.totalBytes > 0) {
          const pct = Math.min(
            99,
            Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          );
          const current = entriesMap.get(entry.localToken);
          if (current) {
            entriesMap.set(entry.localToken, {
              ...current,
              status: "uploading",
              waitingForAuth: false,
              progress: Math.max(current.progress, pct),
              error: undefined,
              errorCode: undefined,
              updatedAt: new Date().toISOString(),
            });
            notifyListeners();
          }
        }
      },
      (err) => {
        if (!settled) {
          settled = true;
          clearInterval(timer);
          reject(err);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearInterval(timer);
          resolve();
        }
      }
    );
  });

  // Upload is confirmed in Firebase Storage — safe to remove from IndexedDB queue now!
  await deletePendingPhotoFromIdb(entry.localToken);

  // Couples do not have Storage read access (admin-only), so getDownloadURL is optional
  let downloadUrl: string | undefined;
  try {
    downloadUrl = await getDownloadURL(storageRef);
  } catch {
    downloadUrl = undefined;
  }

  const latest = entriesMap.get(entry.localToken);
  if (latest) {
    const completed: PhotoUploadEntry = {
      ...latest,
      submissionId,
      targetStoragePath: uploadPath,
      uploadedStoragePath: uploadPath, // ONLY stored after Firebase Storage confirms upload!
      status: "uploaded",
      waitingForAuth: false,
      progress: 100,
      error: undefined,
      errorCode: undefined,
      downloadUrl,
      updatedAt: new Date().toISOString(),
    };
    entriesMap.set(entry.localToken, completed);
    notifyListeners();
    notifyCompletion(completed);
  }

  return uploadPath;
}

function runUploadWithRetries(localToken: string): Promise<string> {
  const existingPromise = activePromisesMap.get(localToken);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    const backoffMs = [1500, 3500, 7000];
    let lastError: unknown;

    for (let attempt = 1; attempt <= backoffMs.length + 1; attempt++) {
      const current = entriesMap.get(localToken);
      if (!current) {
        return "";
      }
      if (current.status === "uploaded" && current.uploadedStoragePath) {
        return current.uploadedStoragePath;
      }

      entriesMap.set(localToken, {
        ...current,
        status: "uploading",
        attempts: attempt,
        error: undefined,
        errorCode: undefined,
        updatedAt: new Date().toISOString(),
      });
      notifyListeners();

      try {
        return await performSingleUploadWithTimeout(current);
      } catch (err: any) {
        lastError = err;
        if (err?.keepQueued) {
          // Sign-in wasn't available yet: keep queued in IndexedDB & retry quietly later instead of failing
          setTimeout(() => {
            const stillQueued = entriesMap.get(localToken);
            if (stillQueued && stillQueued.status !== "uploaded" && !activePromisesMap.has(localToken)) {
              void runUploadWithRetries(localToken).catch(() => {});
            }
          }, 8000);
          return "";
        }
        if (attempt <= backoffMs.length) {
          await new Promise((r) => setTimeout(r, backoffMs[attempt - 1]));
        }
      }
    }

    const latest = entriesMap.get(localToken);
    const errorCode = extractShortErrorCode(lastError, "storage/upload-failed");
    const errorMsg = "Upload paused. Will retry — or tap retry.";
    if (latest) {
      entriesMap.set(localToken, {
        ...latest,
        status: "error",
        waitingForAuth: false,
        error: errorMsg,
        errorCode,
        updatedAt: new Date().toISOString(),
      });
      notifyListeners();
    }

    void logSubmissionError({
      step: "photo_upload",
      error: lastError,
      photoCount: entriesMap.size,
      submissionId: latest?.submissionId,
    });

    throw lastError instanceof Error ? lastError : new Error(errorMsg);
  })().finally(() => {
    activePromisesMap.delete(localToken);
  });

  activePromisesMap.set(localToken, promise);
  return promise;
}

/**
 * Validates size (<= 15 MB), converts HEIC -> JPEG on device, resizes to max 2400px,
 * persists the compressed blob & metadata to IndexedDB so it survives page refreshes,
 * and starts Firebase Storage upload strictly AFTER anonymous sign-in completes.
 */
export async function startBackgroundPhotoUpload(
  file: File,
  categorySlug: string
): Promise<string> {
  const prepared = await preparePhotoForUpload(file);
  const session = getOrCreateCoupleSession();

  const safeSlug =
    categorySlug
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || "photo";
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const localToken = `${PENDING_PHOTO_PREFIX}${uniqueSuffix}_${safeSlug}`;
  const now = new Date().toISOString();

  // Persist compressed blob + metadata to IndexedDB BEFORE uploading so refresh never loses it
  await savePendingPhotoToIdb({
    localToken,
    submissionId: session.submissionId,
    category: safeSlug,
    fileName: file.name || `${safeSlug}.${prepared.extension}`,
    extension: prepared.extension,
    contentType: prepared.contentType,
    blob: prepared.blob,
    createdAt: now,
  });

  const entry: PhotoUploadEntry = {
    localToken,
    submissionId: session.submissionId,
    targetStoragePath: "", // Populated strictly after anonymous auth UID is confirmed
    uploadedStoragePath: undefined,
    category: safeSlug,
    fileName: file.name || `${safeSlug}.${prepared.extension}`,
    extension: prepared.extension,
    previewUrl: prepared.previewUrl,
    blob: prepared.blob,
    contentType: prepared.contentType,
    status: "uploading",
    waitingForAuth: true,
    progress: 3,
    attempts: 1,
    updatedAt: now,
  };

  entriesMap.set(localToken, entry);
  notifyListeners();

  // Start background upload without blocking the UI
  void runUploadWithRetries(localToken).catch(() => {});

  return localToken;
}

/**
 * On page reload or when reopening a resume link, restores any queued photo blobs
 * from IndexedDB for this submission and immediately resumes uploading them.
 * Returns any missing photo slots whose files are no longer in IndexedDB (e.g., cleared
 * browser storage or opened on a different phone) so the couple can re-add only those.
 */
export async function resumePendingUploadsFromIndexedDb(
  submissionId: string,
  answers: QuestionnaireAnswers,
  savedPhotoStatuses?: Record<string, PhotoStatusEntry>
): Promise<{ resumedCount: number; missingSlots: MissingPhotoSlot[] }> {
  const persistedItems = await getAllPendingPhotosFromIdb(submissionId);
  let resumedCount = 0;

  for (const item of persistedItems) {
    if (entriesMap.has(item.localToken)) {
      const existing = entriesMap.get(item.localToken)!;
      if (existing.status !== "uploaded" && !activePromisesMap.has(item.localToken)) {
        void runUploadWithRetries(item.localToken).catch(() => {});
      }
      continue;
    }

    let previewUrl = "";
    try {
      previewUrl = URL.createObjectURL(item.blob);
    } catch {
      previewUrl = "";
    }

    const restoredEntry: PhotoUploadEntry = {
      localToken: item.localToken,
      submissionId: item.submissionId,
      targetStoragePath: "",
      uploadedStoragePath: undefined,
      category: item.category,
      fileName: item.fileName,
      extension: item.extension,
      previewUrl,
      blob: item.blob,
      contentType: item.contentType,
      status: "uploading",
      waitingForAuth: true,
      progress: 5,
      attempts: 1,
      updatedAt: new Date().toISOString(),
    };

    entriesMap.set(item.localToken, restoredEntry);
    resumedCount++;
    void runUploadWithRetries(item.localToken).catch(() => {});
  }

  if (resumedCount > 0) {
    notifyListeners();
  }

  const missingSlots = findMissingPhotoSlots(answers, savedPhotoStatuses);
  return { resumedCount, missingSlots };
}

/**
 * Pure helper that finds any photo slots referenced in answers or saved photoStatuses
 * that are NOT uploaded AND NOT currently recoverable from IndexedDB/RAM.
 */
export function findMissingPhotoSlots(
  answers: QuestionnaireAnswers,
  savedPhotoStatuses?: Record<string, PhotoStatusEntry>,
  lookupEntry: (token: string) => PhotoUploadEntry | undefined = getPhotoUploadEntry
): MissingPhotoSlot[] {
  const missingById = new Map<string, MissingPhotoSlot>();

  const checkToken = (raw: string | undefined, category: string) => {
    if (!raw || !isPendingPhotoToken(raw)) return;
    const entry = lookupEntry(raw);
    if (!entry) {
      missingById.set(raw, {
        id: raw,
        category,
        label: getPhotoCategoryLabel(category),
        stepNumber: getPhotoStepNumber(category),
        status: "pending",
      });
    }
  };

  checkToken(answers.couplePhotoUrl, "couple_photo");
  checkToken(answers.q10_people?.treePhotoUrl, "family_tree");
  answers.q10_people?.familyMembers?.forEach((m) => checkToken(m.photoUrl, "family_member"));
  answers.q10_people?.brideSide?.photos?.forEach((p) => checkToken(p.url, "bride_family"));
  answers.q10_people?.groomSide?.photos?.forEach((p) => checkToken(p.url, "groom_family"));
  answers.q12_references?.images?.forEach((img) => checkToken(img, "reference"));
  answers.wardrobe?.bride?.photos?.forEach((img) => checkToken(img, "bride_outfit"));
  answers.wardrobe?.groom?.photos?.forEach((img) => checkToken(img, "groom_outfit"));
  answers.weddingOutfits?.images?.forEach((img) => checkToken(img, "outfit"));
  answers.decorEvents?.forEach((ev) => {
    const slug = (ev.id || ev.name || "decor").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    ev.images?.forEach((img) => checkToken(img, `decor_${slug}`));
  });
  if (answers.decorEventsMap) {
    Object.values(answers.decorEventsMap).forEach((ev) => {
      if (!ev || ev.deleted || !ev.imagesById) return;
      const slug = (ev.id || ev.name || "decor").toLowerCase().replace(/[^a-z0-9]+/g, "_");
      Object.values(ev.imagesById).forEach((img) => checkToken(img, `decor_${slug}`));
    });
  }
  answers.decorMoodBoard?.images?.forEach((img) => checkToken(img, "decor"));
  answers.q23_oneLastThing?.images?.forEach((img) => checkToken(img, "last_thing"));
  answers.partnerAnswers?.partnerA?.q23_oneLastThing?.images?.forEach((img) =>
    checkToken(img, "last_thing")
  );
  answers.partnerAnswers?.partnerB?.q23_oneLastThing?.images?.forEach((img) =>
    checkToken(img, "last_thing")
  );

  // Also check saved Firestore photoStatuses (for resume links opened on a different device
  // where pending/failed tokens were stripped from Firestore answers)
  if (savedPhotoStatuses) {
    for (const [key, ps] of Object.entries(savedPhotoStatuses)) {
      if (ps.status === "uploaded") continue;
      if (ps.status === "failed" && isLegacyNonFailurePhotoError(ps.errorCode)) {
        continue;
      }
      const entry = lookupEntry(ps.id || key);
      if (entry && (entry.status === "uploading" || entry.status === "uploaded")) {
        continue;
      }
      const slotId = ps.id || key;
      if (!missingById.has(slotId)) {
        missingById.set(slotId, {
          id: slotId,
          category: ps.category || "photo",
          label: ps.label || getPhotoCategoryLabel(ps.category || "photo"),
          stepNumber: getPhotoStepNumber(ps.category || "photo"),
          status: ps.status === "failed" ? "failed" : "pending",
          errorCode: ps.errorCode,
        });
      }
    }
  }

  return Array.from(missingById.values());
}

export function retryBackgroundPhotoUpload(tokenOrPath: string): Promise<string> {
  const entry = getPhotoUploadEntry(tokenOrPath);
  if (!entry) {
    return Promise.resolve(tokenOrPath);
  }
  if (entry.status === "uploaded" && entry.uploadedStoragePath) {
    return Promise.resolve(entry.uploadedStoragePath);
  }
  entriesMap.set(entry.localToken, {
    ...entry,
    status: "uploading",
    progress: Math.max(5, entry.progress),
    error: undefined,
    errorCode: undefined,
    updatedAt: new Date().toISOString(),
  });
  notifyListeners();
  return runUploadWithRetries(entry.localToken);
}

/**
 * Kicks off background retries for any failed or auth-queued uploads without blocking the caller.
 */
export function kickOffPendingPhotoRetries(): void {
  entriesMap.forEach((entry) => {
    if (
      (entry.status === "error" || (entry.status === "uploading" && entry.waitingForAuth)) &&
      !activePromisesMap.has(entry.localToken)
    ) {
      void runUploadWithRetries(entry.localToken).catch(() => {});
    }
  });
}

export function removeBackgroundPhotoEntry(tokenOrPath: string): void {
  const entry = getPhotoUploadEntry(tokenOrPath);
  if (entry) {
    try {
      URL.revokeObjectURL(entry.previewUrl);
    } catch {
      // ignore
    }
    entriesMap.delete(entry.localToken);
    void deletePendingPhotoFromIdb(entry.localToken);
    notifyListeners();
  } else if (isPendingPhotoToken(tokenOrPath)) {
    void deletePendingPhotoFromIdb(tokenOrPath);
  }
}

/**
 * Waits briefly (default 2.5s) for nearly-finished active uploads when Send is clicked,
 * WITHOUT ever throwing or blocking submission if photos are slow or offline.
 */
export async function waitBrieflyForActiveUploads(maxWaitMs = 2500): Promise<void> {
  const promises = Array.from(activePromisesMap.values());
  if (promises.length === 0) return;

  await Promise.race([
    Promise.allSettled(promises),
    new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs)),
  ]);
}

/**
 * Legacy-compatible helper (non-throwing): returns the verified Storage path if uploaded,
 * or empty string if still pending/failed so submission is NEVER blocked.
 */
export async function ensureStoragePathUploaded(
  tokenOrPath: string
): Promise<string> {
  const entry = getPhotoUploadEntry(tokenOrPath);
  if (!entry) {
    return isPendingPhotoToken(tokenOrPath) ? "" : tokenOrPath;
  }
  if (entry.status === "uploaded" && entry.uploadedStoragePath) {
    return entry.uploadedStoragePath;
  }
  return "";
}

export function isPhotoPathUploadingOrFailed(tokenOrPath: string): boolean {
  const entry = getPhotoUploadEntry(tokenOrPath);
  if (!entry) return false;
  return entry.status === "uploading" || entry.status === "error";
}

export interface SanitizedFirestorePhotoResult {
  answers: QuestionnaireAnswers;
  photoStatuses: Record<string, PhotoStatusEntry>;
  uploadedCount: number;
  pendingCount: number;
  failedCount: number;
  totalCount: number;
}

/**
 * Pure/deterministic sanitizer that prepares `QuestionnaireAnswers` for Firestore drafts
 * or final submissions:
 * - Substitutes `pending_photo:...` handles with their verified Storage path ONLY if `status === "uploaded"`.
 * - Omits unuploaded/failed photo paths from answer fields and records them in `photoStatuses`
 *   with status `"pending"` or `"failed"` so Firestore NEVER holds unuploaded paths or base64 data.
 */
export function sanitizeAnswersForFirestore(
  answers: QuestionnaireAnswers,
  lookupEntry: (token: string) => PhotoUploadEntry | undefined = getPhotoUploadEntry
): SanitizedFirestorePhotoResult {
  const cloned: QuestionnaireAnswers = JSON.parse(JSON.stringify(answers));
  const photoStatuses: Record<string, PhotoStatusEntry> = {};
  let uploadedCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  const now = new Date().toISOString();

  const seenUploadedPaths = new Set<string>();

  const recordUploadedStatus = (
    statusKey: string,
    category: string,
    storagePath: string,
    updatedAt: string
  ) => {
    const pathKey = normalizeMediaPathKey(storagePath);
    if (pathKey && seenUploadedPaths.has(pathKey)) {
      return;
    }
    if (pathKey) seenUploadedPaths.add(pathKey);
    uploadedCount++;
    photoStatuses[statusKey] = {
      id: statusKey,
      category,
      label: getPhotoCategoryLabel(category),
      status: "uploaded",
      storagePath,
      updatedAt,
    };
  };

  const resolveSingle = (
    raw: string | undefined,
    category: string,
    slotKey: string
  ): string | undefined => {
    if (!raw || typeof raw !== "string") return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    // Never allow base64 or raw blob URLs into Firestore (only occurs if an actual selected photo failed to upload)
    if (trimmed.startsWith("data:image/") || trimmed.startsWith("blob:")) {
      failedCount++;
      photoStatuses[slotKey] = {
        id: slotKey,
        category,
        label: getPhotoCategoryLabel(category),
        status: "failed",
        errorCode: "storage/upload-failed",
        updatedAt: now,
      };
      return undefined;
    }

    if (isPendingPhotoToken(trimmed)) {
      const entry = lookupEntry(trimmed);
      if (entry?.status === "uploaded" && entry.uploadedStoragePath) {
        recordUploadedStatus(
          entry.localToken,
          entry.category || category,
          entry.uploadedStoragePath,
          entry.updatedAt || now
        );
        return entry.uploadedStoragePath;
      }
      if (entry?.status === "error") {
        failedCount++;
        photoStatuses[entry.localToken] = {
          id: entry.localToken,
          category: entry.category || category,
          label: getPhotoCategoryLabel(entry.category || category),
          status: "failed",
          errorCode: entry.errorCode || "storage/upload-failed",
          updatedAt: entry.updatedAt || now,
        };
        return undefined;
      }
      if (entry?.status === "uploading") {
        // Actively uploading or queued waiting for anonymous auth/network
        pendingCount++;
        photoStatuses[trimmed] = {
          id: trimmed,
          category: entry.category || category,
          label: getPhotoCategoryLabel(entry.category || category),
          status: "pending",
          updatedAt: entry.updatedAt || now,
        };
        return undefined;
      }
      // Pending token has no active upload in RAM/IndexedDB (e.g., browser cleared before upload finished)
      failedCount++;
      photoStatuses[trimmed] = {
        id: trimmed,
        category,
        label: getPhotoCategoryLabel(category),
        status: "failed",
        errorCode: "storage/upload-interrupted",
        updatedAt: now,
      };
      return undefined;
    }

    // Already a verified Firebase Storage path ("submissions/...") or HTTPS URL
    const tracked = lookupEntry(trimmed);
    if (tracked && tracked.status !== "uploaded") {
      if (tracked.status === "error") {
        failedCount++;
        photoStatuses[tracked.localToken] = {
          id: tracked.localToken,
          category: tracked.category || category,
          label: getPhotoCategoryLabel(tracked.category || category),
          status: "failed",
          errorCode: tracked.errorCode || "storage/upload-failed",
          updatedAt: tracked.updatedAt || now,
        };
      } else {
        pendingCount++;
        photoStatuses[tracked.localToken] = {
          id: tracked.localToken,
          category: tracked.category || category,
          label: getPhotoCategoryLabel(tracked.category || category),
          status: "pending",
          updatedAt: tracked.updatedAt || now,
        };
      }
      return undefined;
    }

    recordUploadedStatus(slotKey, category, trimmed, now);
    return trimmed;
  };

  const resolveArray = (arr: string[] | undefined, category: string): string[] => {
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    arr.forEach((item, idx) => {
      const resolved = resolveSingle(item, category, `${category}_${idx + 1}`);
      if (resolved) out.push(resolved);
    });
    return out;
  };

  // Q1 couple photo
  if (cloned.couplePhotoUrl) {
    cloned.couplePhotoUrl = resolveSingle(
      cloned.couplePhotoUrl,
      "couple_photo",
      "couple_photo"
    );
  }

  // Q10 family photos & VIP avatars
  if (cloned.q10_people) {
    if (cloned.q10_people.treePhotoUrl) {
      cloned.q10_people.treePhotoUrl = resolveSingle(
        cloned.q10_people.treePhotoUrl,
        "family_tree",
        "family_tree"
      );
    }
    if (Array.isArray(cloned.q10_people.familyMembers)) {
      cloned.q10_people.familyMembers.forEach((m, idx) => {
        if (m.photoUrl) {
          const memberCat =
            m.side === "bride"
              ? "bride_vip"
              : m.side === "groom"
              ? "groom_vip"
              : "family_member";
          m.photoUrl = resolveSingle(
            m.photoUrl,
            memberCat,
            `${memberCat}_${m.id || idx + 1}`
          );
        }
      });
    }
    if (Array.isArray(cloned.q10_people.brideSide?.photos)) {
      cloned.q10_people.brideSide.photos = cloned.q10_people.brideSide.photos
        .map((p, idx) => {
          const url = resolveSingle(
            p.url,
            "bride_family",
            `bride_family_${p.id || idx + 1}`
          );
          return url ? { ...p, url } : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
    }
    if (Array.isArray(cloned.q10_people.groomSide?.photos)) {
      cloned.q10_people.groomSide.photos = cloned.q10_people.groomSide.photos
        .map((p, idx) => {
          const url = resolveSingle(
            p.url,
            "groom_family",
            `groom_family_${p.id || idx + 1}`
          );
          return url ? { ...p, url } : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
    }
  }

  // Q12 visual references
  if (cloned.q12_references?.images) {
    cloned.q12_references.images = resolveArray(
      cloned.q12_references.images,
      "reference"
    );
  }

  // Q13 wardrobe
  if (cloned.wardrobe?.bride?.photos) {
    cloned.wardrobe.bride.photos = resolveArray(
      cloned.wardrobe.bride.photos,
      "bride_outfit"
    );
  }
  if (cloned.wardrobe?.groom?.photos) {
    cloned.wardrobe.groom.photos = resolveArray(
      cloned.wardrobe.groom.photos,
      "groom_outfit"
    );
  }
  if (cloned.weddingOutfits?.images) {
    cloned.weddingOutfits.images = resolveArray(
      cloned.weddingOutfits.images,
      "outfit"
    );
  }

  // Q14 decor events (array + optional collaborative map)
  if (Array.isArray(cloned.decorEvents)) {
    cloned.decorEvents.forEach((ev, idx) => {
      if (Array.isArray(ev?.images)) {
        const slug =
          (ev.id || ev.name || `event_${idx + 1}`)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "") || `event_${idx + 1}`;
        ev.images = resolveArray(ev.images, `decor_${slug}`);
      }
    });
  }
  if (cloned.decorEventsMap) {
    Object.entries(cloned.decorEventsMap).forEach(([evKey, ev]) => {
      if (ev && !ev.deleted && ev.imagesById && typeof ev.imagesById === "object") {
        const slug =
          (ev.id || ev.name || evKey)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "") || evKey;
        const nextImagesById: Record<string, string> = {};
        Object.entries(ev.imagesById).forEach(([imgKey, imgVal]) => {
          const resolved = resolveArray([imgVal], `decor_${slug}`);
          if (resolved.length > 0) {
            nextImagesById[imgKey] = resolved[0];
          }
        });
        ev.imagesById = nextImagesById;
      }
    });
  }
  if (cloned.decorMoodBoard?.images) {
    cloned.decorMoodBoard.images = resolveArray(
      cloned.decorMoodBoard.images,
      "decor"
    );
  }

  // Q27 one last thing (shared + optional per-partner overlay)
  if (cloned.q23_oneLastThing?.images) {
    cloned.q23_oneLastThing.images = resolveArray(
      cloned.q23_oneLastThing.images,
      "last_thing"
    );
  }
  if (cloned.partnerAnswers?.partnerA?.q23_oneLastThing?.images) {
    cloned.partnerAnswers.partnerA.q23_oneLastThing.images = resolveArray(
      cloned.partnerAnswers.partnerA.q23_oneLastThing.images,
      "last_thing"
    );
  }
  if (cloned.partnerAnswers?.partnerB?.q23_oneLastThing?.images) {
    cloned.partnerAnswers.partnerB.q23_oneLastThing.images = resolveArray(
      cloned.partnerAnswers.partnerB.q23_oneLastThing.images,
      "last_thing"
    );
  }

  return {
    answers: cloned,
    photoStatuses,
    uploadedCount,
    pendingCount,
    failedCount,
    totalCount: uploadedCount + pendingCount + failedCount,
  };
}

export function countAllPhotosInAnswers(answers: QuestionnaireAnswers): number {
  let count = 0;
  if (answers.couplePhotoUrl) count++;
  if (answers.q10_people?.treePhotoUrl) count++;
  count += answers.q10_people?.familyMembers?.filter((m) => Boolean(m.photoUrl)).length || 0;
  count += answers.q10_people?.brideSide?.photos?.length || 0;
  count += answers.q10_people?.groomSide?.photos?.length || 0;
  count += answers.q12_references?.images?.length || 0;
  count += answers.wardrobe?.bride?.photos?.length || 0;
  count += answers.wardrobe?.groom?.photos?.length || 0;
  count += answers.weddingOutfits?.images?.length || 0;
  if (Array.isArray(answers.decorEvents)) {
    for (const ev of answers.decorEvents) {
      count += ev?.images?.length || 0;
    }
  }
  count += answers.decorMoodBoard?.images?.length || 0;
  const lastThingSet = new Set<string>([
    ...(answers.q23_oneLastThing?.images || []),
    ...(answers.partnerAnswers?.partnerA?.q23_oneLastThing?.images || []),
    ...(answers.partnerAnswers?.partnerB?.q23_oneLastThing?.images || []),
  ]);
  count += lastThingSet.size;
  return count;
}

/**
 * Helper used in tests to register a synthetic photo entry without touching Storage.
 */
export function __setPhotoEntryForTest(entry: PhotoUploadEntry): void {
  entriesMap.set(entry.localToken, entry);
}

export function __clearPhotoEntriesForTest(): void {
  entriesMap.clear();
  activePromisesMap.clear();
}
