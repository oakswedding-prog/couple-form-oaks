/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Master code switch for "Together or Separately" filling + Invite Your Partner + Per-Person Answers.
 * Delivered OFF (`false`) by default so live couples see zero behavior change until tested.
 * Can also be turned on via Vercel env var `VITE_ENABLE_SPLIT_MODE=true` (kept out of `.env.example`
 * so AI Studio never triggers a secret-value prompt).
 */
export const ENABLE_SPLIT_MODE = true;

export const LINK_EXPIRY_DAYS = 7;
export const LINK_EXPIRY_MS = LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export const LOCKED_LINK_MESSAGE =
  "This link is no longer active. Please contact the studio.";

export function isSplitModeEnabled(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  try {
    const envVal = (
      import.meta as unknown as { env?: Record<string, string | undefined> }
    )?.env?.VITE_ENABLE_SPLIT_MODE;
    if (envVal === "true" || envVal === "1") return true;
    if (envVal === "false" || envVal === "0") return false;
  } catch {
    // non-Vite test runtime
  }
  return ENABLE_SPLIT_MODE;
}

export type QuestionOwnershipType = "shared" | "perPerson";

export interface QuestionConfigEntry {
  number: number;
  key: string;
  chapter: number;
  type: QuestionOwnershipType;
  mandatory: boolean;
  tabbed?: boolean;
  /** True when the legacy QuestionnaireAnswers shape already has dedicated A/B slots (Q1, Q2, Q4, Q7, Q10, Q13). */
  alreadySplitInAnswers?: boolean;
}

/**
 * Single easy-to-edit config list controlling all 27 questionnaire questions.
 * Switching any question between "shared" and "perPerson" is a one-line change here.
 */
export const QUESTION_CONFIG: readonly QuestionConfigEntry[] = [
  // Chapter 1: Your Story
  { number: 1, key: "q1_calls", chapter: 1, type: "perPerson", mandatory: true, alreadySplitInAnswers: true },
  { number: 2, key: "q2_workPassion", chapter: 1, type: "perPerson", mandatory: true, alreadySplitInAnswers: true },
  { number: 3, key: "q3_firstMeet", chapter: 1, type: "shared", mandatory: true },
  { number: 4, key: "q4_firstImpression", chapter: 1, type: "perPerson", mandatory: false, alreadySplitInAnswers: true },
  { number: 5, key: "q5_threeWords", chapter: 1, type: "shared", mandatory: false },
  { number: 6, key: "q6_activities", chapter: 1, type: "shared", mandatory: true },
  { number: 7, key: "q7_loveMost", chapter: 1, type: "perPerson", mandatory: true, alreadySplitInAnswers: true },
  { number: 8, key: "q8_funnyStory", chapter: 1, type: "shared", mandatory: false },
  { number: 9, key: "q9_proposal", chapter: 1, type: "shared", mandatory: false },

  // Chapter 2: Your People
  { number: 10, key: "q10_people", chapter: 2, type: "perPerson", mandatory: true, tabbed: true, alreadySplitInAnswers: true },

  // Chapter 3: The Look and Feel
  { number: 11, key: "q11_filmFeel", chapter: 3, type: "perPerson", mandatory: true },
  { number: 12, key: "q12_references", chapter: 3, type: "shared", mandatory: true },
  { number: 13, key: "wardrobe", chapter: 3, type: "perPerson", mandatory: true, tabbed: true, alreadySplitInAnswers: true },
  { number: 14, key: "decorEvents", chapter: 3, type: "shared", mandatory: true, tabbed: true },
  { number: 15, key: "q13_tone", chapter: 3, type: "perPerson", mandatory: true },

  // Chapter 4: Your Day
  { number: 16, key: "q14_moments", chapter: 4, type: "perPerson", mandatory: true },
  { number: 17, key: "q15_captureAvoid", chapter: 4, type: "perPerson", mandatory: false },
  { number: 18, key: "q16_nonNegotiables", chapter: 4, type: "perPerson", mandatory: true },
  { number: 19, key: "q17_emotional", chapter: 4, type: "perPerson", mandatory: false },

  // Chapter 5: Working Together
  { number: 20, key: "q18_cameraVersatility", chapter: 5, type: "perPerson", mandatory: true },
  { number: 21, key: "choosingOaks", chapter: 5, type: "perPerson", mandatory: true },
  { number: 22, key: "q20_guidanceComfort", chapter: 5, type: "perPerson", mandatory: true },
  { number: 23, key: "q21_comfortTips", chapter: 5, type: "perPerson", mandatory: false },
  { number: 24, key: "q22_futureFeeling", chapter: 5, type: "perPerson", mandatory: false },
  { number: 25, key: "primaryContact", chapter: 5, type: "shared", mandatory: true },

  // Chapter 6: One Last Thing
  { number: 26, key: "loveStoryNarrative", chapter: 6, type: "shared", mandatory: true },
  { number: 27, key: "q23_oneLastThing", chapter: 6, type: "perPerson", mandatory: false },
];

const QUESTION_CONFIG_BY_STEP = new Map<number, QuestionConfigEntry>(
  QUESTION_CONFIG.map((entry) => [entry.number, entry])
);

export function getQuestionConfig(step: number): QuestionConfigEntry | undefined {
  return QUESTION_CONFIG_BY_STEP.get(step);
}

export function isPerPersonQuestion(step: number): boolean {
  return QUESTION_CONFIG_BY_STEP.get(step)?.type === "perPerson";
}

export function isSharedQuestion(step: number): boolean {
  return QUESTION_CONFIG_BY_STEP.get(step)?.type === "shared";
}

/**
 * Questions whose single legacy field gets an overlay in `answers.partnerAnswers`
 * when split mode is active (Q11, Q15–Q24, Q27).
 */
export const OVERLAY_PER_PERSON_STEPS: readonly number[] = QUESTION_CONFIG.filter(
  (q) => q.type === "perPerson" && !q.alreadySplitInAnswers
).map((q) => q.number);
