/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SubmissionDeletionResult {
  deletedPhotoCount: number;
  deletedDraftCount: number;
  deletedErrorCount: number;
  deletedRelatedDocumentCount: number;
  deletedDisplayId: string | null;
  deletedSequenceNumber: number | null;
  renumberedCount: number;
  renumberedSubmissions: Array<{
    id: string;
    partner1: string;
    partner2: string;
    fromDisplayId: string | null;
    toDisplayId: string | null;
    fromSequenceNumber: number | null;
    toSequenceNumber: number | null;
  }>;
}

export interface SubmissionDeletionActions {
  deleteStorageFiles: () => Promise<number>;
  deleteDrafts: () => Promise<number>;
  deleteSubmissionErrors: () => Promise<number>;
  deleteRelatedDocuments: () => Promise<number>;
  deleteSubmissionRecord: () => Promise<
    | {
        deletedDisplayId?: string | null;
        deletedSequenceNumber?: number | null;
        changes?: SubmissionDeletionResult["renumberedSubmissions"];
      }
    | void
  >;
}

export type SubmissionDeletionStep =
  | "Storage photos"
  | "resume drafts"
  | "submission error records"
  | "archived and private Firestore data"
  | "submission record";

export class SubmissionDeletionError extends Error {
  constructor(
    readonly step: SubmissionDeletionStep,
    detail: string
  ) {
    super(
      `Could not delete ${step}: ${detail}. The main submission record was kept, so an admin can retry.`
    );
    this.name = "SubmissionDeletionError";
  }
}

/**
 * Deletes dependent data first and the parent record last.
 * A failed step stops the plan, leaving the parent available for a safe retry.
 */
export async function runSubmissionDeletionPlan(
  actions: SubmissionDeletionActions
): Promise<SubmissionDeletionResult> {
  const result: SubmissionDeletionResult = {
    deletedPhotoCount: 0,
    deletedDraftCount: 0,
    deletedErrorCount: 0,
    deletedRelatedDocumentCount: 0,
    deletedDisplayId: null,
    deletedSequenceNumber: null,
    renumberedCount: 0,
    renumberedSubmissions: [],
  };

  const runCountedStep = async (
    step: SubmissionDeletionStep,
    action: () => Promise<number>
  ): Promise<number> => {
    try {
      return await action();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new SubmissionDeletionError(step, detail);
    }
  };

  result.deletedPhotoCount = await runCountedStep(
    "Storage photos",
    actions.deleteStorageFiles
  );
  result.deletedDraftCount = await runCountedStep(
    "resume drafts",
    actions.deleteDrafts
  );
  result.deletedErrorCount = await runCountedStep(
    "submission error records",
    actions.deleteSubmissionErrors
  );
  result.deletedRelatedDocumentCount = await runCountedStep(
    "archived and private Firestore data",
    actions.deleteRelatedDocuments
  );

  try {
    const deleted = await actions.deleteSubmissionRecord();
    if (deleted) {
      result.deletedDisplayId = deleted.deletedDisplayId ?? null;
      result.deletedSequenceNumber = deleted.deletedSequenceNumber ?? null;
      result.renumberedSubmissions = deleted.changes ?? [];
      result.renumberedCount = result.renumberedSubmissions.length;
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SubmissionDeletionError("submission record", detail);
  }

  return result;
}
