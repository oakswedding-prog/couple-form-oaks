/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import type { FamilyMember, QuestionnaireAnswers } from "../types/questionnaire.ts";
import {
  CURRENT_REQUIREMENTS_VERSION,
  MIN_VIP_PER_SIDE,
  usesNewRequirements,
} from "../config/questionnaireRequirements.ts";
import {
  buildMissingSummaryForPartner,
  validateQuestionStepForContext,
} from "./splitModeHelpers.ts";
import { validateQuestionStep } from "./questionnaireValidation.ts";
import { splitDecorEventBySide, mergeSplitDecorEvent } from "./decorEvents.ts";
import { checkVipSide } from "./requirements.ts";

function baseAnswers(stamped: boolean): QuestionnaireAnswers {
  return {
    ...(stamped ? { requirementsVersion: CURRENT_REQUIREMENTS_VERSION } : {}),
    partner1: "Maya",
    partner2: "Leo",
    q1_calls: { aCallsB: "Lee", bCallsA: "Mimi" },
    q10_people: { familyMembers: [], treeNotes: "" },
    q12_references: { links: [], images: [], notes: "" },
    wardrobe: {
      bride: { notes: "", links: [], photos: [] },
      groom: { notes: "", links: [], photos: [] },
    },
    decorEvents: [
      { id: "wedding", name: "Wedding", isLocked: true, links: [], images: [], notes: "" },
      { id: "sangeet", name: "Sangeet", isLocked: false, links: [], images: [], notes: "" },
    ],
  } as unknown as QuestionnaireAnswers;
}

function people(side: "bride" | "groom", n: number, withPhoto = true): FamilyMember[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${side}${i}`,
    name: `P${i}`,
    relationship: "Sibling",
    side,
    mustCapture: false,
    ...(withPhoto ? { photoUrl: `photos/${side}${i}.jpg` } : {}),
  }));
}

describe("New mandatory minimums (new drafts only)", () => {
  test("old, unstamped drafts keep the old rules", () => {
    const a = baseAnswers(false);
    assert.equal(usesNewRequirements(a), false);
    // Old rule: nicknames alone complete Q1, no couple photo needed.
    assert.equal(validateQuestionStep(1, a).isComplete, true);
    assert.equal(
      validateQuestionStepForContext(1, a, "separate", "partnerA").isComplete,
      true
    );
  });

  test("Q1 needs the couple photo, and either partner adding it unlocks both", () => {
    const a = baseAnswers(true);
    const res = validateQuestionStep(1, a);
    assert.equal(res.isComplete, false);
    assert.equal(res.missingMessage, "Please add a photo of the two of you to continue");
    const withPhoto = { ...a, couplePhotoUrl: "photos/couple.jpg" };
    assert.equal(validateQuestionStep(1, withPhoto).isComplete, true);
    assert.equal(
      validateQuestionStepForContext(1, withPhoto, "separate", "partnerB").isComplete,
      true
    );
  });

  test("Separate mode: Q1 only needs the own nickname plus the shared photo", () => {
    const a = {
      ...baseAnswers(true),
      couplePhotoUrl: "photos/couple.jpg",
      q1_calls: { aCallsB: "Lee", bCallsA: "" },
    };
    assert.equal(
      validateQuestionStepForContext(1, a, "separate", "partnerA").isComplete,
      true
    );
    assert.equal(
      validateQuestionStepForContext(1, a, "separate", "partnerB").isComplete,
      false
    );
  });

  test("Q10: 5 people with photos per side; only the own side blocks in Separate mode", () => {
    const a = baseAnswers(true);
    a.q10_people = {
      ...a.q10_people,
      familyMembers: [...people("bride", MIN_VIP_PER_SIDE), ...people("groom", 2)],
    };
    assert.equal(
      validateQuestionStepForContext(10, a, "separate", "partnerA").isComplete,
      true
    );
    const b = validateQuestionStepForContext(10, a, "separate", "partnerB");
    assert.equal(b.isComplete, false);
    assert.match(b.progress ?? "", /2 of 5 people added/);
    // Together needs both sides
    assert.equal(validateQuestionStep(10, a).isComplete, false);
    a.q10_people.familyMembers = [
      ...people("bride", 5),
      ...people("groom", 5),
    ];
    assert.equal(validateQuestionStep(10, a).isComplete, true);
  });

  test("people without a photo do not count toward the 5", () => {
    const a = baseAnswers(true);
    a.q10_people = { ...a.q10_people, familyMembers: people("bride", 6, false) };
    assert.equal(checkVipSide(a, "partnerA").complete, false);
  });

  test("Q12 needs 1 link and 3 photos", () => {
    const a = baseAnswers(true);
    a.q12_references = { links: ["https://pin.it/x"], images: ["a", "b"], notes: "" };
    assert.equal(validateQuestionStep(12, a).isComplete, false);
    a.q12_references = { links: ["https://pin.it/x"], images: ["a", "b", "c"], notes: "" };
    assert.equal(validateQuestionStep(12, a).isComplete, true);
  });

  test("Q13 wardrobe: own tab only in Separate mode, both in Together", () => {
    const a = baseAnswers(true);
    a.wardrobe = {
      bride: { notes: "Ivory saree", links: ["https://x.y"], photos: ["1", "2", "3"] },
      groom: { notes: "", links: [], photos: [] },
    } as QuestionnaireAnswers["wardrobe"];
    assert.equal(
      validateQuestionStepForContext(13, a, "separate", "partnerA").isComplete,
      true
    );
    assert.equal(
      validateQuestionStepForContext(13, a, "separate", "partnerB").isComplete,
      false
    );
    assert.equal(validateQuestionStep(13, a).isComplete, false);
  });

  test("Q14: only the Wedding event is required, other events never block", () => {
    const a = baseAnswers(true);
    assert.equal(validateQuestionStep(14, a).isComplete, false);
    a.decorEvents = a.decorEvents!.map((ev) =>
      ev.id === "wedding"
        ? { ...ev, links: ["https://x.y"], images: ["1", "2", "3"] }
        : ev
    );
    assert.equal(validateQuestionStep(14, a).isComplete, true);
  });

  test("Split Sangeet: split and merge keep content and never block", () => {
    const a = baseAnswers(true);
    a.decorEvents = a.decorEvents!.map((ev) =>
      ev.id === "wedding"
        ? { ...ev, links: ["https://x.y"], images: ["1", "2", "3"] }
        : { ...ev, notes: "Marigolds" }
    );
    const split = splitDecorEventBySide(
      a.decorEvents!,
      "sangeet",
      { partnerA: "Maya", partnerB: "Leo" },
      "partnerA"
    );
    const names = split.map((e) => e.name);
    assert.ok(names.includes("Maya's Sangeet") && names.includes("Leo's Sangeet"));
    assert.equal(validateQuestionStep(14, { ...a, decorEvents: split }).isComplete, true);
    const merged = mergeSplitDecorEvent(split, "sangeet", "Sangeet");
    assert.equal(merged.find((e) => e.id === "sangeet")?.notes, "Marigolds");
    assert.equal(merged.length, 2);
  });

  test("Missing summary names the person and what is left", () => {
    const a = baseAnswers(true);
    a.couplePhotoUrl = "photos/couple.jpg";
    a.q10_people = { ...a.q10_people, familyMembers: people("groom", 2) };
    const summary = buildMissingSummaryForPartner(a, "partnerB");
    assert.ok(summary?.startsWith("Waiting for Leo:"));
    assert.match(summary!, /3 more VIP people with photos/);
    assert.match(summary!, /wardrobe photos/);
  });
});
