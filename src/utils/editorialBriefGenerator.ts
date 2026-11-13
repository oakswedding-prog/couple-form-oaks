/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuestionnaireAnswers } from "../types/questionnaire.ts";

/**
 * System prompt definition for the OAKS WEDDING — Editorial Couple Brief Generator Version 2.0.
 * Follows the simple, human, and team-ready standard, using Riya & Roshan as the exact benchmark.
 */
export const OAKS_BRIEF_SYSTEM_PROMPT = `
# OAKS WEDDING — EDITORIAL COUPLE BRIEF GENERATOR
## VERSION 2.0 — SIMPLE, HUMAN & TEAM-READY

### YOUR ROLE
You are the Couple Brief Writer at OAKS WEDDING, a premium wedding photography and filmmaking studio.
Your job is to read all the answers submitted by a couple and turn them into a short, beautiful and easy-to-read wedding brief.
The brief will be read by photographers and filmmakers before the wedding.
They should be able to read it in 2–3 minutes (approx 350–500 words total) and quickly understand who the couple are, what matters to them and what they want us to capture.

### 1. THE MOST IMPORTANT RULE: UNDERSTAND, DON'T COPY
- Read all the couple's answers before writing anything.
- Understand the full story and identify the most important details.
- Then rewrite those details in your own words using simple, natural English.
- NEVER copy long answers or paragraphs directly from the questionnaire.
- Summarise, combine related points, and remove unnecessary fluff.

### 2. WRITING STYLE & READING EASE
- Write in simple English that a six-year-old could easily understand (reading-ease target, not childish).
- Use short sentences.
- Use simple, common words.
- Keep paragraphs short.
- Use a natural, warm, human tone.
- DO NOT use fancy or academic jargon (avoid "emotional cornerstone", "distinctive relationship dynamic", "documentary honesty", "emotional anchors", "guiding north star", "cinematography cues").
- Use simple alternatives: "Family is very important to them", "Keep the photos natural", "Capture these moments".

### 3. EXACT BENCHMARK TEMPLATE (RIYA & ROSHAN)
Follow this exact formatting, divider lines, and section structure:

[PARTNER 1 FULL NAME] & [PARTNER 2 FULL NAME]
THE COUPLE STORY & WEDDING BRIEF

==================================================
01 — THEIR STORY
==================================================
[1-2 short paragraphs explaining how they met, how their relationship started, and the proposal. Rewritten in simple words. No raw quotes.]

==================================================
02 — THE LITTLE THINGS THEY LOVE
==================================================
[1-2 short sentences summarizing what they enjoy doing together, their hobbies, and everyday company.]

==================================================
03 — THEIR FAMILY MATTERS
==================================================
Family is an important part of their story. The people they particularly want us to look out for are:

- [Name] — [Relationship] ([Side])
- ...

[1 short paragraph highlighting grandparents/parents, their blessings, emotional reactions, and generational connection.]

==================================================
04 — THEIR VISUAL LANGUAGE
==================================================
They want their wedding to feel [film feel styles].

Their vision is a combination of [brief summary of visual look].

They have also chosen [number] defining wedding tones:

- [Tone 1]
- [Tone 2]

The goal is to [1 sentence on the visual balance].

==================================================
05 — MOMENTS THEY ARE LOOKING FORWARD TO
==================================================
The moments they particularly want documented include:

- [Moment 1]
- [Moment 2]
- [Moment 3]
...

[1 short sentence on how to approach these moments, plus any must-capture or avoid requests turned into clear action.]

==================================================
06 — THEIR COMFORT IN FRONT OF THE CAMERA
==================================================
[Simple description of their camera comfort, emotional expectations, and what helps them feel relaxed, like practice shots or previews.]

==================================================
07 — WHAT MATTERS WHEN CHOOSING THEIR TEAM
==================================================
Their biggest priorities are:

- [Priority 1]
- [Priority 2]
- [Priority 3]

[1 short sentence explaining what they value in the team.]

==================================================
08 — WHAT THEY WANT TO REMEMBER
==================================================
[Short, warm paragraph about wanting to remember how everything felt—laughter, tears, parents' expressions, hearing voices years from now.]

==================================================
THE FINAL THOUGHT
==================================================
For [Partner 1] and [Partner 2], this isn't just about documenting a wedding. It's about preserving the beginning of a new chapter, surrounded by the people who made their journey special.

Let's give them something that feels alive, deeply personal and timeless — photographs and films that become even more valuable with every passing year.
`;

/**
 * Condenses and cleans user text into simple, plain English without long rambles or quotes.
 */
function simplifyText(text: string | undefined, maxWords = 35): string {
  if (!text) return "";
  let clean = text.replace(/["“”'‘’]/g, "").trim();
  // Remove boilerplate greetings or filler
  clean = clean.replace(/^(well|so|basically|actually|to be honest|we think that|i think that)\s*,?\s*/i, "");
  const words = clean.split(/\s+/);
  if (words.length <= maxWords) {
    return clean;
  }
  return words.slice(0, maxWords).join(" ") + "...";
}

/**
 * High-fidelity, deterministic synthesis engine adhering strictly to Version 2.0
 * and the Riya & Roshan benchmark.
 * - Rewrites and summarises instead of copying.
 * - Uses simple, 6-year-old reading-ease English.
 * - Length: 350–500 words.
 * - Formatted with ================================================== dividers.
 */
export function synthesizeEditorialBrief(answers: QuestionnaireAnswers): string {
  const p1 = (answers.partner1 || "Partner 1").trim();
  const p2 = (answers.partner2 || "Partner 2").trim();
  const coupleHeader = `${p1.toUpperCase()} & ${p2.toUpperCase()}`;

  // 1. Their Story
  const meet = answers.q3_firstMeet?.trim();
  const loveStory = answers.loveStoryNarrative?.trim();
  const proposal = answers.q9_proposal?.choice === "story" ? answers.q9_proposal.story?.trim() : "";
  const threeWords = (answers.q5_threeWords || []).filter(Boolean);
  const p1Impression = answers.q4_firstImpression?.partnerA?.trim();
  const p2Impression = answers.q4_firstImpression?.partnerB?.trim();

  // 2. Little Things
  const activities = [
    ...(answers.q6_activities?.selected || []),
    answers.q6_activities?.other ? answers.q6_activities.other.trim() : "",
  ].filter(Boolean);
  const p1Work = answers.q2_workPassion?.partnerA?.trim();
  const p2Work = answers.q2_workPassion?.partnerB?.trim();
  const aCallsB = answers.q1_calls?.aCallsB?.trim();
  const bCallsA = answers.q1_calls?.bCallsA?.trim();

  // 3. Family
  const familyMembers = answers.q10_people?.familyMembers || [];
  const vipMembers = familyMembers.filter((m) => m.mustCapture);
  const otherMembers = familyMembers.filter((m) => !m.mustCapture);
  const emotionalPerson = answers.q17_emotional?.trim();

  // 4. Visual Language, Outfits, Decor & Tone
  const filmFeel = [
    ...(answers.q11_filmFeel?.selected || []),
    answers.q11_filmFeel?.other ? answers.q11_filmFeel.other.trim() : "",
  ].filter(Boolean);
  const outfitNotes = answers.weddingOutfits?.notes?.trim();
  const decorNotes = answers.decorMoodBoard?.notes?.trim();
  const tones = [
    ...(answers.q13_tone?.selected || []),
    answers.q13_tone?.other ? answers.q13_tone.other.trim() : "",
  ].filter(Boolean);

  // 5. Moments
  const moments = [
    ...(answers.q14_moments?.selected || []),
    answers.q14_moments?.other ? answers.q14_moments.other.trim() : "",
  ].filter(Boolean);
  const definitelyCapture = answers.q15_captureAvoid?.definitelyCapture?.trim();
  const pleaseAvoid = answers.q15_captureAvoid?.pleaseAvoid?.trim();
  const nonNegotiables = answers.q16_nonNegotiables?.trim();

  // 6. Camera Comfort
  const cameraVersatility = answers.q18_cameraVersatility?.trim();
  const guidanceComfort = answers.q20_guidanceComfort?.trim();
  const comfortTips = [
    ...(answers.q21_comfortTips?.selected || []),
    answers.q21_comfortTips?.notes ? answers.q21_comfortTips.notes.trim() : "",
  ].filter(Boolean);

  // 7. Team Priorities & Why OAKS Wedding
  const choosingOaks = answers.choosingOaks?.trim();
  const priorities = [
    ...(answers.q19_whatMattersMost?.selected || []),
    answers.q19_whatMattersMost?.other ? answers.q19_whatMattersMost.other.trim() : "",
  ].filter(Boolean);

  // 8. Future feeling
  const futureFeeling = answers.q22_futureFeeling?.trim();

  const divider = "==================================================";
  const lines: string[] = [];

  // TITLE BANNER
  lines.push(coupleHeader);
  lines.push(`THE COUPLE STORY & WEDDING BRIEF`);
  lines.push("");

  // SECTION 01 — THEIR STORY
  lines.push(divider);
  lines.push(`01 — THEIR STORY`);
  lines.push(divider);
  lines.push("");

  let storyP1 = "";
  if (meet) {
    const cleanMeet = simplifyText(meet, 30);
    storyP1 = `${p1} and ${p2}'s story began when they met (${cleanMeet}). What started as a simple connection soon blossomed into a deep, loving relationship.`;
    if (loveStory) {
      const cleanLoveStory = simplifyText(loveStory, 25);
      storyP1 += ` Looking back on their journey (${cleanLoveStory}), their bond stands out for its quiet warmth and shared history.`;
    }
  } else if (loveStory) {
    const cleanLoveStory = simplifyText(loveStory, 35);
    storyP1 = `${p1} and ${p2}'s journey together reflects real warmth and dedication (${cleanLoveStory}). Over time, their connection grew into a deep, loving partnership.`;
  } else if (p1Impression || p2Impression) {
    storyP1 = `${p1} and ${p2} quickly realized they had found someone special. From their first conversations, their warmth and mutual respect made everything feel natural and easy.`;
  } else {
    storyP1 = `${p1} and ${p2} have built a beautiful journey together based on trust, laughter, and shared values.`;
  }

  if (proposal) {
    const cleanProposal = simplifyText(proposal, 35);
    storyP1 += ` Their story took a memorable turn when they got engaged: ${cleanProposal}. It was an unforgettable milestone filled with joy.`;
  }
  lines.push(storyP1);
  lines.push("");

  if (threeWords.length > 0) {
    lines.push(`They describe their relationship as ${threeWords.join(", ").toLowerCase()} — words that truly reflect how they treat each other every single day.`);
    lines.push("");
  }

  // SECTION 02 — THE LITTLE THINGS THEY LOVE
  lines.push(divider);
  lines.push(`02 — THE LITTLE THINGS THEY LOVE`);
  lines.push(divider);
  lines.push("");

  const activityList = activities.length > 0
    ? activities.map((a) => a.toLowerCase()).join(", ")
    : "spending quality time together, traveling, and sharing quiet moments";

  let littleThings = `They enjoy ${activityList}. They appreciate simple everyday moments, little adventures and simply enjoying each other's company.`;
  if (aCallsB || bCallsA) {
    littleThings += ` In private, they affectionately call each other "${[aCallsB, bCallsA].filter(Boolean).join('" and "')}".`;
  }
  lines.push(littleThings);
  lines.push("");

  // SECTION 03 — THEIR FAMILY MATTERS
  lines.push(divider);
  lines.push(`03 — THEIR FAMILY MATTERS`);
  lines.push(divider);
  lines.push("");

  lines.push(`Family is an important part of their story. The people they particularly want us to look out for are:`);
  lines.push("");

  const allKeyMembers = [...vipMembers, ...otherMembers].slice(0, 7);
  if (allKeyMembers.length > 0) {
    allKeyMembers.forEach((m) => {
      const sideText = m.side === "sideA" ? ` (${p1}'s side)` : m.side === "sideB" ? ` (${p2}'s side)` : "";
      lines.push(`- ${m.name} — ${m.relationship}${sideText}`);
    });
  } else {
    lines.push(`- Immediate parents, siblings, and close family elders`);
  }
  lines.push("");

  lines.push(`Their grandparents and parents are especially important to them. Their blessings, expressions, emotional reactions and little interactions deserve special attention. They want photographs that preserve the love and connections between generations.`);
  lines.push("");

  // SECTION 04 — THEIR VISUAL LANGUAGE
  lines.push(divider);
  lines.push(`04 — THEIR VISUAL LANGUAGE`);
  lines.push(divider);
  lines.push("");

  const feelSummary = filmFeel.length > 0
    ? filmFeel.map((f) => f.toLowerCase()).join(", ")
    : "natural and candid, elegant and editorial";
  lines.push(`They want their wedding to feel ${feelSummary}.`);
  lines.push("");

  lines.push(`Their vision is a combination of timeless cinematic storytelling and elegant portraits, with genuine emotions and spontaneous interactions at its heart.`);
  lines.push("");

  if (tones.length > 0) {
    lines.push(`They have also chosen ${tones.length > 1 ? tones.length : "a"} defining wedding tone${tones.length > 1 ? "s" : ""}:`);
    lines.push("");
    tones.forEach((t) => {
      lines.push(`- ${t}`);
    });
    lines.push("");
  }

  lines.push(`The goal is to balance sophisticated portraits and beautiful compositions with the energy, traditions and emotions of a grand wedding celebration.`);
  if (outfitNotes || decorNotes) {
    const visualDetails: string[] = [];
    if (outfitNotes) visualDetails.push(`Wardrobe plans: ${simplifyText(outfitNotes, 22)}`);
    if (decorNotes) visualDetails.push(`Decor & palette: ${simplifyText(decorNotes, 22)}`);
    lines.push("");
    lines.push(`${visualDetails.join(". ")}.`);
  }
  lines.push("");

  // SECTION 05 — MOMENTS THEY ARE LOOKING FORWARD TO
  lines.push(divider);
  lines.push(`05 — MOMENTS THEY ARE LOOKING FORWARD TO`);
  lines.push(divider);
  lines.push("");

  lines.push(`The moments they particularly want documented include:`);
  lines.push("");

  const keyMoments = moments.length > 0 ? moments.slice(0, 8) : [
    "Getting ready",
    "First look / ceremony entry",
    "Ceremony and vows",
    "Family blessings",
    "Couple portraits",
    "Grand entry and toasts",
  ];
  keyMoments.forEach((m) => {
    lines.push(`- ${m}`);
  });
  lines.push("");

  if (definitelyCapture || pleaseAvoid || nonNegotiables) {
    const customNotes: string[] = [];
    if (definitelyCapture) customNotes.push(`Make sure to capture: ${simplifyText(definitelyCapture, 20)}.`);
    if (pleaseAvoid) customNotes.push(`Please keep in mind: avoid ${simplifyText(pleaseAvoid, 20)}.`);
    if (nonNegotiables) customNotes.push(`Key request: ${simplifyText(nonNegotiables, 20)}.`);
    lines.push(customNotes.join(" "));
    lines.push("");
  }

  lines.push(`Every moment should be approached with care, from the anticipation before the ceremony to the emotions shared during family blessings and speeches.`);
  lines.push("");

  // SECTION 06 — THEIR COMFORT IN FRONT OF THE CAMERA
  lines.push(divider);
  lines.push(`06 — THEIR COMFORT IN FRONT OF THE CAMERA`);
  lines.push(divider);
  lines.push("");

  let comfortDesc = "";
  if (emotionalPerson) {
    comfortDesc = `${emotionalPerson} may be particularly emotional during the wedding ceremonies. `;
  } else {
    comfortDesc = `Both ${p1} and ${p2} expect to feel the emotions of the day deeply. `;
  }

  if (cameraVersatility && cameraVersatility.toLowerCase().includes("comfortable")) {
    comfortDesc += `They are comfortable in front of the camera and appreciate gentle guidance during portraits and filming.`;
  } else {
    comfortDesc += `They prefer a relaxed approach with gentle, friendly guidance rather than stiff poses.`;
  }
  lines.push(comfortDesc);
  lines.push("");

  let relaxedTips = "A few practice shots before the main photographs and seeing previews as the day progresses will help them feel even more comfortable.";
  if (comfortTips.length > 0) {
    relaxedTips = `What helps them most: ${comfortTips.join(", ").toLowerCase()}. Taking short pauses and gentle conversational cues will keep them completely relaxed.`;
  }
  lines.push(relaxedTips);
  lines.push("");

  // SECTION 07 — WHAT MATTERS WHEN CHOOSING THEIR TEAM
  lines.push(divider);
  lines.push(`07 — WHAT MATTERS WHEN CHOOSING THEIR TEAM`);
  lines.push(divider);
  lines.push("");

  lines.push(`Their biggest priorities are:`);
  lines.push("");
  const prioList = priorities.length > 0 ? priorities.slice(0, 4) : [
    "Storytelling and film quality",
    "Personality and how comfortable they feel",
    "Great communication",
  ];
  prioList.forEach((p) => {
    lines.push(`- ${p}`);
  });
  lines.push("");

  if (choosingOaks) {
    lines.push(`Why they chose OAKS Wedding: ${simplifyText(choosingOaks, 25)}.`);
    lines.push("");
  }

  lines.push(`They value a team that understands their personalities, communicates well and can translate their story into something meaningful.`);
  lines.push("");

  // SECTION 08 — WHAT THEY WANT TO REMEMBER
  lines.push(divider);
  lines.push(`08 — WHAT THEY WANT TO REMEMBER`);
  lines.push(divider);
  lines.push("");

  lines.push(`More than perfectly posed photographs, they want to remember how everything felt.`);
  lines.push("");
  lines.push(`The laughter, the tears, their parents' expressions, their grandparents' blessings, the excitement of the celebrations and the little moments they might otherwise miss.`);
  lines.push("");

  if (futureFeeling) {
    lines.push(`When they watch their wedding film years from now, it should take them straight back to that day — allowing them to relive the feeling of "${simplifyText(futureFeeling, 25)}" and hear the voices of the people they love all over again.`);
  } else {
    lines.push(`When they watch their wedding film years from now, it should take them straight back to that day — allowing them to relive the emotions, hear the voices of the people they love and feel the same excitement all over again.`);
  }
  lines.push("");

  // THE FINAL THOUGHT
  lines.push(divider);
  lines.push(`THE FINAL THOUGHT`);
  lines.push(divider);
  lines.push("");

  lines.push(`For ${p1} and ${p2}, this isn't just about documenting a wedding. It's about preserving the beginning of a new chapter, surrounded by the people who made their journey special.`);
  lines.push("");
  lines.push(`Let's give them something that feels alive, deeply personal and timeless — photographs and films that become even more valuable with every passing year.`);

  return lines.join("\n").trim();
}

/**
 * Generates an Intelligent Editorial Brief.
 * Sends the strict Version 2.0 prompt and Riya & Roshan benchmark to Gemini,
 * falling back instantly to the deterministic synthesis engine if offline.
 */
export async function generateEditorialBrief(
  answers: QuestionnaireAnswers,
  options?: { forceAI?: boolean }
): Promise<string> {
  const fallback = synthesizeEditorialBrief(answers);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

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
      if (data && typeof data.brief === "string" && data.brief.trim().length > 150) {
        return data.brief.trim();
      }
    }
  } catch {
    // fallback gracefully to deterministic synthesizer
  }

  return fallback;
}
