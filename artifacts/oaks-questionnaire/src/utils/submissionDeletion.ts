/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SubmissionDeletionResult {
  deletedPhotoCount: number;
  deletedDraftCount: number;
  deletedErrorCount: number;
  deletedRelatedDocumentCount: number;
}

export interface SubmissionDeletionActions {
  deleteStorageFiles: () => Promise<number>;
  deleteDrafts: () => Promise<number>;
  deleteSubmissionErrors: () => Promise<number>;
  deleteRelatedDocuments: () => Promise<number>;
  deleteSubmissionRecord: () => Promise<void>;
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
    await actions.deleteSubmissionRecord();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SubmissionDeletionError("submission record", detail);
  }

  return result;
}
