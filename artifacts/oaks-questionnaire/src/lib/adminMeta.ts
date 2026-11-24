/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase.ts";
import type {
  AdminMetaRecord,
  SubmissionRecord,
  SubmissionStatus,
} from "../types/questionnaire.ts";

export const ADMIN_META_DOC_ID = "main";

function isPermissionDeniedError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "permission-denied") return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("missing or insufficient permissions");
}

/**
 * Pure helper merging admin-only subcollection data over legacy top-level fields.
 * - New/edited private notes & status live exclusively in `submissions/{id}/adminMeta/main`.
 * - Older submissions without an `adminMeta/main` doc seamlessly fall back to their legacy
 *   top-level `privateNotes` and `status` with ZERO data migration.
 */
export function mergeAdminMetaIntoSubmission(
  record: SubmissionRecord,
  adminMeta?: AdminMetaRecord | null
): SubmissionRecord {
  if (!adminMeta) return record;
  return {
    ...record,
    ...(typeof adminMeta.privateNotes === "string"
      ? { privateNotes: adminMeta.privateNotes }
      : {}),
    ...(adminMeta.status ? { status: adminMeta.status } : {}),
  };
}

/**
 * Admin-only: Loads `submissions/{id}/adminMeta/main`.
 * Returns null gracefully if the doc doesn't exist yet or if updated rules aren't deployed yet.
 */
export async function loadAdminMetaForSubmission(
  submissionId: string
): Promise<AdminMetaRecord | null> {
  if (!submissionId) return null;
  try {
    const snap = await getDoc(
      doc(db, "submissions", submissionId, "adminMeta", ADMIN_META_DOC_ID)
    );
    if (!snap.exists()) return null;
    return snap.data() as AdminMetaRecord;
  } catch (err) {
    if (!isPermissionDeniedError(err)) {
      console.warn(`Could not load adminMeta for ${submissionId}:`, err);
    }
    return null;
  }
}

/**
 * Admin-only: Loads `adminMeta/main` in parallel for a list of submissions and merges them
 * over legacy top-level fallback values.
 */
export async function hydrateSubmissionsWithAdminMeta(
  records: SubmissionRecord[]
): Promise<SubmissionRecord[]> {
  if (!records.length) return records;
  const enriched = await Promise.all(
    records.map(async (rec) => {
      const meta = await loadAdminMetaForSubmission(rec.id);
      return mergeAdminMetaIntoSubmission(rec, meta);
    })
  );
  return enriched;
}

/**
 * Admin-only: Saves status strictly into `submissions/{id}/adminMeta/main`
 * (never writable/readable by couples or resume link holders).
 * Falls back to legacy top-level write ONLY if subcollection rules are not yet published.
 */
export async function saveAdminMetaStatus(
  submissionId: string,
  status: SubmissionStatus,
  fallbackTopLevelWrite?: () => Promise<void>
): Promise<"adminMeta" | "legacyFallback"> {
  const now = new Date().toISOString();
  const payload: AdminMetaRecord = {
    status,
    updatedAt: now,
    ...(auth.currentUser?.email ? { updatedByEmail: auth.currentUser.email } : {}),
  };
  try {
    await setDoc(
      doc(db, "submissions", submissionId, "adminMeta", ADMIN_META_DOC_ID),
      payload,
      { merge: true }
    );
    return "adminMeta";
  } catch (err) {
    if (isPermissionDeniedError(err) && fallbackTopLevelWrite) {
      await fallbackTopLevelWrite();
      return "legacyFallback";
    }
    throw err;
  }
}

/**
 * Admin-only: Saves private team notes strictly into `submissions/{id}/adminMeta/main`
 * (never writable/readable by couples or resume link holders).
 * Falls back to legacy top-level write ONLY if subcollection rules are not yet published.
 */
export async function saveAdminMetaNotes(
  submissionId: string,
  privateNotes: string,
  fallbackTopLevelWrite?: () => Promise<void>
): Promise<"adminMeta" | "legacyFallback"> {
  const now = new Date().toISOString();
  const payload: AdminMetaRecord = {
    privateNotes,
    updatedAt: now,
    ...(auth.currentUser?.email ? { updatedByEmail: auth.currentUser.email } : {}),
  };
  try {
    await setDoc(
      doc(db, "submissions", submissionId, "adminMeta", ADMIN_META_DOC_ID),
      payload,
      { merge: true }
    );
    return "adminMeta";
  } catch (err) {
    if (isPermissionDeniedError(err) && fallbackTopLevelWrite) {
      await fallbackTopLevelWrite();
      return "legacyFallback";
    }
    throw err;
  }
}
