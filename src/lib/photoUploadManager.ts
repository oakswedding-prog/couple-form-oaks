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
import type {
  PhotoStatusEntry,
  QuestionnaireAnswers,
} from "../types/questionnaire.ts";

export const PENDING_PHOTO_PREFIX = "pending_photo:";
export const PHOTO_UPLOAD_TIMEOUT_MS = 60_000; // 60 seconds per attempt

export type PhotoUploadStatus = "uploading" | "uploaded" | "error";

export interface PhotoUploadEntry {
  localToken: string;
  targetStoragePath: string;
  uploadedStoragePath?: string; // Set ONLY after Firebase Storage upload succeeds
  category: string;
  previewUrl: string;
  blob: Blob;
  contentType: string;
  status: PhotoUploadStatus;
  progress: number;
  attempts: number;
  error?: string;
  errorCode?: string;
  downloadUrl?: string;
  updatedAt: string;
}

const entriesMap = new Map<string, PhotoUploadEntry>();
const activePromisesMap = new Map<string, Promise<string>>();
const listeners = new Set<() => void>();
const completionListeners = new Set<(entry: PhotoUploadEntry) => void>();

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
  // Also allow lookup by finalized storage path
  for (const entry of entriesMap.values()) {
    if (entry.uploadedStoragePath === tokenOrPath || entry.targetStoragePath === tokenOrPath) {
      return entry;
    }
  }
  return undefined;
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
 * Clears in-memory tracked photo entries when starting a brand new questionnaire.
 */
export function resetDraftUploadFolder(): void {
  entriesMap.forEach((entry) => {
    try {
      URL.revokeObjectURL(entry.previewUrl);
    } catch {
      // ignore
    }
  });
  entriesMap.clear();
  activePromisesMap.clear();
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

async function performSingleUploadWithTimeout(
  entry: PhotoUploadEntry,
  timeoutMs = PHOTO_UPLOAD_TIMEOUT_MS
): Promise<string> {
  // Make sure the couple has an active anonymous UID before uploading
  const authRes = await ensureCoupleAnonymousAuth();
  let uploadPath = entry.targetStoragePath;
  if (authRes?.uid && uploadPath.includes("/anon_pending/")) {
    uploadPath = uploadPath.replace("/anon_pending/", `/${authRes.uid}/`);
    const cur = entriesMap.get(entry.localToken);
    if (cur) {
      entriesMap.set(entry.localToken, { ...cur, targetStoragePath: uploadPath });
    }
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
      targetStoragePath: uploadPath,
      uploadedStoragePath: uploadPath, // ONLY stored after Firebase Storage confirms upload!
      status: "uploaded",
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
      } catch (err) {
        lastError = err;
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
 * creates an immediate local preview, and kicks off Firebase Storage upload in the background
 * under the couple's stable submission ID & anonymous UID.
 *
 * Returns a local pending handle (`pending_photo:...`) so Firestore NEVER stores a Storage path
 * before the upload has actually succeeded.
 */
export async function startBackgroundPhotoUpload(
  file: File,
  categorySlug: string
): Promise<string> {
  const prepared = await preparePhotoForUpload(file);
  const session = getOrCreateCoupleSession();
  const authRes = await ensureCoupleAnonymousAuth();
  const ownerSegment = authRes?.uid || "anon_pending";

  const safeSlug =
    categorySlug
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || "photo";
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const localToken = `${PENDING_PHOTO_PREFIX}${uniqueSuffix}_${safeSlug}`;
  const targetStoragePath = `submissions/${session.submissionId}/${ownerSegment}/${uniqueSuffix}_${safeSlug}.${prepared.extension}`;

  const entry: PhotoUploadEntry = {
    localToken,
    targetStoragePath,
    uploadedStoragePath: undefined,
    category: safeSlug,
    previewUrl: prepared.previewUrl,
    blob: prepared.blob,
    contentType: prepared.contentType,
    status: "uploading",
    progress: 5,
    attempts: 1,
    updatedAt: new Date().toISOString(),
  };

  entriesMap.set(localToken, entry);
  notifyListeners();

  // Start background upload without blocking the UI
  void runUploadWithRetries(localToken).catch(() => {});

  return localToken;
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
 * Kicks off background retries for any failed uploads without blocking the caller.
 */
export function kickOffPendingPhotoRetries(): void {
  entriesMap.forEach((entry) => {
    if (entry.status === "error" && !activePromisesMap.has(entry.localToken)) {
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
    notifyListeners();
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

  const resolveSingle = (
    raw: string | undefined,
    category: string,
    slotKey: string
  ): string | undefined => {
    if (!raw || typeof raw !== "string") return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    // Never allow base64 or raw blob URLs into Firestore
    if (trimmed.startsWith("data:image/") || trimmed.startsWith("blob:")) {
      failedCount++;
      photoStatuses[slotKey] = {
        id: slotKey,
        category,
        status: "failed",
        errorCode: "photo/not-uploaded",
        updatedAt: now,
      };
      return undefined;
    }

    if (isPendingPhotoToken(trimmed)) {
      const entry = lookupEntry(trimmed);
      if (entry?.status === "uploaded" && entry.uploadedStoragePath) {
        uploadedCount++;
        photoStatuses[entry.localToken] = {
          id: entry.localToken,
          category: entry.category || category,
          status: "uploaded",
          storagePath: entry.uploadedStoragePath,
          updatedAt: entry.updatedAt || now,
        };
        return entry.uploadedStoragePath;
      }
      if (entry?.status === "error") {
        failedCount++;
        photoStatuses[entry.localToken] = {
          id: entry.localToken,
          category: entry.category || category,
          status: "failed",
          errorCode: entry.errorCode || "storage/upload-failed",
          updatedAt: entry.updatedAt || now,
        };
        return undefined;
      }
      // Still uploading (or pending in background)
      pendingCount++;
      photoStatuses[trimmed] = {
        id: trimmed,
        category: entry?.category || category,
        status: "pending",
        updatedAt: entry?.updatedAt || now,
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
          status: "failed",
          errorCode: tracked.errorCode,
          updatedAt: tracked.updatedAt || now,
        };
      } else {
        pendingCount++;
        photoStatuses[tracked.localToken] = {
          id: tracked.localToken,
          category: tracked.category || category,
          status: "pending",
          updatedAt: tracked.updatedAt || now,
        };
      }
      return undefined;
    }

    uploadedCount++;
    photoStatuses[slotKey] = {
      id: slotKey,
      category,
      status: "uploaded",
      storagePath: trimmed,
      updatedAt: now,
    };
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
          m.photoUrl = resolveSingle(
            m.photoUrl,
            "family_member",
            `family_member_${m.id || idx + 1}`
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

  // Q14 decor events
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
  if (cloned.decorMoodBoard?.images) {
    cloned.decorMoodBoard.images = resolveArray(
      cloned.decorMoodBoard.images,
      "decor"
    );
  }

  // Q27 one last thing
  if (cloned.q23_oneLastThing?.images) {
    cloned.q23_oneLastThing.images = resolveArray(
      cloned.q23_oneLastThing.images,
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
  count += answers.q23_oneLastThing?.images?.length || 0;
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
