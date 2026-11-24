/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  FamilyMember,
  PartnerSlot,
  QuestionnaireAnswers,
} from "../types/questionnaire.ts";
import {
  MIN_DECOR_IMAGES,
  MIN_DECOR_LINKS,
  MIN_REFERENCE_LINKS,
  MIN_REFERENCE_PHOTOS,
  MIN_VIP_PER_SIDE,
  MIN_WARDROBE_LINKS,
  MIN_WARDROBE_PHOTOS,
  REQUIRE_COUPLE_PHOTO,
} from "../config/questionnaireRequirements.ts";
import { getGroupedQ10People } from "./familyPeople.ts";
import { getGroupedWardrobe } from "./wardrobe.ts";
import { getWeddingDecorEvent } from "./decorEvents.ts";

/**
 * Pure checks for the "NEW drafts only" minimums (couple photo, 5 VIPs per side with photos,
 * reference links + photos, wardrobe links + photos, Wedding decor links + images).
 * Callers decide WHEN to apply them (see `usesNewRequirements`) and for WHOM (own side vs both).
 */
export interface RequirementCheck {
  complete: boolean;
  /** Short sentence naming exactly what is missing. Null when complete. */
  message: string | null;
  /** Small counter such as "2 of 5 people added". Null when there is nothing to count. */
  progress: string | null;
}

const OK: RequirementCheck = { complete: true, message: null, progress: null };

export function partnerName(
  answers: Pick<QuestionnaireAnswers, "partner1" | "partner2">,
  slot: PartnerSlot
): string {
  const raw = slot === "partnerA" ? answers.partner1 : answers.partner2;
  const clean = (raw || "").trim();
  return clean || (slot === "partnerA" ? "Partner 1" : "Partner 2");
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function countFilled(list: readonly string[] | undefined): number {
  return Array.isArray(list)
    ? list.filter((item) => typeof item === "string" && item.trim().length > 0).length
    : 0;
}

export function isVipMemberComplete(member: FamilyMember | undefined | null): boolean {
  return Boolean(
    member &&
      member.name?.trim() &&
      member.relationship?.trim() &&
      typeof member.photoUrl === "string" &&
      member.photoUrl.trim()
  );
}

/** Question 1: one shared photo of the couple. Either partner adding it unlocks Continue for both. */
export function checkCouplePhoto(answers: QuestionnaireAnswers): RequirementCheck {
  if (!REQUIRE_COUPLE_PHOTO) return OK;
  if (answers.couplePhotoUrl?.trim()) return OK;
  return {
    complete: false,
    message: "Please add a photo of the two of you to continue",
    progress: "0 of 1 couple photo added",
  };
}

/** Question 10: at least MIN_VIP_PER_SIDE saved people (name, relationship AND photo) on one side. */
export function checkVipSide(
  answers: QuestionnaireAnswers,
  slot: PartnerSlot
): RequirementCheck {
  const grouped = getGroupedQ10People(answers.q10_people);
  const members = slot === "partnerA" ? grouped.bride.members : grouped.groom.members;
  const count = members.filter(isVipMemberComplete).length;
  const progress = `${Math.min(count, MIN_VIP_PER_SIDE)} of ${MIN_VIP_PER_SIDE} people added`;
  if (count >= MIN_VIP_PER_SIDE) {
    return { complete: true, message: null, progress };
  }
  const missing = MIN_VIP_PER_SIDE - count;
  return {
    complete: false,
    message: `${partnerName(answers, slot)}: add ${missing} more ${plural(
      missing,
      "person",
      "people"
    )} with photos to continue`,
    progress,
  };
}

/** Question 12 (shared): at least 1 link and 3 uploaded reference photos. Notes stay optional. */
export function checkReferences(answers: QuestionnaireAnswers): RequirementCheck {
  const links = countFilled(answers.q12_references?.links);
  const photos = countFilled(answers.q12_references?.images);
  const parts: string[] = [];
  if (links < MIN_REFERENCE_LINKS) {
    parts.push(
      `${MIN_REFERENCE_LINKS - links} ${plural(
        MIN_REFERENCE_LINKS - links,
        "link",
        "links"
      )} (Pinterest, Instagram or video)`
    );
  }
  if (photos < MIN_REFERENCE_PHOTOS) {
    const need = MIN_REFERENCE_PHOTOS - photos;
    parts.push(`${need} more reference ${plural(need, "photo", "photos")}`);
  }
  const progress = `${Math.min(links, MIN_REFERENCE_LINKS)} of ${MIN_REFERENCE_LINKS} link · ${Math.min(
    photos,
    MIN_REFERENCE_PHOTOS
  )} of ${MIN_REFERENCE_PHOTOS} photos`;
  if (parts.length === 0) return { complete: true, message: null, progress };
  return { complete: false, message: `Add ${parts.join(" and ")} to continue`, progress };
}

/** Question 13: one person's wardrobe tab needs 1 link, 3 outfit photos and the existing outfit-notes rule. */
export function checkWardrobeSide(
  answers: QuestionnaireAnswers,
  slot: PartnerSlot
): RequirementCheck {
  const grouped = getGroupedWardrobe(answers);
  const side = slot === "partnerA" ? grouped.bride : grouped.groom;
  const links = countFilled(side.links);
  const photos = countFilled(side.photos);
  const hasNotes = side.notes.trim().length > 0;
  const parts: string[] = [];
  if (links < MIN_WARDROBE_LINKS) {
    parts.push(
      `${MIN_WARDROBE_LINKS - links} inspiration ${plural(MIN_WARDROBE_LINKS - links, "link", "links")}`
    );
  }
  if (photos < MIN_WARDROBE_PHOTOS) {
    const need = MIN_WARDROBE_PHOTOS - photos;
    parts.push(`${need} more outfit ${plural(need, "photo", "photos")}`);
  }
  if (!hasNotes) parts.push("outfit notes");
  const progress = `${Math.min(links, MIN_WARDROBE_LINKS)} of ${MIN_WARDROBE_LINKS} link · ${Math.min(
    photos,
    MIN_WARDROBE_PHOTOS
  )} of ${MIN_WARDROBE_PHOTOS} photos${hasNotes ? " · notes added" : ""}`;
  if (parts.length === 0) return { complete: true, message: null, progress };
  return {
    complete: false,
    message: `${partnerName(answers, slot)}: add ${parts.join(", ")} to continue`,
    progress,
  };
}

/** Question 14 (shared): only the "Wedding" event has minimums. Every other event is optional. */
export function checkWeddingDecor(answers: QuestionnaireAnswers): RequirementCheck {
  const wedding = getWeddingDecorEvent(answers);
  const links = countFilled(wedding?.links);
  const images = countFilled(wedding?.images);
  const parts: string[] = [];
  if (links < MIN_DECOR_LINKS) {
    parts.push(`${MIN_DECOR_LINKS - links} ${plural(MIN_DECOR_LINKS - links, "link", "links")}`);
  }
  if (images < MIN_DECOR_IMAGES) {
    const need = MIN_DECOR_IMAGES - images;
    parts.push(`${need} more ${plural(need, "image", "images")}`);
  }
  const progress = `Wedding: ${Math.min(links, MIN_DECOR_LINKS)} of ${MIN_DECOR_LINKS} link · ${Math.min(
    images,
    MIN_DECOR_IMAGES
  )} of ${MIN_DECOR_IMAGES} images`;
  if (parts.length === 0) return { complete: true, message: null, progress };
  return {
    complete: false,
    message: `Wedding event: add ${parts.join(" and ")} to continue`,
    progress,
  };
}

/** Merge two people's checks (Together mode: both parts are required). */
export function combineChecks(a: RequirementCheck, b: RequirementCheck): RequirementCheck {
  const progress = [a.progress, b.progress].filter(Boolean).join(" · ") || null;
  if (a.complete && b.complete) return { complete: true, message: null, progress };
  const message = [a, b]
    .filter((c) => !c.complete && c.message)
    .map((c) => (c.message as string).replace(/ to continue$/, ""))
    .join(". ");
  return { complete: false, message: `${message} to continue`, progress };
}
