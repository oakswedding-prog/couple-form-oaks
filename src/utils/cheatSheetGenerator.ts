/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { QuestionnaireAnswers } from "../types/questionnaire.ts";
import { cleanSentenceText as cleanUserText } from "./textCleaner.ts";

/**
 * Master system prompt for the Shoot Day Cheat Sheet Generator.
 * Built to enforce the 30–60 second scanning target, 150–220 word count,
 * 6 practical production sections, and zero copied questionnaire transcripts.
 */
export const OAKS_CHEATSHEET_SYSTEM_PROMPT = `# OAKS WEDDING — SHOOT DAY CHEAT SHEET GENERATOR
## MASTER PRODUCTION PROMPT

You are the Lead Shoot Coordinator and Production Brief Specialist at OAKS WEDDING, a premium wedding photography and cinematography studio.

### 1. MAIN OBJECTIVE
Read all 27 questionnaire answers, identify the most important information, remove unnecessary details and convert the findings into a short, practical production brief.

The Shoot Day Cheat Sheet is NOT a summary of all 27 questionnaire answers. It is a quick-reference document for the photography and filmmaking team to use on the actual wedding day.

A team member should be able to scan it in 30–60 seconds and immediately understand the couple's most important preferences, people, moments and instructions.

### 2. LENGTH AND WRITING STYLE
- Target approximately 150–220 words.
- Use simple, clear and natural English.
- Prefer short bullet points over paragraphs.
- Avoid repeating the same instruction in different sections.
- Avoid copying long sentences directly from questionnaire answers.
- Correct minor grammar mistakes without changing the meaning.
- Do not use unnecessarily emotional, poetic or fancy language.
- Make every instruction easy to understand at a glance.

### 3. REQUIRED SECTIONS
Always format the document with these exact uppercase headings:

OAKS WEDDING
[PARTNER 1 NAME] & [PARTNER 2 NAME]
WEDDING DAY CHEAT SHEET


01 — THE VIBE
[Couple's three defining words separated by middle-dots]
[A very short description of their preferred visual style and wedding atmosphere (1–2 sentences)]


02 — TOP PRIORITIES
* [First top priority for the team]
* [Second top priority]
* [Third top priority]
* [Fourth top priority]


03 — MUST-CAPTURE MOMENTS
* [Special request or unusual moment needing preparation, e.g. handwritten letter exchange]
* [First look or couple moments]
* [Ceremony, vows and blessings]
* [Parents' and grandparents' reactions]
* [Grand entry, speeches and toasts]
* [Family portraits and candid interactions]


04 — IMPORTANT PEOPLE
* [Name] — [Relationship]
* [Name] — [Relationship]
* Grandparents — Special priority (if applicable)

Capture individual portraits, group photographs, blessings, hugs and candid interactions with them.


05 — PLEASE AVOID
* [Photography or filming approaches the couple dislikes, e.g. forced or repetitive poses]
* [Artificial smiles and cheesy directions]
* [Interrupting genuine moments]
* [Unnecessary pauses or making the couple feel rushed]


06 — WORKING WITH THE COUPLE
Camera comfort: [Short phrase, e.g. Pretty comfortable / A bit camera-shy]
Direction: [Short phrase, e.g. Gentle guidance / Mostly candid]
Before portraits: [Short phrase, e.g. A few relaxed practice shots]
During the day: [Short phrase, e.g. Show occasional previews / Keep music playing]


TECHNICAL NON-NEGOTIABLE
[Only include when there is an important technical requirement such as clear audio recordings of vows, speeches and toasts, specific lighting, or key moments that must not be missed.]

### 4. STRICT RULES
- Never invent names, relationships, preferences, moments or requirements.
- Never replace the couple's selected answers with assumptions.
- Use the original questionnaire answers as the source of truth.
- Do not omit important family members simply because they were mentioned in a different question.
- If the same preference appears in multiple answers, mention it only once.
- Do not repeat the Must-Capture information under Top Priorities or other sections.
- Do not include generic wedding advice.
- Do not turn every answer into a bullet point.
- Do not include information that has no practical value for the wedding team.

### 5. PRIORITISATION
When deciding what to include, use this order:
1. Non-negotiable requests.
2. Important people and family relationships.
3. Special moments that require preparation or coordination.
4. Specific things to capture or avoid.
5. Couple comfort and working preferences.
6. General visual preferences.

### REFERENCE BENCHMARK MODEL:
OAKS WEDDING
RIYA JACOB & ROSHAN MATHEW
WEDDING DAY CHEAT SHEET


01 — THE VIBE

Playful · Adventurous · Loving

Natural, candid, cinematic and elegant. Balance fashion-editorial portraits with genuine emotions and the energy of a grand celebration.


02 — TOP PRIORITIES

* Capture genuine emotions, especially parents' and grandparents' reactions.
* Give both Riya and Roshan equal attention.
* Tell their story through real moments, not just beautiful poses.
* Preserve the little interactions they may not notice themselves.


03 — MUST-CAPTURE MOMENTS

* Private handwritten letter exchange before the ceremony.
* First look and couple moments.
* Ceremony, vows and family blessings.
* Parents' and grandparents' reactions.
* Grand entry, speeches and toasts.
* Family portraits and candid interactions.


04 — IMPORTANT PEOPLE

* Mini — Mother
* Francis — Father
* Gladson — Brother
* Michelle — Cousin
* Grandparents — Special priority

Capture individual portraits, group photographs, blessings, hugs and candid interactions with them.


05 — PLEASE AVOID

* Forced or repetitive poses.
* Artificial smiles and cheesy directions.
* Interrupting genuine moments.
* Unnecessary pauses or making the couple feel rushed.


06 — WORKING WITH THE COUPLE

Camera comfort: Pretty comfortable
Direction: Gentle guidance
Before portraits: A few relaxed practice shots
During the day: Show occasional previews.


TECHNICAL NON-NEGOTIABLE

Ensure clear audio recordings of vows, speeches and toasts. Don't miss important family reactions.
`;

export interface ParsedCheatSheet {
  title: string;
  coupleNames: string;
  vibeWords: string;
  vibeDescription: string;
  topPriorities: string[];
  mustCaptureMoments: string[];
  importantPeople: { name: string; relationship: string }[];
  importantPeopleNote: string;
  pleaseAvoid: string[];
  workingWithCouple: { label: string; value: string }[];
  technicalNonNegotiable?: string;
  rawText: string;
}

/**
 * Deterministic generator that produces a pristine 150–220 word shoot day cheat sheet
 * following the exact benchmark model and rules.
 */
export function synthesizeCheatSheet(
  answers: QuestionnaireAnswers,
  studioName = "OAKS WEDDING"
): string {
  const p1 = (answers.partner1 || "Partner 1").trim();
  const p2 = (answers.partner2 || "Partner 2").trim();

  // 1. Vibe Words
  const words = (answers.q5_threeWords || [])
    .map((w) => cleanUserText(w).replace(/^[·\-\s]+/, "").trim())
    .filter(Boolean);
  const vibeWords = words.length > 0
    ? words.join(" · ")
    : "Natural · Candid · Joyful";

  // Vibe description from Q11, Q13, Q5
  const filmFeelSelected = Array.isArray((answers.q11_filmFeel as any)?.selected)
    ? (answers.q11_filmFeel as any).selected
    : typeof answers.q11_filmFeel === "string" && answers.q11_filmFeel
    ? [answers.q11_filmFeel]
    : [];
  const toneSelected = Array.isArray((answers.q13_tone as any)?.selected)
    ? (answers.q13_tone as any).selected
    : typeof answers.q13_tone === "string" && answers.q13_tone
    ? [answers.q13_tone]
    : [];

  const styleTerms: string[] = [];
  if (filmFeelSelected.length > 0) {
    filmFeelSelected.forEach((f: string) => {
      const lower = f.toLowerCase();
      if (lower.includes("candid") || lower.includes("natural")) styleTerms.push("natural and candid");
      else if (lower.includes("editorial") || lower.includes("fashion")) styleTerms.push("fashion-editorial portraits");
      else if (lower.includes("cinematic") || lower.includes("film")) styleTerms.push("cinematic visual rhythm");
      else if (lower.includes("documentary")) styleTerms.push("documentary storytelling");
      else if (lower.includes("grand") || lower.includes("traditional")) styleTerms.push("grand cultural tradition");
    });
  }

  let vibeDescription = "";
  if (styleTerms.length > 0) {
    const uniqueStyles = Array.from(new Set(styleTerms));
    const toneNote = toneSelected.length > 0 ? toneSelected[0].toLowerCase() : "celebratory";
    vibeDescription = `Natural, candid, cinematic and elegant. Balance ${uniqueStyles.join(" and ")} with genuine emotions and the energy of a ${toneNote} celebration.`;
  } else {
    vibeDescription = `Natural, candid, cinematic and elegant. Balance fashion-editorial portraits with genuine emotions and the energy of a grand celebration.`;
  }

  // 2. Top Priorities (3–4 crisp bullet points)
  const priorities: string[] = [];
  priorities.push(`Capture genuine emotions, especially parents' and family reactions.`);
  priorities.push(`Give both ${p1} and ${p2} equal attention throughout the day.`);
  priorities.push(`Tell their story through real moments, not just beautiful poses.`);
  priorities.push(`Preserve the little interactions they may not notice themselves.`);

  // 3. Must-Capture Moments
  const mustCapture: string[] = [];
  const rawDefinite = cleanUserText(answers.q15_captureAvoid?.definitelyCapture || "");
  const rawNotes = cleanUserText(answers.q23_oneLastThing?.notes || "");
  const rawProposal = answers.q9_proposal?.story ? cleanUserText(answers.q9_proposal.story) : "";

  // Check for special personal items like handwritten letters, special dances, first looks
  const combinedText = `${rawDefinite} ${rawNotes} ${rawProposal}`.toLowerCase();
  if (combinedText.includes("letter") || combinedText.includes("note") || combinedText.includes("vow book")) {
    mustCapture.push("Private handwritten letter exchange before the ceremony.");
  }
  if (combinedText.includes("first look") || (answers.q14_moments?.selected || []).includes("First Look")) {
    mustCapture.push("First look and quiet couple moments.");
  } else {
    mustCapture.push("First look and couple moments.");
  }

  mustCapture.push("Ceremony, vows and family blessings.");
  mustCapture.push("Parents' and grandparents' reactions.");
  mustCapture.push("Grand entry, speeches and toasts.");

  // Check for specific mention of sunset, party, afterparty, or dance
  if (combinedText.includes("sunset") || combinedText.includes("golden hour")) {
    mustCapture.push("Sunset couple portraits during golden hour.");
  } else if (combinedText.includes("party") || combinedText.includes("dance floor")) {
    mustCapture.push("Dance floor energy, celebrations and party moments.");
  } else {
    mustCapture.push("Family portraits and candid interactions.");
  }

  // 4. Important People
  const familyList = answers.q10_people?.familyMembers || [];
  const peopleLines: string[] = [];
  let hasGrandparents = false;

  familyList.forEach((m) => {
    const name = cleanUserText(m.name);
    const rel = cleanUserText(m.relationship);
    if (!name && !rel) return;
    if (rel.toLowerCase().includes("grandparent") || rel.toLowerCase().includes("grandma") || rel.toLowerCase().includes("grandpa")) {
      hasGrandparents = true;
    }
    const displayName = name || "Family Member";
    const displayRel = rel || "Family";
    peopleLines.push(`* ${displayName} — ${displayRel}`);
  });

  const rawTreeNotes = cleanUserText(answers.q10_people?.treeNotes || "");
  if (rawTreeNotes.toLowerCase().includes("grandparent") || rawTreeNotes.toLowerCase().includes("grandma") || rawTreeNotes.toLowerCase().includes("grandpa")) {
    hasGrandparents = true;
  }

  if (hasGrandparents || !peopleLines.some((p) => p.toLowerCase().includes("grandparent"))) {
    peopleLines.push("* Grandparents — Special priority");
  }

  if (peopleLines.length === 0) {
    peopleLines.push("* Parents & Immediate Family — Special priority");
    peopleLines.push("* Grandparents — Special priority");
  }

  // 5. Please Avoid
  const avoidList: string[] = [];
  const rawAvoid = cleanUserText(answers.q15_captureAvoid?.pleaseAvoid || "");
  if (rawAvoid) {
    // If the couple provided specific avoidances, clean and shorten to 1-2 bullets
    const shortAvoid = rawAvoid.replace(/^(please avoid|avoid|do not|don't)\s*/i, "").trim();
    if (shortAvoid.length > 0) {
      avoidList.push(`* ${shortAvoid.charAt(0).toUpperCase() + shortAvoid.slice(1)}.`);
    }
  }
  avoidList.push("* Forced or repetitive poses.");
  avoidList.push("* Artificial smiles and cheesy directions.");
  avoidList.push("* Interrupting genuine moments.");
  avoidList.push("* Unnecessary pauses or making the couple feel rushed.");

  // Deduplicate avoids
  const uniqueAvoids = Array.from(new Set(avoidList)).slice(0, 4);

  // 6. Working with the Couple
  const cameraComfort = answers.q18_cameraVersatility
    ? cleanUserText(answers.q18_cameraVersatility)
    : "Pretty comfortable";
  const direction = answers.q20_guidanceComfort
    ? cleanUserText(answers.q20_guidanceComfort)
    : "Gentle guidance";

  const comfortTipsSelected = answers.q21_comfortTips?.selected || [];
  let beforePortraits = "A few relaxed practice shots";
  let duringDay = "Show occasional previews.";

  if (comfortTipsSelected.some((t) => t.toLowerCase().includes("music"))) {
    duringDay = "Play favourite background music.";
  } else if (comfortTipsSelected.some((t) => t.toLowerCase().includes("preview"))) {
    duringDay = "Show occasional camera previews.";
  } else if (comfortTipsSelected.some((t) => t.toLowerCase().includes("water") || t.toLowerCase().includes("break"))) {
    duringDay = "Allow short breathing breaks.";
  }

  if (comfortTipsSelected.some((t) => t.toLowerCase().includes("warm") || t.toLowerCase().includes("practice"))) {
    beforePortraits = "A few relaxed practice shots";
  }

  // Technical Non-Negotiable
  const rawNonNeg = cleanUserText(answers.q16_nonNegotiables || "");
  let technicalLine = "";
  if (rawNonNeg) {
    technicalLine = rawNonNeg;
  } else {
    technicalLine = "Ensure clear audio recordings of vows, speeches and toasts. Don't miss important family reactions.";
  }

  const sections: string[] = [];

  sections.push(studioName.toUpperCase());
  sections.push(`${p1.toUpperCase()} & ${p2.toUpperCase()}`);
  sections.push("WEDDING DAY CHEAT SHEET");
  sections.push("");
  sections.push("");

  sections.push("01 — THE VIBE");
  sections.push("");
  sections.push(vibeWords);
  sections.push("");
  sections.push(vibeDescription);
  sections.push("");
  sections.push("");

  sections.push("02 — TOP PRIORITIES");
  sections.push("");
  priorities.forEach((p) => sections.push(`* ${p.replace(/^\*\s*/, "")}`));
  sections.push("");
  sections.push("");

  sections.push("03 — MUST-CAPTURE MOMENTS");
  sections.push("");
  mustCapture.forEach((m) => sections.push(`* ${m.replace(/^\*\s*/, "")}`));
  sections.push("");
  sections.push("");

  sections.push("04 — IMPORTANT PEOPLE");
  sections.push("");
  peopleLines.forEach((p) => sections.push(p.startsWith("* ") ? p : `* ${p}`));
  sections.push("");
  sections.push("Capture individual portraits, group photographs, blessings, hugs and candid interactions with them.");
  sections.push("");
  sections.push("");

  sections.push("05 — PLEASE AVOID");
  sections.push("");
  uniqueAvoids.forEach((a) => sections.push(a.startsWith("* ") ? a : `* ${a}`));
  sections.push("");
  sections.push("");

  sections.push("06 — WORKING WITH THE COUPLE");
  sections.push("");
  sections.push(`Camera comfort: ${cameraComfort}`);
  sections.push(`Direction: ${direction}`);
  sections.push(`Before portraits: ${beforePortraits}`);
  sections.push(`During the day: ${duringDay}`);
  if (answers.primaryContact?.role && (answers.primaryContact.name || answers.primaryContact.phone)) {
    const pc = answers.primaryContact;
    const contactRoleExtra = pc.designation || pc.gender;
    const roleDetail =
      pc.role === "Someone else" && (pc.side || contactRoleExtra)
        ? `${pc.role} (${[pc.side, contactRoleExtra].filter(Boolean).join(", ")})`
        : pc.role;
    const contactLabel = `${pc.name || roleDetail} (${roleDetail})${pc.phone ? ` · ${pc.phone}` : ""}`;
    sections.push(`Primary contact: ${contactLabel}`);
  }

  if (technicalLine) {
    sections.push("");
    sections.push("");
    sections.push("TECHNICAL NON-NEGOTIABLE");
    sections.push("");
    sections.push(technicalLine);
  }

  return sections.join("\n");
}

/**
 * Parses raw cheat sheet text into structured data for UI rendering.
 */
export function parseCheatSheetDocument(
  text: string,
  defaultP1 = "Partner 1",
  defaultP2 = "Partner 2"
): ParsedCheatSheet {
  const lines = text.split("\n").map((l) => l.trim());

  let title = "WEDDING DAY CHEAT SHEET";
  let coupleNames = `${defaultP1} & ${defaultP2}`;
  let vibeWords = "";
  let vibeDescription = "";
  const topPriorities: string[] = [];
  const mustCaptureMoments: string[] = [];
  const importantPeople: { name: string; relationship: string }[] = [];
  let importantPeopleNote = "Capture individual portraits, group photographs, blessings, hugs and candid interactions with them.";
  const pleaseAvoid: string[] = [];
  const workingWithCouple: { label: string; value: string }[] = [];
  let technicalNonNegotiable = "";

  type SectionKey =
    | "none"
    | "vibe"
    | "priorities"
    | "mustCapture"
    | "people"
    | "avoid"
    | "working"
    | "technical";

  let currentSection: SectionKey = "none";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Detect headers
    if (line.includes("WEDDING DAY CHEAT SHEET")) {
      title = line;
      continue;
    }
    if (line.includes("&") && (line.includes("—") === false) && currentSection === "none" && !line.startsWith("*")) {
      coupleNames = line;
      continue;
    }
    if (/^01\s*—\s*THE VIBE/i.test(line)) {
      currentSection = "vibe";
      continue;
    }
    if (/^02\s*—\s*TOP PRIORITIES/i.test(line)) {
      currentSection = "priorities";
      continue;
    }
    if (/^03\s*—\s*MUST-CAPTURE MOMENTS/i.test(line)) {
      currentSection = "mustCapture";
      continue;
    }
    if (/^04\s*—\s*IMPORTANT PEOPLE/i.test(line)) {
      currentSection = "people";
      continue;
    }
    if (/^05\s*—\s*PLEASE AVOID/i.test(line)) {
      currentSection = "avoid";
      continue;
    }
    if (/^06\s*—\s*WORKING WITH THE COUPLE/i.test(line)) {
      currentSection = "working";
      continue;
    }
    if (/^TECHNICAL NON-NEGOTIABLE/i.test(line)) {
      currentSection = "technical";
      continue;
    }

    // Process section lines
    switch (currentSection) {
      case "vibe": {
        if (!vibeWords) {
          vibeWords = line;
        } else {
          vibeDescription = vibeDescription ? `${vibeDescription} ${line}` : line;
        }
        break;
      }
      case "priorities": {
        if (line.startsWith("*") || line.startsWith("-") || line.startsWith("•")) {
          topPriorities.push(line.replace(/^[*•\-]\s*/, ""));
        } else if (line.length > 5) {
          topPriorities.push(line);
        }
        break;
      }
      case "mustCapture": {
        if (line.startsWith("*") || line.startsWith("-") || line.startsWith("•")) {
          mustCaptureMoments.push(line.replace(/^[*•\-]\s*/, ""));
        } else if (line.length > 5) {
          mustCaptureMoments.push(line);
        }
        break;
      }
      case "people": {
        if (line.startsWith("*") || line.startsWith("-") || line.startsWith("•")) {
          const raw = line.replace(/^[*•\-]\s*/, "");
          const parts = raw.split(/[—–-]/);
          if (parts.length >= 2) {
            importantPeople.push({
              name: parts[0].trim(),
              relationship: parts.slice(1).join("—").trim(),
            });
          } else {
            importantPeople.push({
              name: raw.trim(),
              relationship: "Special priority",
            });
          }
        } else if (line.toLowerCase().includes("capture") || line.toLowerCase().includes("portraits")) {
          importantPeopleNote = line;
        }
        break;
      }
      case "avoid": {
        if (line.startsWith("*") || line.startsWith("-") || line.startsWith("•")) {
          pleaseAvoid.push(line.replace(/^[*•\-]\s*/, ""));
        } else if (line.length > 5) {
          pleaseAvoid.push(line);
        }
        break;
      }
      case "working": {
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
          const label = line.slice(0, colonIdx).trim();
          const value = line.slice(colonIdx + 1).trim();
          workingWithCouple.push({ label, value });
        } else {
          workingWithCouple.push({ label: "Note", value: line });
        }
        break;
      }
      case "technical": {
        technicalNonNegotiable = technicalNonNegotiable
          ? `${technicalNonNegotiable} ${line}`
          : line;
        break;
      }
    }
  }

  return {
    title,
    coupleNames,
    vibeWords,
    vibeDescription,
    topPriorities,
    mustCaptureMoments,
    importantPeople,
    importantPeopleNote,
    pleaseAvoid,
    workingWithCouple,
    technicalNonNegotiable: technicalNonNegotiable.trim() || undefined,
    rawText: text,
  };
}

/**
 * Invokes the Gemini API proxy to generate an intelligent Shoot Day Cheat Sheet,
 * falling back gracefully to the deterministic synthesis if unavailable.
 */
export async function generateCheatSheet(
  answers: QuestionnaireAnswers
): Promise<string> {
  try {
    const response = await fetch("/api/generate-cheatsheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers,
        systemPrompt: OAKS_CHEATSHEET_SYSTEM_PROMPT,
      }),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    if (data.cheatSheet && data.cheatSheet.trim().length > 50) {
      return data.cheatSheet.trim();
    }
  } catch (err) {
    console.warn("Failed to generate cheat sheet via AI, falling back to local synthesis:", err);
  }

  return synthesizeCheatSheet(answers);
}
