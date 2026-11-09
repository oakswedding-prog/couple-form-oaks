/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { QuestionnaireAnswers } from "../types/questionnaire.ts";
import { cleanSentenceText as cleanUserText } from "./textCleaner.ts";

/**
 * Master system prompt for the Couple Letter Generator.
 * Enforces warm, human, client-facing English, the Ajin & Siya quality benchmark,
 * 400–650 word count, zero question numbers, and accurate reflection of answers.
 */
export const OAKS_COUPLE_LETTER_SYSTEM_PROMPT = `# OAKS WEDDING — THE COUPLE LETTER GENERATOR
## MASTER INSTRUCTIONS: OUR UNDERSTANDING OF YOUR WEDDING

You are the Creative Director and Studio Owner at OAKS WEDDING, a premium wedding photography and cinematography studio.

### 1. YOUR OBJECTIVE
Write a warm, deeply personalised, client-facing letter to the couple based on all 23 answers they submitted in their wedding questionnaire.

The purpose of this letter is to communicate that OAKS Wedding has carefully read, understood and appreciated their personalities, preferences, wedding vision, expectations, and camera comfort, and to explain how our team intends to approach their wedding based on what they shared.

This letter will be reviewed by our studio team and sent directly to the couple via WhatsApp or Email after they complete the questionnaire.

### 2. THE QUALITY BENCHMARK (AJIN & SIYA REFERENCE)
Study the following reference letter created for Ajin & Siya. Emulate its natural paragraph flow, warmth, simplicity, and level of personalization:

---
AJIN & SIYA
OUR UNDERSTANDING OF YOUR WEDDING

Hi Ajin & Siya,

Thank you for taking the time to share your answers with us. We've gone through your responses, and we'd love to share what we've understood about you as a couple and how we'd like to approach your wedding photography and films.


YOUR STORY & PERSONALITY

From what you've shared, you describe yourselves as playful, funny and grounded. You first connected through Instagram, and while Ajin's first impression of Siya was that she was cute, Siya remembers Ajin as someone passionate.

You both have your own creative interests, with Ajin passionate about photography and Siya interested in editing. It's lovely to see creativity being a part of both your worlds.

You call each other Dudu and Dude, and those little details are part of what makes your relationship yours.


THE WAY YOU WANT YOUR WEDDING TO FEEL

We understand that you want a combination of natural, candid moments, emotional and intimate storytelling, elegant editorial photographs, and the fun energy of a wedding celebration.

Your preferred wedding atmosphere is Romantic & Intimate, along with Fun & Vibrant.

Our approach will be to balance these elements throughout the day — capturing genuine interactions and emotions while also creating beautiful portraits and carefully composed frames that feel natural to you.


THE MOMENTS WE'LL LOOK FORWARD TO

You've mentioned several moments you're especially excited about:

* Getting ready
* Your first look or first glance
* The ceremony and vows
* Family blessings
* Couple portraits
* Grand entry

We'll give these moments the attention they deserve while also looking out for the spontaneous interactions and little details that happen around them.


MAKING YOU FEEL COMFORTABLE

We understand that being in front of the camera may feel a little uncomfortable, especially since you've mentioned being very camera-shy.

That's completely fine. We won't expect you to be comfortable immediately or force you into poses. We'll take time to get to know you, keep things relaxed and offer gentle guidance whenever needed.

Since chatting with the photographer beforehand would help you feel more comfortable, we'd love to arrange that before the wedding. It will give us a chance to get familiar with each other before the cameras come out.


WHAT MATTERS TO YOU

We understand that the two things you value most when choosing your photography and filmmaking team are their style and artistry, along with storytelling and film quality.

We'll keep these priorities in mind as we approach your wedding, focusing on creating photographs and films that feel thoughtfully composed, personal and meaningful.


OUR FINAL THOUGHT

Ajin and Siya, we want your wedding photographs and films to feel like a reflection of who you are together — playful, funny and grounded.

Our aim is to give you space to enjoy your day while we take care of the moments, emotions and memories along the way.

We're looking forward to being a part of your celebration and creating something meaningful for you both.

With love,
Team OAKS Wedding
---

### 3. WRITING RULES & CONSTRAINTS
1. Tone: Warm, personal, professional, conversational, reassuring, human English.
2. Voice: Written as a thoughtful, senior creative lead who genuinely listened to them.
3. NEVER mention question numbers or refer to "the questionnaire" ("In question 4 you said...").
4. NEVER invent details, relationships, proposal stories, or facts not provided by the couple.
5. If a question is unanswered, simply omit it naturally. Do not write awkward sentences about what they skipped.
6. Target length: approximately 400–650 words.
7. Keep paragraphs short (2–4 lines max), easy to read on mobile.
8. Distinguish between what the couple wants and what OAKS proposes to do.
9. End with:
With love,
Team OAKS Wedding`;

export interface CoupleLetterSection {
  title?: string;
  paragraphs: string[];
  bulletPoints?: string[];
}

export interface CoupleLetterDocument {
  title: string;
  subtitle: string;
  coupleNames: string;
  salutation: string;
  openingText: string;
  sections: CoupleLetterSection[];
  finalThought: string;
  signOff: string;
  detailsToConfirm?: string[];
  rawText: string;
}

/**
 * Deterministic local synthesis for The Couple Letter.
 * Produces a warm, beautifully personalized letter matching the Ajin & Siya benchmark,
 * ensuring instant 0ms generation and full offline reliability.
 */
export function synthesizeCoupleLetter(
  answers: QuestionnaireAnswers,
  _studioName: string = "OAKS Wedding"
): string {
  const p1 = (answers.partner1 || "Partner 1").trim();
  const p2 = (answers.partner2 || "Partner 2").trim();
  const coupleNames = `${p1} & ${p2}`;

  const lines: string[] = [];

  // Title & Header
  lines.push(`${p1.toUpperCase()} & ${p2.toUpperCase()}`);
  lines.push("OUR UNDERSTANDING OF YOUR WEDDING");
  lines.push("");

  // Salutation & Opening
  lines.push(`Hi ${p1} & ${p2},`);
  lines.push("");
  lines.push(
    `Thank you for taking the time to share your answers with us. We've gone through your responses, and we'd love to share what we've understood about you as a couple and how we'd like to approach your wedding photography and films.`
  );
  lines.push("");

  // SECTION 1: YOUR STORY & PERSONALITY
  lines.push("YOUR STORY & PERSONALITY");
  lines.push("");

  const threeWords = (answers.q5_threeWords || []).filter(Boolean).map((w) => w.toLowerCase().trim());
  const wordsDesc =
    threeWords.length > 0
      ? threeWords.length === 1
        ? threeWords[0]
        : threeWords.length === 2
        ? `${threeWords[0]} and ${threeWords[1]}`
        : `${threeWords[0]}, ${threeWords[1]} and ${threeWords[2]}`
      : "";

  const firstMeet = cleanUserText(answers.q3_firstMeet || "");
  const p1Imp = cleanUserText(answers.q4_firstImpression?.partnerA || "");
  const p2Imp = cleanUserText(answers.q4_firstImpression?.partnerB || "");

  let personalityPara = "";
  if (wordsDesc) {
    personalityPara += `From what you've shared, you describe yourselves as ${wordsDesc}. `;
  }
  if (firstMeet) {
    personalityPara += `You first met ${firstMeet.replace(/\.$/, "")}, `;
    if (p1Imp && p2Imp) {
      personalityPara += `and while ${p1}'s first impression of ${p2} was that ${p1Imp.replace(/^[Tt]hat\s+/, "")}, ${p2} remembers ${p1} as ${p2Imp.replace(/^[Tt]hat\s+/, "")}.`;
    } else if (p1Imp || p2Imp) {
      const imp = p1Imp || p2Imp;
      personalityPara += `with memorable first impressions that set the tone for your bond.`;
    } else {
      personalityPara += `and your connection has grown naturally ever since.`;
    }
  } else if (p1Imp || p2Imp) {
    if (p1Imp && p2Imp) {
      personalityPara += `Looking back to when you first met, ${p1} remembers ${p2} as ${p1Imp}, while ${p2}'s first impression of ${p1} was ${p2Imp}.`;
    } else {
      personalityPara += `Your early impressions of each other were thoughtful and set the tone for your connection.`;
    }
  } else if (wordsDesc) {
    personalityPara += `That grounded, genuine dynamic is something we can immediately feel across your answers.`;
  }

  if (personalityPara.trim()) {
    lines.push(personalityPara.trim());
    lines.push("");
  }

  // Work & Passions / Nicknames
  const p1Work = cleanUserText(answers.q2_workPassion?.partnerA || "");
  const p2Work = cleanUserText(answers.q2_workPassion?.partnerB || "");
  if (p1Work || p2Work) {
    if (p1Work && p2Work) {
      lines.push(
        `You both have your own distinct interests and passions, with ${p1} focused on ${p1Work} and ${p2} engaged in ${p2Work}. It's lovely to see how your individual pursuits complement your shared world.`
      );
    } else {
      const work = p1Work || p2Work;
      lines.push(
        `You bring a rich mix of personal passions to your relationship, including ${work}, which adds depth and individuality to your story.`
      );
    }
    lines.push("");
  }

  const aCallsB = (answers.q1_calls?.aCallsB || "").trim();
  const bCallsA = (answers.q1_calls?.bCallsA || "").trim();
  if (aCallsB || bCallsA) {
    if (aCallsB && bCallsA) {
      lines.push(
        `You call each other ${aCallsB} and ${bCallsA}, and those little details are part of what makes your relationship yours.`
      );
    } else {
      const nick = aCallsB || bCallsA;
      lines.push(
        `With everyday nicknames like "${nick}," it's clear there's an easy, affectionate comfort between you.`
      );
    }
    lines.push("");
  }

  // SECTION 2: THE WAY YOU WANT YOUR WEDDING TO FEEL
  lines.push("THE WAY YOU WANT YOUR WEDDING TO FEEL");
  lines.push("");

  const filmFeelSelected = Array.isArray((answers.q11_filmFeel as any)?.selected)
    ? (answers.q11_filmFeel as any).selected
    : typeof answers.q11_filmFeel === "string" && answers.q11_filmFeel
    ? [answers.q11_filmFeel]
    : [];

  const feelSummary =
    filmFeelSelected.length > 0
      ? filmFeelSelected.slice(0, 4).join(", ").toLowerCase()
      : "natural, candid moments alongside timeless, emotional storytelling";

  lines.push(
    `We understand that you want a combination of ${feelSummary}.`
  );
  lines.push("");

  const dayToneSelected = Array.isArray((answers.q13_tone as any)?.selected)
    ? (answers.q13_tone as any).selected
    : typeof answers.q13_tone === "string" && answers.q13_tone
    ? [answers.q13_tone]
    : [];

  if (dayToneSelected.length > 0) {
    lines.push(
      `Your preferred wedding atmosphere is ${dayToneSelected.join(" along with ")}.`
    );
    lines.push("");
  }

  lines.push(
    `Our approach will be to balance these elements throughout the day — capturing genuine interactions and emotions while also creating beautiful portraits and carefully composed frames that feel natural to you.`
  );
  lines.push("");

  // SECTION 3: THE MOMENTS WE'LL LOOK FORWARD TO
  lines.push("THE MOMENTS WE'LL LOOK FORWARD TO");
  lines.push("");

  const moments = answers.q14_moments?.selected || [];
  if (moments.length > 0) {
    lines.push("You've mentioned several moments you're especially excited about:");
    lines.push("");
    moments.forEach((m) => {
      lines.push(`* ${m}`);
    });
    lines.push("");
    lines.push(
      `We'll give these moments the attention they deserve while also looking out for the spontaneous interactions and little details that happen around them.`
    );
  } else {
    lines.push(
      `From the intimacy of getting ready to your ceremony, vows, family blessings and couple portraits, we'll give each key chapter the attention it deserves while looking out for the spontaneous interactions and little details that happen around them.`
    );
  }
  lines.push("");

  // Important Family/People (if mentioned)
  const familyList = answers.q10_people?.familyMembers || [];
  const mustCaptureFamily = familyList.filter((m) => m.mustCapture);
  if (mustCaptureFamily.length > 0) {
    const names = mustCaptureFamily.map((m) => `${m.name} (${m.relationship})`).join(", ");
    lines.push(
      `We've also noted the VIP family members and loved ones who mean the world to you — including ${names}. We will make sure they are prominently and warmly documented throughout the celebrations.`
    );
    lines.push("");
  } else if (familyList.length > 0) {
    const sampleNames = familyList.slice(0, 3).map((m) => m.name).join(", ");
    lines.push(
      `We've also noted your close family members (${sampleNames}) and will ensure your parents, siblings and inner circle feel celebrated in the coverage.`
    );
    lines.push("");
  }

  // SECTION 4: MAKING YOU FEEL COMFORTABLE
  lines.push("MAKING YOU FEEL COMFORTABLE");
  lines.push("");

  const cameraComfort = cleanUserText(answers.q18_cameraVersatility || "");
  const guidanceComfort = cleanUserText(answers.q20_guidanceComfort || "");
  const comfortTips = answers.q21_comfortTips?.selected || [];
  const comfortNotes = cleanUserText(answers.q21_comfortTips?.notes || "");

  const isCameraShy =
    cameraComfort.toLowerCase().includes("shy") ||
    cameraComfort.toLowerCase().includes("nervous") ||
    cameraComfort.toLowerCase().includes("awkward") ||
    cameraComfort.toLowerCase().includes("uncomfortable");

  if (isCameraShy) {
    lines.push(
      `We understand that being in front of the camera may feel a little unfamiliar or camera-shy at first.`
    );
  } else {
    lines.push(
      `We understand how important it is for camera coverage to feel effortless, relaxed and never forced.`
    );
  }
  lines.push("");

  lines.push(
    `That's completely fine. We won't expect you to pose stiffly or feel self-conscious. We'll take time to keep things relaxed, blend into the background, and offer gentle, natural direction whenever you need it.`
  );
  lines.push("");

  if (comfortTips.length > 0 || comfortNotes) {
    const tipPhrases = comfortTips.map((t) => t.toLowerCase());
    if (tipPhrases.some((t) => t.includes("chat") || t.includes("beforehand") || t.includes("coffee"))) {
      lines.push(
        `Since chatting beforehand would help you feel more comfortable, we'd love to arrange a pre-wedding call or coffee before the celebrations. It will give us a chance to get familiar with each other before the cameras come out.`
      );
    } else {
      lines.push(
        `We've taken note of what helps you feel at ease, and our crew will ensure the pace stays unhurried and comfortable throughout the day.`
      );
    }
    lines.push("");
  }

  // SECTION 5: WHAT MATTERS TO YOU
  lines.push("WHAT MATTERS TO YOU");
  lines.push("");

  const priorities = answers.q19_whatMattersMost?.selected || [];
  if (priorities.length > 0) {
    const prioStr =
      priorities.length === 1
        ? priorities[0].toLowerCase()
        : priorities.length === 2
        ? `${priorities[0].toLowerCase()} along with ${priorities[1].toLowerCase()}`
        : `${priorities.slice(0, -1).join(", ").toLowerCase()}, and ${priorities[priorities.length - 1].toLowerCase()}`;

    lines.push(
      `We understand that what you value most when choosing your photography and filmmaking team is ${prioStr}.`
    );
  } else {
    lines.push(
      `We understand that what you value most is genuine storytelling, artistic quality, and a team that feels like friendly, dependable collaborators.`
    );
  }
  lines.push("");

  lines.push(
    `We'll keep these priorities in mind as we approach your wedding, focusing on creating photographs and films that feel thoughtfully composed, personal and meaningful.`
  );
  lines.push("");

  // SECTION 6: OUR FINAL THOUGHT
  lines.push("OUR FINAL THOUGHT");
  lines.push("");

  if (wordsDesc) {
    lines.push(
      `${p1} and ${p2}, we want your wedding photographs and films to feel like a true reflection of who you are together — ${wordsDesc}.`
    );
  } else {
    lines.push(
      `${p1} and ${p2}, we want your wedding photographs and films to feel like a true reflection of who you are together.`
    );
  }
  lines.push("");

  lines.push(
    `Our aim is to give you space to enjoy your day while we take care of the moments, emotions and memories along the way.`
  );
  lines.push("");

  lines.push(
    `We're looking forward to being a part of your celebration and creating something meaningful for you both.`
  );
  lines.push("");

  // Sign-off
  lines.push("With love,");
  lines.push("Team OAKS Wedding");

  return lines.join("\n");
}

/**
 * Parses a Couple Letter document string into structured sections for rich card view.
 */
export function parseCoupleLetterDocument(
  text: string,
  p1: string,
  p2: string
): CoupleLetterDocument {
  const coupleNames = `${p1} & ${p2}`;
  const lines = text.split("\n");

  const doc: CoupleLetterDocument = {
    title: `${p1.toUpperCase()} & ${p2.toUpperCase()}`,
    subtitle: "OUR UNDERSTANDING OF YOUR WEDDING",
    coupleNames,
    salutation: `Hi ${coupleNames},`,
    openingText: "",
    sections: [],
    finalThought: "",
    signOff: "With love,\nTeam OAKS Wedding",
    rawText: text,
  };

  let currentSection: CoupleLetterSection | null = null;
  let inOpening = false;
  let inFinalThought = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) continue;

    // Header lines
    if (
      trimmed === `${p1.toUpperCase()} & ${p2.toUpperCase()}` ||
      trimmed === "OUR UNDERSTANDING OF YOUR WEDDING" ||
      trimmed.startsWith("OAKS WEDDING") ||
      trimmed.startsWith("===") ||
      trimmed.startsWith("---")
    ) {
      continue;
    }

    // Salutation
    if (trimmed.startsWith("Hi ") || trimmed.startsWith("Dear ")) {
      doc.salutation = trimmed;
      inOpening = true;
      continue;
    }

    // Check for Section Headings (All caps headers)
    const isHeading =
      trimmed === "YOUR STORY & PERSONALITY" ||
      trimmed === "THE WAY YOU WANT YOUR WEDDING TO FEEL" ||
      trimmed === "THE MOMENTS WE'LL LOOK FORWARD TO" ||
      trimmed === "IMPORTANT PEOPLE & MOMENTS" ||
      trimmed === "MAKING YOU FEEL COMFORTABLE" ||
      trimmed === "WHAT MATTERS TO YOU" ||
      trimmed === "COORDINATION & EXPECTATIONS" ||
      trimmed === "OUR FINAL THOUGHT" ||
      trimmed === "DETAILS TO CONFIRM";

    if (isHeading) {
      inOpening = false;
      if (trimmed === "OUR FINAL THOUGHT") {
        inFinalThought = true;
        currentSection = null;
        continue;
      }

      inFinalThought = false;
      currentSection = {
        title: trimmed,
        paragraphs: [],
        bulletPoints: [],
      };
      doc.sections.push(currentSection);
      continue;
    }

    // Sign off detection
    if (trimmed === "With love," || trimmed.startsWith("Team OAKS")) {
      continue;
    }

    // Bullet points
    if (trimmed.startsWith("* ") || trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      const cleanBullet = trimmed.replace(/^[*•\-]\s*/, "");
      if (currentSection) {
        if (!currentSection.bulletPoints) currentSection.bulletPoints = [];
        currentSection.bulletPoints.push(cleanBullet);
      }
      continue;
    }

    // Content lines
    if (inOpening) {
      doc.openingText = doc.openingText
        ? `${doc.openingText}\n\n${trimmed}`
        : trimmed;
    } else if (inFinalThought) {
      doc.finalThought = doc.finalThought
        ? `${doc.finalThought}\n\n${trimmed}`
        : trimmed;
    } else if (currentSection) {
      currentSection.paragraphs.push(trimmed);
    }
  }

  return doc;
}

/**
 * Invokes the Gemini API proxy to generate a personalized Couple Letter,
 * falling back gracefully to deterministic local synthesis.
 */
export async function generateCoupleLetter(
  answers: QuestionnaireAnswers,
  options: { forceAI?: boolean } = {}
): Promise<string> {
  try {
    const response = await fetch("/api/generate-letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers,
        systemPrompt: OAKS_COUPLE_LETTER_SYSTEM_PROMPT,
      }),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    if (data.letter && data.letter.trim().length > 100) {
      return data.letter.trim();
    }
  } catch (err) {
    console.warn("Failed to generate couple letter with Gemini, falling back to local synthesis:", err);
  }

  return synthesizeCoupleLetter(answers);
}
