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
} from "firebase/firestore";
import { db } from "./firebase.ts";
import {
  ensureCoupleAnonymousAuth,
  isValidResumeToken,
  setActiveCoupleSession,
} from "./coupleSession.ts";
import {
  countAllPhotosInAnswers,
  sanitizeAnswersForFirestore,
} from "./photoUploadManager.ts";
import { assertNoBase64Images } from "../utils/submissionSizeGuard.ts";
import {
  getMissingMandatoryQuestions,
  MANDATORY_QUESTION_STEPS,
} from "../utils/questionnaireValidation.ts";
import { logSubmissionError } from "./errorLogger.ts";
import type { DraftRecord, QuestionnaireAnswers } from "../types/questionnaire.ts";

function stripUndefinedDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface SaveOnlineDraftInput {
  resumeToken: string;
  submissionId: string;
  answers: QuestionnaireAnswers;
  currentStep: number;
  furthestStep: number;
  createdAt?: string;
}

/**
 * Auto-saves the couple's draft to Firestore `drafts/{resumeToken}`.
 * Stores text answers + verified uploaded Storage paths ONLY (zero base64, zero unuploaded paths).
 */
export async function saveOnlineDraft(input: SaveOnlineDraftInput): Promise<void> {
  if (!isValidResumeToken(input.resumeToken)) {
    throw new Error("Invalid resume token");
  }

  const authRes = await ensureCoupleAnonymousAuth();
  if (!authRes?.uid) {
    const authErr: any = new Error("Anonymous authentication unavailable.");
    authErr.code = "auth/anonymous-disabled";
    throw authErr;
  }

  const sanitized = sanitizeAnswersForFirestore(input.answers);
  assertNoBase64Images(sanitized.answers);

  const missingMandatory = getMissingMandatoryQuestions(input.answers);
  const answeredCount = MANDATORY_QUESTION_STEPS.length - missingMandatory.length;
  const now = new Date().toISOString();

  const payload: DraftRecord = stripUndefinedDeep({
    id: input.resumeToken,
    submissionId: input.submissionId,
    ownerUid: authRes.uid,
    status: "draft",
    currentStep: input.currentStep,
    furthestStep: Math.max(input.currentStep, input.furthestStep),
    partner1: (input.answers.partner1 || "").trim(),
    partner2: (input.answers.partner2 || "").trim(),
    weddingDate: input.answers.weddingDate || "",
    phone: input.answers.phone || "",
    email: input.answers.email || "",
    answers: sanitized.answers,
    photoStatuses: sanitized.photoStatuses,
    answeredCount,
    mandatoryRemaining: missingMandatory.length,
    createdAt: input.createdAt || now,
    updatedAt: now,
  });

  const draftRef = doc(db, "drafts", input.resumeToken);
  await setDoc(draftRef, payload);
}

/**
 * Loads an online draft via `?resume=<token>`, signs in anonymously on this browser/device,
 * and links the draft to the new anonymous `ownerUid` so auto-save works again immediately.
 */
export async function loadOnlineDraftByToken(
  resumeToken: string
): Promise<DraftRecord | null> {
  if (!isValidResumeToken(resumeToken)) return null;

  const authRes = await ensureCoupleAnonymousAuth();
  if (!authRes?.uid) return null;

  try {
    const draftRef = doc(db, "drafts", resumeToken);
    const snap = await getDoc(draftRef);
    if (!snap.exists()) return null;

    const data = snap.data() as DraftRecord;
    const restored: DraftRecord = {
      ...data,
      id: snap.id,
    };

    // Persist session locally so every subsequent auto-save, photo upload, and submit reuses the same ID
    setActiveCoupleSession({
      submissionId: restored.submissionId,
      resumeToken: snap.id,
      createdAt: restored.createdAt || new Date().toISOString(),
    });

    // Re-link the draft to this device's anonymous UID so auto-save continues seamlessly
    if (restored.ownerUid !== authRes.uid) {
      try {
        await updateDoc(draftRef, {
          ownerUid: authRes.uid,
          submissionId: restored.submissionId,
          updatedAt: new Date().toISOString(),
        });
        restored.ownerUid = authRes.uid;
      } catch (linkErr) {
        void logSubmissionError({
          step: "resume_link_claim",
          error: linkErr,
          photoCount: countAllPhotosInAnswers(restored.answers),
          submissionId: restored.submissionId,
        });
      }
    }

    return restored;
  } catch (err) {
    void logSubmissionError({
      step: "resume_load",
      error: err,
    });
    return null;
  }
}

/**
 * Quietly marks the couple's online draft as submitted after the main submission save succeeds.
 */
export async function markDraftSubmitted(
  resumeToken: string | undefined | null,
  submissionId: string,
  submittedAt: string
): Promise<void> {
  if (!isValidResumeToken(resumeToken)) return;
  try {
    await updateDoc(doc(db, "drafts", resumeToken), {
      status: "submitted",
      submissionId,
      submittedAt,
      updatedAt: submittedAt,
    });
  } catch (err) {
    void logSubmissionError({
      step: "draft_mark_submitted",
      error: err,
      submissionId,
    });
  }
}

/**
 * Admin: Lists ALL drafts from Firestore (both unfinished and submitted) so the admin
 * dashboard can look up resume links for existing submissions as well as unfinished drafts.
 */
export async function getAllAdminDrafts(): Promise<DraftRecord[]> {
  const snap = await getDocs(collection(db, "drafts"));
  const drafts: DraftRecord[] = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data() as DraftRecord;
    drafts.push({
      ...data,
      id: docSnap.id,
    });
  });

  return drafts.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

/**
 * Admin: Lists unfinished drafts from Firestore (sorted by most recently updated first),
 * so the studio can follow up with couples who have not tapped Send yet.
 */
export async function getAdminDrafts(): Promise<DraftRecord[]> {
  const all = await getAllAdminDrafts();
  return all.filter((d) => d.status !== "submitted");
}

/**
 * Admin: Delete a draft after resolving or cleaning up test entries.
 */
export async function deleteAdminDraft(draftId: string): Promise<void> {
  await deleteDoc(doc(db, "drafts", draftId));
}
