/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { QuestionnaireAnswers } from "../types/questionnaire.ts";

export const FIRESTORE_DOC_LIMIT_BYTES = 1024 * 1024; // 1 MiB (1,048,576 bytes)

/**
 * Recursively scans an object for any inline base64 image data URIs (`data:image/...`)
 * across all questionnaire fields (Q1 couple photo, Q10 family tree & VIPs, Q12 references,
 * Q13 bride/groom wardrobe, Q14 decor events, Q27 final question, etc.).
 */
export function findBase64ImagePaths(
  value: unknown,
  currentPath = "answers"
): string[] {
  const hits: string[] = [];

  if (typeof value === "string") {
    if (value.trim().startsWith("data:image/")) {
      hits.push(currentPath);
    }
    return hits;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      hits.push(...findBase64ImagePaths(value[i], `${currentPath}[${i}]`));
    }
    return hits;
  }

  if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value)) {
      hits.push(...findBase64ImagePaths(val, `${currentPath}.${key}`));
    }
  }

  return hits;
}

/**
 * Guarantees zero base64 image payloads are written to Firestore.
 */
export function assertNoBase64Images(answers: QuestionnaireAnswers): void {
  const hits = findBase64ImagePaths(answers, "answers");
  if (hits.length > 0) {
    throw new Error(
      `Inline image data detected at ${hits[0]}. All photos must be uploaded to Firebase Storage before saving to Firestore.`
    );
  }
}

/**
 * Estimates the UTF-8 JSON byte footprint of a Firestore submission payload.
 */
export function estimateFirestoreRecordBytes(payload: unknown): number {
  const json = JSON.stringify(payload);
  return new TextEncoder().encode(json).length;
}
