/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { QuestionnaireAnswers } from "../types/questionnaire.ts";

export const MANDATORY_QUESTION_STEPS: readonly number[] = [
  1, 2, 3, 6, 7, 10, 11, 12, 13, 14, 15, 16, 18, 20, 21, 22, 25, 26,
];

export const Q11_REQUIRED_SELECTIONS = 3;
export const Q11_MAX_SELECTIONS = 3;

export const Q15_MIN_SELECTIONS = 1;
export const Q15_MAX_SELECTIONS = 3;

export function isQuestionMandatory(step: number): boolean {
  return MANDATORY_QUESTION_STEPS.includes(step);
}

export function isPrimaryContactComplete(
  pc: QuestionnaireAnswers["primaryContact"] | undefined
): boolean {
  if (!pc || !pc.role) return false;
  if (
    pc.role === "Someone else" &&
    (!pc.side || !(pc.designation?.trim() || pc.gender))
  ) {
    return false;
  }
  return pc.name.trim().length > 0 && pc.phone.trim().length > 0;
}

/**
 * Toggles an option inside a multi-select array with an upper cap.
 * Already-selected options can always be unchecked (even if an existing draft
 * exceeds `maxSelections`). New options are ignored once `current.length >= maxSelections`.
 */
export function toggleMultiSelectWithMax(
  current: string[] | undefined,
  option: string,
  maxSelections: number
): string[] {
  const list = Array.isArray(current) ? current : [];
  if (list.includes(option)) {
    return list.filter((item) => item !== option);
  }
  if (list.length >= maxSelections) {
    return list;
  }
  return [...list, option];
}

export interface StepValidationResult {
  isMandatory: boolean;
  isComplete: boolean;
  missingMessage: string | null;
}

export function validateQuestionStep(
  step: number,
  answers: QuestionnaireAnswers
): StepValidationResult {
  const mandatory = isQuestionMandatory(step);
  if (!mandatory) {
    return { isMandatory: false, isComplete: true, missingMessage: null };
  }

  switch (step) {
    case 1: {
      const ok = Boolean(
        answers.q1_calls?.aCallsB?.trim() && answers.q1_calls?.bCallsA?.trim()
      );
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok ? null : "Enter nicknames for both partners to continue",
      };
    }
    case 2: {
      const ok = Boolean(
        answers.q2_workPassion?.partnerA?.trim() &&
          answers.q2_workPassion?.partnerB?.trim()
      );
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok
          ? null
          : "Fill in work & passions for both partners to continue",
      };
    }
    case 3: {
      const ok = Boolean(answers.q3_firstMeet?.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok ? null : "Share how you first met to continue",
      };
    }
    case 6: {
      const ok =
        (answers.q6_activities?.selected?.length || 0) > 0 ||
        Boolean(answers.q6_activities?.other?.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok
          ? null
          : "Select or enter an activity to continue",
      };
    }
    case 7: {
      const ok = Boolean(
        answers.q7_loveMost?.partnerA?.trim() &&
          answers.q7_loveMost?.partnerB?.trim()
      );
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok
          ? null
          : "Fill in what you love about each other to continue",
      };
    }
    case 10: {
      const ok =
        (answers.q10_people?.familyMembers?.length || 0) > 0 ||
        Boolean(answers.q10_people?.treePhotoUrl?.trim()) ||
        Boolean(answers.q10_people?.treeNotes?.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok
          ? null
          : "Add a VIP person, tree photo, or note to continue",
      };
    }
    case 11: {
      const count = answers.q11_filmFeel?.selected?.length || 0;
      const ok = count === Q11_REQUIRED_SELECTIONS;
      let missingMessage: string | null = null;
      if (count < Q11_REQUIRED_SELECTIONS) {
        missingMessage = `Select 3 styles to continue (${count}/${Q11_REQUIRED_SELECTIONS})`;
      } else if (count > Q11_MAX_SELECTIONS) {
        missingMessage = `Keep only 3 styles selected to continue (${count}/${Q11_MAX_SELECTIONS})`;
      }
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage,
      };
    }
    case 12: {
      const ok =
        (answers.q12_references?.links?.length || 0) > 0 ||
        (answers.q12_references?.images?.length || 0) > 0 ||
        Boolean(answers.q12_references?.notes?.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok
          ? null
          : "Add a reference link, photo, or note to continue",
      };
    }
    case 13: {
      const ok =
        Boolean(answers.weddingOutfits?.notes?.trim()) ||
        (answers.weddingOutfits?.links?.length || 0) > 0 ||
        (answers.weddingOutfits?.images?.length || 0) > 0;
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok
          ? null
          : "Share wardrobe details, links, or photos to continue",
      };
    }
    case 14: {
      const ok =
        (answers.decorMoodBoard?.links?.length || 0) > 0 ||
        (answers.decorMoodBoard?.images?.length || 0) > 0 ||
        Boolean(answers.decorMoodBoard?.notes?.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok
          ? null
          : "Add a decor link, photo, or note to continue",
      };
    }
    case 15: {
      const count = answers.q13_tone?.selected?.length || 0;
      const ok = count >= Q15_MIN_SELECTIONS && count <= Q15_MAX_SELECTIONS;
      let missingMessage: string | null = null;
      if (count < Q15_MIN_SELECTIONS) {
        missingMessage = "Select 1 to 3 tones to continue";
      } else if (count > Q15_MAX_SELECTIONS) {
        missingMessage = `Keep at most 3 tones selected to continue (${count}/${Q15_MAX_SELECTIONS})`;
      }
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage,
      };
    }
    case 16: {
      const ok =
        (answers.q14_moments?.selected?.length || 0) > 0 ||
        Boolean(answers.q14_moments?.other?.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok
          ? null
          : "Select or enter a wedding moment to continue",
      };
    }
    case 18: {
      const ok = Boolean(answers.q16_nonNegotiables?.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok
          ? null
          : "Share your non-negotiables to continue",
      };
    }
    case 20: {
      const ok = Boolean(answers.q18_cameraVersatility?.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok ? null : "Select an option to continue",
      };
    }
    case 21: {
      const ok = Boolean(answers.choosingOaks?.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok
          ? null
          : "Share what drew you to OAKS Wedding to continue",
      };
    }
    case 22: {
      const ok = Boolean(answers.q20_guidanceComfort?.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok
          ? null
          : "Select a guidance preference to continue",
      };
    }
    case 25: {
      const ok = isPrimaryContactComplete(answers.primaryContact);
      let missingMessage: string | null = null;
      if (!ok) {
        const pc = answers.primaryContact;
        missingMessage = !pc?.role
          ? "Select a primary contact to continue"
          : pc?.role === "Someone else" &&
            (!pc?.side || !(pc?.designation?.trim() || pc?.gender))
          ? "Select side, enter role designation & fill contact details"
          : "Enter contact name & phone number to continue";
      }
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage,
      };
    }
    case 26: {
      const ok = Boolean(answers.loveStoryNarrative?.trim());
      return {
        isMandatory: true,
        isComplete: ok,
        missingMessage: ok ? null : "Share your story to continue",
      };
    }
    default:
      return { isMandatory: false, isComplete: true, missingMessage: null };
  }
}

export function getMissingMandatoryQuestions(
  answers: QuestionnaireAnswers
): number[] {
  return MANDATORY_QUESTION_STEPS.filter(
    (step) => !validateQuestionStep(step, answers).isComplete
  );
}
