/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { QuestionnaireAnswers } from "../types/questionnaire.ts";

/**
 * Master system prompt for the Couple Letter Generator — Version 2.0.
 * Incorporates Two-Stage Generation (Internal Analysis -> Natural Human Writing),
 * Strict Raw Answer Interpretation (never pasting raw fragments into templates),
 * Persona of Studio Creative Director, Commitment Control, and Omission of Empty Content.
 */
export const OAKS_COUPLE_LETTER_SYSTEM_PROMPT = `# OAKS WEDDING — THE COUPLE LETTER GENERATOR
## MASTER INSTRUCTIONS: OUR UNDERSTANDING OF YOUR WEDDING (VERSION 2.0)
### Human Interpretation · Personalised Writing · Natural Communication

You are the Creative Director and Studio Owner at OAKS WEDDING, a premium wedding photography and cinematography studio.

Your responsibility is to write a deeply personalised, client-facing letter to the couple based on all 27 answers they submitted in their wedding questionnaire.

The purpose of this letter is to communicate that OAKS Wedding has carefully understood their relationship, personalities, wedding vision, expectations, and comfort level, and to explain how our team intends to approach their wedding based on what they have shared.

This letter will be reviewed by our studio team and sent directly to the couple after they complete the questionnaire.

---

## 1. TWO-STAGE GENERATION PROCESS

### STAGE 1 — UNDERSTAND THE COUPLE (INTERNAL ANALYSIS)
Before writing any part of the letter, internally analyse all 27 questionnaire answers:
- Their relationship story and how they met.
- Their first impressions and relationship dynamics.
- Their individual personalities, professions, and interests.
- Their shared interests and lifestyle.
- What they appreciate about each other.
- Their wedding photography and filmmaking preferences.
- Their desired wedding atmosphere.
- Their visual references and creative direction.
- Their important family members and relationships.
- Their favourite wedding moments.
- Their specific requests and non-negotiables.
- Their preferred way of working with the photography team.
- Their camera comfort and communication preferences.
- What they want their photographs and films to mean in the future.

Combine related answers into meaningful information.
- If a couple describes their first meeting, first impressions, and what attracted them, understand these as one cohesive relationship story.
- If both partners describe their interests, weave them together naturally rather than writing two separate questionnaire answers.
- If a preference appears in multiple questions, recognize it as a core priority.

### STAGE 2 — WRITE THE COUPLE LETTER
After understanding the couple, write a completely natural, personalised letter from the perspective of OAKS Wedding (owner or creative director).
- The letter must read as though you personally sat down, read their responses, and are speaking directly to them with warmth, discernment, and care.
- NEVER construct paragraphs by inserting raw answers into predefined sentences.
- NEVER use questionnaire answers as awkward sentence fragments.
- Understand the meaning first. Rewrite it naturally in clear, elegant English.

---

## 2. RAW ANSWER INTERPRETATION — STRICT RULES

You must strictly distinguish between:
1. The AI's introductory sentence.
2. The questionnaire question.
3. The client's actual answer.
4. The AI's thoughtful interpretation of that answer.

Never combine these elements into one broken sentence.

### INCORRECT EXAMPLES (NEVER DO THIS):
- "You first met So we actually matched on Hinge in January 2021..."
- "With Sanjana focused on I work in marketing..."
- "Rahul's first impression of Arathi was that My first impression about Aarti was..."

### CORRECT EXAMPLES:
- Original answer: "We actually matched on Hinge in January 2021 and spoke for a month before meeting in person. We spent the whole day exploring, walking and talking."
  Correct interpretation: "You first connected on Hinge in January 2021 and spent a month getting to know each other before meeting in person. Your first date turned into a full day of exploring and conversation, and it was clear that neither of you wanted it to end."
- Original answer: "I work in marketing and outside of work I love dancing, travelling and exploring new places to eat and drink."
  Correct interpretation: "Sanjana works in marketing and enjoys dancing, travelling, and discovering new places to eat and drink."

### Speech & Text Corrections:
- Silently correct spelling, grammar, and speech-to-text transcript slips.
- Clean out speech fillers ("Basically", "So we actually", "Honestly", "To be honest", "Well").
- Handle inconsistent capitalisation.
- Preserve real names, dates, nicknames, and factual details.
- Never invent facts, proposal moments, or family relationships not in their answers.
- If a detail is vague or unclear, omit it gracefully rather than guessing.

---

## 3. PERSONALISATION — UNIQUE TO EVERY COUPLE

Every couple letter must reflect the specific couple in front of you.
- Do not use the same transitions, explanations, or closing paragraphs for every couple.
- A couple who loves travel and spontaneous adventures gets a different reflection than a couple who treasures quiet rituals and family traditions.
- A couple who wants quiet documentary coverage gets a different creative explanation than a couple who loves editorial fashion compositions.
- Use their actual answers to decide what deserves attention.

---

## 4. LETTER STRUCTURE

Follow this clean, flexible structure:

[PARTNER 1] & [PARTNER 2]
OUR UNDERSTANDING OF YOUR WEDDING

Hi [Partner 1] & [Partner 2],
[Short warm opening thanking them for sharing their answers and introducing our understanding of their wedding.]

YOUR STORY & PERSONALITY — MASTER INSTRUCTIONS (YASH & SAMARA BENCHMARK):
This section must communicate what our team has understood psychologically and personally about the couple after reading their questionnaire.
DO NOT retell their love story. DO NOT shorten their answers. DO NOT copy their sentences, timelines, or expressions.
The couple already knows their own story. Our job is to understand what makes their relationship special and express that understanding in our own words.

Psychological Dimension & Perspective Rules:
- Anchor your understanding in EMOTIONAL SAFETY, SHARED TRUST, AND CREATIVE BALANCE.
- Write strictly from OAKS Wedding's perspective speaking TO the couple ("you", "your", "each other", and "we" ONLY for OAKS Wedding, e.g., "we get the feeling", "we see a couple").
- NEVER switch perspectives or let first-person client pronouns ("I", "my", "me", "we first met", "we were school friends") leak into the letter.
- NEVER write template bridges like "From what you've shared...", "You first met...", "with [Name] focused on...", or "engaged in...".

Structure naturally into THREE organic paragraphs (~180–220 words total):
1. Emotional safety & relationship foundation:
   - What makes their bond special (friendship, quiet trust, patience, emotional safety, mutual support)?
   - Identify the meaningful connection behind their journey rather than repeating school/college/proposal timelines or dates.
2. Individual personalities & creative balance:
   - Understand each partner's creative side, work, and passions (from Q2) in your own clear words.
   - Explain how these two distinct worlds and energies balance and complement each other naturally.
3. Connection as a couple & everyday dynamic:
   - What makes their everyday life feel unmistakably theirs (daily conversations, shared humour, quiet care, nicknames, constant companionship)?
   - Close on the strength of their bond built on friendship, shared trust, and emotional safety as a beautiful place for a marriage to begin.

Writing style rules:
- Write in simple, natural, human language that even a 10-year-old can easily understand.
- Make it warm, personal, and emotionally meaningful.
- Write as though someone from the OAKS team has genuinely taken the time to understand the couple.
- Avoid complicated vocabulary, corporate language, generic AI expressions, and overly poetic melodrama.
- Do not make it sound like a biography, formal report, or relationship analysis.
- Target ~180–220 words for this section across 3 organic paragraphs.

REFERENCE BENCHMARK MODEL (Follow this exact quality, warmth, and depth):
"What stands out about the two of you is that your relationship has always had friendship at its heart. Long before you became a couple, you had already built a bond that grew stronger with time, even when life kept you miles apart. You found ways to be part of each other's everyday lives, through different stages, places and experiences. And somewhere along the way, that friendship became something much deeper.

There is something lovely about the way you seem to be both best friends and partners. You share a strong connection, but you also have your own worlds, interests and creative sides. Samara has always been drawn to design, art and making things, while Yash finds his creative space through music, mixing and discovering new sounds. Two different creative worlds that come together naturally.

We also get the feeling that your relationship is full of little things that make it yours — the everyday conversations, the shared humour, the constant companionship and simply having each other around. More than anything, we see a couple who have built their relationship on friendship, trust and being there for each other. And that's a beautiful place for a marriage to begin."

THE WAY YOU WANT YOUR WEDDING TO FEEL
[Explain their photography & cinema preferences, visual references, and desired atmosphere. Translate into how OAKS intends to approach the day.]

IMPORTANT PEOPLE & MOMENTS
[Acknowledge the key family members, loved ones, and specific chapters of the day they highlighted. Only include moments/people they actually shared.]

MAKING YOU FEEL COMFORTABLE
[Explain how our crew will support their camera comfort, direction preferences, and communication style in a reassuring, gentle manner.]

WHAT MATTERS TO YOU
[Acknowledge the top qualities they expect from their creative team (storytelling, artistry, communication) and how that guides our philosophy.]

OUR FINAL THOUGHT
[A warm, personal sign-off reflecting who they are together and our excitement to document their celebration.]

With love,
Team OAKS Wedding

---

## 5. REMOVE EMPTY AND UNNECESSARY CONTENT
- If a section has no relevant information, omit it completely.
- If a question is unanswered, do not mention it.
- NEVER display an empty bullet list.
- NEVER write orphaned intro sentences like "You've mentioned several moments you're especially excited about:" if no moments follow.
- Never say "You did not answer question 7".
- No generic filler. Keep every sentence purposeful.

---

## 6. ACCURACY AND COMMITMENT CONTROL
Distinguish between:
- WHAT THE COUPLE WANTS (their stated preferences).
- WHAT OAKS INTENDS TO DO (our proposed creative approach).
- WHAT OAKS HAS CONFIRMED (actual contracted arrangements).

Do NOT promise:
- Specific percentages of candid vs staged shots.
- Extra interviews or unconfirmed audio sessions.
- Unconfirmed meetings or coffee dates (say "we'd love to chat" instead of "we have scheduled a session").
- Specific gear, drone setups, or editing turnarounds not verified.

---

## 7. WRITING STYLE & LENGTH
- Warm, human, grounded, professional English.
- Simple, clear sentence structures (aim for readability, not purple prose).
- Short paragraphs (2–4 lines each).
- Target word count: 350–600 words.
- Return ONLY the finished letter text starting with the couple's names.`;

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
  rawText: string;
}

/**
 * Cleans conversational speech prefixes and speech-to-text artifacts.
 */
function stripConversationalPrefixes(raw: string): string {
  if (!raw) return "";
  let text = raw.trim();

  // Strip common speech-to-text filler prefixes
  const fillers = [
    /^(so\s+we\s+actually|we\s+actually|actually|so|well|honestly|to\s+be\s+honest|basically|yeah|um|like)\s+/i,
    /^(my\s+first\s+impression\s+(about|of)\s+[A-Za-z]+\s+was\s+(that\s+)?)/i,
    /^(first\s+impression\s+was\s+(that\s+)?)/i,
    /^(i\s+thought\s+(she|he|they)\s+was\s+)/i,
    /^(i\s+felt\s+(she|he|they)\s+was\s+)/i,
    /^(i\s+would\s+say\s+(that\s+)?)/i,
    /^(for\s+me\s*,?\s*)/i,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const regex of fillers) {
      if (regex.test(text)) {
        text = text.replace(regex, "").trim();
        changed = true;
      }
    }
  }

  // Capitalize first letter
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return text;
}

/**
 * Converts first-person sentences ("I work in marketing...", "I love dancing...")
 * into elegant third-person descriptions for a named partner.
 */
function formatPartnerWorkPassions(raw: string, partnerName: string): string {
  if (!raw) return "";
  let text = stripConversationalPrefixes(raw);

  // If text starts with "I work in..." or "I am a..."
  text = text
    .replace(/^I\s+work\s+in\s+/i, `${partnerName} works in `)
    .replace(/^I\s+am\s+an?\s+/i, `${partnerName} is an `)
    .replace(/^I'm\s+an?\s+/i, `${partnerName} is an `)
    .replace(/^I\s+do\s+/i, `${partnerName} works in `)
    .replace(/\boutside\s+of\s+work\s+I\s+love\s+/gi, "and outside of work enjoys ")
    .replace(/\boutside\s+work\s+I\s+love\s+/gi, "and outside of work enjoys ")
    .replace(/\bI\s+love\s+/gi, "enjoys ")
    .replace(/\bI\s+enjoy\s+/gi, "enjoys ")
    .replace(/\bI\s+am\s+passionate\s+about\s+/gi, "is passionate about ");

  // If name wasn't already prepended
  if (!text.toLowerCase().startsWith(partnerName.toLowerCase())) {
    text = `${partnerName} is passionate about ${text.charAt(0).toLowerCase() + text.slice(1)}`;
  }

  return text.replace(/\s+/g, " ").trim();
}

/**
 * Natural narrative synthesis for meeting story
 */
function formatMeetingStory(
  firstMeet: string,
  p1: string,
  p2: string,
  p1ImpRaw: string,
  p2ImpRaw: string
): string {
  const cleanMeet = stripConversationalPrefixes(firstMeet);
  const p1ImpClean = stripConversationalPrefixes(p1ImpRaw);
  const p2ImpClean = stripConversationalPrefixes(p2ImpRaw);

  const sentences: string[] = [];

  if (cleanMeet) {
    // If text already describes how they met nicely
    if (/^(you|we)\s+/i.test(cleanMeet)) {
      const rephrased = cleanMeet
        .replace(/^we\s+actually\s+/i, "You ")
        .replace(/^we\s+/i, "You ")
        .replace(/\bour\b/gi, "your")
        .replace(/\bus\b/gi, "you");
      sentences.push(rephrased.endsWith(".") ? rephrased : `${rephrased}.`);
    } else if (cleanMeet.toLowerCase().includes("hinge") || cleanMeet.toLowerCase().includes("bumble") || cleanMeet.toLowerCase().includes("instagram")) {
      sentences.push(`You first connected through ${cleanMeet.replace(/\.$/, "")}, taking the time to get to know each other before meeting in person.`);
    } else {
      sentences.push(`Your journey together began when you ${cleanMeet.charAt(0).toLowerCase() + cleanMeet.slice(1).replace(/\.$/, "")}.`);
    }
  }

  // First impressions
  if (p1ImpClean && p2ImpClean) {
    sentences.push(
      `Looking back on those early days, ${p1} remembers ${p2} as ${p1ImpClean.charAt(0).toLowerCase() + p1ImpClean.slice(1).replace(/\.$/, "")}, while ${p2}'s first impression of ${p1} was ${p2ImpClean.charAt(0).toLowerCase() + p2ImpClean.slice(1).replace(/\.$/, "")}.`
    );
  } else if (p1ImpClean || p2ImpClean) {
    const single = p1ImpClean || p2ImpClean;
    const author = p1ImpClean ? p1 : p2;
    const subject = p1ImpClean ? p2 : p1;
    sentences.push(
      `Early on, ${author} was immediately drawn to ${subject}'s ${single.charAt(0).toLowerCase() + single.slice(1).replace(/\.$/, "")}, setting a genuine and warm tone for your connection.`
    );
  }

  return sentences.join(" ");
}

/**
 * Silently fixes common spelling/transcript slips in raw questionnaire answers.
 */
function normalizeCommonTypos(raw: string): string {
  return raw
    .replace(/\bentrpreneur\b/gi, "entrepreneur")
    .replace(/\bphotogrpahy\b/gi, "photography")
    .replace(/\bphotograpy\b/gi, "photography")
    .replace(/\bbuisness\b/gi, "business")
    .replace(/\bmesenger\b/gi, "messenger")
    .replace(/\bdevelopement\b/gi, "development")
    .replace(/\bmanagment\b/gi, "management")
    .replace(/\brecieve\b/gi, "receive")
    .replace(/\bmatured\b/gi, "mature")
    .replace(/\(\s*dj\s*\)/gi, "DJ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type PassionEnergy = "creative" | "builder" | "care" | "balanced";

function classifyPassionDomain(text: string): PassionEnergy {
  const lower = text.toLowerCase();
  const hasCreative =
    /\b(design|designer|art|craft|crafts|music|dj|mixing|bake|baker|baking|cook|cooking|photo|photography|film|write|writer|fashion|paint|dance|dancing|curate|curator|architect|interior)\b/.test(
      lower
    );
  const hasBuilder =
    /\b(entrepreneur|business|construction|data|scientist|engineer|software|tech|finance|bank|consult|manage|founder|law|lawyer|doctor|research|strategy|analyst|marketing)\b/.test(
      lower
    );
  const hasCare =
    /\b(teach|teacher|therap|nurse|care|volunteer|community|social|travel|travelling|hospitality|home baker)\b/.test(
      lower
    );

  if (hasCreative && hasBuilder) return "balanced";
  if (hasCreative) return "creative";
  if (hasCare) return "care";
  if (hasBuilder) return "builder";
  return "balanced";
}

/**
 * Interprets a partner's raw Q2 answer into a clean, concise third-person clause
 * without ever echoing first-person pronouns ("I am..."), repeating the partner's
 * name awkwardly ("drawn to Samara is..."), or pasting multi-sentence transcripts.
 */
function interpretPartnerWorld(rawInput: string, partnerName: string): {
  clause: string;
  energy: PassionEnergy;
} {
  const cleanedRaw = normalizeCommonTypos(stripConversationalPrefixes(rawInput || ""));
  if (!cleanedRaw) {
    return { clause: "", energy: "balanced" };
  }

  const energy = classifyPassionDomain(cleanedRaw);

  // Split into sentences and keep at most the first two meaningful clauses, dropping filler commentary
  const rawSentences = cleanedRaw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/[.!?]+$/, "").trim())
    .filter((s) => {
      if (!s) return false;
      const l = s.toLowerCase();
      if (/^(it is a true passion|when (he|she|they) (is|are) not doing that|that is what|this is what)/.test(l)) {
        return false;
      }
      return true;
    })
    .slice(0, 2);

  let text = rawSentences.join(", ");

  // Strip partner name prefixes ("Samara is a...", "Yash is a...", "Arathi is a...")
  const firstToken = partnerName.split(/\s+/)[0] || partnerName;
  const namePattern = new RegExp(
    `^(?:${escapeRegExp(partnerName)}|${escapeRegExp(firstToken)})\\s+(?:is\\s+(?:an?\\s+)?|works\\s+(?:in|as|on)\\s+(?:an?\\s+)?|loves\\s+|enjoys\\s+)`,
    "i"
  );
  text = text.replace(namePattern, "");

  // Strip first-person prefixes & mid-sentence 1st/3rd person connectors
  text = text
    .replace(/^(?:i\s+am|i'm|i\s+work\s+(?:in|as|on)|i\s+do|my\s+work\s+is)\s+(?:an?\s+)?/i, "")
    .replace(/^(?:multi\s+entrepreneur\s+who\s+works\s+on)\s+/i, "entrepreneurship, ")
    .replace(/\bwho\s+works\s+on\s+/gi, "working across ")
    .replace(/\bby\s+day\s+and\s+in\s+(?:his|her|their|my)\s+free\s+time\s+(?:he|she|they|i)\s+gets?\s+lost\s+in\s+the\s+world\s+of\s+/gi, ", diving into ")
    .replace(/\b(?:he|she|they)\s+gets?\s+lost\s+in\s+the\s+world\s+of\s+/gi, "exploring ")
    .replace(/\ball\s+(?:her|his|their|my)\s+life\s+(?:she|he|they|i)\s+has\s+been\s+deeply\s+engrossed\s+in\s+/gi, "with a lifelong love for ")
    .replace(/\boutside\s+(?:of\s+)?work\s+(?:i|he|she|they)\s+(?:love|enjoy)s?\s+/gi, "alongside ")
    .replace(/\b(?:i|he|she)\s+(?:love|enjoy)s?\s+/gi, "")
    .replace(/\ba\s+fair\s+share\s+in\s+/gi, "")
    .replace(/\b(?:him|her)self\b/gi, "themselves")
    .replace(/\b(?:his|her)\b/gi, "their")
    .replace(/\b(?:he|she)\b/gi, "they")
    .replace(/\b(?:i|my|me|mine)\b/gi, "")
    .replace(/\s*,\s*,+/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  // Cap at ~14 words cleanly without cutting mid-phrase awkwardly
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 15) {
    text = words.slice(0, 14).join(" ").replace(/[,;:\-]+$/, "");
  }

  if (!text) return { clause: "", energy };

  // Lowercase leading letter for natural clause embedding (preserving acronyms like DJ)
  if (!/^[A-Z]{2,}\b/.test(text)) {
    text = text.charAt(0).toLowerCase() + text.slice(1);
  }

  // Format cleanly as a natural human predicate starting after partnerName
  const startsWithRoleNoun =
    /^(visual\s+designer|home\s+baker|data\s+scientist|software\s+engineer|architect|curator|photographer|entrepreneur|doctor|teacher|lawyer|designer|artist|musician|baker|chef|writer|analyst|consultant|director|manager|founder|marketer|student)\b/i.test(
      text
    );

  let clause = "";
  if (startsWithRoleNoun) {
    // Check if there's a second passion joined by and/with/alongside/diving/exploring
    if (/\b(?:and|with|alongside|diving|exploring)\b/i.test(text)) {
      clause = `${partnerName} balances life as a ${text}`;
    } else {
      clause = `${partnerName} pours quiet focus and care into being a ${text}`;
    }
  } else if (/^(entrepreneurship|working|building|creating|exploring|design|art|music|baking|cooking)/i.test(text)) {
    clause = `${partnerName} channels their energy into ${text}`;
  } else {
    clause = `${partnerName} brings a genuine passion for ${text}`;
  }

  // Clean up "a a " or "a entrepreneur" -> "an entrepreneur"
  clause = clause
    .replace(/\ba\s+([aeiou])/gi, "an $1")
    .replace(/\ban\s+(?=[bcdfghjklmnpqrstvwxyz])/gi, (m, offset, str) => {
      const after = str.slice(offset + 3);
      if (/^(entrepreneur|architect|artist|analyst)/i.test(after)) return "an ";
      return m;
    })
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  return { clause, energy };
}

/**
 * Synthesizes the "YOUR STORY & PERSONALITY" section following the Yash & Samara benchmark.
 * Anchored in emotional safety, shared trust, and creative balance.
 * Constructs exactly 3 organic, human-interpreted paragraphs (~180–220 words):
 * 1. Emotional safety & relationship foundation (never retelling dates/timelines)
 * 2. Individual personalities & creative balance (Q2 interpreted into natural third-person)
 * 3. Everyday dynamic, shared trust, quiet nuances, and the beginning of marriage.
 */
export function synthesizeYourStoryAndPersonality(
  answers: QuestionnaireAnswers,
  p1: string,
  p2: string
): string[] {
  const paragraphs: string[] = [];

  // Gather psychological signals across Q3, Q4, Q5, Q7, Q8 (without ever copying raw text)
  const signalText = [
    answers.q3_firstMeet || "",
    answers.q4_firstImpression?.partnerA || "",
    answers.q4_firstImpression?.partnerB || "",
    ...(answers.q5_threeWords || []),
    answers.q7_loveMost?.partnerA || "",
    answers.q7_loveMost?.partnerB || "",
    answers.q8_funnyStory || "",
  ]
    .join(" ")
    .toLowerCase();

  const isSchoolOrYears =
    /\b(school|grade|college|undergrad|years|childhood|grew up|long before)\b/.test(signalText);
  const isFriendshipFirst =
    /\b(friend|friends|best friend|companionship|crossed paths|common friend)\b/.test(signalText);
  const isLongDistance =
    /\b(distance|miles|cities|countries|time zone|facetime|flights|abroad|continental)\b/.test(signalText);
  const isStructuredMature =
    /\b(structured|organised|organized|mature|matured|steady|task driven|calm|safe|grounded|care|caring)\b/.test(
      signalText
    );
  const isPlayfulWarm =
    /\b(playful|funny|humour|humor|laugh|teased|crush|warm|easy|creative)\b/.test(signalText);

  // PARAGRAPH 1: Emotional safety, shared trust & meaningful journey
  let p1Text = "";
  if ((isSchoolOrYears || isFriendshipFirst) && isLongDistance) {
    p1Text =
      `What stands out about the two of you is that friendship and emotional safety have always been at the heart of your bond. Long before becoming partners, you stayed woven into each other's lives across different chapters, cities and time zones. What speaks loudest about your journey isn't the distance you navigated, but the patience, loyalty and quiet trust that turned a deep friendship into an unshakeable home for both of you.`;
  } else if (isStructuredMature && (isFriendshipFirst || !isLongDistance)) {
    p1Text =
      `What stands out about the two of you is the quiet maturity and genuine care that anchor your relationship. From the time your paths first crossed, there was a natural alignment in how thoughtfully you both move through life and look out for the people you love. Rather than rushing, you built a connection rooted in shared trust, clarity and emotional safety — a steady space where you can both simply be yourselves.`;
  } else if (isLongDistance) {
    p1Text =
      `What stands out about the two of you is the unwavering trust and patience that have shaped your connection. Even when life stretched across different places and schedules, you found consistent ways to show up in each other's everyday worlds. Choosing one another with intention through every chapter built a quiet emotional safety — the kind of deep, unforced trust that distance could never shake.`;
  } else if (isFriendshipFirst) {
    p1Text =
      `What stands out about the two of you is that your relationship has always had genuine friendship and emotional safety at its heart. Long before anything felt formal, you built an easy comfort together — a space where conversations flowed naturally and neither of you had to hold back. Through everyday life and quiet support, that companionship grew into a partnership rooted in deep trust.`;
  } else {
    p1Text =
      `What stands out about the two of you is the quiet emotional safety and natural warmth that hold your relationship together. From your earliest days, there has been an easy comfort between you — the kind where you feel deeply heard, supported and free to be completely yourselves. Over time, that shared trust has grown into a steady, comforting bond that feels unmistakably yours.`;
  }
  paragraphs.push(p1Text);

  // PARAGRAPH 2: Individual personalities & creative balance
  const w1 = interpretPartnerWorld(answers.q2_workPassion?.partnerA || "", p1);
  const w2 = interpretPartnerWorld(answers.q2_workPassion?.partnerB || "", p2);

  let balanceReflection = "Two distinct personal worlds that come together naturally.";
  if (w1.energy !== w2.energy) {
    balanceReflection =
      "On the surface your worlds look different, yet together they create a natural creative balance — pairing complementary strengths with shared warmth.";
  } else if (w1.energy === "creative" && w2.energy === "creative") {
    balanceReflection =
      "Two different creative worlds that meet easily, giving each other room to make, explore and inspire one another.";
  } else if (w1.energy === "builder" || w2.energy === "builder") {
    balanceReflection =
      "Even with full, driven days, you create space for both ambition and quiet calm inside your relationship.";
  }

  let p2Text = "";
  if (w1.clause && w2.clause) {
    p2Text =
      `There is something lovely about the way you are both best friends and partners while keeping your own individual spark. ${w1.clause}, while ${w2.clause}. ${balanceReflection}`;
  } else if (w1.clause || w2.clause) {
    const activeClause = w1.clause || w2.clause;
    p2Text =
      `There is something lovely about the way you stay deeply connected while honouring each other's individual worlds and interests. ${activeClause}, bringing curiosity and grounding into your life together. It's a gentle creative balance built on mutual respect for who each of you is.`;
  } else {
    p2Text =
      `There is something lovely about the way you seem to be both best friends and partners. You share a strong connection, while giving each other the space to hold your own interests, passions and creative rhythm — two individual worlds that come together with ease.`;
  }
  paragraphs.push(p2Text);

  // PARAGRAPH 3: Everyday dynamic, unspoken nuances & trust
  const aCallsB = (answers.q1_calls?.aCallsB || "").trim();
  const bCallsA = (answers.q1_calls?.bCallsA || "").trim();
  const validNicknames =
    aCallsB &&
    bCallsA &&
    aCallsB.length <= 18 &&
    bCallsA.length <= 18 &&
    !/\b(i|we|my|they|call)\b/i.test(`${aCallsB} ${bCallsA}`);

  const activities = (answers.q6_activities?.selected || []).filter(Boolean);
  const dynamicCue = isPlayfulWarm
    ? "the shared humour, easy playfulness"
    : "the everyday conversations, gentle humour";

  const detailClauses: string[] = [];
  if (validNicknames) {
    detailClauses.push(`playful nicknames like ${aCallsB} and ${bCallsA}`);
  }
  if (activities.length > 0) {
    const cleanAct = activities
      .slice(0, 2)
      .map((a) => a.toLowerCase())
      .join(" and ");
    detailClauses.push(`a shared love for ${cleanAct}`);
  }

  const extraDetail =
    detailClauses.length > 0 ? `, ${detailClauses.join(" and ")}` : "";

  const p3Text =
    `We also get the feeling that your relationship lives in the small, honest moments that make it yours — ${dynamicCue}${extraDetail}, and the quiet comfort of simply having each other around. More than anything, we see a couple who have built their bond on friendship, shared trust and emotional safety. And that is a beautiful place for a marriage to begin.`;

  paragraphs.push(p3Text);

  return paragraphs;
}

/**
 * Replaces ONLY the "YOUR STORY & PERSONALITY" section inside an existing Couple Letter,
 * leaving all other sections, salutations, and sign-off intact.
 */
function replaceStorySectionInLetter(
  existingLetter: string,
  newParagraphs: string[]
): string | null {
  const lines = existingLetter.split("\n");
  const startIdx = lines.findIndex((l) => {
    const t = l.trim();
    return t === "YOUR STORY & PERSONALITY" || t === "THEIR STORY & PERSONALITY";
  });

  if (startIdx === -1) return null;

  const knownNextHeadings = new Set([
    "THE WAY YOU WANT YOUR WEDDING TO FEEL",
    "THE WAY THEY WANT THEIR WEDDING TO FEEL",
    "IMPORTANT PEOPLE & MOMENTS",
    "MAKING YOU FEEL COMFORTABLE",
    "MAKING THEM FEEL COMFORTABLE",
    "WHAT MATTERS TO YOU",
    "WHAT MATTERS TO THEM",
    "COORDINATION & EXPECTATIONS",
    "OUR FINAL THOUGHT",
  ]);

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (knownNextHeadings.has(t) || t === "With love,") {
      endIdx = i;
      break;
    }
  }

  const before = lines.slice(0, startIdx + 1);
  const after = lines.slice(endIdx);
  const replacementBlock = ["", ...newParagraphs.flatMap((p) => [p, ""])];

  return [...before, ...replacementBlock, ...after].join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * Detects whether a saved Couple Letter contains legacy raw-pasting,
 * perspective-switching pronouns, or outdated template phrasing.
 */
export function isOutdatedCoupleLetter(
  savedLetter: string | undefined,
  answers?: QuestionnaireAnswers
): boolean {
  if (!savedLetter || savedLetter.trim().length < 50) return true;

  // Extract Section 1 text if present
  const sectionMatch = savedLetter.match(
    /YOUR STORY & PERSONALITY\s*([\s\S]*?)(?=THE WAY YOU WANT YOUR WEDDING TO FEEL|IMPORTANT PEOPLE & MOMENTS|MAKING YOU FEEL COMFORTABLE|WHAT MATTERS TO YOU|OUR FINAL THOUGHT|With love,|$)/i
  );
  const storyBody = sectionMatch ? sectionMatch[1].trim() : savedLetter;

  // Legacy template & pre-benchmark phrases
  const legacyMarkers = [
    "From what you've shared, you describe yourselves as",
    "You first met ",
    "focused on ",
    "engaged in ",
    "first impression of ",
    "You call each other ",
    "It's lovely to see how your individual pursuits complement your shared world",
    "You first connected through",
    "Your journey together began when you",
    "Looking back on those early days,",
    "What you appreciate most in one another is that steady sense of partnership:",
    "Outside of work, you love spending time",
  ];

  if (legacyMarkers.some((marker) => storyBody.includes(marker))) {
    return true;
  }

  // Perspective-switching / raw 1st-person client pronouns inside Story section
  const firstPersonLeak =
    /\b(I\s+(?:am|work|met|was|have|had|moved|decided|feel|love)|I'm|my\s+(?:hometown|classmates|parents|friends|first\s+impression)|we\s+(?:first\s+met|were|reconnected|became|remained|decided|have\s+had|needed)|our\s+(?:relationship|dynamic|big|venues|outfits|families))\b/i;
  if (firstPersonLeak.test(storyBody)) {
    return true;
  }

  // Word-count sanity check for Section 1 (raw copy-paste stories bloat > 260 words)
  if (sectionMatch) {
    const storyWords = storyBody.split(/\s+/).filter(Boolean).length;
    if (storyWords > 265) {
      return true;
    }
  }

  // Direct verbatim 7-word overlap with raw q3_firstMeet
  if (answers?.q3_firstMeet && answers.q3_firstMeet.trim().length > 40) {
    const q3Words = answers.q3_firstMeet.trim().toLowerCase().split(/\s+/);
    if (q3Words.length >= 7) {
      const samplePhrase = q3Words.slice(0, 7).join(" ");
      if (storyBody.toLowerCase().includes(samplePhrase)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Automatically upgrades outdated/legacy saved Couple Letters on open,
 * replacing only the "YOUR STORY & PERSONALITY" section when valid structure exists,
 * or regenerating cleanly if the letter is missing/malformed.
 */
export function upgradeCoupleLetterIfNeeded(
  savedLetter: string | undefined,
  answers: QuestionnaireAnswers,
  studioName: string = "OAKS Wedding"
): { letter: string; wasUpgraded: boolean } {
  if (!savedLetter || savedLetter.trim().length < 50) {
    return {
      letter: synthesizeCoupleLetter(answers, studioName),
      wasUpgraded: true,
    };
  }

  if (!isOutdatedCoupleLetter(savedLetter, answers)) {
    return { letter: savedLetter, wasUpgraded: false };
  }

  const p1 = (answers.partner1 || "Partner 1").trim();
  const p2 = (answers.partner2 || "Partner 2").trim();
  const newStoryParagraphs = synthesizeYourStoryAndPersonality(answers, p1, p2);
  const surgicallyUpdated = replaceStorySectionInLetter(savedLetter, newStoryParagraphs);

  return {
    letter: surgicallyUpdated || synthesizeCoupleLetter(answers, studioName),
    wasUpgraded: true,
  };
}

/**
 * Deterministic local synthesis for The Couple Letter (Version 2.0).
 * Implements Stage 1 understanding and Stage 2 natural human writing,
 * completely avoiding raw template pasting, empty lists, or generic filler.
 */
export function synthesizeCoupleLetter(
  answers: QuestionnaireAnswers,
  _studioName: string = "OAKS Wedding"
): string {
  const p1 = (answers.partner1 || "Partner 1").trim();
  const p2 = (answers.partner2 || "Partner 2").trim();

  const threeWords = (answers.q5_threeWords || [])
    .filter(Boolean)
    .map((w) => w.toLowerCase().trim());
  const wordsDesc =
    threeWords.length > 0
      ? threeWords.length === 1
        ? threeWords[0]
        : threeWords.length === 2
        ? `${threeWords[0]} and ${threeWords[1]}`
        : `${threeWords.slice(0, -1).join(", ")}, and ${threeWords[threeWords.length - 1]}`
      : "";

  const lines: string[] = [];

  // Title & Header
  lines.push(`${p1.toUpperCase()} & ${p2.toUpperCase()}`);
  lines.push("OUR UNDERSTANDING OF YOUR WEDDING");
  lines.push("");

  // Salutation & Opening
  lines.push(`Hi ${p1} & ${p2},`);
  lines.push("");
  lines.push(
    `Thank you for taking the time to share your answers with us. We've spent time reading through everything you shared, and we want to reflect our understanding of your story, your personalities, and how we intend to approach documenting your celebration.`
  );
  lines.push("");

  // SECTION 1: YOUR STORY & PERSONALITY (Yash & Samara Benchmark)
  lines.push("YOUR STORY & PERSONALITY");
  lines.push("");

  const storyParagraphs = synthesizeYourStoryAndPersonality(answers, p1, p2);
  storyParagraphs.forEach((para) => {
    lines.push(para);
    lines.push("");
  });

  // SECTION 2: THE WAY YOU WANT YOUR WEDDING TO FEEL
  lines.push("THE WAY YOU WANT YOUR WEDDING TO FEEL");
  lines.push("");

  const filmFeelSelected: string[] = Array.isArray((answers.q11_filmFeel as any)?.selected)
    ? (answers.q11_filmFeel as any).selected
    : typeof answers.q11_filmFeel === "string" && answers.q11_filmFeel
    ? [answers.q11_filmFeel]
    : [];

  const dayToneSelected: string[] = Array.isArray((answers.q13_tone as any)?.selected)
    ? (answers.q13_tone as any).selected
    : typeof answers.q13_tone === "string" && answers.q13_tone
    ? [answers.q13_tone]
    : [];

  if (filmFeelSelected.length > 0 || dayToneSelected.length > 0) {
    const feelText = filmFeelSelected.length > 0 ? filmFeelSelected.slice(0, 3).join(", ").toLowerCase() : "natural, candid storytelling";
    const toneText = dayToneSelected.length > 0 ? dayToneSelected.join(" and ") : "warm and celebratory";

    lines.push(
      `We understand that you envision your wedding celebration to feel ${toneText}, documented through ${feelText}.`
    );
    lines.push("");
    lines.push(
      `Our creative intention is to honor that vision by focusing on genuine, unprompted interactions — allowing the atmosphere of the day to unfold without interrupting the room, while crafting refined portraits with clean compositions and natural light.`
    );
    lines.push("");
  } else {
    lines.push(
      `Our creative approach will be centered on genuine, candid interactions and natural light — allowing you and your guests to live in each moment while we compose frames that feel timeless and emotionally authentic.`
    );
    lines.push("");
  }

  // SECTION 3: IMPORTANT PEOPLE & MOMENTS
  const familyList = answers.q10_people?.familyMembers || [];
  const mustCaptureFamily = familyList.filter((m) => m.mustCapture || m.name);
  const moments = answers.q14_moments?.selected || [];

  if (mustCaptureFamily.length > 0 || moments.length > 0) {
    lines.push("IMPORTANT PEOPLE & MOMENTS");
    lines.push("");

    if (mustCaptureFamily.length > 0) {
      const familyNames = mustCaptureFamily.slice(0, 5).map((m) => m.relationship ? `${m.name} (${m.relationship})` : m.name).join(", ");
      lines.push(
        `Weddings are as much about the people around you as the two of you at the altar. We've noted the important family members and loved ones who matter deeply to you — including ${familyNames}. Our team will ensure they are warmly and thoughtfully captured throughout the key ceremonies.`
      );
      lines.push("");
    }

    if (moments.length > 0) {
      const momentsList = moments.slice(0, 5).join(", ").toLowerCase();
      lines.push(
        `We are especially looking forward to documenting the moments you highlighted, including ${momentsList}. We will give these chapters dedicated attention while preserving the quiet, spontaneous exchanges happening around them.`
      );
      lines.push("");
    }
  }

  // SECTION 4: MAKING YOU FEEL COMFORTABLE
  lines.push("MAKING YOU FEEL COMFORTABLE");
  lines.push("");

  const cameraComfort = (answers.q18_cameraVersatility || "").toLowerCase();
  const comfortTips = answers.q21_comfortTips?.selected || [];
  const isCameraShy =
    cameraComfort.includes("shy") ||
    cameraComfort.includes("nervous") ||
    cameraComfort.includes("awkward") ||
    cameraComfort.includes("uncomfortable");

  if (isCameraShy) {
    lines.push(
      `You mentioned that being in front of the lens can feel slightly camera-shy or unfamiliar. We completely understand, and that is very common.`
    );
  } else {
    lines.push(
      `We know how important it is for camera coverage to feel effortless, natural, and never intrusive.`
    );
  }
  lines.push("");

  lines.push(
    `Our promise is that we will never force you into stiff, artificial poses or make you feel performative. We work with gentle, conversational direction, stepping back to let you be yourselves and stepping in with guidance only when it helps you feel confident.`
  );
  lines.push("");

  if (comfortTips.length > 0) {
    const tipMentions = comfortTips.join(", ").toLowerCase();
    lines.push(
      `We've noted your preferences for feeling at ease — particularly around ${tipMentions}. We'd love to connect before the wedding day so you feel completely familiar with our team before the cameras ever come out.`
    );
    lines.push("");
  }

  // SECTION 5: WHAT MATTERS TO YOU
  const priorities = answers.q19_whatMattersMost?.selected || [];
  const whyOaks = answers.choosingOaks?.trim();
  if (priorities.length > 0 || whyOaks) {
    lines.push("WHAT MATTERS TO YOU");
    lines.push("");
    if (priorities.length > 0) {
      const prioStr = priorities.join(" alongside ").toLowerCase();
      lines.push(
        `When selecting your photography and filmmaking team, you shared that your highest priorities are ${prioStr}.`
      );
      lines.push("");
    }
    if (whyOaks) {
      lines.push(
        `Hearing what drew you to OAKS Wedding means a great deal to our team, and it reminds us to stay true to the quiet honesty and craft you trusted us with.`
      );
      lines.push("");
    }
    lines.push(
      `We hold ourselves to those exact standards. Our responsibility is not just to deliver beautiful imagery, but to craft photographs and films that will feel honest, emotive, and true to your memories ten, twenty, and fifty years from now.`
    );
    lines.push("");
  }

  // SECTION 6: OUR FINAL THOUGHT
  lines.push("OUR FINAL THOUGHT");
  lines.push("");

  if (wordsDesc) {
    lines.push(
      `${p1} and ${p2}, our intention is simple: to create a wedding film and collection of photographs that feel like a pure reflection of who you are together — ${wordsDesc}.`
    );
  } else {
    lines.push(
      `${p1} and ${p2}, our intention is simple: to create a wedding film and collection of photographs that feel like a pure, heartfelt reflection of your bond.`
    );
  }
  lines.push("");

  lines.push(
    `We want you to soak in every second of your celebration, confident that every meaningful look, heartfelt tear, and celebration is in caring and capable hands.`
  );
  lines.push("");
  lines.push(
    `We cannot wait to be part of your wedding day and to create something timeless for you both.`
  );
  lines.push("");

  // Sign-off (Master standard)
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

    // Check for Section Headings
    const isHeading =
      trimmed === "YOUR STORY & PERSONALITY" ||
      trimmed === "THEIR STORY & PERSONALITY" ||
      trimmed === "THE WAY YOU WANT YOUR WEDDING TO FEEL" ||
      trimmed === "THE WAY THEY WANT THEIR WEDDING TO FEEL" ||
      trimmed === "IMPORTANT PEOPLE & MOMENTS" ||
      trimmed === "MAKING YOU FEEL COMFORTABLE" ||
      trimmed === "MAKING THEM FEEL COMFORTABLE" ||
      trimmed === "WHAT MATTERS TO YOU" ||
      trimmed === "WHAT MATTERS TO THEM" ||
      trimmed === "COORDINATION & EXPECTATIONS" ||
      trimmed === "OUR FINAL THOUGHT";

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
    if (trimmed === "With love," || trimmed.startsWith("Team OAKS") || trimmed.startsWith("With warm regards")) {
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
 * using the Version 2.0 Two-Stage Generation and Yash & Samara benchmark.
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
      const { letter } = upgradeCoupleLetterIfNeeded(data.letter.trim(), answers);
      return letter;
    }
  } catch (err) {
    console.warn("Failed to generate couple letter with Gemini, falling back to local synthesis:", err);
  }

  return synthesizeCoupleLetter(answers);
}
