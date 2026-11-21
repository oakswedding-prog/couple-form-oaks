/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuestionnaireAnswers } from "../types/questionnaire.ts";

/**
 * Master system prompt for OAKS WEDDING — Human Interview Question Generator (Version 2.0).
 * Enforces natural, conversational human tone, zero copied answers, and uses Riya & Roshan as benchmark.
 */
export const OAKS_INTERVIEW_SYSTEM_PROMPT = `
# OAKS WEDDING — HUMAN INTERVIEW QUESTION GENERATOR
## VERSION 2.0 — NATURAL, PERSONAL & AUTHENTIC

### 1. YOUR ROLE
You are a professional wedding interviewer and documentary storyteller working for OAKS WEDDING.
Your job is to read a couple's completed wedding questionnaire and create exactly 11 personalised interview questions for their wedding film.
These questions will be asked by a videographer sitting with the bride and groom during the wedding day, reception or another interview session.
Your goal is to make the couple feel like they are having a genuine conversation with someone who is interested in their story.
You are NOT writing a formal interview script, a psychological assessment or a collection of profound-sounding questions.
You are creating a natural conversation that helps couples remember, laugh, share stories, appreciate each other and express what they genuinely feel.
The questions should sound like something a thoughtful, curious human would actually ask.

### 2. THE BIGGEST RULE: NEVER COPY THEIR ANSWERS INTO QUESTIONS
- Read all 27 questionnaire answers and understand them.
- Use the information to discover interesting topics, memories and personal details.
- NEVER paste the couple's original answers into the questions.
- NEVER place long questionnaire responses inside brackets.
- NEVER repeat their full stories before asking them about those stories.
- NEVER make the question sound like the interviewer is reading their questionnaire aloud.

BAD EXAMPLE:
"Take us back to when your paths first crossed (We met at a small café. Roshan approached me, asked for my number...). What was going through your mind?"

GOOD EXAMPLE:
"When you look back at the beginning of your relationship, what is one thing about each other that you never imagined would bring you this far?"

### 3. SOUND LIKE A REAL HUMAN
Write in simple, conversational English.
Prefer:
- What was going through your mind?
- What do you remember most?
- What made you smile?
- What do you love about that?
- Can you tell us what happened?
- What was that moment like?
- Have you ever told them that?
- What do you think about it now?
- What are you most excited about?

AVOID overly dramatic or artificial expressions such as:
- "What was the unspoken thought rushing through your chest?"
- "What did your eyes tell you that words never could?"
- "Why did that interaction hit your heart so profoundly?"
- "As you step forward into tomorrow as one..."
- "What is the emotional cornerstone of your relationship?"
- "What does this milestone mean to your soul?"

Make it sound human, not impressive.

### 4. THE 11 STORYTELLING CATEGORIES
Use this storytelling structure as a guide:
01 — THE BEGINNING
02 — THE PROPOSAL OR DEFINING MEMORY
03 — THE LITTLE THINGS
04 — WHAT YOU ADMIRE
05 — THE FAMILY STORY / REACTION
06 — THE PEOPLE WHO MATTER
07 — THE WEDDING DAY SO FAR
08 — THE FIRST LOOK & THE VOWS
09 — A MESSAGE TO EACH OTHER
10 — THE FUTURE
11 — THE FINAL WORD

### 5. BENCHMARK QUALITY & TONE (RIYA & ROSHAN BENCHMARK)
Study this example of expected tone, natural language, and human warmth:

THE COUPLE INTERVIEW — RIYA & ROSHAN

01. THE BEGINNING
When you look back at the beginning of your relationship, what is one thing about each other that you never imagined would bring you this far?

02. THE PROPOSAL
Roshan, take us back to that surprise mountain trip. What was going through your mind while planning the proposal? And Riya, what was the very first thought that crossed your mind when you realised what was happening?

03. THE LITTLE THINGS
After spending almost two years together, what is one little habit, silly thing or everyday moment about each other that still makes you smile?

04. WHAT YOU ADMIRE
Riya, what is something about Roshan that makes you feel lucky to have him? And Roshan, what is that one thing about Riya that makes you fall in love with her all over again?

05. THE FAMILY REACTION
When you finally introduced each other to your families, how did everyone react? Was there a particular moment or someone's reaction that you will never forget?

06. THE PEOPLE WHO MATTER
Looking around today, with your parents, grandparents, siblings and everyone you love together, what does having all these people here mean to you?

07. THE WEDDING DAY SO FAR
What's been the most unexpected or emotional moment of today so far? Was there a moment when everything suddenly felt real — that you were actually getting married?

08. THE FIRST LOOK & THE VOWS
When you saw each other dressed for the wedding, what was going through your mind? Was there anything you wanted to say but couldn't quite put into words?

09. A MESSAGE TO EACH OTHER
If you could tell your partner one thing right now, without worrying about anyone else listening, what would you want them to know?

10. THE FUTURE
Imagine the two of you watching your wedding film ten or twenty years from today. What do you hope you'll remember about this particular day, and what kind of life do you hope you'll have built together by then?

11. THE FINAL WORD
Now that this day is becoming a memory, if you had to describe your love story and everything you're feeling right now in just a few words, what would you say?

### 6. REQUIRED OUTPUT FORMAT
# OAKS WEDDING
## THE COUPLE INTERVIEW — [BRIDE] & [GROOM]

Provide exactly 11 questions. For each question:

**01 — SHORT TITLE**

**Ask:** Bride / Groom / Both.

**Question:**
One natural, personalised and open-ended question.

**Optional follow-up:**
One short conversational prompt.

After the questions, provide:
### INTERVIEW DIRECTION
Short practical guidance on approach, separate vs joint interviews, balance of humor and emotion, and what to avoid.
`;

export interface ParsedInterviewQuestion {
  number: number;
  title: string;
  question: string;
  askTarget: "Bride" | "Groom" | "Both" | string;
  followUp: string;
}

export interface ParsedInterviewDocument {
  title: string;
  coupleNames: string;
  questions: ParsedInterviewQuestion[];
  direction: string;
  creativeObjective: string;
  rawText: string;
}

/**
 * Deterministic human-grade interview questions synthesizer.
 * Strictly adheres to Version 2.0 instructions and the Riya & Roshan benchmark:
 * - Natural, conversational English.
 * - Zero copied questionnaire paragraphs.
 * - Zero artificial drama or philosophical fluff.
 * - Authentic, thoughtful, and human.
 */
export function synthesizeInterviewQuestions(
  answers: QuestionnaireAnswers,
  eventType: "wedding" | "haldi" | "reception" | "general" = "wedding"
): string {
  const p1 = (answers.partner1 || "Partner 1").trim();
  const p2 = (answers.partner2 || "Partner 2").trim();

  // Context extracted without raw verbatim pasting
  const hasProposal = answers.q9_proposal?.choice === "story" && Boolean(answers.q9_proposal?.story?.trim());
  const proposalText = (answers.q9_proposal?.story || "").toLowerCase();
  const isTripProposal = proposalText.includes("trip") || proposalText.includes("travel") || proposalText.includes("holiday") || proposalText.includes("mountain") || proposalText.includes("beach");
  
  const hasGrandparents =
    (answers.q10_people?.familyMembers || []).some(
      (m) =>
        m.relationship.toLowerCase().includes("grand") ||
        m.name.toLowerCase().includes("grand")
    ) ||
    [
      answers.q10_people?.treeNotes || "",
      answers.q10_people?.brideSide?.notes || "",
      answers.q10_people?.groomSide?.notes || "",
      ...(answers.q10_people?.brideSide?.photos || []).map((p) => p.caption || ""),
      ...(answers.q10_people?.groomSide?.photos || []).map((p) => p.caption || ""),
    ]
      .join(" ")
      .toLowerCase()
      .includes("grand");

  const lines: string[] = [];

  lines.push(`# OAKS WEDDING`);
  lines.push(`## THE COUPLE INTERVIEW — ${p1.toUpperCase()} & ${p2.toUpperCase()}`);
  lines.push("");

  // 01 — THE BEGINNING
  lines.push(`**01 — THE BEGINNING**`);
  lines.push(`**Ask:** Both.`);
  lines.push(`**Question:**`);
  lines.push(`When you look back at the beginning of your relationship, what is one thing about each other that you never imagined would bring you this far?`);
  lines.push(`**Optional follow-up:**`);
  lines.push(`Can you remember the exact moment or conversation when you realized this wasn't just another date?`);
  lines.push("");

  // 02 — THE PROPOSAL OR DEFINING MEMORY
  lines.push(`**02 — THE PROPOSAL**`);
  if (hasProposal) {
    if (isTripProposal) {
      lines.push(`**Ask:** Both (Groom first, then Bride).`);
      lines.push(`**Question:**`);
      lines.push(`${p2}, take us back to planning that surprise trip and proposal. What was going through your mind beforehand? And ${p1}, what was the very first thought that crossed your mind when you realized what was happening?`);
    } else {
      lines.push(`**Ask:** Both (Groom first, then Bride).`);
      lines.push(`**Question:**`);
      lines.push(`${p2}, take us back to the proposal. What was going through your mind while planning it? And ${p1}, what was the very first thought that crossed your mind when you realized what was happening?`);
    }
  } else {
    lines.push(`**Ask:** Both.`);
    lines.push(`**Question:**`);
    lines.push(`Take us back to that defining milestone or trip together. What was going through your mind, and when did you both realize that you had found your person?`);
  }
  lines.push(`**Optional follow-up:**`);
  lines.push(`What was the very first thing you did or said right after?`);
  lines.push("");

  // 03 — THE LITTLE THINGS
  lines.push(`**03 — THE LITTLE THINGS**`);
  lines.push(`**Ask:** Both.`);
  lines.push(`**Question:**`);
  lines.push(`After all this time together, what is one little habit, silly thing or everyday moment about each other that still makes you smile?`);
  lines.push(`**Optional follow-up:**`);
  lines.push(`Have you ever told them how much you secretly love that little habit?`);
  lines.push("");

  // 04 — WHAT YOU ADMIRE
  lines.push(`**04 — WHAT YOU ADMIRE**`);
  lines.push(`**Ask:** Bride & Groom individually.`);
  lines.push(`**Question:**`);
  lines.push(`${p1}, what is something about ${p2} that makes you feel lucky to have him? And ${p2}, what is that one thing about ${p1} that makes you fall in love with her all over again?`);
  lines.push(`**Optional follow-up:**`);
  lines.push(`Can you recall a quiet day when that quality stood out more than ever?`);
  lines.push("");

  // 05 — THE FAMILY REACTION
  lines.push(`**05 — THE FAMILY REACTION**`);
  lines.push(`**Ask:** Both.`);
  lines.push(`**Question:**`);
  lines.push(`When you finally introduced each other to your families, how did everyone react? Was there a particular moment or someone's reaction that you will never forget?`);
  lines.push(`**Optional follow-up:**`);
  lines.push(`Did anyone say something that instantly made you feel welcomed as family?`);
  lines.push("");

  // 06 — THE PEOPLE WHO MATTER
  lines.push(`**06 — THE PEOPLE WHO MATTER**`);
  lines.push(`**Ask:** Both.`);
  lines.push(`**Question:**`);
  if (hasGrandparents) {
    lines.push(`Looking around today, with your parents, grandparents, siblings and everyone you love together, what does having all these people here mean to you?`);
  } else {
    lines.push(`Looking around today, with your parents, siblings, family and dearest friends gathered together, what does having all these people here mean to your hearts?`);
  }
  lines.push(`**Optional follow-up:**`);
  lines.push(`Has there been a warm hug or quiet blessing today that caught you by surprise?`);
  lines.push("");

  // 07 — THE WEDDING DAY
  if (eventType === "haldi") {
    lines.push(`**07 — THE HALDI CELEBRATION**`);
    lines.push(`**Ask:** Both.`);
    lines.push(`**Question:**`);
    lines.push(`Haldi celebrations are always full of pure joy and energy. What's been the funniest or warmest moment when everyone surrounded you today?`);
  } else if (eventType === "reception") {
    lines.push(`**07 — THE RECEPTION NIGHT**`);
    lines.push(`**Ask:** Both.`);
    lines.push(`**Question:**`);
    lines.push(`Now that the formal ceremonies have settled and you're celebrating tonight, what does it feel like to finally stand beside each other as husband and wife?`);
  } else {
    lines.push(`**07 — THE WEDDING DAY SO FAR**`);
    lines.push(`**Ask:** Both.`);
    lines.push(`**Question:**`);
    lines.push(`What's been the most unexpected or emotional moment of today so far? Was there a moment when everything suddenly felt real — that you were actually getting married?`);
  }
  lines.push(`**Optional follow-up:**`);
  lines.push(`What was the very first thing you whispered to each other in that moment?`);
  lines.push("");

  // 08 — THE FIRST LOOK & THE VOWS
  lines.push(`**08 — THE FIRST LOOK & THE VOWS**`);
  lines.push(`**Ask:** Groom first, then Bride.`);
  lines.push(`**Question:**`);
  lines.push(`When you saw each other dressed for the wedding, what was going through your mind? Was there anything you wanted to say but couldn't quite put into words?`);
  lines.push(`**Optional follow-up:**`);
  lines.push(`Did your heart skip a beat, or did an overwhelming sense of calm wash over you?`);
  lines.push("");

  // 09 — A MESSAGE TO EACH OTHER
  lines.push(`**09 — A MESSAGE TO EACH OTHER**`);
  lines.push(`**Ask:** Both (facing each other).`);
  lines.push(`**Question:**`);
  lines.push(`If you could tell your partner one thing right now, without worrying about anyone else listening, what would you want them to know?`);
  lines.push(`**Optional follow-up:**`);
  lines.push(`Take a quiet breath and look at each other for a second.`);
  lines.push("");

  // 10 — THE FUTURE
  lines.push(`**10 — THE FUTURE**`);
  lines.push(`**Ask:** Both.`);
  lines.push(`**Question:**`);
  lines.push(`Imagine the two of you watching your wedding film ten or twenty years from today. What do you hope you'll remember about this particular day, and what kind of life do you hope you'll have built together by then?`);
  lines.push(`**Optional follow-up:**`);
  lines.push(`What is the first simple adventure you can't wait to take together once the wedding concludes?`);
  lines.push("");

  // 11 — THE FINAL WORD
  lines.push(`**11 — THE FINAL WORD**`);
  lines.push(`**Ask:** Both.`);
  lines.push(`**Question:**`);
  lines.push(`Now that this day is becoming a memory, if you had to describe your love story and everything you're feeling right now in just a few words, what would you say?`);
  lines.push(`**Optional follow-up:**`);
  lines.push(`Let that be the closing thought for your wedding film.`);
  lines.push("");

  // INTERVIEW DIRECTION
  lines.push(`### INTERVIEW DIRECTION`);
  lines.push(`- **Atmosphere:** Keep the conversation casual, warm, and friendly. Treat it like a chat over coffee, not an audition or formal press junket.`);
  lines.push(`- **Individual vs. Joint:** Ask Q03 and Q04 individually so their answers are genuine, affectionate surprises in the final film edit. For Q09, seat them close together.`);
  lines.push(`- **Pacing & Pauses:** Never rush past an emotional moment. When they finish speaking, pause for 3–4 seconds of comfortable silence; that natural pause often brings out the most honest follow-up reaction.`);
  lines.push(`- **What to Avoid:** Do not interrogate, never read questions like a school exam, and avoid forced movie melodrama. Let genuine laughter and real affection lead the way.`);

  return lines.join("\n").trim();
}

/**
 * Parses raw interview markdown into structured objects for UI rendering.
 * Works seamlessly with both Version 2.0 format and fallback formats.
 */
export function parseInterviewDocument(rawText: string, p1: string, p2: string): ParsedInterviewDocument {
  const questions: ParsedInterviewQuestion[] = [];

  // Match questions in multiple formats: **01 — TITLE**, 01. TITLE, **QUESTION 01 — TITLE**
  const questionRegex = /(?:\*\*|\b)(?:QUESTION\s+)?(\d{1,2})[\s.—]+([^*\n]+)(?:\*\*)?/gi;
  
  // Find all question headers and their positions
  const matches: { number: number; title: string; index: number; fullMatch: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = questionRegex.exec(rawText)) !== null) {
    const num = parseInt(m[1], 10);
    if (num >= 1 && num <= 11) {
      matches.push({
        number: num,
        title: m[2].trim().replace(/\*+/g, ""),
        index: m.index,
        fullMatch: m[0],
      });
    }
  }

  // De-duplicate in case of multiple matches for the same number
  const uniqueMatches: typeof matches = [];
  const seenNumbers = new Set<number>();
  for (const match of matches) {
    if (!seenNumbers.has(match.number)) {
      seenNumbers.add(match.number);
      uniqueMatches.push(match);
    }
  }

  for (let i = 0; i < uniqueMatches.length; i++) {
    const cur = uniqueMatches[i];
    const nextIndex = i + 1 < uniqueMatches.length ? uniqueMatches[i + 1].index : rawText.length;
    const chunk = rawText.substring(cur.index, nextIndex);

    // Extract Ask target
    const askMatch = chunk.match(/\*\*Ask:\*\*\s*([^\n.]+)/i);
    const askTarget = askMatch ? askMatch[1].trim() : "Both";

    // Extract Question
    let question = "";
    const qMatch = chunk.match(/\*\*Question:\*\*\s*\n?([^\n*]+(?:\n[^\n*]+)*)/i);
    if (qMatch) {
      question = qMatch[1].trim();
    } else {
      // Fallback: search for quoted text or text right after the header
      const quoteMatch = chunk.match(/"([^"]{15,})"/);
      if (quoteMatch) {
        question = quoteMatch[1].trim();
      } else {
        // Line based extraction
        const lines = chunk
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("**") && !l.startsWith("###") && !l.startsWith("#"));
        if (lines.length > 0) {
          question = lines[0];
        }
      }
    }

    // Clean question text of surrounding quotes
    question = question.replace(/^["“”]/, "").replace(/["“”]$/, "").trim();

    // Extract Follow-up
    let followUp = "";
    const fMatch = chunk.match(/\*\*Optional follow-up:\*\*\s*\n?([^\n*]+(?:\n[^\n*]+)*)/i);
    if (fMatch) {
      followUp = fMatch[1].trim().replace(/^["“”]/, "").replace(/["“”]$/, "").trim();
    }

    questions.push({
      number: cur.number,
      title: cur.title,
      question,
      askTarget,
      followUp,
    });
  }

  // Extract Direction
  let direction = "";
  const dirMatch = rawText.match(/###\s+INTERVIEW DIRECTION\s*([\s\S]*?)(?=###|$)/i);
  if (dirMatch) {
    direction = dirMatch[1].trim();
  }

  // Extract Objective
  let creativeObjective = "";
  const objMatch = rawText.match(/###\s+(?:THE CREATIVE OBJECTIVE|CREATIVE OBJECTIVE)\s*([\s\S]*?)$/i);
  if (objMatch) {
    creativeObjective = objMatch[1].trim().replace(/^["“”]/, "").replace(/["“”]$/, "").trim();
  }

  return {
    title: `THE COUPLE INTERVIEW — ${p1.toUpperCase()} & ${p2.toUpperCase()}`,
    coupleNames: `${p1} & ${p2}`,
    questions,
    direction,
    creativeObjective,
    rawText,
  };
}

/**
 * Generates the 11 Interview Questions using Gemini if available, with deterministic fallback.
 * Strictly enforces Version 2.0 Human Interview prompt and Riya & Roshan benchmark.
 */
export async function generateInterviewQuestions(
  answers: QuestionnaireAnswers,
  options?: { forceAI?: boolean; eventType?: "wedding" | "haldi" | "reception" | "general" }
): Promise<string> {
  const eventType = options?.eventType || "wedding";
  const fallback = synthesizeInterviewQuestions(answers, eventType);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const res = await fetch("/api/generate-interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers,
        eventType,
        systemPrompt: OAKS_INTERVIEW_SYSTEM_PROMPT,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.interview === "string" && data.interview.trim().length > 150) {
        return data.interview.trim();
      }
    }
  } catch {
    // fallback gracefully to deterministic synthesizer
  }

  return fallback;
}
