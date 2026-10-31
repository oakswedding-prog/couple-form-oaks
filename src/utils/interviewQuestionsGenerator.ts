/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuestionnaireAnswers } from "../types/questionnaire.ts";

export const OAKS_INTERVIEW_SYSTEM_PROMPT = `
# OAKS WEDDING
## INTELLIGENT COUPLE INTERVIEW & TESTIMONIAL QUESTION GENERATOR

### 1. YOUR ROLE
You are the Lead Wedding Documentary Interviewer, Relationship Story Researcher and Creative Storytelling Director at OAKS WEDDING, a premium wedding photography and cinematography studio.

Your speciality is creating deeply personalised, open-ended interview questions for couples on their wedding day, reception day, haldi day or during a dedicated couple interview session.

You understand that the most memorable wedding films are created by capturing the voices, personalities, emotions, memories, relationships and little stories that make each couple unique.

Your responsibility is to study the couple's completed wedding questionnaire, understand their individual personalities and relationship dynamics, and transform their answers into exactly 11 exceptional interview questions.

These questions will be asked by a videographer who is sitting with the bride and groom, either individually or together.

The ultimate objective is to capture genuine, emotional, spontaneous and meaningful responses that can become part of their wedding film.

### 2. PRINCIPLES
- Generate exactly 11 numbered questions following the 11-question emotional storytelling journey.
- Personalise every question using the couple's actual questionnaire answers.
- Never invent relationship events, names, locations, or experiences.
- Ask open-ended questions that produce editable narrative film soundbites.
- For each question specify:
  1. Title
  2. The question
  3. Ask (Bride / Groom / Both)
  4. Optional follow-up prompt
- After the 11 questions, include:
  ### INTERVIEW DIRECTION (practical videographer guidance)
  ### THE CREATIVE OBJECTIVE (one concise closing sentence)
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
 * Deterministic, high-fidelity interview questions synthesizer.
 * Strictly adheres to the 11-question storytelling framework, personalizing
 * every question with the couple's questionnaire answers with zero hallucinations.
 */
export function synthesizeInterviewQuestions(
  answers: QuestionnaireAnswers,
  eventType: "wedding" | "haldi" | "reception" | "general" = "wedding"
): string {
  const p1 = (answers.partner1 || "Partner 1").trim();
  const p2 = (answers.partner2 || "Partner 2").trim();

  // Questionnaire details
  const aCallsB = answers.q1_calls?.aCallsB?.trim();
  const bCallsA = answers.q1_calls?.bCallsA?.trim();
  const meetStory = answers.q3_firstMeet?.trim();
  const p1Impression = answers.q4_firstImpression?.partnerA?.trim();
  const p2Impression = answers.q4_firstImpression?.partnerB?.trim();
  const threeWords = (answers.q5_threeWords || []).filter(Boolean);
  const activities = [
    ...(answers.q6_activities?.selected || []),
    answers.q6_activities?.other ? answers.q6_activities.other.trim() : "",
  ].filter(Boolean);
  const p1Loves = answers.q7_loveMost?.partnerA?.trim();
  const p2Loves = answers.q7_loveMost?.partnerB?.trim();
  const funnyStory = answers.q8_funnyStory?.trim();
  const proposalStory = answers.q9_proposal?.choice === "story" ? answers.q9_proposal.story?.trim() : "";

  const familyMembers = answers.q10_people?.familyMembers || [];
  const vipMembers = familyMembers.filter((m) => m.mustCapture);
  const emotionalPerson = answers.q17_emotional?.trim();

  const moments = [
    ...(answers.q14_moments?.selected || []),
    answers.q14_moments?.other ? answers.q14_moments.other.trim() : "",
  ].filter(Boolean);

  const futureFeeling = answers.q22_futureFeeling?.trim();
  const oneLastThing = answers.q23_oneLastThing?.notes?.trim();

  const lines: string[] = [];

  lines.push(`# OAKS WEDDING`);
  lines.push(`## THE COUPLE INTERVIEW — ${p1.toUpperCase()} & ${p2.toUpperCase()}`);
  lines.push("");

  // Q1: THE BEGINNING
  lines.push(`**QUESTION 01 — THE BEGINNING**`);
  if (meetStory) {
    lines.push(`**The question:** "Take us back to when your paths first crossed (${meetStory}). What was that initial moment when you looked at each other and thought, 'There is something genuinely different about this person'?"`);
  } else if (p1Impression || p2Impression) {
    lines.push(`**The question:** "Take us back to the early days when you first met. ${p1Impression ? `${p1}, you mentioned noticing ${p1Impression}. ` : ""}${p2Impression ? `${p2}, you felt ${p2Impression}. ` : ""}What was the moment you realized this wasn't just another date, but the start of something lasting?"`);
  } else {
    lines.push(`**The question:** "Take us back to the very beginning of your journey together. What was the exact moment or quality that first drew you to one another?"`);
  }
  lines.push(`**Ask:** Both.`);
  lines.push(`**Optional follow-up:** "Can you still remember what was going through your mind in that exact conversation?"`);
  lines.push("");

  // Q2: THE DEFINING MEMORY
  lines.push(`**QUESTION 02 — THE DEFINING MEMORY**`);
  if (proposalStory) {
    lines.push(`**The question:** "When you look back on the proposal (${proposalStory}), what was the one unspoken thought or feeling rushing through your chest the second you knew it was happening?"`);
    lines.push(`**Ask:** Both (or Groom then Bride).`);
    lines.push(`**Optional follow-up:** "What was the very first thing you did right after you said yes?"`);
  } else if (funnyStory) {
    lines.push(`**The question:** "You shared that defining memory about '${funnyStory}'. Take us right into that moment—why is that the story that captures who you two really are when nobody else is watching?"`);
    lines.push(`**Ask:** Both.`);
    lines.push(`**Optional follow-up:** "How did that moment change the way you looked at each other?"`);
  } else {
    lines.push(`**The question:** "Among all the trips, conversations, and milestones you've shared, which single memory instantly takes you back to when you felt your happiest together?"`);
    lines.push(`**Ask:** Both.`);
    lines.push(`**Optional follow-up:** "What made that specific day feel so unforgettable?"`);
  }
  lines.push("");

  // Q3: THE LITTLE THINGS
  lines.push(`**QUESTION 03 — THE LITTLE THINGS**`);
  let q3Detail = "";
  if (aCallsB || bCallsA) {
    q3Detail = `In private, you call each other "${[aCallsB, bCallsA].filter(Boolean).join('" and "')}". `;
  }
  if (activities.length > 0) {
    q3Detail += `Whether it's ${activities.slice(0, 2).join(" or ").toLowerCase()}, `;
  }
  lines.push(`**The question:** "${q3Detail}what is an everyday habit, quirk, or small ritual of your partner that never fails to make you smile—or laugh out loud?"`);
  lines.push(`**Ask:** Bride & Groom individually.`);
  lines.push(`**Optional follow-up:** "Have you ever told them how much you love that little habit?"`);
  lines.push("");

  // Q4: WHAT THEY ADMIRE ABOUT EACH OTHER
  lines.push(`**QUESTION 04 — WHAT THEY ADMIRE ABOUT EACH OTHER**`);
  if (p1Loves || p2Loves) {
    lines.push(`**The question:** "${p1}, you've expressed deep admiration for ${p1Loves || 'your partner'}. And ${p2}, for ${p2Loves || 'your partner'}. Looking at them right now, can you describe a time when you saw that quality shine through during a difficult or quiet moment?"`);
  } else {
    lines.push(`**The question:** "Beyond the celebrations and big milestones, what is the one quiet strength or act of kindness in your partner that makes you feel completely safe and understood?"`);
  }
  lines.push(`**Ask:** Bride & Groom individually.`);
  lines.push(`**Optional follow-up:** "What did that moment teach you about who they are as a human being?"`);
  lines.push("");

  // Q5: FAMILY AND THEIR JOURNEY
  lines.push(`**QUESTION 05 — FAMILY AND THEIR JOURNEY**`);
  if (vipMembers.length > 0) {
    const vipNames = vipMembers.slice(0, 3).map((m) => `${m.name} (${m.relationship})`).join(", ");
    lines.push(`**The question:** "You mentioned how central ${vipNames} are to your hearts. When your families came together to celebrate this union, was there a specific moment, blessing, or look in your parents' eyes that you will carry forever?"`);
  } else {
    lines.push(`**The question:** "Our families carry us to this milestone. When you look at your parents and elders today, what is the greatest lesson or blessing about love they have handed down to you?"`);
  }
  lines.push(`**Ask:** Both.`);
  lines.push(`**Optional follow-up:** "What would you want to thank them for if you had just one sentence right now?"`);
  lines.push("");

  // Q6: THE PEOPLE WHO MATTER MOST
  lines.push(`**QUESTION 06 — THE PEOPLE WHO MATTER MOST**`);
  if (emotionalPerson) {
    lines.push(`**The question:** "You anticipated that ${emotionalPerson} might feel this day most deeply. When you caught their eye amidst the crowd and music, what passed between you without saying a single word?"`);
  } else {
    lines.push(`**The question:** "Weddings bring together everyone from every chapter of your lives. Has there been a hug, a glance, or a whisper from someone dear to you that caught you completely off guard today?"`);
  }
  lines.push(`**Ask:** Bride individually, then Groom.`);
  lines.push(`**Optional follow-up:** "Why did that interaction hit your heart so profoundly?"`);
  lines.push("");

  // Q7: THE WEDDING DAY EXPERIENCE
  lines.push(`**QUESTION 07 — THE WEDDING DAY EXPERIENCE**`);
  if (eventType === "haldi") {
    lines.push(`**The question:** "Haldi is known for pure joy and uninhibited celebration. What was the wildest, warmest, or most unexpected moment when the yellow turmeric and laughter took over today?"`);
  } else if (eventType === "reception") {
    lines.push(`**The question:** "Now that the formal ceremonies have settled and you're surrounded by music and celebration tonight, what does it feel like to finally stand beside each other as husband and wife?"`);
  } else if (moments.length > 0) {
    lines.push(`**The question:** "You were both looking forward so eagerly to ${moments[0].toLowerCase()}. When that sequence actually unfolded, did it feel the way you had dreamed, or did reality take your breath away in an unexpected way?"`);
  } else {
    lines.push(`**The question:** "Amidst the rush of hair, makeup, music, and guests today, was there a single quiet pause when you took a deep breath and realized: 'This is really our wedding day'?"`);
  }
  lines.push(`**Ask:** Both.`);
  lines.push(`**Optional follow-up:** "What was the very first thing you whispered to each other in that pause?"`);
  lines.push("");

  // Q8: THE MOMENT THEY SAW EACH OTHER
  lines.push(`**QUESTION 08 — THE MOMENT THEY SAW EACH OTHER**`);
  lines.push(`**The question:** "Describe the exact second you saw each other dressed for this milestone—whether at the first look or walking down the aisle. What did your eyes tell you that words never could?"`);
  lines.push(`**Ask:** Groom first, then Bride.`);
  lines.push(`**Optional follow-up:** "Did your heart skip a beat, or did an overwhelming sense of calm wash over you?"`);
  lines.push("");

  // Q9: SOMETHING THEY WANT TO SAY
  lines.push(`**QUESTION 09 — SOMETHING THEY WANT TO SAY**`);
  lines.push(`**The question:** "Turn and look at each other for a second. Without holding back or worrying about the cameras, what is one heartfelt thing you want to tell your partner on this milestone that you may not have said aloud yet?"`);
  lines.push(`**Ask:** Both (speaking directly to each other).`);
  lines.push(`**Optional follow-up:** "Take a quiet moment to let that sink in together."`);
  lines.push("");

  // Q10: THEIR FUTURE TOGETHER
  lines.push(`**QUESTION 10 — THEIR FUTURE TOGETHER**`);
  if (futureFeeling) {
    lines.push(`**The question:** "You shared that decades from now, you hope watching your wedding film makes you feel '${futureFeeling}'. When you picture your home, your mornings, and your adventures thirty years down the road, what is the life you are building hand in hand?"`);
  } else {
    lines.push(`**The question:** "Years from now, when you're sitting on a quiet evening rewatching this film together, what is the one promise from today that you hope still rings true in every single second?"`);
  }
  lines.push(`**Ask:** Both.`);
  lines.push(`**Optional follow-up:** "What is the very first adventure you want to take once the celebrations conclude?"`);
  lines.push("");

  // Q11: THE FINAL EMOTIONAL MOMENT
  lines.push(`**QUESTION 11 — THE FINAL EMOTIONAL MOMENT**`);
  if (threeWords.length > 0) {
    lines.push(`**The question:** "You began this journey describing yourselves as '${threeWords.join(', ')}'. As you step forward into tomorrow as one, how would you finish this sentence: 'Marrying you today means...'?"`);
  } else if (oneLastThing) {
    lines.push(`**The question:** "Thinking about your entire journey and everything you've overcome to get here, what does this milestone mean to your souls?"`);
  } else {
    lines.push(`**The question:** "If your future children or grandchildren watch this film decades from now, what do you want them to know about the kind of love that brought you to this day?"`);
  }
  lines.push(`**Ask:** Bride then Groom.`);
  lines.push(`**Optional follow-up:** "Let that answer be the closing note of your story."`);
  lines.push("");

  // INTERVIEW DIRECTION
  lines.push(`### INTERVIEW DIRECTION`);
  lines.push(`- **Format & Delivery:** Begin with comfortable, lighter questions (Q1–Q3) to settle the couple before delving into family bonds (Q5–Q6) and intimate vows (Q8–Q9).`);
  lines.push(`- **Individual vs Joint Dynamics:** For Q3 and Q4, interview each partner individually if schedule permits so responses are genuine surprises for the film edit. For Q9 and Q10, have them sit close together and encourage eye contact.`);
  lines.push(`- **Pacing & Tone:** Do not rush answers. Give them 3 to 5 seconds of silence after an emotional response before offering the follow-up; that pause is often where the most tender soundbite surfaces.`);
  lines.push(`- **What to Avoid:** Never interrogate, judge, or ask questions requiring yes/no answers. Avoid asking for praise of the photo/cinema team.`);
  lines.push("");

  // THE CREATIVE OBJECTIVE
  lines.push(`### THE CREATIVE OBJECTIVE`);
  lines.push(`To capture the authentic cadence of ${p1} and ${p2}'s relationship—balancing their playful shared humour with the deep, unspoken emotional gratitude that anchors their commitment.`);

  return lines.join("\n").trim();
}

/**
 * Parses raw markdown interview questions into structured format for UI rendering.
 */
export function parseInterviewDocument(rawText: string, p1: string, p2: string): ParsedInterviewDocument {
  const questions: ParsedInterviewQuestion[] = [];

  const questionChunks = rawText.split(/(?=\*\*QUESTION\s+\d+)/);

  for (const chunk of questionChunks) {
    const match = chunk.match(/\*\*QUESTION\s+(\d+)\s*—\s*([^*]+)\*\*/);
    if (match) {
      const num = parseInt(match[1], 10);
      const title = match[2].trim();

      const qMatch = chunk.match(/\*\*The question:\*\*\s*"([^"]+)"|\*\*The question:\*\*\s*([^\n]+)/);
      const question = qMatch ? (qMatch[1] || qMatch[2]).trim() : "";

      const askMatch = chunk.match(/\*\*Ask:\*\*\s*([^\n.]+)/);
      const askTarget = askMatch ? askMatch[1].trim() : "Both";

      const followMatch = chunk.match(/\*\*Optional follow-up:\*\*\s*"([^"]+)"|\*\*Optional follow-up:\*\*\s*([^\n]+)/);
      const followUp = followMatch ? (followMatch[1] || followMatch[2]).trim() : "";

      questions.push({
        number: num,
        title,
        question,
        askTarget,
        followUp,
      });
    }
  }

  // Parse Interview Direction
  let direction = "";
  const dirMatch = rawText.match(/###\s+INTERVIEW DIRECTION\s*([\s\S]*?)(?=###\s+THE CREATIVE OBJECTIVE|$)/);
  if (dirMatch) {
    direction = dirMatch[1].trim();
  }

  // Parse Creative Objective
  let creativeObjective = "";
  const objMatch = rawText.match(/###\s+THE CREATIVE OBJECTIVE\s*([\s\S]*?)$/);
  if (objMatch) {
    creativeObjective = objMatch[1].trim();
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
 */
export async function generateInterviewQuestions(
  answers: QuestionnaireAnswers,
  options?: { forceAI?: boolean; eventType?: "wedding" | "haldi" | "reception" | "general" }
): Promise<string> {
  const eventType = options?.eventType || "wedding";
  const fallback = synthesizeInterviewQuestions(answers, eventType);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 14000);

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
      if (data && typeof data.interview === "string" && data.interview.trim().length > 200) {
        return data.interview.trim();
      }
    }
  } catch {
    // fallback gracefully
  }

  return fallback;
}
