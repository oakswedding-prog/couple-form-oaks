/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import test from "node:test";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  handleSubmissionNumberingRequest,
  readAdminMoodboardImage,
} from "@workspace/submission-numbering";

const projectId = "oaks-couple-questionnaire";
const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const storageEmulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
const shouldRun = Boolean(firestoreEmulator && authEmulator && storageEmulator);

async function signUpTestUser(email: string, password: string): Promise<{
  uid: string;
  idToken: string;
}> {
  const response = await fetch(
    `http://${authEmulator}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-test-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const result = (await response.json()) as {
    localId?: string;
    idToken?: string;
    error?: unknown;
  };
  assert.equal(response.ok, true, JSON.stringify(result));
  assert.ok(result.localId);
  assert.ok(result.idToken);
  return { uid: result.localId, idToken: result.idToken };
}

async function firestoreRestPatch(
  documentPath: string,
  idToken: string,
  fields: Record<string, { integerValue?: string; stringValue?: string }>,
  fieldPaths: string[]
): Promise<Response> {
  const query = fieldPaths
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join("&");
  return fetch(
    `http://${firestoreEmulator}/v1/projects/${projectId}/databases/(default)/documents/${documentPath}?${query}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );
}

test(
  "trusted numbering serializes concurrent submissions, deletes atomically, and protects number fields",
  { skip: !shouldRun },
  async () => {
    const seedApp = initializeApp({ projectId }, "submission-numbering-emulator-test");
    const db = getFirestore(seedApp);
    const existing = await db.collection("submissions").get();
    const cleanupBatch = db.batch();
    existing.docs.forEach((document) => cleanupBatch.delete(document.ref));
    cleanupBatch.delete(db.collection("counters").doc("submissions"));
    await cleanupBatch.commit();

    const couple = await signUpTestUser(
      "numbering-couple@oaks.test",
      "emulator-only-password"
    );
    const admin = await signUpTestUser(
      "numbering-admin@oaks.test",
      "emulator-only-password"
    );
    await db.collection("admins").doc("numbering-admin@oaks.test").set({
      active: true,
    });
    const coupleToken = couple.idToken;
    const adminToken = admin.idToken;
    const imagePath = "submissions/numbering-image-test/admin/moodboard.png";
    const originalImageBytes = Buffer.from([137, 80, 78, 71, 0, 1, 2, 3, 255]);
    const imageFile = getStorage(seedApp)
      .bucket("oaks-couple-questionnaire.firebasestorage.app")
      .file(imagePath);
    await imageFile.save(originalImageBytes, {
      metadata: { contentType: "image/png" },
    });
    const proxiedImage = await readAdminMoodboardImage({
      authorization: `Bearer ${adminToken}`,
      source: imagePath,
    });
    assert.deepEqual(proxiedImage.bytes, originalImageBytes);
    assert.equal(proxiedImage.contentType, "image/png");
    await assert.rejects(
      readAdminMoodboardImage({
        authorization: `Bearer ${coupleToken}`,
        source: imagePath,
      }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "admin_required"
    );
    await imageFile.delete();

    const dates = [
      "2026-11-01T10:00:00.000Z",
      "2026-11-02T10:00:00.000Z",
      "2026-11-03T10:00:00.000Z",
    ];
    for (const [index, id] of ["numbering-test-a", "numbering-test-b", "numbering-test-c"].entries()) {
      await db.collection("submissions").doc(id).set({
        partner1: `Test ${index + 1}`,
        partner2: "Couple",
        ownerUid: couple.uid,
        participantUids: [couple.uid],
        submittedAt: dates[index],
        sequenceNumber: index + 1,
        displayId: `#00${index + 1}`,
      });
    }
    await db.collection("counters").doc("submissions").set({ current: 3 });

    const numberChangesFromCouple = await firestoreRestPatch(
      "submissions/numbering-test-a",
      coupleToken,
      { sequenceNumber: { integerValue: "50" } },
      ["sequenceNumber"]
    );
    assert.equal(numberChangesFromCouple.status, 403);
    const counterWriteFromCouple = await firestoreRestPatch(
      "counters/submissions",
      coupleToken,
      { current: { integerValue: "50" } },
      ["current"]
    );
    assert.equal(counterWriteFromCouple.status, 403);

    const unauthorizedDelete = await handleSubmissionNumberingRequest({
      authorization: `Bearer ${coupleToken}`,
      body: { action: "delete", submissionId: "numbering-test-b" },
    });
    assert.equal(unauthorizedDelete.status, 403);

    const deleted = await handleSubmissionNumberingRequest({
      authorization: `Bearer ${adminToken}`,
      body: { action: "delete", submissionId: "numbering-test-b" },
    });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    const afterDeleteA = (await db.doc("submissions/numbering-test-a").get()).data();
    const afterDeleteC = (await db.doc("submissions/numbering-test-c").get()).data();
    assert.equal(afterDeleteA?.sequenceNumber, 1);
    assert.equal(afterDeleteC?.sequenceNumber, 2);
    assert.equal(afterDeleteC?.displayId, "#002");
    assert.equal(
      (await db.doc("counters/submissions").get()).data()?.current,
      2
    );

    const nextId = "numbering-test-d";
    await db.doc(`submissions/${nextId}`).set({
      partner1: "Next",
      partner2: "Couple",
      ownerUid: couple.uid,
      participantUids: [couple.uid],
      submittedAt: "2026-11-04T10:00:00.000Z",
    });
    const nextAssigned = await handleSubmissionNumberingRequest({
      authorization: `Bearer ${coupleToken}`,
      body: { action: "assign", submissionId: nextId },
    });
    assert.equal(nextAssigned.status, 200, JSON.stringify(nextAssigned.body));
    assert.deepEqual(nextAssigned.body.number, {
      sequenceNumber: 3,
      displayId: "#003",
    });
    assert.equal(nextAssigned.body.changes, undefined, "A couple must not receive other couples' records");

    const concurrentIds = ["numbering-test-e", "numbering-test-f"];
    for (const [index, id] of concurrentIds.entries()) {
      await db.doc(`submissions/${id}`).set({
        partner1: `Concurrent ${index + 1}`,
        partner2: "Couple",
        ownerUid: couple.uid,
        participantUids: [couple.uid],
        submittedAt: `2026-11-0${5 + index}T10:00:00.000Z`,
      });
    }
    const concurrentResults = await Promise.all(
      concurrentIds.map((submissionId) =>
        handleSubmissionNumberingRequest({
          authorization: `Bearer ${coupleToken}`,
          body: { action: "assign", submissionId },
        })
      )
    );
    assert.ok(concurrentResults.every((result) => result.status === 200));
    const finalDocs = await db.collection("submissions").get();
    const finalNumbers = finalDocs.docs
      .map((document) => document.data().sequenceNumber)
      .sort((left, right) => left - right);
    assert.deepEqual(finalNumbers, [1, 2, 3, 4, 5]);
    assert.equal(new Set(finalNumbers).size, 5);
    assert.equal(
      (await db.doc("counters/submissions").get()).data()?.current,
      5
    );

    const adminNumberUpdate = await firestoreRestPatch(
      "submissions/numbering-test-a",
      adminToken,
      { sequenceNumber: { integerValue: "1" } },
      ["sequenceNumber"]
    );
    assert.equal(adminNumberUpdate.status, 200);

    await db.doc("submissions/numbering-test-c").update({
      displayId: "#022", sequenceNumber: 22,
    });
    const preview = await handleSubmissionNumberingRequest({
      authorization: `Bearer ${adminToken}`,
      body: { action: "preview-renumber" },
    });
    assert.equal(preview.status, 200);
    assert.ok((preview.body.changes as Array<{fromDisplayId: string}>).some((change) => change.fromDisplayId === "#022"));
    const repaired = await handleSubmissionNumberingRequest({
      authorization: `Bearer ${adminToken}`,
      body: { action: "renumber", expectedRevision: preview.body.revision },
    });
    assert.equal(repaired.status, 200);
    assert.equal((await db.doc("submissions/numbering-test-c").get()).data()?.displayId, "#002");
    const stale = await handleSubmissionNumberingRequest({
      authorization: `Bearer ${adminToken}`,
      body: { action: "renumber", expectedRevision: preview.body.revision },
    });
    assert.equal(stale.status, 409, "Stale previews must not write");
    assert.equal((await db.doc("submissions/numbering-test-c").get()).data()?.displayId, "#002");
  }
);
