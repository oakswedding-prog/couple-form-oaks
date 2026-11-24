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
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase.ts";
import {
  buildResumeUrl,
  ensureCoupleAnonymousAuth,
  generateResumeToken,
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
import { LINK_EXPIRY_MS } from "../config/splitMode.ts";
import {
  computeLinkExpiryIso,
  extractTimestampMillis,
  getDraftLinkInactiveReason,
} from "../utils/splitModeHelpers.ts";
import type {
  DraftRecord,
  FieldEditMeta,
  FillMode,
  PartnerProgressMap,
  QuestionnaireAnswers,
} from "../types/questionnaire.ts";

function stripUndefinedDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildFreshExpiry(): {
  linkExpiresAt: Timestamp;
  linkExpiresAtIso: string;
} {
  const nowMs = Date.now();
  return {
    linkExpiresAt: Timestamp.fromMillis(nowMs + LINK_EXPIRY_MS),
    linkExpiresAtIso: computeLinkExpiryIso(nowMs),
  };
}

function mergeParticipantUids(
  existing: string[] | undefined,
  ownerUid: string,
  currentUid: string
): string[] {
  const out: string[] = [];
  for (const uid of [ownerUid, ...(existing || []), currentUid]) {
    if (uid && !out.includes(uid)) {
      out.push(uid);
    }
  }
  return out.slice(0, 4);
}

export interface SaveOnlineDraftInput {
  resumeToken: string;
  submissionId: string;
  answers: QuestionnaireAnswers;
  currentStep: number;
  furthestStep: number;
  createdAt?: string;
  fillMode?: FillMode;
  partnerProgress?: PartnerProgressMap;
  fieldMeta?: Record<string, FieldEditMeta>;
  existingOwnerUid?: string;
  participantUids?: string[];
  linkExpiresAtMs?: number;
}

/**
 * Auto-saves the couple's draft to Firestore `drafts/{resumeToken}`.
 * Stores text answers + verified uploaded Storage paths ONLY (zero base64, zero unuploaded paths).
 * Sets a server-enforced 7-day `linkExpiresAt` Timestamp and preserves `participantUids`
 * when two partners collaborate on separate phones.
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
  const effectiveOwnerUid = input.existingOwnerUid || authRes.uid;
  const participantUids = mergeParticipantUids(
    input.participantUids,
    effectiveOwnerUid,
    authRes.uid
  );

  const expiryMs =
    typeof input.linkExpiresAtMs === "number" && input.linkExpiresAtMs > Date.now()
      ? input.linkExpiresAtMs
      : Date.now() + LINK_EXPIRY_MS;

  const basePayload = stripUndefinedDeep({
    id: input.resumeToken,
    submissionId: input.submissionId,
    ownerUid: effectiveOwnerUid,
    participantUids,
    status: "draft" as const,
    linkLocked: false,
    revoked: false,
    linkExpiresAtIso: new Date(expiryMs).toISOString(),
    ...(input.fillMode ? { fillMode: input.fillMode } : {}),
    ...(input.partnerProgress ? { partnerProgress: input.partnerProgress } : {}),
    ...(input.fieldMeta ? { fieldMeta: input.fieldMeta } : {}),
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

  const payloadWithTimestamp = {
    ...basePayload,
    linkExpiresAt: Timestamp.fromMillis(expiryMs),
  };

  const draftRef = doc(db, "drafts", input.resumeToken);
  try {
    await setDoc(draftRef, payloadWithTimestamp);
  } catch (err: any) {
    // Graceful fallback if new multi-partner rules are not deployed yet in Firebase Console
    const isPermDenied =
      err?.code === "permission-denied" ||
      String(err?.message || "").toLowerCase().includes("insufficient permissions");
    if (isPermDenied && effectiveOwnerUid !== authRes.uid) {
      await setDoc(draftRef, {
        ...payloadWithTimestamp,
        ownerUid: authRes.uid,
      });
      return;
    }
    throw err;
  }
}

/**
 * Performs a surgical dot-notation `updateDoc` on `drafts/{resumeToken}` so Partner A
 * and Partner B editing different answers (or different Q14 decor events) at the same time
 * never overwrite each other's work.
 */
export async function saveOnlineDraftFieldPatch(params: {
  resumeToken: string;
  submissionId: string;
  patch: Record<string, unknown>;
  answersForSummary?: QuestionnaireAnswers;
  partnerProgress?: PartnerProgressMap;
  existingOwnerUid?: string;
  participantUids?: string[];
}): Promise<void> {
  if (!isValidResumeToken(params.resumeToken)) return;

  const authRes = await ensureCoupleAnonymousAuth();
  if (!authRes?.uid) return;

  const cleanPatch = stripUndefinedDeep(params.patch);
  assertNoBase64Images(cleanPatch as unknown as QuestionnaireAnswers);

  const now = new Date().toISOString();
  const updateBody: Record<string, unknown> = {
    ...cleanPatch,
    submissionId: params.submissionId,
    updatedAt: now,
  };

  if (params.existingOwnerUid) {
    updateBody.ownerUid = params.existingOwnerUid;
    updateBody.participantUids = mergeParticipantUids(
      params.participantUids,
      params.existingOwnerUid,
      authRes.uid
    );
  }

  if (params.partnerProgress) {
    updateBody.partnerProgress = stripUndefinedDeep(params.partnerProgress);
  }

  if (params.answersForSummary) {
    const missing = getMissingMandatoryQuestions(params.answersForSummary);
    updateBody.answeredCount = MANDATORY_QUESTION_STEPS.length - missing.length;
    updateBody.mandatoryRemaining = missing.length;
    updateBody.partner1 = (params.answersForSummary.partner1 || "").trim();
    updateBody.partner2 = (params.answersForSummary.partner2 || "").trim();
    updateBody.weddingDate = params.answersForSummary.weddingDate || "";
    updateBody.phone = params.answersForSummary.phone || "";
    updateBody.email = params.answersForSummary.email || "";
  }

  const draftRef = doc(db, "drafts", params.resumeToken);
  try {
    await updateDoc(draftRef, updateBody);
  } catch (err: any) {
    const isPermDenied =
      err?.code === "permission-denied" ||
      String(err?.message || "").toLowerCase().includes("insufficient permissions");
    if (isPermDenied && params.existingOwnerUid && params.existingOwnerUid !== authRes.uid) {
      await updateDoc(draftRef, {
        ...updateBody,
        ownerUid: authRes.uid,
      });
      return;
    }
    throw err;
  }
}

export type DraftLoadInactiveReason = "locked" | "revoked" | "expired" | "not_found";

export type DraftLoadResult =
  | { status: "active"; draft: DraftRecord }
  | { status: "inactive"; reason: DraftLoadInactiveReason };

/**
 * Loads an online draft via `?resume=<token>` and checks whether the link is still active
 * (not locked, not revoked, not past 7-day expiry).
 * - If locked/revoked/expired/denied: returns `{ status: "inactive", reason }` with ZERO answers.
 * - If active: joins `participantUids` (preserving Partner A's `ownerUid` for collaborative mode)
 *   and persists the couple session locally.
 */
export async function loadOnlineDraftWithStatus(
  resumeToken: string
): Promise<DraftLoadResult> {
  if (!isValidResumeToken(resumeToken)) {
    return { status: "inactive", reason: "not_found" };
  }

  const authRes = await ensureCoupleAnonymousAuth();
  if (!authRes?.uid) {
    return { status: "inactive", reason: "locked" };
  }

  try {
    const draftRef = doc(db, "drafts", resumeToken);
    const snap = await getDoc(draftRef);
    if (!snap.exists()) {
      return { status: "inactive", reason: "not_found" };
    }

    const data = snap.data() as DraftRecord;
    const inactiveReason = getDraftLinkInactiveReason(data);
    if (inactiveReason) {
      return { status: "inactive", reason: inactiveReason };
    }

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

    const isAlreadyParticipant =
      restored.ownerUid === authRes.uid ||
      (Array.isArray(restored.participantUids) &&
        restored.participantUids.includes(authRes.uid));

    if (!isAlreadyParticipant) {
      const nextParticipants = mergeParticipantUids(
        restored.participantUids,
        restored.ownerUid,
        authRes.uid
      );
      const isCollaborative =
        restored.fillMode === "separate" ||
        restored.answers?.fillMode === "separate" ||
        (Array.isArray(restored.participantUids) && restored.participantUids.length > 0);

      try {
        if (isCollaborative) {
          // Path A: keep ownerUid fixed so Partner A stays authorized, add Partner B to participantUids
          await updateDoc(draftRef, {
            ownerUid: restored.ownerUid,
            participantUids: nextParticipants,
            submissionId: restored.submissionId,
            updatedAt: new Date().toISOString(),
          });
          restored.participantUids = nextParticipants;
        } else {
          // Path B: legacy single-owner resume on a new device
          await updateDoc(draftRef, {
            ownerUid: authRes.uid,
            participantUids: nextParticipants,
            submissionId: restored.submissionId,
            updatedAt: new Date().toISOString(),
          });
          restored.ownerUid = authRes.uid;
          restored.participantUids = nextParticipants;
        }
      } catch (linkErr: any) {
        const isPermDenied =
          linkErr?.code === "permission-denied" ||
          String(linkErr?.message || "").toLowerCase().includes("insufficient permissions");
        if (isPermDenied && isCollaborative) {
          // Fallback for environments where new multi-partner rules haven't been published yet
          try {
            await updateDoc(draftRef, {
              ownerUid: authRes.uid,
              participantUids: nextParticipants,
              submissionId: restored.submissionId,
              updatedAt: new Date().toISOString(),
            });
            restored.ownerUid = authRes.uid;
            restored.participantUids = nextParticipants;
          } catch (fallbackErr) {
            void logSubmissionError({
              step: "resume_link_claim",
              error: fallbackErr,
              photoCount: countAllPhotosInAnswers(restored.answers),
              submissionId: restored.submissionId,
            });
          }
        } else {
          void logSubmissionError({
            step: "resume_link_claim",
            error: linkErr,
            photoCount: countAllPhotosInAnswers(restored.answers),
            submissionId: restored.submissionId,
          });
        }
      }
    }

    return { status: "active", draft: restored };
  } catch (err: any) {
    const isPermDenied =
      err?.code === "permission-denied" ||
      String(err?.message || "").toLowerCase().includes("insufficient permissions");
    if (isPermDenied) {
      // Firestore rules rejected get() because link is locked, revoked, or expired!
      return { status: "inactive", reason: "locked" };
    }
    void logSubmissionError({
      step: "resume_load",
      error: err,
    });
    return { status: "inactive", reason: "not_found" };
  }
}

/**
 * Legacy-compatible loader: returns the active DraftRecord or null if inactive/not found.
 */
export async function loadOnlineDraftByToken(
  resumeToken: string
): Promise<DraftRecord | null> {
  const res = await loadOnlineDraftWithStatus(resumeToken);
  return res.status === "active" ? res.draft : null;
}

/**
 * Subscribes to live Firestore updates on `drafts/{resumeToken}` for real-time sync
 * between two partners AND instant lock/revoke detection if an admin locks the link.
 */
export function subscribeOnlineDraft(
  resumeToken: string,
  onUpdate: (draft: DraftRecord) => void,
  onInactive: (reason: DraftLoadInactiveReason) => void
): () => void {
  if (!isValidResumeToken(resumeToken)) {
    return () => {};
  }
  const draftRef = doc(db, "drafts", resumeToken);
  return onSnapshot(
    draftRef,
    (snap) => {
      if (!snap.exists()) {
        onInactive("not_found");
        return;
      }
      const data = snap.data() as DraftRecord;
      const inactiveReason = getDraftLinkInactiveReason(data);
      if (inactiveReason) {
        onInactive(inactiveReason);
        return;
      }
      onUpdate({ ...data, id: snap.id });
    },
    (err) => {
      const isPermDenied =
        (err as any)?.code === "permission-denied" ||
        String(err?.message || "").toLowerCase().includes("insufficient permissions");
      if (isPermDenied) {
        onInactive("locked");
      }
    }
  );
}

/**
 * Quietly marks the couple's online draft as submitted AND auto-locks the link
 * (`linkLocked: true`) after the main submission save succeeds.
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
      linkLocked: true,
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
 * Admin: Locks an active draft link immediately so anyone opening it sees only
 * "This link is no longer active. Please contact the studio."
 */
export async function lockDraftLinkNow(draftId: string): Promise<void> {
  if (!draftId) return;
  const now = new Date().toISOString();
  await updateDoc(doc(db, "drafts", draftId), {
    linkLocked: true,
    updatedAt: now,
  });
}

/**
 * Admin: Revokes the old draft link permanently (`revoked: true, linkLocked: true`)
 * and creates a brand-new 192-bit draft link with a fresh 7-day expiry carrying
 * all existing answers and progress intact.
 */
export async function resetDraftResumeLink(
  draft: DraftRecord
): Promise<{ newDraft: DraftRecord; token: string; url: string }> {
  const now = new Date().toISOString();
  const newToken = generateResumeToken();
  const expiry = buildFreshExpiry();

  const newDraftBase: DraftRecord = stripUndefinedDeep({
    ...draft,
    id: newToken,
    status: "draft",
    linkLocked: false,
    revoked: false,
    linkExpiresAtIso: expiry.linkExpiresAtIso,
    updatedAt: now,
  });

  await setDoc(doc(db, "drafts", newToken), {
    ...newDraftBase,
    linkExpiresAt: expiry.linkExpiresAt,
  });

  await updateDoc(doc(db, "drafts", draft.id), {
    revoked: true,
    linkLocked: true,
    updatedAt: now,
  });

  return {
    newDraft: {
      ...newDraftBase,
      linkExpiresAt: expiry.linkExpiresAt,
    },
    token: newToken,
    url: buildResumeUrl(newToken),
  };
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
 * Admin: Lists active/unfinished non-revoked drafts from Firestore (sorted by most recently updated first),
 * so the studio can follow up with couples who have not tapped Send yet.
 */
export async function getAdminDrafts(): Promise<DraftRecord[]> {
  const all = await getAllAdminDrafts();
  return all.filter((d) => d.status !== "submitted" && d.revoked !== true);
}

/**
 * Admin: Delete a draft after resolving or cleaning up test entries.
 */
export async function deleteAdminDraft(draftId: string): Promise<void> {
  await deleteDoc(doc(db, "drafts", draftId));
}

export function getDraftExpiryMillis(draft: DraftRecord | null | undefined): number | undefined {
  if (!draft) return undefined;
  return extractTimestampMillis(draft.linkExpiresAt ?? draft.linkExpiresAtIso) ?? undefined;
}

