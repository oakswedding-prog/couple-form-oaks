/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { QuestionnaireAnswers } from "../types/questionnaire.ts";
import { getGroupedQ10People } from "./familyPeople.ts";
import { getGroupedWardrobe } from "./wardrobe.ts";
import { getGroupedDecorEvents } from "./decorEvents.ts";

/**
 * Generates a clean, elegant, human-readable brief text for the photography
 * and cinema team, organized by chapters.
 */
export function generateBriefSummary(
  studioName: string,
  answers: QuestionnaireAnswers
): string {
  const p1 = answers.partner1 || "Partner 1";
  const p2 = answers.partner2 || "Partner 2";

  const divider = "=".repeat(60);
  const subDivider = "-".repeat(40);

  const lines: string[] = [];

  lines.push(divider);
  lines.push(`OUR STORY QUESTIONNAIRE — STUDIO BRIEF`);
  lines.push(`${studioName.toUpperCase()}`);
  lines.push(`Couple: ${p1} & ${p2}`);
  lines.push(`Generated: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`);
  lines.push(divider);
  lines.push("");

  // CHAPTER 1
  lines.push(`CHAPTER 1: YOUR STORY`);
  lines.push(subDivider);
  lines.push(`1. What do you call each other?`);
  lines.push(`   • ${p1} calls ${p2}: "${answers.q1_calls.aCallsB || '—'}"`);
  lines.push(`   • ${p2} calls ${p1}: "${answers.q1_calls.bCallsA || '—'}"`);
  if (answers.couplePhotoUrl) {
    lines.push(`   • Couple photo attached: Yes`);
  }
  lines.push("");

  lines.push(`2. What do you both do for living and what are you truly passionate about doing?`);
  lines.push(`   • ${p1}: ${answers.q2_workPassion.partnerA || '—'}`);
  lines.push(`   • ${p2}: ${answers.q2_workPassion.partnerB || '—'}`);
  lines.push("");

  lines.push(`3. How did you first meet?`);
  lines.push(`   ${answers.q3_firstMeet ? answers.q3_firstMeet : '—'}`);
  lines.push("");

  lines.push(`4. What was your first impression of each other?`);
  lines.push(`   • ${p1}: ${answers.q4_firstImpression.partnerA || '—'}`);
  lines.push(`   • ${p2}: ${answers.q4_firstImpression.partnerB || '—'}`);
  lines.push("");

  const words = answers.q5_threeWords.filter(Boolean).join(", ");
  lines.push(`5. How would you describe yourselves as a couple in three words?`);
  lines.push(`   ${words ? words : '—'}`);
  lines.push("");

  const activities = [
    ...(answers.q6_activities.selected || []),
    answers.q6_activities.other ? `Other: ${answers.q6_activities.other}` : null,
  ].filter(Boolean).join("; ");
  lines.push(`6. What do you enjoy doing together?`);
  lines.push(`   ${activities ? activities : '—'}`);
  lines.push("");

  lines.push(`7. What do you love most about each other?`);
  lines.push(`   • ${p1}: ${answers.q7_loveMost.partnerA || '—'}`);
  lines.push(`   • ${p2}: ${answers.q7_loveMost.partnerB || '—'}`);
  lines.push("");

  lines.push(`8. Is there a funny story, inside joke, or special moment that defines your relationship?`);
  lines.push(`   ${answers.q8_funnyStory ? answers.q8_funnyStory : '—'}`);
  lines.push("");

  lines.push(`9. How did the proposal happen? (If applicable.)`);
  if (answers.q9_proposal.choice === "na") {
    lines.push(`   Not applicable`);
  } else {
    lines.push(`   ${answers.q9_proposal.story ? answers.q9_proposal.story : '—'}`);
  }
  lines.push("");

  // CHAPTER 2
  lines.push(`CHAPTER 2: YOUR PEOPLE`);
  lines.push(subDivider);
  lines.push(`10. Who are the most important people you want us to capture?`);
  const groupedPeople = getGroupedQ10People(answers.q10_people);
  const formatSideBlock = (
    heading: string,
    sideData: typeof groupedPeople.bride
  ) => {
    const hasSideContent =
      sideData.photos.length > 0 ||
      sideData.members.length > 0 ||
      Boolean(sideData.notes.trim());
    if (!hasSideContent) return;
    lines.push(`   [${heading}]:`);
    if (sideData.photos.length > 0) {
      lines.push(`     • Uploaded photos / trees: ${sideData.photos.length}`);
      sideData.photos.forEach((ph, idx) => {
        const cap = ph.caption?.trim();
        const star = ph.mustCapture ? " — [MUST CAPTURE]" : "";
        if (cap) {
          lines.push(`       - Photo ${idx + 1}: ${cap}${star}`);
        } else if (ph.mustCapture) {
          lines.push(`       - Photo ${idx + 1}${star}`);
        }
      });
    }
    sideData.members.forEach((m) => {
      lines.push(`     • ${m.name} (${m.relationship})${m.mustCapture ? " — [MUST CAPTURE]" : ""}`);
    });
    if (sideData.notes.trim()) {
      lines.push(`     • Notes: ${sideData.notes.trim()}`);
    }
  };

  if (
    !groupedPeople.hasBrideEntry &&
    !groupedPeople.hasGroomEntry &&
    groupedPeople.sharedMembers.length === 0
  ) {
    lines.push(`   (No specific individual VIP cards entered)`);
  } else {
    formatSideBlock("Bride's Side", groupedPeople.bride);
    formatSideBlock("Groom's Side", groupedPeople.groom);
    if (groupedPeople.sharedMembers.length > 0) {
      lines.push(`   [Both Sides / Mutual]:`);
      groupedPeople.sharedMembers.forEach((m) => {
        lines.push(`     • ${m.name} (${m.relationship})${m.mustCapture ? " — [MUST CAPTURE]" : ""}`);
      });
    }
  }

  if (groupedPeople.legacyTreePhotoUrl) {
    lines.push(`   • Family tree reference photo uploaded: Yes`);
  }
  if (groupedPeople.legacyTreeNotes) {
    lines.push(`   • Written notes on family: ${groupedPeople.legacyTreeNotes}`);
  }
  lines.push("");

  // CHAPTER 3
  lines.push(`CHAPTER 3: THE LOOK AND FEEL`);
  lines.push(subDivider);
  lines.push(`11. How do you want your wedding photographs and films to feel?`);
  const q11Text = Array.isArray((answers.q11_filmFeel as any)?.selected)
    ? [
        ...((answers.q11_filmFeel as any).selected || []),
        (answers.q11_filmFeel as any).other ? `Other: ${(answers.q11_filmFeel as any).other}` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : typeof answers.q11_filmFeel === "string"
    ? answers.q11_filmFeel
    : "";
  lines.push(`   ${q11Text ? q11Text : '—'}`);
  lines.push("");


  lines.push(`12. Are there any photographers, films, or Pinterest references you love?`);
  if (answers.q12_references.links?.length) {
    lines.push(`   • Links: ${answers.q12_references.links.join(", ")}`);
  }
  if (answers.q12_references.images?.length) {
    lines.push(`   • Reference screenshots/photos attached: ${answers.q12_references.images.length} images`);
  }
  if (answers.q12_references.notes) {
    lines.push(`   • Specific photographers or films mentioned: ${answers.q12_references.notes}`);
  }
  if (!answers.q12_references.links?.length && !answers.q12_references.images?.length && !answers.q12_references.notes) {
    lines.push(`   —`);
  }
  lines.push("");

  lines.push(`13. Have you finalised your wedding wardrobe? Share your outfit plans, colour preferences, and styling ideas. Knowing these details helps us plan your photography and films more thoughtfully.`);
  const groupedWardrobe = getGroupedWardrobe(answers);
  const pushWardrobeSide = (
    heading: string,
    side: typeof groupedWardrobe.bride
  ) => {
    const hasSide =
      Boolean(side.notes.trim()) ||
      side.links.length > 0 ||
      side.photos.length > 0;
    if (!hasSide) return;
    lines.push(`   [${heading}]:`);
    if (side.notes.trim()) {
      lines.push(`     • Wardrobe details: ${side.notes.trim()}`);
    }
    if (side.links.length > 0) {
      lines.push(`     • Links: ${side.links.join(", ")}`);
    }
    if (side.photos.length > 0) {
      lines.push(`     • Outfit photos/references attached: ${side.photos.length} images`);
    }
  };
  if (groupedWardrobe.legacyShared) {
    if (groupedWardrobe.legacyShared.notes.trim()) {
      lines.push(`   • Wardrobe details: ${groupedWardrobe.legacyShared.notes.trim()}`);
    }
    if (groupedWardrobe.legacyShared.links.length > 0) {
      lines.push(`   • Links: ${groupedWardrobe.legacyShared.links.join(", ")}`);
    }
    if (groupedWardrobe.legacyShared.photos.length > 0) {
      lines.push(`   • Outfit photos/references attached: ${groupedWardrobe.legacyShared.photos.length} images`);
    }
  } else if (!groupedWardrobe.hasBrideContent && !groupedWardrobe.hasGroomContent) {
    lines.push(`   —`);
  } else {
    pushWardrobeSide("Bride's wardrobe", groupedWardrobe.bride);
    pushWardrobeSide("Groom's wardrobe", groupedWardrobe.groom);
  }
  lines.push("");

  lines.push(`14. Do you have a wedding decor mood board or any visual references for your celebration?`);
  const groupedDecor = getGroupedDecorEvents(answers);
  if (!groupedDecor.hasAnyContent) {
    lines.push(`   —`);
  } else {
    for (const ev of groupedDecor.populatedEvents) {
      lines.push(`   [${ev.name}]:`);
      if (ev.links.length > 0) {
        lines.push(`     • Links: ${ev.links.join(", ")}`);
      }
      if (ev.images.length > 0) {
        lines.push(`     • Decor mood images attached: ${ev.images.length} images`);
      }
      if (ev.notes.trim()) {
        lines.push(`     • Decor & colour notes: ${ev.notes.trim()}`);
      }
    }
  }
  lines.push("");

  lines.push(`15. What tone are you expecting to set for your wedding day`);
  const q13Text = Array.isArray((answers.q13_tone as any)?.selected)
    ? [
        ...((answers.q13_tone as any).selected || []),
        (answers.q13_tone as any).other ? `Other: ${(answers.q13_tone as any).other}` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : typeof answers.q13_tone === "string"
    ? answers.q13_tone
    : "";
  lines.push(`   ${q13Text ? q13Text : '—'}`);
  lines.push("");

  // CHAPTER 4
  lines.push(`CHAPTER 4: YOUR DAY`);
  lines.push(subDivider);
  const moments = [
    ...(answers.q14_moments.selected || []),
    answers.q14_moments.other ? `Other: ${answers.q14_moments.other}` : null,
  ].filter(Boolean).join("; ");
  lines.push(`16. What are the moments you are most looking forward to during your wedding?`);
  lines.push(`   ${moments ? moments : '—'}`);
  lines.push("");

  lines.push(`17. Is there anything you definitely want us to capture or avoid?`);
  lines.push(`   • Definitely capture: ${answers.q15_captureAvoid.definitelyCapture || '—'}`);
  lines.push(`   • Please avoid: ${answers.q15_captureAvoid.pleaseAvoid || '—'}`);
  lines.push("");

  lines.push(`18. Please mention your non negotiables in your films and photographs?`);
  lines.push(`   ${answers.q16_nonNegotiables ? answers.q16_nonNegotiables : '—'}`);
  lines.push("");

  lines.push(`19. Who do you think is going to be more emotional during wedding?`);
  lines.push(`   ${answers.q17_emotional ? answers.q17_emotional : '—'}`);
  lines.push("");

  // CHAPTER 5
  lines.push(`CHAPTER 5: WORKING TOGETHER`);
  lines.push(subDivider);
  lines.push(`20. How versatile are you with the camera?`);
  lines.push(`   ${answers.q18_cameraVersatility ? answers.q18_cameraVersatility : '—'}`);
  lines.push("");

  lines.push(`21. What mattered most to you when choosing OAKS Wedding to capture your wedding?`);
  lines.push(`   ${answers.choosingOaks ? answers.choosingOaks : '—'}`);
  lines.push("");

  lines.push(`22. How comfortable are you with being guided or directed during portraits and filming?`);
  lines.push(`   ${answers.q20_guidanceComfort ? answers.q20_guidanceComfort : '—'}`);
  lines.push("");

  const comfortTips = [
    ...(answers.q21_comfortTips.selected || []),
    answers.q21_comfortTips.notes ? `Note: ${answers.q21_comfortTips.notes}` : null,
  ].filter(Boolean).join("; ");
  lines.push(`23. Is there anything that would help you feel more comfortable in front of the camera?`);
  lines.push(`   ${comfortTips ? comfortTips : '—'}`);
  lines.push("");

  lines.push(`24. What do you hope to feel when you watch your wedding film years from now?`);
  lines.push(`   ${answers.q22_futureFeeling ? answers.q22_futureFeeling : '—'}`);
  lines.push("");

  lines.push(`25. Who should be our primary point of contact for wedding-related communication and coordination?`);
  if (answers.primaryContact?.role) {
    lines.push(`   • Role: ${answers.primaryContact.role}`);
    if (answers.primaryContact.role === "Someone else") {
      if (answers.primaryContact.side) lines.push(`   • Side: ${answers.primaryContact.side}`);
      if (answers.primaryContact.designation) {
        lines.push(`   • Role designation: ${answers.primaryContact.designation}`);
      } else if (answers.primaryContact.gender) {
        lines.push(`   • Role designation: ${answers.primaryContact.gender}`);
      }
    }
    lines.push(`   • Name: ${answers.primaryContact.name || '—'}`);
    lines.push(`   • Phone / WhatsApp: ${answers.primaryContact.phone || '—'}`);
  } else {
    lines.push(`   —`);
  }
  lines.push("");

  // ONE LAST THING
  lines.push(`ONE LAST THING`);
  lines.push(subDivider);
  lines.push(`26. Last but not least, we'd love to hear your story. How did your journey begin, and what would you love us to know about the two of you?`);
  lines.push(`   ${answers.loveStoryNarrative ? answers.loveStoryNarrative : '—'}`);
  lines.push("");

  lines.push(`27. Is there anything else you'd like to let us know?`);
  lines.push(`   ${answers.q23_oneLastThing.notes ? answers.q23_oneLastThing.notes : '—'}`);
  if (answers.q23_oneLastThing.images?.length) {
    lines.push(`   • Attached photos: ${answers.q23_oneLastThing.images.length} photos`);
  }
  lines.push("");
  lines.push(divider);

  return lines.join("\n");
}
