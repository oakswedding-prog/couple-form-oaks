/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { QuestionnaireAnswers } from "../types/questionnaire.ts";

const IDB_NAME = "oaks_photo_upload_queue_v1";
const IDB_VERSION = 1;
const STORE_NAME = "pending_photos";

export const PENDING_POST_SUBMIT_KEY = "oaks_pending_post_submit_v1";

export interface PersistedPendingPhoto {
  localToken: string;
  submissionId: string;
  category: string;
  fileName: string;
  extension: string;
  contentType: string;
  blob: Blob;
  createdAt: string;
}

export interface PendingPostSubmitState {
  submissionId: string;
  resumeToken?: string;
  answers: QuestionnaireAnswers;
  submittedAt: string;
}

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openPhotoQueueDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "localToken" });
          store.createIndex("by_submissionId", "submissionId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Stores a compressed photo Blob + upload metadata in IndexedDB so it survives
 * page reloads or tab crashes until Firebase Storage confirms the upload.
 */
export async function savePendingPhotoToIdb(
  record: PersistedPendingPhoto
): Promise<boolean> {
  const db = await openPhotoQueueDb();
  if (!db) return false;

  return new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Deletes a queued photo from IndexedDB ONLY after Firebase Storage confirms the upload
 * (or the user explicitly removes the photo).
 */
export async function deletePendingPhotoFromIdb(localToken: string): Promise<void> {
  if (!localToken) return;
  const db = await openPhotoQueueDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(localToken);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Loads all queued photo records from IndexedDB (optionally filtered by submissionId).
 */
export async function getAllPendingPhotosFromIdb(
  submissionId?: string
): Promise<PersistedPendingPhoto[]> {
  const db = await openPhotoQueueDb();
  if (!db) return [];

  return new Promise<PersistedPendingPhoto[]>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = submissionId
        ? store.index("by_submissionId").getAll(IDBKeyRange.only(submissionId))
        : store.getAll();
      req.onsuccess = () => {
        const result = Array.isArray(req.result) ? req.result : [];
        resolve(result as PersistedPendingPhoto[]);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * Clears all queued IndexedDB photos belonging to a specific submissionId.
 */
export async function clearPendingPhotosForSubmissionIdb(
  submissionId: string
): Promise<void> {
  if (!submissionId) return;
  const existing = await getAllPendingPhotosFromIdb(submissionId);
  await Promise.all(existing.map((item) => deletePendingPhotoFromIdb(item.localToken)));
}

/**
 * Persists lightweight post-submit sync metadata in localStorage so if the couple refreshes
 * on the Thank You screen while photos are still uploading, the app automatically resumes
 * uploads from IndexedDB and patches the uploaded Storage paths into Firestore.
 */
export function savePendingPostSubmitState(state: PendingPostSubmitState): void {
  try {
    localStorage.setItem(PENDING_POST_SUBMIT_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota / private mode
  }
}

export function loadPendingPostSubmitState(): PendingPostSubmitState | null {
  try {
    const raw = localStorage.getItem(PENDING_POST_SUBMIT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingPostSubmitState>;
    if (parsed && typeof parsed.submissionId === "string" && parsed.answers) {
      return {
        submissionId: parsed.submissionId,
        resumeToken: parsed.resumeToken,
        answers: parsed.answers,
        submittedAt: parsed.submittedAt || new Date().toISOString(),
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export function clearPendingPostSubmitState(): void {
  try {
    localStorage.removeItem(PENDING_POST_SUBMIT_KEY);
  } catch {
    // ignore
  }
}
