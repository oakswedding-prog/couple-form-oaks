/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  DecorEventBoard,
  DecorEventMapEntry,
  DraftRecord,
  FieldEditMeta,
  FillMode,
  PartnerAnswersMap,
  PartnerProgressMap,
  PartnerSlot,
  PartnerSpecificAnswers,
  QuestionnaireAnswers,
} from "../types/questionnaire.ts";
import {
  LINK_EXPIRY_MS,
  QUESTION_CONFIG,
  isPerPersonQuestion,
} from "../config/splitMode.ts";
import {
  Q11_MAX_SELECTIONS,
  Q11_REQUIRED_SELECTIONS,
  Q15_MAX_SELECTIONS,
  Q15_MIN_SELECTIONS,
  StepValidationResult,
  isQuestionMandatory,
  validateQuestionStep,
} from "./questionnaireValidation.ts";
import { getGroupedQ10People } from "./familyPeople.ts";
import { getGroupedWardrobe } from "./wardrobe.ts";
import { getGroupedDecorEvents } from "./decorEvents.ts";
import {
  MIN_VIP_PER_SIDE,
  MIN_WARDROBE_LINKS,
  MIN_WARDROBE_PHOTOS,
  usesNewRequirements,
} from "../config/questionnaireRequirements.ts";
import { checkCouplePhoto, checkVipSide, checkWardrobeSide } from "./requirements.ts";

export function getEffectiveFillMode(
  source?: { fillMode?: FillMode } | null
): FillMode {
  return source?.fillMode === "separate" ? "separate" : "together";
}

export function getPartnerDisplayName(
  answers: Pick<QuestionnaireAnswers, "partner1" | "partner2">,
  slot: PartnerSlot
): string {
  if (slot === "partnerA") return answers.partner1?.trim() || "Partner 1";
  return answers.partner2?.trim() || "Partner 2";
}

export function getOtherPartnerSlot(slot: PartnerSlot): PartnerSlot {
  return slot === "partnerA" ? "partnerB" : "partnerA";
}

/** A completed submission has its resume link locked, but must still show Thank You. */
export function shouldShowLockedLinkScreen(
  isLinkLocked: boolean,
  currentStep: number
): boolean {
  return isLinkLocked && currentStep !== 29;
}

/**
 * In Together mode, returns whether a per-person overlay step (Q11, Q15–Q24, Q27)
 * uses a single shared answer for both partners. Defaults to `true` (legacy behavior).
 */
export function isSameForBothForStep(
  answers: QuestionnaireAnswers,
  step: number
): boolean {
  const mode = getEffectiveFillMode(answers);
  if (mode === "separate") return false;
  const flag = answers.partnerAnswers?.sameForBoth?.[String(step)];
  if (typeof flag === "boolean") return flag;
  return true;
}

export function setSameForBothForStep(
  answers: QuestionnaireAnswers,
  step: number,
  sameForBoth: boolean
): QuestionnaireAnswers {
  const prevMap = answers.partnerAnswers || {};
  const nextSameMap = {
    ...(prevMap.sameForBoth || {}),
    [String(step)]: sameForBoth,
  };

  if (!sameForBoth) {
    // Seed both partners from the existing canonical answer if not already filled
    const key = getOverlayFieldKeyForStep(step);
    if (key) {
      const canonical = cloneValue((answers as any)[key]);
      const existingA = prevMap.partnerA?.[key];
      const existingB = prevMap.partnerB?.[key];
      return {
        ...answers,
        partnerAnswers: {
          ...prevMap,
          sameForBoth: nextSameMap,
          partnerA: {
            ...(prevMap.partnerA || {}),
            [key]: existingA !== undefined ? existingA : cloneValue(canonical),
          },
          partnerB: {
            ...(prevMap.partnerB || {}),
            [key]: existingB !== undefined ? existingB : cloneValue(canonical),
          },
        },
      };
    }
  }

  return {
    ...answers,
    partnerAnswers: {
      ...prevMap,
      sameForBoth: nextSameMap,
    },
  };
}

export type OverlayFieldKey = keyof PartnerSpecificAnswers;

const STEP_TO_OVERLAY_KEY: Record<number, OverlayFieldKey> = {
  11: "q11_filmFeel",
  15: "q13_tone",
  16: "q14_moments",
  17: "q15_captureAvoid",
  18: "q16_nonNegotiables",
  19: "q17_emotional",
  20: "q18_cameraVersatility",
  21: "choosingOaks",
  22: "q20_guidanceComfort",
  23: "q21_comfortTips",
  24: "q22_futureFeeling",
  27: "q23_oneLastThing",
};

export function getOverlayFieldKeyForStep(step: number): OverlayFieldKey | null {
  return STEP_TO_OVERLAY_KEY[step] ?? null;
}

function cloneValue<T>(val: T): T {
  if (val === undefined || val === null) return val;
  return JSON.parse(JSON.stringify(val)) as T;
}

function defaultOverlayValue<K extends OverlayFieldKey>(
  key: K
): NonNullable<PartnerSpecificAnswers[K]> {
  switch (key) {
    case "q11_filmFeel":
    case "q13_tone":
    case "q14_moments":
      return { selected: [], other: "" } as unknown as NonNullable<PartnerSpecificAnswers[K]>;
    case "q15_captureAvoid":
      return { definitelyCapture: "", pleaseAvoid: "" } as unknown as NonNullable<
        PartnerSpecificAnswers[K]
      >;
    case "q21_comfortTips":
      return { selected: [], notes: "" } as unknown as NonNullable<PartnerSpecificAnswers[K]>;
    case "q23_oneLastThing":
      return { notes: "", images: [] } as unknown as NonNullable<PartnerSpecificAnswers[K]>;
    default:
      return "" as unknown as NonNullable<PartnerSpecificAnswers[K]>;
  }
}

/**
 * Reads a partner's answer for an overlay per-person field.
 * Falls back cleanly to the canonical field for Partner A on legacy records so zero data is ever lost.
 */
export function getPartnerOverlayValue<K extends OverlayFieldKey>(
  answers: QuestionnaireAnswers,
  slot: PartnerSlot,
  key: K
): NonNullable<PartnerSpecificAnswers[K]> {
  const fromSlot = answers.partnerAnswers?.[slot]?.[key];
  if (fromSlot !== undefined) {
    return fromSlot as NonNullable<PartnerSpecificAnswers[K]>;
  }
  const stepEntry = QUESTION_CONFIG.find((q) => q.key === key);
  if (stepEntry && isSameForBothForStep(answers, stepEntry.number)) {
    const canonical = (answers as any)[key];
    if (canonical !== undefined) return canonical;
  }
  return defaultOverlayValue(key);
}

/**
 * Returns whether an overlay field actually has distinct per-person data stored
 * (used by Admin Couple Detail, Briefs, Cheat Sheet, PDF, and Word exports).
 */
export function hasSplitOverlayAnswers<K extends OverlayFieldKey>(
  answers: QuestionnaireAnswers,
  key: K
): boolean {
  const pa = answers.partnerAnswers?.partnerA?.[key];
  const pb = answers.partnerAnswers?.partnerB?.[key];
  const hasA = !isOverlayValueEmpty(key, pa);
  const hasB = !isOverlayValueEmpty(key, pb);
  if (!hasA && !hasB) return false;

  const stepEntry = QUESTION_CONFIG.find((q) => q.key === key);
  if (
    stepEntry &&
    getEffectiveFillMode(answers) === "together" &&
    isSameForBothForStep(answers, stepEntry.number)
  ) {
    return false;
  }
  return true;
}

export function isOverlayValueEmpty(key: OverlayFieldKey, val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === "string") return val.trim().length === 0;
  if (typeof val === "object") {
    const obj = val as Record<string, any>;
    if (key === "q15_captureAvoid") {
      return !String(obj.definitelyCapture || "").trim() && !String(obj.pleaseAvoid || "").trim();
    }
    if (key === "q21_comfortTips") {
      return (!Array.isArray(obj.selected) || obj.selected.length === 0) && !String(obj.notes || "").trim();
    }
    if (key === "q23_oneLastThing") {
      return !String(obj.notes || "").trim() && (!Array.isArray(obj.images) || obj.images.length === 0);
    }
    return (!Array.isArray(obj.selected) || obj.selected.length === 0) && !String(obj.other || "").trim();
  }
  return true;
}

/**
 * Updates one partner's value for an overlay per-person field AND keeps the canonical
 * top-level field synchronized (merged/primary) so legacy consumers stay 100% functional.
 */
export function setPartnerOverlayValue<K extends OverlayFieldKey>(
  answers: QuestionnaireAnswers,
  slot: PartnerSlot,
  key: K,
  value: NonNullable<PartnerSpecificAnswers[K]>
): QuestionnaireAnswers {
  const prevMap: PartnerAnswersMap = answers.partnerAnswers || {};
  const nextPartnerAnswers: PartnerAnswersMap = {
    ...prevMap,
    [slot]: {
      ...(prevMap[slot] || {}),
      [key]: value,
    },
  };

  const mergedCanonical = mergeOverlayFieldToCanonical(
    key,
    nextPartnerAnswers.partnerA?.[key],
    nextPartnerAnswers.partnerB?.[key],
    (answers as any)[key]
  );

  return {
    ...answers,
    [key]: mergedCanonical,
    partnerAnswers: nextPartnerAnswers,
  };
}

function mergeOverlayFieldToCanonical<K extends OverlayFieldKey>(
  key: K,
  valA: PartnerSpecificAnswers[K] | undefined,
  valB: PartnerSpecificAnswers[K] | undefined,
  fallback: unknown
): any {
  const hasA = !isOverlayValueEmpty(key, valA);
  const hasB = !isOverlayValueEmpty(key, valB);
  if (!hasA && !hasB) return defaultOverlayValue(key);
  if (hasA && !hasB) return cloneValue(valA);
  if (!hasA && hasB) return cloneValue(valB);

  if (key === "q11_filmFeel" || key === "q13_tone" || key === "q14_moments") {
    const a = valA as { selected: string[]; other: string };
    const b = valB as { selected: string[]; other: string };
    const mergedSelected = Array.from(new Set([...(a.selected || []), ...(b.selected || [])]));
    const otherParts = [a.other?.trim(), b.other?.trim()].filter(Boolean);
    return {
      selected: mergedSelected,
      other: Array.from(new Set(otherParts)).join(" / "),
    };
  }
  if (key === "q15_captureAvoid") {
    const a = valA as { definitelyCapture: string; pleaseAvoid: string };
    const b = valB as { definitelyCapture: string; pleaseAvoid: string };
    return {
      definitelyCapture: Array.from(
        new Set([a.definitelyCapture?.trim(), b.definitelyCapture?.trim()].filter(Boolean))
      ).join("\n"),
      pleaseAvoid: Array.from(
        new Set([a.pleaseAvoid?.trim(), b.pleaseAvoid?.trim()].filter(Boolean))
      ).join("\n"),
    };
  }
  if (key === "q21_comfortTips") {
    const a = valA as { selected: string[]; notes: string };
    const b = valB as { selected: string[]; notes: string };
    return {
      selected: Array.from(new Set([...(a.selected || []), ...(b.selected || [])])),
      notes: Array.from(new Set([a.notes?.trim(), b.notes?.trim()].filter(Boolean))).join("\n"),
    };
  }
  if (key === "q23_oneLastThing") {
    const a = valA as { notes: string; images: string[] };
    const b = valB as { notes: string; images: string[] };
    return {
      notes: Array.from(new Set([a.notes?.trim(), b.notes?.trim()].filter(Boolean))).join("\n"),
      images: Array.from(new Set([...(a.images || []), ...(b.images || [])])),
    };
  }
  if (typeof valA === "string" || typeof valB === "string") {
    const sA = String(valA || "").trim();
    const sB = String(valB || "").trim();
    if (sA === sB) return sA;
    return [sA, sB].filter(Boolean).join(" / ");
  }
  return fallback ?? defaultOverlayValue(key);
}

/**
 * Validates a single question step FOR A SPECIFIC PARTNER in Separate mode
 * (or delegates directly to the untouched legacy `validateQuestionStep` in Together mode
 * unless split per-person boxes were explicitly unticked).
 */
export function validateQuestionStepForContext(
  step: number,
  answers: QuestionnaireAnswers,
  mode: FillMode,
  activePartner: PartnerSlot
): StepValidationResult {
  const mandatory = isQuestionMandatory(step);
  if (!mandatory) {
    return { isMandatory: false, isComplete: true, missingMessage: null };
  }

  // Together mode with "Same answer for both of us" (default) uses exact legacy validation
  if (mode === "together") {
    const overlayKey = getOverlayFieldKeyForStep(step);
    if (!overlayKey || isSameForBothForStep(answers, step)) {
      return validateQuestionStep(step, answers);
    }
    // Together mode with "Same answer for both of us" UNTICKED -> validate both partnerA and partnerB
    const resA = validateOverlayStepForSlot(step, answers, "partnerA");
    const resB = validateOverlayStepForSlot(step, answers, "partnerB");
    if (resA.isComplete && resB.isComplete) {
      return { isMandatory: true, isComplete: true, missingMessage: null };
    }
    const p1 = getPartnerDisplayName(answers, "partnerA");
    const p2 = getPartnerDisplayName(answers, "partnerB");
    if (!resA.isComplete && !resB.isComplete) {
      return {
        isMandatory: true,
        isComplete: false,
        missingMessage: resA.missingMessage || `Complete both ${p1}'s and ${p2}'s answers to continue`,
      };
    }
    return {
      isMandatory: true,
      isComplete: false,
      missingMessage: !resA.isComplete
        ? `${p1}: ${resA.missingMessage}`
        : `${p2}: ${resB.missingMessage}`,
    };
  }

  // Separate mode: validate ONLY shared questions + activePartner's own side of perPerson questions!
  if (!isPerPersonQuestion(step)) {
    return validateQuestionStep(step, answers);
  }

  const partnerName = getPartnerDisplayName(answers, activePartner);
  switch (step) {
    case 1: {
      const ok =
        activePartner === "partnerA"
          ? Boolean(answers.q1_calls?.aCallsB?.trim())
          : Boolean(answers.q1_calls?.bCallsA?.trim());
      if (ok && usesNewRequirements(answers)) {
        const photo = checkCouplePhoto(answers);
        return {
          isMandatory: true,
          isComplete: photo.complete,
          missingMessage: photo.message,
          progress: photo.progress,
        };
      }
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok ? null : `Enter what ${partnerName} calls your partner to continue`,
      };
    }
    case 2: {
      const ok =
        activePartner === "partnerA"
          ? Boolean(answers.q2_workPassion?.partnerA?.trim())
          : Boolean(answers.q2_workPassion?.partnerB?.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok ? null : `Fill in ${partnerName}'s work & passions to continue`,
      };
    }
    case 7: {
      const ok =
        activePartner === "partnerA"
          ? Boolean(answers.q7_loveMost?.partnerA?.trim())
          : Boolean(answers.q7_loveMost?.partnerB?.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok ? null : `Share what ${partnerName} loves most to continue`,
      };
    }
    case 10: {
      const own = checkVipSide(answers, activePartner);
      return {
        isMandatory: true,
        isComplete: own.complete,
        missingMessage: own.message,
        progress: own.progress,
      };
    }
    case 13: {
      if (usesNewRequirements(answers)) {
        const own = checkWardrobeSide(answers, activePartner);
        return {
          isMandatory: true,
          isComplete: own.complete,
          missingMessage: own.message,
          progress: own.progress,
        };
      }
      const grouped = getGroupedWardrobe(answers);
      const side =
        activePartner === "partnerA" ? grouped.bride : grouped.groom;
      const ok = Boolean(side.notes.trim()) || Boolean(grouped.legacyShared?.notes.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok
          ? null
          : `Add outfit notes for ${partnerName}'s Wardrobe to continue`,
      };
    }
    default:
      return validateOverlayStepForSlot(step, answers, activePartner);
  }
}

function validateOverlayStepForSlot(
  step: number,
  answers: QuestionnaireAnswers,
  slot: PartnerSlot
): StepValidationResult {
  switch (step) {
    case 11: {
      const val = getPartnerOverlayValue(answers, slot, "q11_filmFeel");
      const count = val.selected?.length || 0;
      const ok = count === Q11_REQUIRED_SELECTIONS;
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage:
          count < Q11_REQUIRED_SELECTIONS
            ? `Select 3 styles to continue (${count}/${Q11_REQUIRED_SELECTIONS})`
            : count > Q11_MAX_SELECTIONS
            ? `Keep only 3 styles selected to continue (${count}/${Q11_MAX_SELECTIONS})`
            : null,
      };
    }
    case 15: {
      const val = getPartnerOverlayValue(answers, slot, "q13_tone");
      const count = val.selected?.length || 0;
      const ok = count >= Q15_MIN_SELECTIONS && count <= Q15_MAX_SELECTIONS;
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage:
          count < Q15_MIN_SELECTIONS
            ? "Select 1 to 3 tones to continue"
            : count > Q15_MAX_SELECTIONS
            ? `Keep at most 3 tones selected to continue (${count}/${Q15_MAX_SELECTIONS})`
            : null,
      };
    }
    case 16: {
      const val = getPartnerOverlayValue(answers, slot, "q14_moments");
      const ok = (val.selected?.length || 0) > 0 || Boolean(val.other?.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok ? null : "Select or enter a wedding moment to continue",
      };
    }
    case 18: {
      const val = getPartnerOverlayValue(answers, slot, "q16_nonNegotiables");
      const ok = Boolean(val.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok ? null : "Share your non-negotiables to continue",
      };
    }
    case 20: {
      const val = getPartnerOverlayValue(answers, slot, "q18_cameraVersatility");
      const ok = Boolean(val.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok ? null : "Select an option to continue",
      };
    }
    case 21: {
      const val = getPartnerOverlayValue(answers, slot, "choosingOaks");
      const ok = Boolean(val.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok ? null : "Share what drew you to OAKS Wedding to continue",
      };
    }
    case 22: {
      const val = getPartnerOverlayValue(answers, slot, "q20_guidanceComfort");
      const ok = Boolean(val.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok ? null : "Select a guidance preference to continue",
      };
    }
    default:
      return { isMandatory: false, isComplete: true, missingMessage: null };
  }
}

export function getMissingMandatoryQuestionsForPartner(
  answers: QuestionnaireAnswers,
  slot: PartnerSlot
): number[] {
  return QUESTION_CONFIG.filter(
    (q) =>
      q.mandatory &&
      !validateQuestionStepForContext(q.number, answers, "separate", slot).isComplete
  ).map((q) => q.number);
}

/**
 * Plain-words list of what one partner still owes, e.g.
 * "Waiting for Leo: 3 more VIP people with photos, wardrobe photos".
 * Returns null when that partner has nothing mandatory left.
 */
export function buildMissingSummaryForPartner(
  answers: QuestionnaireAnswers,
  slot: PartnerSlot
): string | null {
  const missingSteps = getMissingMandatoryQuestionsForPartner(answers, slot);
  if (missingSteps.length === 0) return null;
  const name = getPartnerDisplayName(answers, slot);
  const parts: string[] = [];
  let other = 0;
  const detailed = usesNewRequirements(answers);
  for (const step of missingSteps) {
    if (detailed && step === 1 && answers.couplePhotoUrl?.trim()) {
      other += 1;
    } else if (detailed && step === 1) {
      const nick =
        slot === "partnerA"
          ? answers.q1_calls?.aCallsB?.trim()
          : answers.q1_calls?.bCallsA?.trim();
      if (!nick) parts.push("nickname");
      parts.push("couple photo");
    } else if (step === 10) {
      const g = getGroupedQ10People(answers.q10_people);
      const members = slot === "partnerA" ? g.bride.members : g.groom.members;
      const done = members.filter(
        (m) => m.name?.trim() && m.relationship?.trim() && m.photoUrl?.trim()
      ).length;
      const need = Math.max(0, MIN_VIP_PER_SIDE - done);
      parts.push(`${need} more VIP ${need === 1 ? "person" : "people"} with photos`);
    } else if (detailed && step === 13) {
      const w = getGroupedWardrobe(answers);
      const side = slot === "partnerA" ? w.bride : w.groom;
      if (side.photos.length < MIN_WARDROBE_PHOTOS) parts.push("wardrobe photos");
      if (side.links.length < MIN_WARDROBE_LINKS) parts.push("wardrobe link");
      if (!side.notes.trim()) parts.push("wardrobe notes");
    } else {
      other += 1;
    }
  }
  if (other > 0) parts.push(`${other} other ${other === 1 ? "answer" : "answers"}`);
  return `Waiting for ${name}: ${parts.join(", ")}`;
}

/**
 * Checks whether a specific question (1–27, mandatory or optional) has any answer for a given partner.
 * Used for "Maya: 14 of 27 · Leo: 3 of 27" and resuming at the partner's first unanswered question.
 */
export function isQuestionAnsweredForPartner(
  step: number,
  answers: QuestionnaireAnswers,
  slot: PartnerSlot
): boolean {
  const cfg = QUESTION_CONFIG.find((q) => q.number === step);
  if (!cfg) return false;
  if (cfg.mandatory) {
    return validateQuestionStepForContext(step, answers, "separate", slot).isComplete;
  }

  switch (step) {
    case 4:
      return slot === "partnerA"
        ? Boolean(answers.q4_firstImpression?.partnerA?.trim())
        : Boolean(answers.q4_firstImpression?.partnerB?.trim());
    case 5:
      return Boolean(answers.q5_threeWords?.some((w) => w.trim().length > 0));
    case 8:
      return Boolean(answers.q8_funnyStory?.trim());
    case 9:
      return answers.q9_proposal?.choice === "na" || Boolean(answers.q9_proposal?.story?.trim());
    case 17:
      return !isOverlayValueEmpty("q15_captureAvoid", getPartnerOverlayValue(answers, slot, "q15_captureAvoid"));
    case 19:
      return !isOverlayValueEmpty("q17_emotional", getPartnerOverlayValue(answers, slot, "q17_emotional"));
    case 23:
      return !isOverlayValueEmpty("q21_comfortTips", getPartnerOverlayValue(answers, slot, "q21_comfortTips"));
    case 24:
      return !isOverlayValueEmpty("q22_futureFeeling", getPartnerOverlayValue(answers, slot, "q22_futureFeeling"));
    case 27:
      return !isOverlayValueEmpty("q23_oneLastThing", getPartnerOverlayValue(answers, slot, "q23_oneLastThing"));
    default:
      return false;
  }
}

export function getPartnerAnsweredCount(
  answers: QuestionnaireAnswers,
  slot: PartnerSlot
): number {
  let count = 0;
  for (let step = 1; step <= 27; step++) {
    if (isQuestionAnsweredForPartner(step, answers, slot)) {
      count++;
    }
  }
  return count;
}

/**
 * Returns the first unanswered question (1–27) for this partner (prioritizing mandatory gaps,
 * then any unanswered question, or 28 for Review if all 27 are answered).
 */
export function getFirstUnansweredStepForPartner(
  answers: QuestionnaireAnswers,
  slot: PartnerSlot
): number {
  for (let step = 1; step <= 27; step++) {
    if (!isQuestionAnsweredForPartner(step, answers, slot)) {
      return step;
    }
  }
  return 28;
}

export function buildPartnerProgressSnapshot(
  answers: QuestionnaireAnswers,
  existing?: PartnerProgressMap | null
): PartnerProgressMap {
  return {
    partnerA: {
      done: Boolean(existing?.partnerA?.done),
      ...(existing?.partnerA?.doneAt ? { doneAt: existing.partnerA.doneAt } : {}),
      ...(typeof existing?.partnerA?.lastStep === "number"
        ? { lastStep: existing.partnerA.lastStep }
        : {}),
      answeredCount: getPartnerAnsweredCount(answers, "partnerA"),
    },
    partnerB: {
      done: Boolean(existing?.partnerB?.done),
      ...(existing?.partnerB?.doneAt ? { doneAt: existing.partnerB.doneAt } : {}),
      ...(typeof existing?.partnerB?.lastStep === "number"
        ? { lastStep: existing.partnerB.lastStep }
        : {}),
      answeredCount: getPartnerAnsweredCount(answers, "partnerB"),
    },
  };
}

/**
 * Per-event & per-item map helpers for Question 14 (Wedding Decor Mood Board) so Partner A and
 * Partner B can add links, photos, and notes to the same or different events concurrently.
 */
function stableItemId(prefix: string, value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

export function decorEventsToMap(
  events: readonly DecorEventBoard[] | undefined | null
): Record<string, DecorEventMapEntry> {
  const map: Record<string, DecorEventMapEntry> = {};
  if (!Array.isArray(events)) return map;
  events.forEach((ev, idx) => {
    if (!ev || !ev.id) return;
    const linksById: Record<string, string> = {};
    (ev.links || []).forEach((l: string) => {
      const clean = l.trim();
      if (clean) linksById[stableItemId("lnk", clean)] = clean;
    });
    const imagesById: Record<string, string> = {};
    (ev.images || []).forEach((img: string) => {
      const clean = img.trim();
      if (clean) imagesById[stableItemId("img", clean)] = clean;
    });
    map[ev.id] = {
      id: ev.id,
      name: ev.name,
      order: idx,
      isLocked: Boolean(ev.isLocked || ev.id === "wedding"),
      ...(ev.splitGroupId ? { splitGroupId: ev.splitGroupId } : {}),
      ...(ev.splitSide ? { splitSide: ev.splitSide } : {}),
      notes: ev.notes || "",
      linksById,
      imagesById,
    };
  });
  return map;
}

export function decorMapToEvents(
  map: Record<string, DecorEventMapEntry> | undefined | null
): DecorEventBoard[] {
  if (!map || typeof map !== "object") return [];
  return Object.values(map)
    .filter((entry) => entry && !entry.deleted && entry.name?.trim())
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      isLocked: Boolean(entry.isLocked || entry.id === "wedding"),
      ...(entry.splitGroupId ? { splitGroupId: entry.splitGroupId } : {}),
      ...(entry.splitSide ? { splitSide: entry.splitSide } : {}),
      notes: entry.notes || "",
      links: Array.from(new Set(Object.values(entry.linksById || {}).filter(Boolean))),
      images: Array.from(new Set(Object.values(entry.imagesById || {}).filter(Boolean))),
    }));
}

/**
 * Merges two concurrent `decorEventsMap` versions (e.g. Partner A added Haldi photos while
 * Partner B added Sangeet links) without losing either partner's items.
 */
export function mergeDecorEventMaps(
  baseMap: Record<string, DecorEventMapEntry> | undefined,
  incomingMap: Record<string, DecorEventMapEntry> | undefined
): Record<string, DecorEventMapEntry> {
  const merged: Record<string, DecorEventMapEntry> = {};
  const allIds = new Set([
    ...Object.keys(baseMap || {}),
    ...Object.keys(incomingMap || {}),
  ]);

  for (const id of allIds) {
    const a = baseMap?.[id];
    const b = incomingMap?.[id];
    if (a && !b) {
      merged[id] = cloneValue(a);
    } else if (!a && b) {
      merged[id] = cloneValue(b);
    } else if (a && b) {
      const bIsNewer = (b.updatedAt || "") >= (a.updatedAt || "");
      merged[id] = {
        id,
        name: bIsNewer ? b.name : a.name,
        order: Math.min(a.order ?? 99, b.order ?? 99),
        isLocked: Boolean(a.isLocked || b.isLocked || id === "wedding"),
        ...((b.splitGroupId || a.splitGroupId)
          ? { splitGroupId: b.splitGroupId || a.splitGroupId }
          : {}),
        ...((b.splitSide || a.splitSide) ? { splitSide: b.splitSide || a.splitSide } : {}),
        deleted: bIsNewer ? Boolean(b.deleted) : Boolean(a.deleted),
        notes: bIsNewer ? b.notes : a.notes,
        linksById: { ...(a.linksById || {}), ...(b.linksById || {}) },
        imagesById: { ...(a.imagesById || {}), ...(b.imagesById || {}) },
        updatedAt: bIsNewer ? b.updatedAt : a.updatedAt,
        updatedBy: bIsNewer ? b.updatedBy : a.updatedBy,
      };
    }
  }
  return merged;
}

export interface SharedFieldConflict {
  fieldKey: string;
  otherPartnerSlot: PartnerSlot;
  otherPartnerName: string;
  localValue: unknown;
  remoteValue: unknown;
  remoteUpdatedAt: string;
}

/**
 * Detects if the other partner updated a shared field while the current user had an unsaved edit
 * on that same field, powering the banner:
 * "[Name] changed this a moment ago. Keep theirs or use yours?"
 */
export function detectSharedFieldConflict(params: {
  fieldKey: string;
  activePartner: PartnerSlot;
  localValue: unknown;
  remoteValue: unknown;
  remoteMeta?: FieldEditMeta;
  partnerNames: { partner1: string; partner2: string };
  isFieldLocallyDirty: boolean;
}): SharedFieldConflict | null {
  const {
    fieldKey,
    activePartner,
    localValue,
    remoteValue,
    remoteMeta,
    partnerNames,
    isFieldLocallyDirty,
  } = params;
  if (!isFieldLocallyDirty || !remoteMeta) return null;
  if (remoteMeta.updatedBy === activePartner) return null;
  if (JSON.stringify(localValue) === JSON.stringify(remoteValue)) return null;

  const otherPartnerName = getPartnerDisplayName(partnerNames, remoteMeta.updatedBy);
  return {
    fieldKey,
    otherPartnerSlot: remoteMeta.updatedBy,
    otherPartnerName,
    localValue,
    remoteValue,
    remoteUpdatedAt: remoteMeta.updatedAt,
  };
}

/**
 * Extracts milliseconds from a Firestore Timestamp, Date, number, or ISO string.
 */
export function extractTimestampMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === "object") {
    const obj = value as { toMillis?: () => number; seconds?: number };
    if (typeof obj.toMillis === "function") return obj.toMillis();
    if (typeof obj.seconds === "number") return obj.seconds * 1000;
  }
  return null;
}

export function computeLinkExpiryIso(nowMs: number = Date.now()): string {
  return new Date(nowMs + LINK_EXPIRY_MS).toISOString();
}

export type DraftLinkInactiveReason = "revoked" | "locked" | "expired";

/**
 * Pure check for whether a resume/invite link is currently active (not revoked, not locked,
 * and within its 7-day expiry window). Legacy drafts without `linkExpiresAt` remain active
 * until submitted or locked.
 */
export function getDraftLinkInactiveReason(
  draft: Partial<DraftRecord> | null | undefined,
  nowMs: number = Date.now()
): DraftLinkInactiveReason | null {
  if (!draft) return "revoked";
  if (draft.revoked === true) return "revoked";
  if (draft.linkLocked === true) return "locked";
  const expiresMs =
    extractTimestampMillis(draft.linkExpiresAt) ??
    extractTimestampMillis(draft.linkExpiresAtIso);
  if (expiresMs !== null && nowMs >= expiresMs) {
    return "expired";
  }
  return null;
}

export function isDraftLinkCurrentlyActive(
  draft: Partial<DraftRecord> | null | undefined,
  nowMs: number = Date.now()
): boolean {
  return getDraftLinkInactiveReason(draft, nowMs) === null;
}

/**
 * Builds human-readable labelled lines for per-person answers in Admin views,
 * Short Briefs, Editorial Briefs, PDF, and Word exports.
 */
export interface LabelledPartnerDisplay {
  isSplit: boolean;
  singleValue: string;
  partnerALabel: string;
  partnerAValue: string;
  partnerBLabel: string;
  partnerBValue: string;
  hasDifference: boolean;
}

function formatOverlayValAsText(key: OverlayFieldKey, val: unknown): string {
  if (isOverlayValueEmpty(key, val)) return "";
  if (typeof val === "string") return val.trim();
  const obj = val as Record<string, any>;
  if (key === "q15_captureAvoid") {
    const parts: string[] = [];
    if (obj.definitelyCapture?.trim()) parts.push(`Capture: ${obj.definitelyCapture.trim()}`);
    if (obj.pleaseAvoid?.trim()) parts.push(`Avoid: ${obj.pleaseAvoid.trim()}`);
    return parts.join(" | ");
  }
  if (key === "q21_comfortTips") {
    return [
      ...(Array.isArray(obj.selected) ? obj.selected : []),
      obj.notes?.trim() ? `Note: ${obj.notes.trim()}` : null,
    ]
      .filter(Boolean)
      .join("; ");
  }
  if (key === "q23_oneLastThing") {
    const parts: string[] = [];
    if (obj.notes?.trim()) parts.push(obj.notes.trim());
    if (Array.isArray(obj.images) && obj.images.length > 0) {
      parts.push(`(${obj.images.length} photo${obj.images.length === 1 ? "" : "s"})`);
    }
    return parts.join(" ");
  }
  return [
    ...(Array.isArray(obj.selected) ? obj.selected : []),
    obj.other?.trim() ? `Other: ${obj.other.trim()}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

export function getLabelledOverlayDisplay(
  answers: QuestionnaireAnswers,
  key: OverlayFieldKey
): LabelledPartnerDisplay {
  const p1 = getPartnerDisplayName(answers, "partnerA");
  const p2 = getPartnerDisplayName(answers, "partnerB");
  const singleValue = formatOverlayValAsText(key, (answers as any)[key]);

  if (!hasSplitOverlayAnswers(answers, key)) {
    return {
      isSplit: false,
      singleValue,
      partnerALabel: p1,
      partnerAValue: singleValue,
      partnerBLabel: p2,
      partnerBValue: singleValue,
      hasDifference: false,
    };
  }

  const aVal = formatOverlayValAsText(key, answers.partnerAnswers?.partnerA?.[key]);
  const bVal = formatOverlayValAsText(key, answers.partnerAnswers?.partnerB?.[key]);
  const hasDifference =
    Boolean(aVal) &&
    Boolean(bVal) &&
    aVal.toLowerCase().trim() !== bVal.toLowerCase().trim();

  return {
    isSplit: true,
    singleValue,
    partnerALabel: p1,
    partnerAValue: aVal,
    partnerBLabel: p2,
    partnerBValue: bVal,
    hasDifference,
  };
}

/**
 * Combines both partners' Must-Capture (Q17), Please Avoid (Q17), and Non-Negotiables (Q18)
 * with partner labels when both provided distinct notes, ensuring zero important requests are lost.
 */
export function getCombinedCrewPriorities(answers: QuestionnaireAnswers): {
  mustCaptureEntries: string[];
  pleaseAvoidEntries: string[];
  nonNegotiableEntries: string[];
  partnerDifferences: string[];
} {
  const p1 = getPartnerDisplayName(answers, "partnerA");
  const p2 = getPartnerDisplayName(answers, "partnerB");

  const mustCaptureEntries: string[] = [];
  const pleaseAvoidEntries: string[] = [];
  const nonNegotiableEntries: string[] = [];
  const partnerDifferences: string[] = [];

  // Q17 Capture / Avoid
  if (hasSplitOverlayAnswers(answers, "q15_captureAvoid")) {
    const a = answers.partnerAnswers?.partnerA?.q15_captureAvoid;
    const b = answers.partnerAnswers?.partnerB?.q15_captureAvoid;
    if (a?.definitelyCapture?.trim()) mustCaptureEntries.push(`${p1}: ${a.definitelyCapture.trim()}`);
    if (b?.definitelyCapture?.trim()) mustCaptureEntries.push(`${p2}: ${b.definitelyCapture.trim()}`);
    if (a?.pleaseAvoid?.trim()) pleaseAvoidEntries.push(`${p1}: ${a.pleaseAvoid.trim()}`);
    if (b?.pleaseAvoid?.trim()) pleaseAvoidEntries.push(`${p2}: ${b.pleaseAvoid.trim()}`);
  } else {
    if (answers.q15_captureAvoid?.definitelyCapture?.trim()) {
      mustCaptureEntries.push(answers.q15_captureAvoid.definitelyCapture.trim());
    }
    if (answers.q15_captureAvoid?.pleaseAvoid?.trim()) {
      pleaseAvoidEntries.push(answers.q15_captureAvoid.pleaseAvoid.trim());
    }
  }

  // Q18 Non-negotiables
  if (hasSplitOverlayAnswers(answers, "q16_nonNegotiables")) {
    const a = answers.partnerAnswers?.partnerA?.q16_nonNegotiables?.trim();
    const b = answers.partnerAnswers?.partnerB?.q16_nonNegotiables?.trim();
    if (a) nonNegotiableEntries.push(`${p1}: ${a}`);
    if (b) nonNegotiableEntries.push(`${p2}: ${b}`);
  } else if (answers.q16_nonNegotiables?.trim()) {
    nonNegotiableEntries.push(answers.q16_nonNegotiables.trim());
  }

  // Crew-critical differences (Camera comfort, Direction, Film Feel, Tone)
  const diffFields: Array<{ key: OverlayFieldKey; label: string }> = [
    { key: "q18_cameraVersatility", label: "Camera comfort" },
    { key: "q20_guidanceComfort", label: "Direction" },
    { key: "q11_filmFeel", label: "Visual style" },
    { key: "q13_tone", label: "Wedding tone" },
  ];
  for (const df of diffFields) {
    const display = getLabelledOverlayDisplay(answers, df.key);
    if (display.isSplit && display.hasDifference) {
      partnerDifferences.push(
        `${df.label} — ${display.partnerALabel}: ${display.partnerAValue} · ${display.partnerBLabel}: ${display.partnerBValue}`
      );
    }
  }

  return {
    mustCaptureEntries,
    pleaseAvoidEntries,
    nonNegotiableEntries,
    partnerDifferences,
  };
}

/**
 * Helper for Missing or unfinished dashboard rows: returns concise human-readable
 * waiting/progress text for separate-mode drafts (e.g. "Waiting for Leo (14 of 27 done)").
 */
export function describeDraftPartnerStatus(draft: DraftRecord): string | null {
  if (draft.fillMode !== "separate") return null;
  const p1 = draft.partner1?.trim() || draft.answers?.partner1?.trim() || "Partner 1";
  const p2 = draft.partner2?.trim() || draft.answers?.partner2?.trim() || "Partner 2";
  const prog = draft.partnerProgress || buildPartnerProgressSnapshot(draft.answers);

  if (prog.partnerA.done && !prog.partnerB.done) {
    return `Waiting for ${p2} (${prog.partnerB.answeredCount} of 27 done)`;
  }
  if (prog.partnerB.done && !prog.partnerA.done) {
    return `Waiting for ${p1} (${prog.partnerA.answeredCount} of 27 done)`;
  }
  return `${p1}: ${prog.partnerA.answeredCount}/27 · ${p2}: ${prog.partnerB.answeredCount}/27`;
}

/**
 * Ensures any decorEventsMap stored in answers is synced into `answers.decorEvents`
 * so legacy viewers/exports always see the complete merged event list.
 */
export function syncDecorMapAndArray(answers: QuestionnaireAnswers): QuestionnaireAnswers {
  if (answers.decorEventsMap && Object.keys(answers.decorEventsMap).length > 0) {
    const mergedEvents = decorMapToEvents(answers.decorEventsMap);
    if (mergedEvents.length > 0) {
      return {
        ...answers,
        decorEvents: mergedEvents,
      };
    }
  }
  const grouped = getGroupedDecorEvents(answers);
  return {
    ...answers,
    decorEventsMap: decorEventsToMap(grouped.events),
  };
}
