import test from "node:test";
import assert from "node:assert/strict";
import type { FamilyMember, QuestionnaireAnswers } from "../types/questionnaire.ts";
import { validateQuestionStep } from "./questionnaireValidation.ts";
import { validateQuestionStepForContext, buildMissingSummaryForPartner } from "./splitModeHelpers.ts";

const members = (side: "bride" | "groom", count: number): FamilyMember[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${side}-${i}`,
    name: `Person ${i + 1}`,
    relationship: "Close friend",
    side,
    photoUrl: `https://example.com/${side}-${i}.jpg`,
  }));

function answers(version?: number): QuestionnaireAnswers {
  return {
    requirementsVersion: version,
    partner1: "Maya",
    partner2: "Leo",
    q10_people: { familyMembers: [], treeNotes: "" },
  } as unknown as QuestionnaireAnswers;
}

for (const version of [undefined, 2]) {
  test(`Q10 requires five named people with photos for each partner, version ${version ?? "legacy"}`, () => {
    const a = answers(version);
    a.q10_people.familyMembers = [...members("bride", 5), ...members("groom", 1)];
    assert.equal(validateQuestionStepForContext(10, a, "separate", "partnerA").isComplete, true);
    assert.equal(validateQuestionStepForContext(10, a, "separate", "partnerB").isComplete, false);
    assert.match(validateQuestionStepForContext(10, a, "separate", "partnerB").missingMessage!, /4 more people/);
    assert.equal(validateQuestionStep(10, a).isComplete, false);
    assert.match(buildMissingSummaryForPartner(a, "partnerB")!, /4 more VIP people with photos/);
    a.q10_people.familyMembers = [...members("bride", 5), ...members("groom", 5)];
    assert.equal(validateQuestionStep(10, a).isComplete, true);
    for (const slot of ["partnerA", "partnerB"] as const) {
      assert.equal(validateQuestionStepForContext(10, a, "separate", slot).isComplete, true);
    }
    a.q10_people.familyMembers[9].photoUrl = "";
    assert.equal(validateQuestionStep(10, a).isComplete, false);
    a.q10_people.familyMembers[9].photoUrl = "https://example.com/photo.jpg";
    a.q10_people.familyMembers[9].name = " ";
    assert.equal(validateQuestionStep(10, a).isComplete, false);
    a.q10_people.familyMembers.splice(9, 1);
    assert.equal(validateQuestionStepForContext(10, a, "separate", "partnerB").isComplete, false);
  });
}

test("Q10 family-tree photos and notes cannot replace five named people", () => {
  const a = answers();
  a.q10_people.brideSide = { photos: [{ id: "tree", url: "https://example.com/tree.jpg" }], notes: "Family" };
  a.q10_people.groomSide = { photos: [], notes: "Family" };
  assert.equal(validateQuestionStep(10, a).isComplete, false);
});
