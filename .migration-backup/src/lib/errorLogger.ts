/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase.ts";
import {
  detectDeviceAndBrowser,
  getActiveCoupleSession,
  redactResumeTokens,
} from "./coupleSession.ts";
import type { SubmissionErrorRecord } from "../types/questionnaire.ts";

/**
 * Extracts a short, clean diagnostic code like "storage/unauthorized" or "firestore/unavailable"
 * suitable for displaying in small grey text to the couple and recording in submissionErrors.
 */
export function extractShortErrorCode(err: unknown, fallback = "unknown"): string {
  if (!err) return fallback;
  const anyErr = err as { code?: unknown; name?: unknown; message?: unknown };

  if (typeof anyErr.code === "string" && anyErr.code.trim()) {
    return anyErr.code.trim().slice(0, 64);
  }

  const msg =
    typeof anyErr.message === "string"
      ? anyErr.message
      : typeof err === "string"
      ? err
      : "";

  const lower = msg.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out")) return "network/timeout";
  if (lower.includes("offline") || lower.includes("failed to fetch") || lower.includes("network")) {
    return "network/offline";
  }
  if (lower.includes("dynamically imported module") || lower.includes("chunk")) {
    return "app/chunk-load-error";
  }
  if (lower.includes("permission") || lower.includes("unauthorized")) {
    return "firestore/permission-denied";
  }
  if (lower.includes("quota")) return "storage/quota-exceeded";
  if (typeof anyErr.name === "string" && anyErr.name && anyErr.name !== "Error") {
    return anyErr.name.toLowerCase().slice(0, 48);
  }
  return fallback;
}

export interface LogSubmissionErrorInput {
  step: string;
  error: unknown;
  photoCount?: number;
  submissionId?: string;
  extraMessage?: string;
}

/**
 * Creates a clean, privacy-safe error log payload (zero personal answers, zero resume token).
 */
export function buildSafeSubmissionErrorPayload(
  input: LogSubmissionErrorInput
): Omit<SubmissionErrorRecord, "id"> {
  const activeSession = getActiveCoupleSession();
  const knownToken = activeSession?.resumeToken;
  const errorCode = extractShortErrorCode(input.error);
  const rawMessage =
    input.extraMessage ||
    (input.error instanceof Error
      ? input.error.message
      : typeof input.error === "string"
      ? input.error
      : "Unexpected error");

  const safeMessage = redactResumeTokens(rawMessage, knownToken)
    .replace(/data:image\/[a-zA-Z0-9.+_-]+;base64,[A-Za-z0-9+/=]+/g, "[IMAGE_REDACTED]")
    .slice(0, 320);

  return {
    step: String(input.step || "unknown").slice(0, 64),
    errorCode,
    message: safeMessage,
    deviceBrowser: detectDeviceAndBrowser(),
    timestamp: new Date().toISOString(),
    photoCount: typeof input.photoCount === "number" ? Math.max(0, input.photoCount) : 0,
    submissionId: (input.submissionId || activeSession?.submissionId || "unknown").slice(0, 80),
    ownerUid: auth.currentUser?.uid ?? null,
  };
}

/**
 * Quietly logs a failure to Firestore's `submissionErrors` collection.
 * Never throws, never logs personal answers, and never logs the resume token.
 */
export async function logSubmissionError(
  input: LogSubmissionErrorInput
): Promise<string> {
  const payload = buildSafeSubmissionErrorPayload(input);
  try {
    await addDoc(collection(db, "submissionErrors"), {
      ...payload,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Logging itself must never interrupt the couple
  }
  return payload.errorCode;
}

/**
 * Admin: Fetch the latest error logs from `submissionErrors`.
 */
export async function getSubmissionErrors(
  maxItems = 60
): Promise<SubmissionErrorRecord[]> {
  try {
    const q = query(
      collection(db, "submissionErrors"),
      orderBy("timestamp", "desc"),
      limit(maxItems)
    );
    const snap = await getDocs(q);
    const items: SubmissionErrorRecord[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Partial<SubmissionErrorRecord>;
      items.push({
        id: docSnap.id,
        step: data.step || "unknown",
        errorCode: data.errorCode || "unknown",
        message: data.message || "",
        deviceBrowser: data.deviceBrowser || "Unknown",
        timestamp: data.timestamp || "",
        photoCount: typeof data.photoCount === "number" ? data.photoCount : 0,
        submissionId: data.submissionId || "unknown",
        ownerUid: data.ownerUid ?? null,
      });
    });
    return items;
  } catch {
    // Fallback without orderBy in case an older doc lacks `timestamp`
    const snap = await getDocs(collection(db, "submissionErrors"));
    const items: SubmissionErrorRecord[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Partial<SubmissionErrorRecord>;
      items.push({
        id: docSnap.id,
        step: data.step || "unknown",
        errorCode: data.errorCode || "unknown",
        message: data.message || "",
        deviceBrowser: data.deviceBrowser || "Unknown",
        timestamp: data.timestamp || "",
        photoCount: typeof data.photoCount === "number" ? data.photoCount : 0,
        submissionId: data.submissionId || "unknown",
        ownerUid: data.ownerUid ?? null,
      });
    });
    return items
      .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
      .slice(0, maxItems);
  }
}
