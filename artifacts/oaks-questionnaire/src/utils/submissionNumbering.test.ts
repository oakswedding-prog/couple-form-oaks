/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import test from "node:test";
import { calculateSubmissionNumbering } from "@workspace/submission-numbering";

test("numbering follows submittedAt order instead of the previous numbers", () => {
  const plan = calculateSubmissionNumbering([
    {
      id: "third",
      data: {
        partner1: "Third",
        partner2: "Couple",
        submittedAt: "2026-11-03T10:00:00.000Z",
        sequenceNumber: 1,
        displayId: "#001",
      },
    },
    {
      id: "first",
      data: {
        partner1: "First",
        partner2: "Couple",
        submittedAt: "2026-11-01T10:00:00.000Z",
        sequenceNumber: 3,
        displayId: "#003",
      },
    },
    {
      id: "second",
      data: {
        partner1: "Second",
        partner2: "Couple",
        submittedAt: "2026-11-02T10:00:00.000Z",
        sequenceNumber: 2,
        displayId: "#002",
      },
    },
  ]);

  assert.equal(plan.submissionCount, 3);
  assert.deepEqual(plan.numbersById, {
    first: { sequenceNumber: 1, displayId: "#001" },
    second: { sequenceNumber: 2, displayId: "#002" },
    third: { sequenceNumber: 3, displayId: "#003" },
  });
  assert.equal(plan.changes.length, 2);
  assert.equal(plan.changes[0].fromDisplayId, "#003");
  assert.equal(plan.changes[0].toDisplayId, "#001");
});

test("unsubmitted records are excluded and their old number fields are cleared", () => {
  const plan = calculateSubmissionNumbering([
    {
      id: "submitted",
      data: {
        submittedAt: "2026-11-01T10:00:00.000Z",
        sequenceNumber: 1,
        displayId: "#001",
      },
    },
    {
      id: "unfinished",
      data: {
        sequenceNumber: 99,
        displayId: "#099",
      },
    },
  ]);

  assert.equal(plan.submissionCount, 1);
  assert.deepEqual(plan.changes, [
    {
      id: "unfinished",
      partner1: "Partner 1",
      partner2: "Partner 2",
      fromDisplayId: "#099",
      toDisplayId: null,
      fromSequenceNumber: 99,
      toSequenceNumber: null,
    },
  ]);
});

test("equal submission timestamps use server creation time as a stable tie-breaker", () => {
  const timestamp = "2026-11-01T10:00:00.000Z";
  const plan = calculateSubmissionNumbering([
    { id: "a", createTimeMs: 200, data: { submittedAt: timestamp } },
    { id: "z", createTimeMs: 100, data: { submittedAt: timestamp } },
  ]);

  assert.deepEqual(plan.numbersById, {
    z: { sequenceNumber: 1, displayId: "#001" },
    a: { sequenceNumber: 2, displayId: "#002" },
  });
});

test("a contiguous sequence produces no changes and a stable preview revision", () => {
  const records = [
    {
      id: "a",
      data: {
        submittedAt: "2026-11-01T10:00:00.000Z",
        sequenceNumber: 1,
        displayId: "#001",
      },
    },
    {
      id: "b",
      data: {
        submittedAt: "2026-11-02T10:00:00.000Z",
        sequenceNumber: 2,
        displayId: "#002",
      },
    },
  ];
  const first = calculateSubmissionNumbering(records);
  const second = calculateSubmissionNumbering([...records].reverse());

  assert.equal(first.changes.length, 0);
  assert.equal(first.revision, second.revision);
});

