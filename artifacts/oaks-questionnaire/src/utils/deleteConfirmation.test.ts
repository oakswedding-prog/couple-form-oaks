/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import test from "node:test";
import { matchesSubmissionDeleteConfirmation } from "./deleteConfirmation.ts";

test("delete confirmation accepts the couple names or DELETE, case-insensitively", () => {
  assert.equal(
    matchesSubmissionDeleteConfirmation("Ringa & Ronga", "Ringa", "Ronga"),
    true
  );
  assert.equal(
    matchesSubmissionDeleteConfirmation("DELETE", "Ringa", "Ronga"),
    true
  );
  assert.equal(
    matchesSubmissionDeleteConfirmation("Ronga & Ringa", "Ringa", "Ronga"),
    false
  );
  assert.equal(
    matchesSubmissionDeleteConfirmation("Ringa", "Ringa", "Ronga"),
    false
  );
});
