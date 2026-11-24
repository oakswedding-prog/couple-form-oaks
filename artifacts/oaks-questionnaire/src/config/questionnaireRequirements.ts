/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single place for every "minimum" the questionnaire enforces on NEW drafts.
 * Change a number here and the validation, counters and messages follow.
 */
export const MIN_VIP_PER_SIDE = 5;
export const MIN_REFERENCE_PHOTOS = 3;
export const MIN_REFERENCE_LINKS = 1;
export const MIN_WARDROBE_PHOTOS = 3;
export const MIN_WARDROBE_LINKS = 1;
export const MIN_DECOR_IMAGES = 3;
export const MIN_DECOR_LINKS = 1;
export const REQUIRE_COUPLE_PHOTO = true;

/**
 * Stamped on every NEW draft (`answers.requirementsVersion`). Drafts and submissions that were
 * created before these rules existed have no stamp and keep the old rules.
 */
export const CURRENT_REQUIREMENTS_VERSION = 2;

/**
 * Set to `true` to also apply the new minimums to drafts/submissions that already exist
 * (for example a couple reopening an already-sent submission through a resume link).
 */
export const APPLY_NEW_REQUIREMENTS_TO_EXISTING = false;

export function usesNewRequirements(
  answers: { requirementsVersion?: number } | null | undefined
): boolean {
  if (APPLY_NEW_REQUIREMENTS_TO_EXISTING) return true;
  return (answers?.requirementsVersion ?? 0) >= CURRENT_REQUIREMENTS_VERSION;
}
