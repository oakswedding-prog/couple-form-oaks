/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { cleanSentenceText, deduplicateTranscript } from "./textCleaner.ts";
import { generateBriefSummary } from "./briefGenerator.ts";
import { synthesizeCheatSheet, parseCheatSheetDocument } from "./cheatSheetGenerator.ts";
import {
  synthesizeCoupleLetter,
  parseCoupleLetterDocument,
  isOutdatedCoupleLetter,
  upgradeCoupleLetterIfNeeded,
} from "./coupleLetterGenerator.ts";
import type { QuestionnaireAnswers } from "../types/questionnaire.ts";

test("cleanSentenceText capitalizes sentence starts and normalizes spaces", () => {
  const input = "we met at coffee. it was raining! did you know? yes.";
  const expected = "We met at coffee. It was raining! Did you know? Yes.";
  assert.equal(cleanSentenceText(input), expected);
});

test("cleanSentenceText handles empty or whitespace-only strings gracefully", () => {
  assert.equal(cleanSentenceText(""), "");
  assert.equal(cleanSentenceText("   "), "");
});

test("deduplicateTranscript avoids appending identical duplicate chunks", () => {
  const existing = "We love to travel together";
  const duplicateChunk = "travel together";
  const result = deduplicateTranscript(existing, duplicateChunk);
  assert.equal(result, "We love to travel together");
});

test("deduplicateTranscript appends new distinct chunk with space", () => {
  const existing = "We love to travel";
  const newChunk = "especially to Japan";
  const result = deduplicateTranscript(existing, newChunk);
  assert.equal(result, "We love to travel especially to Japan");
});

test("generateBriefSummary formats all 5 chapters and One Last Thing with couple names", () => {
  const mockAnswers: QuestionnaireAnswers = {
    partner1: "Aarav",
    partner2: "Meera",
    q1_calls: { aCallsB: "Meer", bCallsA: "Aaru" },
    q2_workPassion: { partnerA: "Architect", partnerB: "Curator" },
    q3_firstMeet: "Library cafe in Bangalore",
    q4_firstImpression: { partnerA: "Thoughtful smile", partnerB: "Sharp style" },
    q5_threeWords: ["Warm", "Adventurous", "Steady"],
    q6_activities: { selected: ["Travelling", "Food and cafes"], other: "Pottery" },
    q7_loveMost: { partnerA: "Her empathy", partnerB: "His humor" },
    q8_funnyStory: "Got lost on a scooter in Goa",
    q9_proposal: { choice: "story", story: "Sunset cliffside in Udaipur" },
    q10_people: {
      familyMembers: [
        {
          id: "1",
          name: "Sunita",
          relationship: "Mother",
          side: "sideA",
          mustCapture: true,
        },
      ],
      treeNotes: "Close-knit extended family",
    },
    q11_filmFeel: { selected: ["Natural and candid"], other: "" },
    q12_references: {
      links: ["https://pinterest.com/pin/123"],
      images: [],
      notes: "Love grain and warm natural light",
    },
    weddingOutfits: {
      links: ["https://pinterest.com/outfits"],
      images: [],
      notes: "Ivory silk saree and tailored black bandhgala",
    },
    decorMoodBoard: {
      links: ["https://pinterest.com/decor"],
      images: [],
      notes: "Candlelit courtyard with marigold and sage",
    },
    q13_tone: { selected: ["Romantic & Intimate"], other: "" },
    q14_moments: {
      selected: ["First look or first glance", "Quiet moments together"],
      other: "",
    },
    q15_captureAvoid: {
      definitelyCapture: "Grandparents dancing",
      pleaseAvoid: "Awkward stiff line-up photos",
    },
    q16_nonNegotiables: "Keep audio of our vows crystal clear",
    q17_emotional: "Aarav",
    q18_cameraVersatility: "Pretty comfortable",
    choosingOaks: "Your documentary storytelling and timeless colour palette",
    q19_whatMattersMost: {
      selected: ["Storytelling and film quality", "Personality and how comfortable we feel"],
      other: "",
    },
    q20_guidanceComfort: "Happy with gentle guidance",
    q21_comfortTips: {
      selected: ["A moment alone as a couple"],
      notes: "A quick breath before portraits",
    },
    q22_futureFeeling: "Warm nostalgia and happy tears",
    primaryContact: {
      role: "Someone else",
      side: "Bride's side",
      gender: "Woman",
      name: "Ananya Rao",
      phone: "+91 98765 12345",
    },
    loveStoryNarrative: "We met at a design workshop and stayed best friends for years before realizing we were meant to be.",
    q23_oneLastThing: {
      notes: "Our dog Bruno might wear a bow-tie!",
      images: [],
    },
  };

  const brief = generateBriefSummary("Velvet & Vine Studios", mockAnswers);

  assert.ok(brief.includes("VELVET & VINE STUDIOS"));
  assert.ok(brief.includes("Aarav & Meera"));
  assert.ok(brief.includes("CHAPTER 1: YOUR STORY"));
  assert.ok(brief.includes("CHAPTER 2: YOUR PEOPLE"));
  assert.ok(brief.includes("CHAPTER 3: THE LOOK AND FEEL"));
  assert.ok(brief.includes("CHAPTER 4: YOUR DAY"));
  assert.ok(brief.includes("CHAPTER 5: WORKING TOGETHER"));
  assert.ok(brief.includes("ONE LAST THING"));
  assert.ok(brief.includes("13. Have you finalised your wedding outfits? We'd love to know about your wardrobe plans."));
  assert.ok(brief.includes("Ivory silk saree and tailored black bandhgala"));
  assert.ok(brief.includes("14. Do you have a wedding decor mood board or any visual references for your celebration?"));
  assert.ok(brief.includes("Candlelit courtyard with marigold and sage"));
  assert.ok(brief.includes("15. What tone are you expecting to set for your wedding day"));
  assert.ok(brief.includes("21. What mattered most to you when choosing OAKS Wedding to capture your wedding?"));
  assert.ok(brief.includes("Your documentary storytelling and timeless colour palette"));
  assert.ok(brief.includes("22. What matters most to you when choosing a wedding photography and filmmaking team?"));
  assert.ok(brief.includes("26. Who should be our primary point of contact for wedding-related communication and coordination?"));
  assert.ok(brief.includes("Ananya Rao"));
  assert.ok(brief.includes("Bride's side"));
  assert.ok(brief.includes("27. Last but not least, we'd love to hear your story. How did your journey begin, and what would you love us to know about the two of you?"));
  assert.ok(brief.includes("We met at a design workshop and stayed best friends for years"));
  assert.ok(brief.includes("28. Is there anything else you'd like to let us know?"));
  assert.ok(brief.includes("Sunita (Mother) — [MUST CAPTURE]"));
  assert.ok(brief.includes("Natural and candid"));
  assert.ok(brief.includes("Bruno might wear a bow-tie"));
});

test("synthesizeCheatSheet and parseCheatSheetDocument match the master 6-section benchmark", async () => {
  const { synthesizeCheatSheet, parseCheatSheetDocument } = await import("./cheatSheetGenerator.ts");
  const mockAnswers: QuestionnaireAnswers = {
    partner1: "Riya Jacob",
    partner2: "Roshan Mathew",
    q1_calls: { aCallsB: "Rosh", bCallsA: "Riri" },
    q2_workPassion: { partnerA: "Doctor", partnerB: "Engineer" },
    q3_firstMeet: "Met during college festival in Kochi",
    q4_firstImpression: { partnerA: "Quiet smile", partnerB: "Very warm" },
    q5_threeWords: ["Playful", "Adventurous", "Loving"],
    q6_activities: { selected: ["Travel"], other: "" },
    q7_loveMost: { partnerA: "Kindness", partnerB: "Energy" },
    q8_funnyStory: "",
    q9_proposal: { choice: "story", story: "Surprise mountain trip with a handwritten letter" },
    q10_people: {
      familyMembers: [
        { id: "1", name: "Mini", relationship: "Mother", side: "sideA", mustCapture: true },
        { id: "2", name: "Francis", relationship: "Father", side: "sideA", mustCapture: true },
        { id: "3", name: "Gladson", relationship: "Brother", side: "sideA", mustCapture: false },
        { id: "4", name: "Michelle", relationship: "Cousin", side: "sideB", mustCapture: false },
      ],
      treeNotes: "Grandparents are very dear to us",
    },
    q11_filmFeel: { selected: ["Natural and candid", "Cinematic"], other: "" },
    q12_references: { links: [], images: [], notes: "" },
    q13_tone: { selected: ["Romantic & Intimate"], other: "" },
    q14_moments: { selected: ["First Look", "Exchange of Vows", "Speeches"], other: "" },
    q15_captureAvoid: {
      definitelyCapture: "Private letter exchange before ceremony, vows and speeches",
      pleaseAvoid: "Forced poses, artificial smiles",
    },
    q16_nonNegotiables: "Ensure clear audio recordings of vows, speeches and toasts.",
    q17_emotional: "Roshan's father",
    q18_cameraVersatility: "Pretty comfortable",
    q19_whatMattersMost: { selected: ["Storytelling"], other: "" },
    q20_guidanceComfort: "Gentle guidance",
    q21_comfortTips: { selected: ["Show occasional previews"], notes: "" },
    q22_futureFeeling: "Joyful",
    primaryContact: {
      role: "Bride",
      name: "Riya Jacob",
      phone: "+91 99999 88888",
    },
    q23_oneLastThing: { notes: "", images: [] },
  };

  const sheet = synthesizeCheatSheet(mockAnswers, "OAKS WEDDING");
  assert.ok(sheet.includes("OAKS WEDDING"));
  assert.ok(sheet.includes("01 — THE VIBE"));
  assert.ok(sheet.includes("Playful · Adventurous · Loving"));
  assert.ok(sheet.includes("02 — TOP PRIORITIES"));
  assert.ok(sheet.includes("03 — MUST-CAPTURE MOMENTS"));
  assert.ok(sheet.includes("04 — IMPORTANT PEOPLE"));
  assert.ok(sheet.includes("Mini — Mother"));
  assert.ok(sheet.includes("Francis — Father"));
  assert.ok(sheet.includes("Grandparents — Special priority"));
  assert.ok(sheet.includes("05 — PLEASE AVOID"));
  assert.ok(sheet.includes("06 — WORKING WITH THE COUPLE"));
  assert.ok(sheet.includes("Primary contact: Riya Jacob (Bride) · +91 99999 88888"));
  assert.ok(sheet.includes("TECHNICAL NON-NEGOTIABLE"));

  // Check word count is practical for 30-60 second scan (~150-220 words)
  const words = sheet.replace(/[#*—\-]/g, "").split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 120 && words <= 260, `Word count was ${words}`);

  // Test parsed document
  const parsed = parseCheatSheetDocument(sheet, "Riya Jacob", "Roshan Mathew");
  assert.equal(parsed.vibeWords, "Playful · Adventurous · Loving");
  assert.ok(parsed.topPriorities.length >= 3);
  assert.ok(parsed.mustCaptureMoments.length >= 4);
  assert.ok(parsed.importantPeople.length >= 4);
  assert.ok(parsed.pleaseAvoid.length >= 3);
  assert.ok(parsed.workingWithCouple.length >= 3);
  assert.ok(parsed.technicalNonNegotiable?.includes("audio"));
});

test("synthesizeCoupleLetter matches the Yash & Samara 3-paragraph benchmark for YOUR STORY & PERSONALITY", () => {
  const mockAnswers: QuestionnaireAnswers = {
    partner1: "Yash",
    partner2: "Samara",
    weddingDate: "2027-02-14",
    q1_calls: { aCallsB: "Sami", bCallsA: "Yashy" },
    q2_workPassion: {
      partnerA: "I produce music and mix sounds",
      partnerB: "I work in design, art and making things",
    },
    q3_firstMeet: "We were friends in college for years before anything happened",
    q4_firstImpression: { partnerA: "Artistic presence", partnerB: "Super funny and warm" },
    q5_threeWords: ["Playful", "Grounded", "Creative"],
    q6_activities: { selected: ["Listening to vinyl records", "Trying new cafes"], other: "" },
    q7_loveMost: { partnerA: "Her empathy and creativity", partnerB: "His steady humor" },
    q8_funnyStory: "Burned toast on our first road trip",
    q9_proposal: { choice: "story", story: "Studio listening party" },
    q10_people: { familyMembers: [], treeNotes: "" },
    q11_filmFeel: { selected: ["Documentary"], other: "" },
    q12_references: { links: [], images: [], notes: "" },
    q13_tone: { selected: ["Warm"], other: "" },
    q14_moments: { selected: ["First look"], other: "" },
    q15_captureAvoid: { definitelyCapture: "", pleaseAvoid: "" },
    q16_nonNegotiables: "",
    q17_emotional: "",
    q18_cameraVersatility: "Comfortable",
    q19_whatMattersMost: { selected: ["Storytelling"], other: "" },
    q20_guidanceComfort: "",
    q21_comfortTips: { selected: [], notes: "" },
    q22_futureFeeling: "Timeless",
    q23_oneLastThing: { notes: "", images: [] },
  };

  const letter = synthesizeCoupleLetter(mockAnswers, "OAKS Wedding");
  assert.ok(letter.includes("YASH & SAMARA"));
  assert.ok(letter.includes("OUR UNDERSTANDING OF YOUR WEDDING"));
  assert.ok(letter.includes("YOUR STORY & PERSONALITY"));
  assert.ok(letter.includes("With love,\nTeam OAKS Wedding"));

  const parsed = parseCoupleLetterDocument(letter, "Yash", "Samara");
  const storySection = parsed.sections.find((s) => s.title === "YOUR STORY & PERSONALITY");
  assert.ok(storySection, "YOUR STORY & PERSONALITY section must exist");

  // Verify exactly 3 organic paragraphs
  assert.equal(storySection.paragraphs.length, 3, "Must have exactly 3 organic paragraphs");

  // Paragraph 1: Emotional safety & Foundation
  assert.ok(
    storySection.paragraphs[0].includes("emotional safety") ||
    storySection.paragraphs[0].includes("shared trust"),
    "Paragraph 1 should capture emotional safety and shared trust"
  );

  // Paragraph 2: Individual Personalities & Creative Balance
  assert.ok(
    storySection.paragraphs[1].includes("creative") ||
    storySection.paragraphs[1].includes("individual"),
    "Paragraph 2 should capture complementary creative worlds"
  );

  // Paragraph 3: Everyday dynamic & trust
  assert.ok(
    storySection.paragraphs[2].includes("everyday") ||
    storySection.paragraphs[2].includes("marriage to begin"),
    "Paragraph 3 should capture the everyday dynamic and marriage beginning"
  );

  // Verify word count of the 3 paragraphs is in target range (~180–220 words)
  const storyWords = storySection.paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  assert.ok(storyWords >= 150 && storyWords <= 250, `Story word count was ${storyWords}`);

  // Already upgraded letter must NOT trigger legacy auto-upgrade again
  assert.equal(isOutdatedCoupleLetter(letter, mockAnswers), false);
});

test("upgradeCoupleLetterIfNeeded fixes Samara & Yash verbatim copy-paste and Rahul & Arathi perspective switching cleanly", () => {
  const samaraYashAnswers: QuestionnaireAnswers = {
    partner1: "Samara",
    partner2: "Yash",
    q1_calls: { aCallsB: "", bCallsA: "" },
    q2_workPassion: {
      partnerA: "Samara is a visual designer. All her life she has been deeply engrossed in crafts and design.",
      partnerB: "Yash is a data scientist by day and in his free time he gets lost in the world of mixing (dj) house music. It is a true passion of his. When he is not doing that he goes for numerous niche gigs with his friends or even alone.",
    },
    q3_firstMeet: "Yash and I (Samara) met in school in the 8th grade when he moved to Chennai (my hometown) for two years. We were school friends at that time and stayed long distance best friends across Singapore, Manipal, Toronto and Boston.",
    q4_firstImpression: { partnerA: "Teased by grade", partnerB: "Warm" },
    q5_threeWords: ["Playful", "Creative", "Grounded"],
    q6_activities: { selected: ["Music", "Art"], other: "" },
    q7_loveMost: { partnerA: "His support", partnerB: "Her creativity" },
    q8_funnyStory: "",
    q9_proposal: { choice: "story", story: "Boston surprise" },
    q10_people: { familyMembers: [], treeNotes: "" },
    q11_filmFeel: { selected: ["Documentary"], other: "" },
    q12_references: { links: [], images: [], notes: "" },
    q13_tone: { selected: ["Warm"], other: "" },
    q14_moments: { selected: ["Ceremony"], other: "" },
    q15_captureAvoid: { definitelyCapture: "", pleaseAvoid: "" },
    q16_nonNegotiables: "",
    q17_emotional: "",
    q18_cameraVersatility: "Comfortable",
    q19_whatMattersMost: { selected: ["Storytelling"], other: "" },
    q20_guidanceComfort: "",
    q21_comfortTips: { selected: [], notes: "" },
    q22_futureFeeling: "Joyful",
    q23_oneLastThing: { notes: "", images: [] },
  };

  const legacySamaraLetter = `SAMARA & YASH
OUR UNDERSTANDING OF YOUR WEDDING

Hi Samara & Yash,

Thank you for sharing your story.

YOUR STORY & PERSONALITY

From what you've shared, you describe yourselves as playful, creative and grounded. You first met Yash and I (Samara) met in school in the 8th grade when he moved to Chennai (my hometown) for two years.

You both have your own distinct interests and passions, with Samara focused on Samara is a visual designer. All her life she has been deeply engrossed in crafts and design. and Yash engaged in Yash is a data scientist by day and in his free time he gets lost in the world of mixing (dj) house music..

THE WAY YOU WANT YOUR WEDDING TO FEEL

Custom kept section for wedding feel.

With love,
Team OAKS Wedding`;

  const syResult = upgradeCoupleLetterIfNeeded(legacySamaraLetter, samaraYashAnswers);
  assert.equal(syResult.wasUpgraded, true);
  assert.ok(syResult.letter.includes("Custom kept section for wedding feel."), "Other sections must remain untouched");
  assert.ok(!syResult.letter.includes("You first met Yash and I"), "Verbatim 1st-person story must be gone");
  assert.ok(!syResult.letter.includes("focused on Samara is"), "Broken template join must be gone");
  assert.ok(!syResult.letter.includes("Chennai"), "Must not retell literal timeline/locations");
  assert.equal(isOutdatedCoupleLetter(syResult.letter, samaraYashAnswers), false);

  const rahulArathiAnswers: QuestionnaireAnswers = {
    partner1: "Rahul",
    partner2: "Arathi",
    q1_calls: { aCallsB: "Aadi", bCallsA: "Rau" },
    q2_workPassion: {
      partnerA: "I am a multi entrpreneur who works on wedding photogrpahy business and a fair share in construction",
      partnerB: "Arathi is a home baker.",
    },
    q3_firstMeet: "We first met at one of our common friends place",
    q4_firstImpression: {
      partnerA: "My first impression about Aarti was she say well structured organised and who was someone who truly care about others",
      partnerB: "Who is well organised, structured and task driven",
    },
    q5_threeWords: ["Matured", "Romantic", "Organised"],
    q6_activities: { selected: [], other: "" },
    q7_loveMost: { partnerA: "Care", partnerB: "Stability" },
    q8_funnyStory: "",
    q9_proposal: { choice: "na", story: "" },
    q10_people: { familyMembers: [], treeNotes: "" },
    q11_filmFeel: { selected: ["Natural"], other: "" },
    q12_references: { links: [], images: [], notes: "" },
    q13_tone: { selected: ["Warm"], other: "" },
    q14_moments: { selected: ["Family"], other: "" },
    q15_captureAvoid: { definitelyCapture: "", pleaseAvoid: "" },
    q16_nonNegotiables: "",
    q17_emotional: "",
    q18_cameraVersatility: "Comfortable",
    q19_whatMattersMost: { selected: ["Storytelling"], other: "" },
    q20_guidanceComfort: "",
    q21_comfortTips: { selected: [], notes: "" },
    q22_futureFeeling: "Honest",
    q23_oneLastThing: { notes: "", images: [] },
  };

  const legacyRahulLetter = `RAHUL & ARATHI
OUR UNDERSTANDING OF YOUR WEDDING

Hi Rahul & Arathi,

Thank you for sharing.

YOUR STORY & PERSONALITY

From what you've shared, you describe yourselves as matured, romantic and organised. You first met We first met at one of our common friends place, and while rahul's first impression of arathi was that My first impression about Aarti was she say well structured organised.

You both have your own distinct interests and passions, with rahul focused on I am a multi entrpreneur who works on wedding photogrpahy business and a fair share in construction and arathi engaged in Arathi is a home baker.

You call each other aadi and rau, and those little details are part of what makes your relationship yours.

THE WAY YOU WANT YOUR WEDDING TO FEEL

Preserved feel section.

With love,
Team OAKS Wedding`;

  const raResult = upgradeCoupleLetterIfNeeded(legacyRahulLetter, rahulArathiAnswers);
  assert.equal(raResult.wasUpgraded, true);
  assert.ok(raResult.letter.includes("Preserved feel section."));
  assert.ok(!raResult.letter.includes("I am a multi"));
  assert.ok(!raResult.letter.includes("entrpreneur"));
  assert.ok(!raResult.letter.includes("photogrpahy"));
  assert.ok(!raResult.letter.includes("You first met We first met"));
  assert.ok(raResult.letter.includes("entrepreneur"));
  assert.ok(raResult.letter.includes("photography"));
  assert.ok(raResult.letter.includes("home baker"));
  assert.equal(isOutdatedCoupleLetter(raResult.letter, rahulArathiAnswers), false);
});


