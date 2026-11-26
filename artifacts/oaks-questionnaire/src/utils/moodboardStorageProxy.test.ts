import test from "node:test";
import assert from "node:assert/strict";
import {
  NumberingServiceError,
  parseFirebaseMoodboardImageSource,
} from "@workspace/submission-numbering";

const currentBucket = "oaks-couple-questionnaire.firebasestorage.app";

test("moodboard image proxy accepts submission paths and Firebase Storage URLs", () => {
  const objectPath = "submissions/sub_123/owner/photo one.png";
  assert.deepEqual(parseFirebaseMoodboardImageSource(objectPath), {
    bucket: currentBucket,
    objectPath,
  });
  assert.deepEqual(
    parseFirebaseMoodboardImageSource(`gs://${currentBucket}/${objectPath}`),
    { bucket: currentBucket, objectPath }
  );
  assert.deepEqual(
    parseFirebaseMoodboardImageSource(
      `https://firebasestorage.googleapis.com/v0/b/${currentBucket}/o/${encodeURIComponent(objectPath)}?alt=media&token=unused`
    ),
    { bucket: currentBucket, objectPath }
  );
});

test("moodboard image proxy accepts the legacy Firebase bucket URL", () => {
  const objectPath = "submissions/sub_123/owner/photo.jpg";
  assert.deepEqual(
    parseFirebaseMoodboardImageSource(
      `https://storage.googleapis.com/oaks-couple-questionnaire.appspot.com/${objectPath}`
    ),
    { bucket: "oaks-couple-questionnaire.appspot.com", objectPath }
  );
});

test("moodboard image proxy rejects external hosts, other buckets, and path traversal", () => {
  for (const source of [
    "https://example.com/image.png",
    "gs://another-bucket/submissions/sub_123/photo.png",
    "submissions/sub_123/../private/key.json",
    "https://firebasestorage.googleapis.com/v0/b/oaks-couple-questionnaire.firebasestorage.app/o/%ZZ",
  ]) {
    assert.throws(
      () => parseFirebaseMoodboardImageSource(source),
      (error: unknown) => error instanceof NumberingServiceError
    );
  }
});
