/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase.ts";
import { preparePhotoForUpload } from "../utils/imageCompressor.ts";

const DRAFT_UPLOAD_FOLDER_KEY = "oaks_draft_upload_folder_v1";

export type PhotoUploadStatus = "uploading" | "uploaded" | "error";

export interface PhotoUploadEntry {
  storagePath: string;
  previewUrl: string;
  blob: Blob;
  contentType: string;
  status: PhotoUploadStatus;
  progress: number;
  attempts: number;
  error?: string;
  downloadUrl?: string;
}

const entriesMap = new Map<string, PhotoUploadEntry>();
const activePromisesMap = new Map<string, Promise<string>>();
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore
    }
  });
}

export function subscribePhotoUploads(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPhotoUploadEntry(
  storagePath: string | undefined | null
): PhotoUploadEntry | undefined {
  if (!storagePath) return undefined;
  return entriesMap.get(storagePath);
}

/**
 * Returns the fastest previewable URL during the couple's current session
 * (in-memory blob preview or resolved downloadUrl), while answers/Firestore store
 * only the lightweight Firebase Storage path ("submissions/...").
 */
export function getPhotoPreviewSrc(
  pathOrUrl: string | undefined | null
): string | undefined {
  if (!pathOrUrl) return undefined;
  const entry = entriesMap.get(pathOrUrl);
  if (entry) {
    return entry.downloadUrl || entry.previewUrl;
  }
  return pathOrUrl;
}

export function usePhotoUploadStatus(
  storagePath: string | undefined | null
): PhotoUploadEntry | undefined {
  const [, setVersion] = useState(0);

  useEffect(() => {
    return subscribePhotoUploads(() => {
      setVersion((v) => v + 1);
    });
  }, []);

  return getPhotoUploadEntry(storagePath);
}

export function getOrCreateDraftUploadFolder(): string {
  try {
    const existing = localStorage.getItem(DRAFT_UPLOAD_FOLDER_KEY);
    if (existing && /^[a-zA-Z0-9_-]+$/.test(existing)) {
      return existing;
    }
    const created = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(DRAFT_UPLOAD_FOLDER_KEY, created);
    return created;
  } catch {
    return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function resetDraftUploadFolder(): void {
  try {
    localStorage.removeItem(DRAFT_UPLOAD_FOLDER_KEY);
  } catch {
    // ignore
  }
}

async function performSingleUpload(entry: PhotoUploadEntry): Promise<string> {
  const storageRef = ref(storage, entry.storagePath);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, entry.blob, {
      contentType: entry.contentType,
    });

    task.on(
      "state_changed",
      (snapshot) => {
        if (snapshot.totalBytes > 0) {
          const pct = Math.min(
            99,
            Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          );
          const current = entriesMap.get(entry.storagePath);
          if (current) {
            entriesMap.set(entry.storagePath, {
              ...current,
              status: "uploading",
              progress: Math.max(current.progress, pct),
              error: undefined,
            });
            notifyListeners();
          }
        }
      },
      (err) => reject(err),
      () => resolve()
    );
  });

  // Unauthenticated couples do not have read access (`allow read: if isAdmin()`),
  // so getDownloadURL is expected to throw storage/unauthorized — fall back to storagePath.
  let downloadUrl: string | undefined;
  try {
    downloadUrl = await getDownloadURL(storageRef);
  } catch {
    downloadUrl = undefined;
  }

  const latest = entriesMap.get(entry.storagePath);
  if (latest) {
    entriesMap.set(entry.storagePath, {
      ...latest,
      status: "uploaded",
      progress: 100,
      error: undefined,
      downloadUrl,
    });
    notifyListeners();
  }

  return entry.storagePath;
}

function runUploadWithRetries(storagePath: string): Promise<string> {
  const existingPromise = activePromisesMap.get(storagePath);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    const maxRetries = 2;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const current = entriesMap.get(storagePath);
      if (!current) {
        return storagePath;
      }

      entriesMap.set(storagePath, {
        ...current,
        status: "uploading",
        attempts: attempt,
        error: undefined,
      });
      notifyListeners();

      try {
        return await performSingleUpload(current);
      } catch (err) {
        lastError = err;
        if (attempt <= maxRetries) {
          await new Promise((r) => setTimeout(r, attempt * 1200));
        }
      }
    }

    const latest = entriesMap.get(storagePath);
    const errorMsg =
      lastError instanceof Error && lastError.message
        ? "Upload paused. Tap retry."
        : "Upload failed. Tap retry.";
    if (latest) {
      entriesMap.set(storagePath, {
        ...latest,
        status: "error",
        error: errorMsg,
      });
      notifyListeners();
    }
    throw new Error(errorMsg);
  })().finally(() => {
    activePromisesMap.delete(storagePath);
  });

  activePromisesMap.set(storagePath, promise);
  return promise;
}

/**
 * Validates size (<= 15 MB), converts HEIC -> JPEG, resizes to max 2400px,
 * creates an immediate local preview, and kicks off Firebase Storage upload
 * in the background with progress and automatic retries.
 *
 * Returns the Firebase Storage path immediately so answers/localStorage
 * never store large base64 data.
 */
export async function startBackgroundPhotoUpload(
  file: File,
  categorySlug: string
): Promise<string> {
  const prepared = await preparePhotoForUpload(file);
  const folder = getOrCreateDraftUploadFolder();
  const safeSlug =
    categorySlug
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || "photo";
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const storagePath = `submissions/${folder}/${uniqueSuffix}_${safeSlug}.${prepared.extension}`;

  const entry: PhotoUploadEntry = {
    storagePath,
    previewUrl: prepared.previewUrl,
    blob: prepared.blob,
    contentType: prepared.contentType,
    status: "uploading",
    progress: 5,
    attempts: 1,
  };

  entriesMap.set(storagePath, entry);
  notifyListeners();

  // Start background upload without blocking caller; swallow unhandled rejection
  // because upload state is tracked on the entry & awaited on submit.
  void runUploadWithRetries(storagePath).catch(() => {});

  return storagePath;
}

export function retryBackgroundPhotoUpload(storagePath: string): Promise<string> {
  const entry = entriesMap.get(storagePath);
  if (!entry) {
    return Promise.resolve(storagePath);
  }
  if (entry.status === "uploaded") {
    return Promise.resolve(storagePath);
  }
  entriesMap.set(storagePath, {
    ...entry,
    status: "uploading",
    progress: Math.max(5, entry.progress),
    error: undefined,
  });
  notifyListeners();
  return runUploadWithRetries(storagePath);
}

export function removeBackgroundPhotoEntry(storagePath: string): void {
  const entry = entriesMap.get(storagePath);
  if (entry) {
    try {
      URL.revokeObjectURL(entry.previewUrl);
    } catch {
      // ignore
    }
    entriesMap.delete(storagePath);
    notifyListeners();
  }
}

/**
 * Ensures any in-memory background upload referenced by `storagePath` has
 * finished uploading to Firebase Storage (awaiting in-flight uploads or retrying
 * failed ones before saving the submission document to Firestore).
 */
export async function ensureStoragePathUploaded(
  storagePath: string
): Promise<string> {
  const inFlight = activePromisesMap.get(storagePath);
  if (inFlight) {
    return await inFlight;
  }
  const entry = entriesMap.get(storagePath);
  if (entry && entry.status === "error") {
    return await runUploadWithRetries(storagePath);
  }
  return storagePath;
}

export function isPhotoPathUploadingOrFailed(storagePath: string): boolean {
  const entry = entriesMap.get(storagePath);
  if (!entry) return false;
  return entry.status === "uploading" || entry.status === "error";
}
