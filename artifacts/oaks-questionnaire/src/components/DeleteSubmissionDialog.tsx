/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import type { SubmissionRecord } from "../types/questionnaire.ts";
import { matchesSubmissionDeleteConfirmation } from "../utils/deleteConfirmation.ts";

interface DeleteSubmissionDialogProps {
  submission: SubmissionRecord | null;
  isDeleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteSubmissionDialog: React.FC<DeleteSubmissionDialogProps> = ({
  submission,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}) => {
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    setConfirmation("");
  }, [submission?.id]);

  if (!submission) return null;

  const partner1 = submission.partner1 || "Partner 1";
  const partner2 = submission.partner2 || "Partner 2";
  const canDelete = matchesSubmissionDeleteConfirmation(
    confirmation,
    partner1,
    partner2
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => {
        if (!isDeleting) onCancel();
      }}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full border border-[#E5DDD2] shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-submission-title"
        aria-describedby="delete-submission-warning"
      >
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
            <Trash2 className="w-6 h-6" />
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-[#7A756D] hover:text-[#1A1A1A] hover:bg-[#FAF7F2] transition-colors cursor-pointer disabled:opacity-50"
            title="Cancel"
            aria-label="Cancel deletion"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-1.5">
          <h3
            id="delete-submission-title"
            className="font-cormorant text-2xl font-semibold text-[#1A1A1A]"
          >
            Delete Submission?
          </h3>
          <p className="text-xs text-[#5F5F5F] leading-relaxed">
            This will permanently delete the record for{" "}
            <strong className="text-[#1A1A1A] font-semibold">
              {partner1} &amp; {partner2}
            </strong>{" "}
            ({submission.displayId || "Unnumbered"}).
          </p>
        </div>

        <div
          id="delete-submission-warning"
          className="bg-red-50/80 border border-red-200 rounded-xl p-3 text-xs text-red-900 leading-relaxed flex items-start gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>
            This permanently deletes their answers, photos and resume link. This
            cannot be undone. It also removes private notes and archived event
            records.
          </span>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="delete-submission-confirmation"
            className="block text-xs font-semibold text-[#1A1A1A]"
          >
            Type “{partner1} &amp; {partner2}” or “DELETE” to continue.
          </label>
          <input
            id="delete-submission-confirmation"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={isDeleting}
            className="w-full rounded-xl border border-[#E5DDD2] px-3 py-2.5 text-sm outline-none focus:border-[#8C7043] disabled:bg-[#FAF8F5]"
          />
        </div>

        {error && (
          <div role="alert" className="p-2.5 bg-red-100 text-red-800 text-xs rounded-xl font-medium">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#F0EBE1]">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-medium text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#FAF7F2] rounded-xl border border-[#E5DDD2] transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting || !canDelete}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Deleting…</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete permanently</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
