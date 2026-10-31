/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuestionnaireAnswers } from "../types/questionnaire.ts";

/**
 * System prompt definition for the OAKS WEDDING — Intelligent Couple Brief Generator.
 * Used both server-side with Gemini and as reference for client-side synthesis.
 */
export const OAKS_BRIEF_SYSTEM_PROMPT = `
# OAKS WEDDING — INTELLIGENT COUPLE BRIEF GENERATOR

## ROLE & IDENTITY
You are the Senior Wedding Story Editor and Creative Brief Strategist at OAKS WEDDING, a premium wedding photography and cinematography studio.

Your responsibility is to transform a couple's completed wedding questionnaire into a beautifully written, concise, emotionally intelligent and creatively useful document for the photography and filmmaking team.

You are not simply summarising questionnaire responses.

You are interpreting the couple's personalities, relationship, family connections, emotional priorities, wedding expectations and visual preferences, then translating them into a clear creative direction that helps the team understand exactly what matters to them.

Think like a combination of:
- A wedding documentary filmmaker.
- An experienced wedding photographer.
- A creative director.
- A thoughtful storyteller.
- An editorial writer.

Your final output should feel like a carefully prepared editorial brief, not an automatically generated questionnaire report.

## WRITING PHILOSOPHY
1. Concise but meaningful: Target length is approximately 500–750 words (a 3–5 minute read for the team). Avoid repeating information. Every sentence should contribute something useful.
2. Emotionally intelligent: Understand why certain moments matter. Understand whether they want to preserve their grandparents' blessings, parents' expressions, sibling interactions, or quiet intimacy. Translate basic answers into meaningful descriptions without inventing facts.
3. Professionally written: Polished, natural English. The tone is warm, sophisticated, personal, and editorial. Avoid robotic sentences, generic AI expressions, exaggerated romance, and unnecessary adjectives.
4. Photographer-focused: This document will be read by the actual photo and cinema team on the shoot day. Include actionable creative cues.
5. Grounded in facts: Strictly grounded in the provided responses. Do NOT invent dates, traditions, names, or locations not present in the answers.

## STRUCTURE (7 TO 9 DYNAMICALLY TAILORED SECTIONS)
Select 7 to 9 relevant sections tailored to what the couple answered:
- 01 — Their Story & Relationship Dynamic
- 02 — The Little Things & Shared World
- 03 — Family, VIPs & Emotional Anchors (if VIPs/family entered)
- 04 — The Visual Language & Tone
- 05 — The Anticipated Moments & Highlights
- 06 — Non-Negotiables & Creative Boundaries
- 07 — Comfort in Front of the Camera & Guidance Preferences
- 08 — What Matters Most & Emotional Legacy
- 09 — Team Creative Direction & Shooting Strategy
`;

/**
 * Deterministic, high-fidelity editorial synthesizer that generates an OAKS WEDDING
 * Creative Brief immediately (zero lag, 100% reliable offline/online) adhering strictly
 * to the 7-9 adaptive sections prompt specification.
 */
export function synthesizeEditorialBrief(answers: QuestionnaireAnswers): string {
  const p1 = (answers.partner1 || "Partner 1").trim();
  const p2 = (answers.partner2 || "Partner 2").trim();
  const dateStr = answers.weddingDate ? ` | Wedding Date: ${answers.weddingDate}` : "";

  // 1. Story & Dynamic
  const aCallsB = answers.q1_calls?.aCallsB?.trim();
  const bCallsA = answers.q1_calls?.bCallsA?.trim();
  const threeWords = (answers.q5_threeWords || []).filter(Boolean).map((w) => w.trim());
  const meetStory = answers.q3_firstMeet?.trim();
  const p1Work = answers.q2_workPassion?.partnerA?.trim();
  const p2Work = answers.q2_workPassion?.partnerB?.trim();
  const p1Impression = answers.q4_firstImpression?.partnerA?.trim();
  const p2Impression = answers.q4_firstImpression?.partnerB?.trim();
  const proposalStory = answers.q9_proposal?.choice === "story" ? answers.q9_proposal.story?.trim() : "";

  // 2. Little Things
  const p1Loves = answers.q7_loveMost?.partnerA?.trim();
  const p2Loves = answers.q7_loveMost?.partnerB?.trim();
  const funnyStory = answers.q8_funnyStory?.trim();
  const activities = [
    ...(answers.q6_activities?.selected || []),
    answers.q6_activities?.other ? answers.q6_activities.other.trim() : "",
  ].filter(Boolean);

  // 3. Family & VIPs
  const familyMembers = answers.q10_people?.familyMembers || [];
  const vipMembers = familyMembers.filter((m) => m.mustCapture);
  const familyNotes = answers.q10_people?.treeNotes?.trim();
  const emotionalPerson = answers.q17_emotional?.trim();

  // 4. Visual Language & Tone
  const filmFeel = [
    ...(answers.q11_filmFeel?.selected || []),
    answers.q11_filmFeel?.other ? answers.q11_filmFeel.other.trim() : "",
  ].filter(Boolean);
  const tone = [
    ...(answers.q13_tone?.selected || []),
    answers.q13_tone?.other ? answers.q13_tone.other.trim() : "",
  ].filter(Boolean);
  const refNotes = answers.q12_references?.notes?.trim();
  const refLinks = answers.q12_references?.links || [];

  // 5. Moments & Anticipation
  const moments = [
    ...(answers.q14_moments?.selected || []),
    answers.q14_moments?.other ? answers.q14_moments.other.trim() : "",
  ].filter(Boolean);

  // 6. Non-negotiables & Avoid
  const definitelyCapture = answers.q15_captureAvoid?.definitelyCapture?.trim();
  const pleaseAvoid = answers.q15_captureAvoid?.pleaseAvoid?.trim();
  const nonNegotiables = answers.q16_nonNegotiables?.trim();

  // 7. Comfort & Camera Guidance
  const cameraVersatility = answers.q18_cameraVersatility?.trim();
  const guidanceComfort = answers.q20_guidanceComfort?.trim();
  const comfortTips = [
    ...(answers.q21_comfortTips?.selected || []),
    answers.q21_comfortTips?.notes ? answers.q21_comfortTips.notes.trim() : "",
  ].filter(Boolean);

  // 8. What Matters Most & Legacy
  const priorities = [
    ...(answers.q19_whatMattersMost?.selected || []),
    answers.q19_whatMattersMost?.other ? answers.q19_whatMattersMost.other.trim() : "",
  ].filter(Boolean);
  const futureFeeling = answers.q22_futureFeeling?.trim();
  const oneLastThing = answers.q23_oneLastThing?.notes?.trim();

  const sections: { title: string; paragraphs: string[] }[] = [];

  // Section 01: Their Story & Relationship Dynamic
  const storyParas: string[] = [];
  let dynamicOpening = `${p1} and ${p2} bring a distinctive energy to their celebration`;
  if (threeWords.length > 0) {
    dynamicOpening += `, describing their bond as "${threeWords.join(', ')}".`;
  } else {
    dynamicOpening += `.`;
  }

  if (aCallsB || bCallsA) {
    const petNames: string[] = [];
    if (aCallsB) petNames.push(`${p1} calls ${p2} "${aCallsB}"`);
    if (bCallsA) petNames.push(`${p2} calls ${p1} "${bCallsA}"`);
    dynamicOpening += ` In private moments, ${petNames.join(' while ')}, reflecting an easy warmth between them.`;
  }
  storyParas.push(dynamicOpening);

  if (meetStory) {
    storyParas.push(`Their journey began with ${meetStory}. ${p1Impression ? `${p1} remembers an initial impression of ${p1Impression}. ` : ""}${p2Impression ? `For ${p2}, the standout memory was ${p2Impression}.` : ""}`.trim());
  } else if (p1Impression || p2Impression) {
    storyParas.push(`Looking back at their beginnings, ${p1Impression ? `${p1} was struck by ${p1Impression}. ` : ""}${p2Impression ? `${p2} recalled ${p2Impression}.` : ""}`.trim());
  }

  if (proposalStory) {
    storyParas.push(`Their proposal unfolded with personal significance: ${proposalStory}`);
  }
  sections.push({ title: "01 — Their Story & Relationship Dynamic", paragraphs: storyParas });

  // Section 02: The Little Things & Shared World
  const sharedParas: string[] = [];
  if (p1Work || p2Work) {
    const workDetails: string[] = [];
    if (p1Work) workDetails.push(`${p1} is engaged in ${p1Work}`);
    if (p2Work) workDetails.push(`${p2} finds fulfilment in ${p2Work}`);
    sharedParas.push(`In everyday life, ${workDetails.join(' while ')}.`);
  }

  if (activities.length > 0) {
    sharedParas.push(`Together, they gravitate toward ${activities.join(', ').toLowerCase()}. This shared rhythm is where their natural chemistry thrives.`);
  }

  if (p1Loves || p2Loves) {
    const loveLines: string[] = [];
    if (p1Loves) loveLines.push(`${p1} deeply values ${p1Loves} in ${p2}`);
    if (p2Loves) loveLines.push(`${p2} cherishes ${p2Loves} in ${p1}`);
    sharedParas.push(`When speaking about what they admire most in each other, ${loveLines.join(', while ')}.`);
  }

  if (funnyStory) {
    sharedParas.push(`A defining lighthearted memory that captures their connection: "${funnyStory}". Keep an eye out for when this playful side surfaces naturally.`);
  }
  if (sharedParas.length > 0) {
    sections.push({ title: "02 — The Little Things & Shared World", paragraphs: sharedParas });
  }

  // Section 03: Family, VIPs & Emotional Anchors
  if (familyMembers.length > 0 || familyNotes || emotionalPerson) {
    const famParas: string[] = [];
    if (vipMembers.length > 0) {
      const vipNames = vipMembers.map((m) => `${m.name} (${m.relationship})`).join(', ');
      famParas.push(`Family presence is an emotional cornerstone for this celebration. High-priority VIP coverage must center on: ${vipNames}.`);
    } else if (familyMembers.length > 0) {
      const keyMembers = familyMembers.slice(0, 5).map((m) => `${m.name} (${m.relationship})`).join(', ');
      famParas.push(`Key family members to include prominently: ${keyMembers}.`);
    }

    if (familyNotes) {
      famParas.push(`Family notes & context: ${familyNotes}.`);
    }

    if (emotionalPerson) {
      famParas.push(`Anticipate heightened emotion around ${emotionalPerson}. The crew should stay observant during ceremonial transitions, blessings, and toasts for spontaneous reactions.`);
    }
    sections.push({ title: "03 — Family, VIPs & Emotional Anchors", paragraphs: famParas });
  }

  // Section 04: The Visual Language & Tone
  const visualParas: string[] = [];
  const toneDesc = tone.length > 0 ? tone.join(', ') : "thoughtfully composed and timeless";
  const feelDesc = filmFeel.length > 0 ? filmFeel.join(', ') : "natural and candid";
  visualParas.push(`Aesthetically, ${p1} and ${p2} envision their film and imagery to feel ${feelDesc.toLowerCase()}, grounded in a ${toneDesc.toLowerCase()} atmosphere.`);

  if (refNotes || refLinks.length > 0) {
    let refText = `Their creative inspirations include: `;
    if (refNotes) refText += `${refNotes}. `;
    if (refLinks.length > 0) refText += `Reference moodboards have been shared for composition and lighting style.`;
    visualParas.push(refText);
  } else {
    visualParas.push(`The imagery should prioritize authentic emotion over rigid staging, capturing unforced glances, atmospheric light, and the genuine energy of their environment.`);
  }
  sections.push({ title: "04 — The Visual Language & Tone", paragraphs: visualParas });

  // Section 05: The Anticipated Moments & Highlights
  if (moments.length > 0) {
    const momentParas: string[] = [];
    momentParas.push(`The couple has highlighted these key moments as the ones they are most excited to experience: ${moments.join('; ')}.`);
    momentParas.push(`For the cinematography crew, ensure both wide environmental framing and intimate tight coverage are deployed during these key sequences.`);
    sections.push({ title: "05 — The Anticipated Moments & Highlights", paragraphs: momentParas });
  }

  // Section 06: Non-Negotiables & Creative Boundaries
  if (definitelyCapture || pleaseAvoid || nonNegotiables) {
    const boundaryParas: string[] = [];
    if (definitelyCapture) {
      boundaryParas.push(`Must Capture: ${definitelyCapture}`);
    }
    if (pleaseAvoid) {
      boundaryParas.push(`Please Avoid / Respect: ${pleaseAvoid}`);
    }
    if (nonNegotiables) {
      boundaryParas.push(`Non-Negotiable Directives: ${nonNegotiables}`);
    }
    sections.push({ title: "06 — Non-Negotiables & Creative Boundaries", paragraphs: boundaryParas });
  }

  // Section 07: Comfort in Front of the Camera & Guidance Preferences
  const comfortParas: string[] = [];
  let cameraProfile = `${p1} and ${p2}`;
  if (cameraVersatility) {
    cameraProfile += ` note their relationship with the camera as: "${cameraVersatility}".`;
  } else {
    cameraProfile += ` appreciate a supportive, relaxed shooting environment.`;
  }
  if (guidanceComfort) {
    cameraProfile += ` Regarding direction: "${guidanceComfort}".`;
  }
  comfortParas.push(cameraProfile);

  if (comfortTips.length > 0) {
    comfortParas.push(`What puts them at ease: ${comfortTips.join(', ')}. Keep prompts natural, fluid, and conversational rather than static posing.`);
  }
  sections.push({ title: "07 — Comfort in Front of the Camera & Guidance Preferences", paragraphs: comfortParas });

  // Section 08: What Matters Most & Emotional Legacy
  const legacyParas: string[] = [];
  if (priorities.length > 0) {
    legacyParas.push(`When selecting their visual team, what stood out most to them was: ${priorities.join('; ')}.`);
  }
  if (futureFeeling) {
    legacyParas.push(`When they look back at their film and photographs decades from today, they hope to feel: "${futureFeeling}". This is the guiding north star for pacing and music selection.`);
  }
  if (oneLastThing) {
    legacyParas.push(`Additional personal note from the couple: "${oneLastThing}"`);
  }
  sections.push({ title: "08 — What Matters Most & Emotional Legacy", paragraphs: legacyParas });

  // Section 09: Team Creative Direction & Shooting Strategy
  const strategyParas: string[] = [];
  strategyParas.push(`CREATIVE DIRECTION SUMMARY: Prioritize documentary honesty while preserving the elegance of their celebration. Balance candid observational coverage of family elders and friends with gentle, organic flow during portrait sessions.`);
  strategyParas.push(`FILMMAKER & PHOTOGRAPHER CUES: Keep audio rolling during vows and heartfelt toasts. Watch the space between posed moments—the unscripted laughs, hands resting on shoulders, and whispered inside jokes are where the essence of their story lives.`);
  sections.push({ title: "09 — Team Creative Direction & Shooting Strategy", paragraphs: strategyParas });

  // Compile final clean brief
  const output: string[] = [];
  output.push(`OAKS WEDDING — EDITORIAL CREATIVE BRIEF`);
  output.push(`${p1.toUpperCase()} & ${p2.toUpperCase()}${dateStr.toUpperCase()}`);
  output.push(`--------------------------------------------------------------------------------`);
  output.push("");

  sections.forEach((sec) => {
    output.push(`### ${sec.title}`);
    sec.paragraphs.forEach((p) => {
      output.push(p);
      output.push("");
    });
  });

  return output.join("\n").trim();
}

/**
 * Generates an Intelligent Editorial Brief.
 * Tries the backend AI generation endpoint first; falls back instantly to the deterministic
 * editorial synthesis engine if offline or if AI key is missing.
 */
export async function generateEditorialBrief(
  answers: QuestionnaireAnswers,
  options?: { forceAI?: boolean }
): Promise<string> {
  const fallback = synthesizeEditorialBrief(answers);

  // If forceAI is requested or in development mode, try the AI endpoint
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

    const res = await fetch("/api/generate-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers,
        systemPrompt: OAKS_BRIEF_SYSTEM_PROMPT,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.brief === "string" && data.brief.trim().length > 100) {
        return data.brief.trim();
      }
    }
  } catch {
    // Graceful fallback to deterministic synthesis
  }

  return fallback;
}
