import { auth } from "./firebase.ts";

export interface SubmissionNumberChange {
  id: string;
  partner1: string;
  partner2: string;
  fromDisplayId: string | null;
  toDisplayId: string | null;
  fromSequenceNumber: number | null;
  toSequenceNumber: number | null;
}

export interface RenumberPreview {
  revision: string;
  submissionCount: number;
  changes: SubmissionNumberChange[];
}

export interface RenumberResult {
  submissionCount: number;
  changes: SubmissionNumberChange[];
}

export interface DeleteAndRenumberResult extends RenumberResult {
  deletedDisplayId: string | null;
  deletedSequenceNumber: number | null;
}

interface NumberingResponse<T> {
  success: boolean;
  error?: string;
  revision?: string;
  number?: { sequenceNumber: number; displayId: string };
  result?: T;
  submissionCount?: number;
  changes?: SubmissionNumberChange[];
  deletedDisplayId?: string | null;
  deletedSequenceNumber?: number | null;
}

async function requestNumbering<T>(
  body: Record<string, unknown>
): Promise<NumberingResponse<T>> {
  const user = auth.currentUser;
  if (!user) throw new Error("A signed-in session is required to number submissions.");

  const response = await fetch(`${import.meta.env.BASE_URL}api/numbering`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | NumberingResponse<T>
    | null;
  if (!response.ok || !payload?.success) {
    throw new Error(
      payload?.error || `Submission numbering request failed (${response.status}).`
    );
  }
  return payload;
}

export async function assignNumberForSubmission(
  submissionId: string
): Promise<{ sequenceNumber: number; displayId: string }> {
  const response = await requestNumbering({
    action: "assign",
    submissionId,
  });
  if (!response.number) throw new Error("The numbering service returned no number.");
  return response.number;
}

export async function getRenumberPreview(): Promise<RenumberPreview> {
  const response = await requestNumbering<RenumberPreview>({
    action: "preview-renumber",
  });
  if (!response.revision || !Array.isArray(response.changes)) {
    throw new Error("The numbering service returned an invalid preview.");
  }
  return {
    revision: response.revision,
    submissionCount: response.submissionCount ?? 0,
    changes: response.changes,
  };
}

export async function applyRenumberPreview(
  revision: string
): Promise<RenumberResult> {
  const response = await requestNumbering<RenumberResult>({
    action: "renumber",
    expectedRevision: revision,
  });
  return {
    submissionCount: response.submissionCount ?? 0,
    changes: response.changes ?? [],
  };
}

export async function deleteSubmissionAndRenumber(
  submissionId: string
): Promise<DeleteAndRenumberResult> {
  const response = await requestNumbering<DeleteAndRenumberResult>({
    action: "delete",
    submissionId,
  });
  return {
    deletedDisplayId: response.deletedDisplayId ?? null,
    deletedSequenceNumber: response.deletedSequenceNumber ?? null,
    submissionCount: response.submissionCount ?? 0,
    changes: response.changes ?? [],
  };
}

export async function checkSubmissionDeletionReady(submissionId: string): Promise<void> {
  await requestNumbering({ action: "check-delete", submissionId });
}
