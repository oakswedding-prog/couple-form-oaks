/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

function normalizedConfirmation(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function matchesSubmissionDeleteConfirmation(
  value: string,
  partner1: string,
  partner2: string
): boolean {
  const typed = normalizedConfirmation(value.trim());
  if (typed === "delete") return true;
  const expectedNames = normalizedConfirmation(`${partner1} ${partner2}`);
  return expectedNames.length > 0 && typed === expectedNames;
}
