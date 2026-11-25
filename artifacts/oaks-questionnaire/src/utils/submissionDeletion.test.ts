/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  runSubmissionDeletionPlan,
  SubmissionDeletionError,
  type SubmissionDeletionActions,
} from "./submissionDeletion.ts";

function actionsWithOrder(order: string[]): SubmissionDeletionActions {
  return {
    deleteStorageFiles: async () => {
      order.push("storage");
      return 12;
    },
    deleteDrafts: async () => {
      order.push("drafts");
      return 1;
    },
    deleteSubmissionErrors: async () => {
      order.push("errors");
      return 2;
    },
    deleteRelatedDocuments: async () => {
      order.push("related");
      return 4;
    },
    deleteSubmissionRecord: async () => {
      order.push("submission");
    },
  };
}

test("submission cleanup removes dependencies before the parent and returns counts", async () => {
  const order: string[] = [];
  const result = await runSubmissionDeletionPlan(actionsWithOrder(order));

  assert.deepEqual(order, ["storage", "drafts", "errors", "related", "submission"]);
  assert.deepEqual(result, {
    deletedPhotoCount: 12,
    deletedDraftCount: 1,
    deletedErrorCount: 2,
    deletedRelatedDocumentCount: 4,
    deletedDisplayId: null,
    deletedSequenceNumber: null,
    renumberedCount: 0,
    renumberedSubmissions: [],
  });
});

test("atomic parent deletion returns the numbers that were moved down", async () => {
  const order: string[] = [];
  const actions = actionsWithOrder(order);
  actions.deleteSubmissionRecord = async () => {
    order.push("submission");
    return {
      deletedDisplayId: "#002",
      deletedSequenceNumber: 2,
      changes: [
        {
          id: "third",
          partner1: "Third",
          partner2: "Couple",
          fromDisplayId: "#003",
          toDisplayId: "#002",
          fromSequenceNumber: 3,
          toSequenceNumber: 2,
        },
      ],
    };
  };

  const result = await runSubmissionDeletionPlan(actions);
  assert.equal(result.deletedDisplayId, "#002");
  assert.equal(result.deletedSequenceNumber, 2);
  assert.equal(result.renumberedCount, 1);
  assert.equal(result.renumberedSubmissions[0].toDisplayId, "#002");
});

test("a failed cleanup step keeps the main record and reports where to retry", async () => {
  const order: string[] = [];
  const actions = actionsWithOrder(order);
  actions.deleteDrafts = async () => {
    order.push("drafts");
    throw new Error("permission denied");
  };

  await assert.rejects(
    () => runSubmissionDeletionPlan(actions),
    (error: unknown) => {
      assert.ok(error instanceof SubmissionDeletionError);
      assert.equal(error.step, "resume drafts");
      assert.match(error.message, /main submission record was kept/i);
      return true;
    }
  );
  assert.deepEqual(order, ["storage", "drafts"]);
});

test("a parent deletion failure preserves the exact stage and is retryable", async () => {
  const order: string[] = [];
  const actions = actionsWithOrder(order);
  actions.deleteSubmissionRecord = async () => {
    order.push("submission");
    throw new Error("permission denied");
  };

  await assert.rejects(
    () => runSubmissionDeletionPlan(actions),
    (error: unknown) => {
      assert.ok(error instanceof SubmissionDeletionError);
      assert.equal(error.step, "submission record");
      return true;
    }
  );
  assert.equal(order.at(-1), "submission");
});
