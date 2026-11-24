/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuestionnaireAnswers } from "../types/questionnaire.ts";
import { cleanSentenceText } from "./textCleaner.ts";
import { getGroupedQ10People } from "./familyPeople.ts";
import { getGroupedWardrobe } from "./wardrobe.ts";
import { getGroupedDecorEvents } from "./decorEvents.ts";
import {
  getLabelledOverlayDisplay,
  hasSplitOverlayAnswers,
  OverlayFieldKey,
} from "./splitModeHelpers.ts";

export const OAKS_BRIEF_SYSTEM_PROMPT = `
# OAKS WEDDING — EDITORIAL CREATIVE BRIEF GENERATOR
## ALL 27 QUESTIONS · QUICK-REFERENCE SUMMARY

### YOUR ROLE
You are the Creative Brief Editor at OAKS WEDDING, a premium wedding photography and filmmaking studio.
Your job is to produce a crisp, fast-reading reference brief covering **ALL 27 questions** from the couple's questionnaire in their exact original order, grouped under the **6 questionnaire chapters**.
The photography and cinematography crew should be able to scan all 27 answers in just a few minutes without reading long raw paragraphs.

### STRICT RULES
1. **Include all 27 questions (Q01 through Q27)** in the exact chapter order below. Never skip or merge questions.
2. **Do not reproduce lengthy original paragraphs verbatim.** Convert long responses (e.g. 150–250+ words) into **2–4 short, meaningful bullet points** capturing exact facts, names, relationships, emotions, venues, preferences, and instructions while stripping repetition, greetings, and filler.
3. **Keep short answers equally short.** If an answer is already brief (one name, phrase, or short sentence), summarise it in **1 short bullet point** — never pad or expand it.
4. **If a question is unanswered**, output strictly: \`- Not provided\`
5. **Zero assumptions.** Never invent, guess, or extrapolate details the couple did not provide.
6. **Simple, clear English** readable at a glance by the photography and film crew.

### EXACT OUTPUT STRUCTURE
Start with:
[PARTNER 1 FULL NAME] & [PARTNER 2 FULL NAME]
EDITORIAL CREATIVE BRIEF — ALL 27 QUESTIONS

Then use these exact 6 chapter blocks separated by \`==================================================\`:

==================================================
CHAPTER 1 — YOUR STORY (Q1–Q9)
==================================================
Q01. What do you call each other?
Q02. What do you both do for a living and what are you truly passionate about?
Q03. How did you first meet?
Q04. What was your first impression of each other?
Q05. How would you describe yourselves as a couple in three words?
Q06. What do you enjoy doing together?
Q07. What do you love most about each other?
Q08. Is there a funny story, inside joke, or special moment that defines your relationship?
Q09. How did the proposal happen?

==================================================
CHAPTER 2 — YOUR PEOPLE (Q10)
==================================================
Q10. Who are the most important people you want us to capture?

==================================================
CHAPTER 3 — THE LOOK AND FEEL (Q11–Q15)
==================================================
Q11. How do you want your wedding photographs and films to feel?
Q12. Are there any photographers, films, or Pinterest references you love?
Q13. Have you finalised your wedding wardrobe? Share your outfit plans, colour preferences, and styling ideas. Knowing these details helps us plan your photography and films more thoughtfully.
Q14. Do you have a wedding decor mood board or visual references?
Q15. What tone are you expecting to set for your wedding day?

==================================================
CHAPTER 4 — YOUR DAY (Q16–Q19)
==================================================
Q16. What are the moments you are most looking forward to?
Q17. Is there anything you definitely want us to capture or avoid?
Q18. What are your non-negotiables in your films and photographs?
Q19. Who do you think is going to be more emotional during the wedding?

==================================================
CHAPTER 5 — WORKING TOGETHER (Q20–Q25)
==================================================
Q20. How versatile are you with the camera?
Q21. What mattered most when choosing OAKS Wedding?
Q22. How comfortable are you with being guided or directed during portraits and filming?
Q23. Is there anything that would help you feel more comfortable in front of the camera?
Q24. What do you hope to feel when you watch your wedding film years from now?
Q25. Who should be our primary point of contact?

==================================================
CHAPTER 6 — ONE LAST THING (Q26–Q27)
==================================================
Q26. What is your story and journey together?
Q27. Is there anything else you would like us to know?
`;

const CHAPTER_DIVIDER = "==================================================";

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "they", "them", "were",
  "have", "been", "very", "just", "really", "actually", "basically", "about",
  "when", "where", "which", "what", "there", "their", "then", "also", "into",
  "our", "your", "both", "each", "other", "more", "some", "would", "could",
  "like", "feel", "felt", "made", "make", "much", "such", "than", "over",
]);

function stripFillerPrefixes(raw: string): string {
  return raw
    .replace(/^(well|so|basically|actually|honestly|to be honest|truthfully|seriously|you know|i think that|we think that|i feel like|we feel like|we would say that|just wanted to say that|to be fair|in short|overall)[,\s]+/i, "")
    .replace(/\b(in order to)\b/gi, "to")
    .replace(/\b(due to the fact that)\b/gi, "because")
    .replace(/\b(at the end of the day)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimSentenceToMaxWords(sentence: string, maxWords: number): string {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return sentence;
  const slice = words.slice(0, maxWords).join(" ").replace(/[,;:\-]+$/, "");
  return `${slice}…`;
}

function tokenSet(sentence: string): Set<string> {
  const tokens = sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(tokens);
}

function isNearDuplicate(a: string, b: string): boolean {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 || setB.size === 0) {
    return a.toLowerCase() === b.toLowerCase();
  }
  let intersection = 0;
  for (const tok of setA) {
    if (setB.has(tok)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 && intersection / union >= 0.58;
}

function scoreSentenceInformation(sentence: string): number {
  let score = 0;
  // Proper nouns / names / places mid-sentence
  const midCapitals = sentence.slice(1).match(/\b[A-Z][a-z]{2,}\b/g);
  if (midCapitals) score += midCapitals.length * 2;
  // Numbers / dates / durations
  if (/\d/.test(sentence)) score += 2;
  // Key wedding/production signals
  if (
    /\b(avoid|never|must|always|prefer|want|love|emotional|tears|parents|grandparents|audio|vows|candid|surprise|song|entry|dance|outfit|decor|palette|proposal|met|college|school|friend|family)\b/i.test(
      sentence
    )
  ) {
    score += 3;
  }
  const wordCount = sentence.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 5 && wordCount <= 26) score += 2;
  return score;
}

/**
 * Summarises raw text cleanly:
 * - Short single answers (<= 22 words, single sentence) remain 1 concise bullet without inflation.
 * - Lengthy narratives are distilled into 2–4 concise, non-redundant bullet points
 *   preserving names, specifics, preferences, and emotions.
 */
export function summarizeToPoints(
  rawText: string | undefined,
  options?: { maxBullets?: number; maxWordsPerBullet?: number }
): string[] {
  if (!rawText) return [];
  const normalized = stripFillerPrefixes(
    cleanSentenceText(rawText.replace(/["“”]/g, ""))
  );
  if (!normalized) return [];

  const maxBullets = options?.maxBullets ?? 4;
  const maxWordsPerBullet = options?.maxWordsPerBullet ?? 24;

  // Split into meaningful clauses/sentences
  const rawSegments = normalized
    .split(/(?<=[.!?])\s+|\n+|;\s+/)
    .map((seg) => stripFillerPrefixes(seg).replace(/^[•\-–—*\d.)\s]+/, "").trim())
    .filter((seg) => seg.length > 1);

  if (rawSegments.length === 0) return [];

  const totalWords = normalized.split(/\s+/).filter(Boolean).length;

  // Short answers stay concise in 1 bullet
  if (rawSegments.length === 1 && totalWords <= 22) {
    return [rawSegments[0].replace(/\.$/, "")];
  }

  // If a single long run-on sentence (> 26 words), split by comma/conjunction clauses cleanly
  let candidates = rawSegments;
  if (rawSegments.length === 1 && totalWords > 26) {
    const clauseParts = rawSegments[0]
      .split(/,\s+(?=(?:and|but|so|then|also|while|because|where)\s)/i)
      .map((part) => part.replace(/^(?:and|but|so|then|also)\s+/i, "").trim())
      .filter((part) => part.split(/\s+/).filter(Boolean).length >= 3);
    if (clauseParts.length >= 2) {
      candidates = clauseParts;
    }
  }

  // Deduplicate repeated thoughts
  const unique: string[] = [];
  for (const cand of candidates) {
    if (!unique.some((existing) => isNearDuplicate(existing, cand))) {
      unique.push(cand);
    }
  }

  if (unique.length <= maxBullets) {
    return unique.map((item) => trimSentenceToMaxWords(item.replace(/\.$/, ""), maxWordsPerBullet));
  }

  // Score by information density while retaining chronological order
  const rankedIndices = unique
    .map((text, idx) => ({ idx, score: scoreSentenceInformation(text) + (idx === 0 ? 1 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxBullets)
    .map((entry) => entry.idx)
    .sort((a, b) => a - b);

  return rankedIndices.map((idx) =>
    trimSentenceToMaxWords(unique[idx].replace(/\.$/, ""), maxWordsPerBullet)
  );
}

function formatPartnerPairSummary(
  p1: string,
  valA: string | undefined,
  p2: string,
  valB: string | undefined
): string[] {
  const bullets: string[] = [];
  const ptsA = summarizeToPoints(valA, { maxBullets: 2, maxWordsPerBullet: 22 });
  const ptsB = summarizeToPoints(valB, { maxBullets: 2, maxWordsPerBullet: 22 });

  if (ptsA.length === 1) {
    bullets.push(`${p1}: ${ptsA[0]}`);
  } else if (ptsA.length > 1) {
    bullets.push(`${p1}: ${ptsA[0]}`);
    for (let i = 1; i < ptsA.length; i++) {
      bullets.push(`${p1} (cont.): ${ptsA[i]}`);
    }
  }

  if (ptsB.length === 1) {
    bullets.push(`${p2}: ${ptsB[0]}`);
  } else if (ptsB.length > 1) {
    bullets.push(`${p2}: ${ptsB[0]}`);
    for (let i = 1; i < ptsB.length; i++) {
      bullets.push(`${p2} (cont.): ${ptsB[i]}`);
    }
  }

  return bullets;
}

function summarizeMediaAndNotes(
  media: { links?: string[]; images?: string[]; notes?: string } | undefined,
  labelPrefix: string
): string[] {
  if (!media) return [];
  const bullets: string[] = [];
  const links = (media.links || []).map((l) => l.trim()).filter(Boolean);
  const images = (media.images || []).filter(Boolean);
  const notePts = summarizeToPoints(media.notes, { maxBullets: 3, maxWordsPerBullet: 22 });

  for (const pt of notePts) {
    bullets.push(pt);
  }
  if (links.length > 0) {
    const domains = links.map((link) => {
      try {
        return new URL(link).hostname.replace(/^www\./, "");
      } catch {
        return link;
      }
    });
    bullets.push(`${labelPrefix} links (${links.length}): ${domains.slice(0, 3).join(", ")}${links.length > 3 ? ` +${links.length - 3} more` : ""}`);
  }
  if (images.length > 0) {
    bullets.push(`Uploaded reference image${images.length > 1 ? "s" : ""}: ${images.length}`);
  }
  return bullets;
}

function summarizeSelectionsAndNotes(
  selected: string[] | undefined,
  notes: string | undefined,
  notePrefix?: string
): string[] {
  const cleanSelected = (selected || []).map((s) => s.trim()).filter(Boolean);
  const notePts = summarizeToPoints(notes, { maxBullets: 2, maxWordsPerBullet: 22 });
  const bullets: string[] = [];

  if (cleanSelected.length > 0) {
    bullets.push(cleanSelected.join(", "));
  }
  for (const pt of notePts) {
    bullets.push(notePrefix ? `${notePrefix}: ${pt}` : pt);
  }
  return bullets;
}

function pushQuestion(lines: string[], code: string, question: string, bullets: string[]): void {
  lines.push(`${code}. ${question}`);
  if (bullets.length === 0) {
    lines.push(`- Not provided`);
  } else {
    for (const b of bullets) {
      lines.push(`- ${b}`);
    }
  }
  lines.push("");
}

/**
 * Deterministic 27-question Editorial Creative Brief synthesizer.
 * Covers all 27 questionnaire questions in exact original order, grouped across the 6 chapters.
 */
export function synthesizeEditorialBrief(answers: QuestionnaireAnswers): string {
  const p1 = (answers.partner1 || "Partner 1").trim();
  const p2 = (answers.partner2 || "Partner 2").trim();
  const coupleHeader = `${p1.toUpperCase()} & ${p2.toUpperCase()}`;

  const lines: string[] = [];
  lines.push(coupleHeader);
  lines.push("EDITORIAL CREATIVE BRIEF — ALL 27 QUESTIONS");
  lines.push("");

  const buildSplitOrLegacyBullets = (
    key: OverlayFieldKey,
    legacyBullets: string[]
  ): string[] => {
    const disp = getLabelledOverlayDisplay(answers, key);
    if (!disp.isSplit) return legacyBullets;
    return formatPartnerPairSummary(
      disp.partnerALabel,
      disp.partnerAValue,
      disp.partnerBLabel,
      disp.partnerBValue
    );
  };

  // CHAPTER 1: YOUR STORY (Q1–Q9)
  lines.push(CHAPTER_DIVIDER);
  lines.push("CHAPTER 1 — YOUR STORY (Q1–Q9)");
  lines.push(CHAPTER_DIVIDER);
  lines.push("");

  // Q01
  const q1Bullets: string[] = [];
  const aCallsB = answers.q1_calls?.aCallsB?.trim();
  const bCallsA = answers.q1_calls?.bCallsA?.trim();
  if (aCallsB) q1Bullets.push(`${p1} calls ${p2}: ${aCallsB}`);
  if (bCallsA) q1Bullets.push(`${p2} calls ${p1}: ${bCallsA}`);
  if (answers.couplePhotoUrl?.trim()) q1Bullets.push("Couple photo uploaded");
  pushQuestion(lines, "Q01", "What do you call each other?", q1Bullets);

  // Q02
  const q2Bullets = formatPartnerPairSummary(
    p1,
    answers.q2_workPassion?.partnerA,
    p2,
    answers.q2_workPassion?.partnerB
  );
  pushQuestion(
    lines,
    "Q02",
    "What do you both do for a living and what are you truly passionate about?",
    q2Bullets
  );

  // Q03
  pushQuestion(
    lines,
    "Q03",
    "How did you first meet?",
    summarizeToPoints(answers.q3_firstMeet, { maxBullets: 4, maxWordsPerBullet: 24 })
  );

  // Q04
  pushQuestion(
    lines,
    "Q04",
    "What was your first impression of each other?",
    formatPartnerPairSummary(
      p1,
      answers.q4_firstImpression?.partnerA,
      p2,
      answers.q4_firstImpression?.partnerB
    )
  );

  // Q05
  const threeWords = (answers.q5_threeWords || []).map((w) => w.trim()).filter(Boolean);
  pushQuestion(
    lines,
    "Q05",
    "How would you describe yourselves as a couple in three words?",
    threeWords.length > 0 ? [threeWords.join(" · ")] : []
  );

  // Q06
  pushQuestion(
    lines,
    "Q06",
    "What do you enjoy doing together?",
    summarizeSelectionsAndNotes(answers.q6_activities?.selected, answers.q6_activities?.other, "Also")
  );

  // Q07
  pushQuestion(
    lines,
    "Q07",
    "What do you love most about each other?",
    formatPartnerPairSummary(
      p1,
      answers.q7_loveMost?.partnerA,
      p2,
      answers.q7_loveMost?.partnerB
    )
  );

  // Q08
  pushQuestion(
    lines,
    "Q08",
    "Is there a funny story, inside joke, or special moment that defines your relationship?",
    summarizeToPoints(answers.q8_funnyStory, { maxBullets: 4, maxWordsPerBullet: 24 })
  );

  // Q09
  const q9Bullets: string[] = [];
  if (answers.q9_proposal?.choice === "na") {
    q9Bullets.push("Not applicable — decided together without a formal proposal");
  } else if (answers.q9_proposal?.story?.trim()) {
    q9Bullets.push(
      ...summarizeToPoints(answers.q9_proposal.story, { maxBullets: 4, maxWordsPerBullet: 24 })
    );
  } else if (answers.q9_proposal?.choice === "story") {
    q9Bullets.push("Proposal story selected (details not provided)");
  }
  pushQuestion(lines, "Q09", "How did the proposal happen?", q9Bullets);

  // CHAPTER 2: YOUR PEOPLE (Q10)
  lines.push(CHAPTER_DIVIDER);
  lines.push("CHAPTER 2 — YOUR PEOPLE (Q10)");
  lines.push(CHAPTER_DIVIDER);
  lines.push("");

  const q10Bullets: string[] = [];
  const groupedPeople = getGroupedQ10People(answers.q10_people);

  const appendSideBullets = (
    sideTitle: string,
    sideData: typeof groupedPeople.bride
  ) => {
    const sortedSideMembers = [...sideData.members].sort(
      (a, b) => Number(Boolean(b.mustCapture)) - Number(Boolean(a.mustCapture))
    );
    for (const m of sortedSideMembers.slice(0, 8)) {
      const mustFlag = m.mustCapture ? " · Must capture" : "";
      q10Bullets.push(`${sideTitle}: ${m.name} — ${m.relationship}${mustFlag}`);
    }
    if (sideData.photos.length > 0) {
      const captioned = sideData.photos
        .map((ph) => ph.caption?.trim())
        .filter((c): c is string => Boolean(c));
      if (captioned.length > 0) {
        q10Bullets.push(
          `${sideTitle} photos (${sideData.photos.length}): ${captioned.slice(0, 5).join(", ")}`
        );
      } else {
        q10Bullets.push(
          `${sideTitle}: ${sideData.photos.length} family tree / VIP ${sideData.photos.length === 1 ? "photo" : "photos"} uploaded`
        );
      }
    }
    const sideNotes = summarizeToPoints(sideData.notes, {
      maxBullets: 2,
      maxWordsPerBullet: 24,
    });
    for (const note of sideNotes) {
      q10Bullets.push(`${sideTitle} note: ${note}`);
    }
  };

  appendSideBullets("Bride's Side", groupedPeople.bride);
  appendSideBullets("Groom's Side", groupedPeople.groom);

  for (const m of groupedPeople.sharedMembers.slice(0, 6)) {
    const mustFlag = m.mustCapture ? " · Must capture" : "";
    q10Bullets.push(`Both sides: ${m.name} — ${m.relationship}${mustFlag}`);
  }

  const treeNotes = summarizeToPoints(groupedPeople.legacyTreeNotes, {
    maxBullets: 2,
    maxWordsPerBullet: 24,
  });
  for (const note of treeNotes) {
    q10Bullets.push(`Family note: ${note}`);
  }
  if (groupedPeople.legacyTreePhotoUrl) {
    q10Bullets.push("Family tree reference photo uploaded");
  }
  pushQuestion(
    lines,
    "Q10",
    "Who are the most important people you want us to capture?",
    q10Bullets
  );

  // CHAPTER 3: THE LOOK AND FEEL (Q11–Q15)
  lines.push(CHAPTER_DIVIDER);
  lines.push("CHAPTER 3 — THE LOOK AND FEEL (Q11–Q15)");
  lines.push(CHAPTER_DIVIDER);
  lines.push("");

  // Q11
  pushQuestion(
    lines,
    "Q11",
    "How do you want your wedding photographs and films to feel?",
    buildSplitOrLegacyBullets(
      "q11_filmFeel",
      summarizeSelectionsAndNotes(answers.q11_filmFeel?.selected, answers.q11_filmFeel?.other, "Note")
    )
  );

  // Q12
  pushQuestion(
    lines,
    "Q12",
    "Are there any photographers, films, or Pinterest references you love?",
    summarizeMediaAndNotes(answers.q12_references, "Reference")
  );

  // Q13
  const groupedWardrobe = getGroupedWardrobe(answers);
  const q13Bullets: string[] = [];
  const appendWardrobeBullets = (
    heading: string,
    side: typeof groupedWardrobe.bride
  ) => {
    const notePts = summarizeToPoints(side.notes, {
      maxBullets: 3,
      maxWordsPerBullet: 24,
    });
    for (const pt of notePts) {
      q13Bullets.push(`${heading}: ${pt}`);
    }
    if (side.links.length > 0) {
      q13Bullets.push(`${heading} links: ${side.links.slice(0, 3).join(", ")}`);
    }
    if (side.photos.length > 0) {
      q13Bullets.push(
        `${heading}: ${side.photos.length} reference ${side.photos.length === 1 ? "photo" : "photos"} uploaded`
      );
    }
  };
  if (groupedWardrobe.legacyShared) {
    q13Bullets.push(...summarizeMediaAndNotes(answers.weddingOutfits, "Outfit"));
  } else {
    appendWardrobeBullets("Bride's wardrobe", groupedWardrobe.bride);
    appendWardrobeBullets("Groom's wardrobe", groupedWardrobe.groom);
  }
  pushQuestion(
    lines,
    "Q13",
    "Have you finalised your wedding wardrobe? Share your outfit plans, colour preferences, and styling ideas. Knowing these details helps us plan your photography and films more thoughtfully.",
    q13Bullets
  );

  // Q14
  const groupedDecor = getGroupedDecorEvents(answers);
  const q14Bullets: string[] = [];
  for (const ev of groupedDecor.populatedEvents) {
    if (ev.links.length > 0) {
      q14Bullets.push(`${ev.name} links: ${ev.links.slice(0, 3).join(", ")}`);
    }
    if (ev.images.length > 0) {
      q14Bullets.push(
        `${ev.name}: ${ev.images.length} mood board ${ev.images.length === 1 ? "image" : "images"} uploaded`
      );
    }
    const notePts = summarizeToPoints(ev.notes, {
      maxBullets: 3,
      maxWordsPerBullet: 24,
    });
    for (const pt of notePts) {
      q14Bullets.push(`${ev.name}: ${pt}`);
    }
  }
  pushQuestion(
    lines,
    "Q14",
    "Do you have a wedding decor mood board or visual references?",
    q14Bullets
  );

  // Q15
  pushQuestion(
    lines,
    "Q15",
    "What tone are you expecting to set for your wedding day?",
    buildSplitOrLegacyBullets(
      "q13_tone",
      summarizeSelectionsAndNotes(answers.q13_tone?.selected, answers.q13_tone?.other, "Note")
    )
  );

  // CHAPTER 4: YOUR DAY (Q16–Q19)
  lines.push(CHAPTER_DIVIDER);
  lines.push("CHAPTER 4 — YOUR DAY (Q16–Q19)");
  lines.push(CHAPTER_DIVIDER);
  lines.push("");

  // Q16
  pushQuestion(
    lines,
    "Q16",
    "What are the moments you are most looking forward to?",
    buildSplitOrLegacyBullets(
      "q14_moments",
      summarizeSelectionsAndNotes(answers.q14_moments?.selected, answers.q14_moments?.other, "Custom")
    )
  );

  // Q17
  const q17Bullets: string[] = [];
  if (hasSplitOverlayAnswers(answers, "q15_captureAvoid")) {
    const a = answers.partnerAnswers?.partnerA?.q15_captureAvoid;
    const b = answers.partnerAnswers?.partnerB?.q15_captureAvoid;
    for (const c of summarizeToPoints(a?.definitelyCapture, { maxBullets: 2, maxWordsPerBullet: 24 })) {
      q17Bullets.push(`${p1} — Definitely capture: ${c}`);
    }
    for (const c of summarizeToPoints(b?.definitelyCapture, { maxBullets: 2, maxWordsPerBullet: 24 })) {
      q17Bullets.push(`${p2} — Definitely capture: ${c}`);
    }
    for (const av of summarizeToPoints(a?.pleaseAvoid, { maxBullets: 2, maxWordsPerBullet: 24 })) {
      q17Bullets.push(`${p1} — Please avoid: ${av}`);
    }
    for (const av of summarizeToPoints(b?.pleaseAvoid, { maxBullets: 2, maxWordsPerBullet: 24 })) {
      q17Bullets.push(`${p2} — Please avoid: ${av}`);
    }
  } else {
    const capPts = summarizeToPoints(answers.q15_captureAvoid?.definitelyCapture, {
      maxBullets: 2,
      maxWordsPerBullet: 24,
    });
    const avoidPts = summarizeToPoints(answers.q15_captureAvoid?.pleaseAvoid, {
      maxBullets: 2,
      maxWordsPerBullet: 24,
    });
    for (const c of capPts) q17Bullets.push(`Definitely capture: ${c}`);
    for (const a of avoidPts) q17Bullets.push(`Please avoid: ${a}`);
  }
  pushQuestion(
    lines,
    "Q17",
    "Is there anything you definitely want us to capture or avoid?",
    q17Bullets
  );

  // Q18
  pushQuestion(
    lines,
    "Q18",
    "What are your non-negotiables in your films and photographs?",
    buildSplitOrLegacyBullets(
      "q16_nonNegotiables",
      summarizeToPoints(answers.q16_nonNegotiables, { maxBullets: 4, maxWordsPerBullet: 24 })
    )
  );

  // Q19
  pushQuestion(
    lines,
    "Q19",
    "Who do you think is going to be more emotional during the wedding?",
    buildSplitOrLegacyBullets(
      "q17_emotional",
      summarizeToPoints(answers.q17_emotional, { maxBullets: 2, maxWordsPerBullet: 20 })
    )
  );

  // CHAPTER 5: WORKING TOGETHER (Q20–Q25)
  lines.push(CHAPTER_DIVIDER);
  lines.push("CHAPTER 5 — WORKING TOGETHER (Q20–Q25)");
  lines.push(CHAPTER_DIVIDER);
  lines.push("");

  // Q20
  pushQuestion(
    lines,
    "Q20",
    "How versatile are you with the camera?",
    buildSplitOrLegacyBullets(
      "q18_cameraVersatility",
      summarizeToPoints(answers.q18_cameraVersatility, { maxBullets: 2, maxWordsPerBullet: 20 })
    )
  );

  // Q21
  pushQuestion(
    lines,
    "Q21",
    "What mattered most when choosing OAKS Wedding?",
    buildSplitOrLegacyBullets(
      "choosingOaks",
      summarizeToPoints(answers.choosingOaks, { maxBullets: 4, maxWordsPerBullet: 24 })
    )
  );

  // Q22
  pushQuestion(
    lines,
    "Q22",
    "How comfortable are you with being guided or directed during portraits and filming?",
    buildSplitOrLegacyBullets(
      "q20_guidanceComfort",
      summarizeToPoints(answers.q20_guidanceComfort, { maxBullets: 2, maxWordsPerBullet: 20 })
    )
  );

  // Q23
  pushQuestion(
    lines,
    "Q23",
    "Is there anything that would help you feel more comfortable in front of the camera?",
    buildSplitOrLegacyBullets(
      "q21_comfortTips",
      summarizeSelectionsAndNotes(
        answers.q21_comfortTips?.selected,
        answers.q21_comfortTips?.notes,
        "Note"
      )
    )
  );

  // Q24
  pushQuestion(
    lines,
    "Q24",
    "What do you hope to feel when you watch your wedding film years from now?",
    buildSplitOrLegacyBullets(
      "q22_futureFeeling",
      summarizeToPoints(answers.q22_futureFeeling, { maxBullets: 3, maxWordsPerBullet: 24 })
    )
  );

  // Q25
  const q25Bullets: string[] = [];
  const pc = answers.primaryContact;
  if (pc && (pc.role || pc.name || pc.phone)) {
    const roleParts = [pc.role, pc.side, pc.designation || pc.gender].filter(Boolean);
    if (roleParts.length > 0) {
      q25Bullets.push(`Role: ${roleParts.join(" · ")}`);
    }
    const contactLine = [pc.name, pc.phone].filter(Boolean).join(" · ");
    if (contactLine) {
      q25Bullets.push(`Contact: ${contactLine}`);
    }
  }
  pushQuestion(
    lines,
    "Q25",
    "Who should be our primary point of contact?",
    q25Bullets
  );

  // CHAPTER 6: ONE LAST THING (Q26–Q27)
  lines.push(CHAPTER_DIVIDER);
  lines.push("CHAPTER 6 — ONE LAST THING (Q26–Q27)");
  lines.push(CHAPTER_DIVIDER);
  lines.push("");

  // Q26
  pushQuestion(
    lines,
    "Q26",
    "What is your story and journey together?",
    summarizeToPoints(answers.loveStoryNarrative, { maxBullets: 4, maxWordsPerBullet: 24 })
  );

  // Q27
  let q27Bullets: string[];
  if (hasSplitOverlayAnswers(answers, "q23_oneLastThing")) {
    const a = answers.partnerAnswers?.partnerA?.q23_oneLastThing;
    const b = answers.partnerAnswers?.partnerB?.q23_oneLastThing;
    q27Bullets = formatPartnerPairSummary(p1, a?.notes, p2, b?.notes);
    const aImgs = (a?.images || []).filter(Boolean);
    const bImgs = (b?.images || []).filter(Boolean);
    if (aImgs.length > 0) {
      q27Bullets.push(`${p1}: ${aImgs.length} parting image${aImgs.length > 1 ? "s" : ""} uploaded`);
    }
    if (bImgs.length > 0) {
      q27Bullets.push(`${p2}: ${bImgs.length} parting image${bImgs.length > 1 ? "s" : ""} uploaded`);
    }
  } else {
    q27Bullets = summarizeToPoints(answers.q23_oneLastThing?.notes, {
      maxBullets: 4,
      maxWordsPerBullet: 24,
    });
    const q27Images = (answers.q23_oneLastThing?.images || []).filter(Boolean);
    if (q27Images.length > 0) {
      q27Bullets.push(`Uploaded parting image${q27Images.length > 1 ? "s" : ""}: ${q27Images.length}`);
    }
  }
  pushQuestion(
    lines,
    "Q27",
    "Is there anything else you would like us to know?",
    q27Bullets
  );

  return lines.join("\n").trim();
}

/**
 * Checks whether a saved Editorial Brief uses an older format (v1, 8-section v2, or pre-Q22-removal 28-question format)
 * instead of the complete 27-question format.
 */
export function isOutdatedEditorialBrief(briefText?: string): boolean {
  if (!briefText || !briefText.trim()) return true;
  if (
    briefText.includes("bring a distinctive energy") ||
    briefText.includes("CREATIVE DIRECTION SUMMARY") ||
    briefText.includes("Their proposal unfolded with personal significance") ||
    briefText.includes("01 — THEIR STORY") ||
    briefText.includes("ALL 28 QUESTIONS") ||
    briefText.includes("Q22. What matters most when choosing")
  ) {
    return true;
  }
  const questionMatches = briefText.match(/^Q\d{2}\.\s+/gm) || [];
  return questionMatches.length < 27;
}

export interface ParsedBriefQuestion {
  code: string;
  question: string;
  bullets: string[];
  isNotProvided: boolean;
}

export interface ParsedBriefChapter {
  title: string;
  questions: ParsedBriefQuestion[];
  rawBody: string;
}

/**
 * Parses either the 6-chapter 27-question brief or arbitrary edited brief sections
 * for structured rendering in EditorialBriefView.
 */
export function parseEditorialBriefDocument(text: string): ParsedBriefChapter[] {
  const sections: { title: string; body: string }[] = [];

  if (text.includes("====")) {
    const pattern = /={20,}\s*\n([^\n]+)\n\s*={20,}/g;
    const titles: { title: string; index: number; length: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      titles.push({
        title: m[1].trim(),
        index: m.index,
        length: m[0].length,
      });
    }

    for (let i = 0; i < titles.length; i++) {
      const cur = titles[i];
      const nextIndex = i + 1 < titles.length ? titles[i + 1].index : text.length;
      const body = text.substring(cur.index + cur.length, nextIndex).trim();
      sections.push({ title: cur.title, body });
    }
  } else {
    const rawSections = text.split(/(?=###\s+)/);
    for (const chunk of rawSections) {
      const match = chunk.match(/###\s+(.+)\n([\s\S]*)/);
      if (match) {
        sections.push({ title: match[1].trim(), body: match[2].trim() });
      }
    }
  }

  return sections.map((sec) => {
    const questions: ParsedBriefQuestion[] = [];
    const lines = sec.body.split("\n");
    let currentQ: ParsedBriefQuestion | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const qMatch = line.match(/^(Q\d{2})\.\s+(.+)$/);
      if (qMatch) {
        if (currentQ) {
          currentQ.isNotProvided =
            currentQ.bullets.length === 0 ||
            (currentQ.bullets.length === 1 &&
              currentQ.bullets[0].toLowerCase() === "not provided");
          questions.push(currentQ);
        }
        currentQ = {
          code: qMatch[1],
          question: qMatch[2].trim(),
          bullets: [],
          isNotProvided: false,
        };
      } else if (currentQ) {
        const cleanedBullet = line.replace(/^[-•*]\s*/, "").trim();
        if (cleanedBullet) {
          currentQ.bullets.push(cleanedBullet);
        }
      }
    }

    if (currentQ) {
      currentQ.isNotProvided =
        currentQ.bullets.length === 0 ||
        (currentQ.bullets.length === 1 &&
          currentQ.bullets[0].toLowerCase() === "not provided");
      questions.push(currentQ);
    }

    return {
      title: sec.title,
      questions,
      rawBody: sec.body,
    };
  });
}

/**
 * Generates an Intelligent 27-Question Editorial Brief.
 * Sends the 27-question prompt to Gemini (/api/generate-brief),
 * verifying all 27 questions are present and falling back gracefully to the deterministic engine.
 */
export async function generateEditorialBrief(
  answers: QuestionnaireAnswers,
  _options?: { forceAI?: boolean }
): Promise<string> {
  const fallback = synthesizeEditorialBrief(answers);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

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
      if (
        data &&
        typeof data.brief === "string" &&
        data.brief.trim().length > 300 &&
        !isOutdatedEditorialBrief(data.brief)
      ) {
        return data.brief.trim();
      }
    }
  } catch {
    // fallback gracefully to deterministic 27-question synthesizer
  }

  return fallback;
}
