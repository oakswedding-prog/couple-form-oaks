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
import {
  synthesizeEditorialBrief,
  isOutdatedEditorialBrief,
  parseEditorialBriefDocument,
  summarizeToPoints,
} from "./editorialBriefGenerator.ts";
import {
  CHECKLIST_EVENTS,
  WEDDING_PRODUCTION_CHECKLIST,
  RECEPTION_PRODUCTION_CHECKLIST,
  SANGEET_PRODUCTION_CHECKLIST,
  TOTAL_CHECKLIST_ITEMS,
  getChecklistSectionsForEvent,
  getTotalChecklistItemsForEvent,
  getEventChecklistItems,
  getEventFileDetails,
  buildUpdatedChecklistData,
  buildUpdatedManagersChecklistData,
  buildSubmittedStandardEventData,
  buildSubmittedCustomEventData,
  buildCustomEventUpsertChecklistData,
  buildCustomEventDeleteChecklistData,
  isChecklistCompleteForSubmission,
  isStandardEventLocked,
  canDeleteEvent,
  countChecklistProgress,
  mergeCustomEvents,
  summarizeFileDetails,
} from "../constants/productionChecklist.ts";
import {
  MANDATORY_QUESTION_STEPS,
  Q11_MAX_SELECTIONS,
  Q15_MAX_SELECTIONS,
  isQuestionMandatory,
  toggleMultiSelectWithMax,
  validateQuestionStep,
  getMissingMandatoryQuestions,
} from "./questionnaireValidation.ts";
import {
  AUTHORIZED_ADMIN_EMAILS,
  normalizeAdminEmail,
  isAllowlistedAdminEmail,
} from "../lib/adminAllowlist.ts";
import { getGroupedQ10People } from "./familyPeople.ts";
import { getGroupedWardrobe } from "./wardrobe.ts";
import {
  MAX_DECOR_EVENTS,
  addDecorEventToList,
  createDefaultDecorEvents,
  getGroupedDecorEvents,
  removeDecorEventFromList,
  renameDecorEventInList,
} from "./decorEvents.ts";
import {
  MAX_PHOTO_UPLOAD_BYTES,
  TOO_LARGE_PHOTO_ERROR,
  isHeicPhotoFile,
  validatePhotoFileBeforeCompression,
} from "./imageCompressor.ts";
import {
  FIRESTORE_DOC_LIMIT_BYTES,
  assertNoBase64Images,
  estimateFirestoreRecordBytes,
  findBase64ImagePaths,
} from "./submissionSizeGuard.ts";
import { synthesizeInterviewQuestions } from "./interviewQuestionsGenerator.ts";
import type {
  ChecklistItemStatus,
  CustomProductionEvent,
  QuestionnaireAnswers,
} from "../types/questionnaire.ts";

function buildAllMarkedItems(
  overrides: Record<string, ChecklistItemStatus> = {},
  defaultStatus: ChecklistItemStatus = "got_it"
): Record<string, ChecklistItemStatus> {
  const result: Record<string, ChecklistItemStatus> = {};
  for (const section of WEDDING_PRODUCTION_CHECKLIST) {
    for (const item of section.items) {
      result[item.id] = overrides[item.id] ?? defaultStatus;
    }
  }
  return result;
}

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
    couplePhotoUrl: "https://example.com/couple-portrait.jpg",
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
    q20_guidanceComfort: "Happy with gentle guidance",
    q21_comfortTips: {
      selected: ["A moment alone as a couple"],
      notes: "A quick breath before portraits",
    },
    q22_futureFeeling: "Warm nostalgia and happy tears",
    primaryContact: {
      role: "Someone else",
      side: "Bride's side",
      designation: "Auntie",
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
  assert.ok(brief.includes("Couple photo attached: Yes"));
  assert.ok(brief.includes("CHAPTER 2: YOUR PEOPLE"));
  assert.ok(brief.includes("CHAPTER 3: THE LOOK AND FEEL"));
  assert.ok(brief.includes("CHAPTER 4: YOUR DAY"));
  assert.ok(brief.includes("CHAPTER 5: WORKING TOGETHER"));
  assert.ok(brief.includes("ONE LAST THING"));
  assert.ok(
    brief.includes(
      "13. Have you finalised your wedding wardrobe? Share your outfit plans, colour preferences, and styling ideas. Knowing these details helps us plan your photography and films more thoughtfully."
    )
  );
  assert.ok(brief.includes("Ivory silk saree and tailored black bandhgala"));
  assert.ok(brief.includes("14. Do you have a wedding decor mood board or any visual references for your celebration?"));
  assert.ok(brief.includes("Candlelit courtyard with marigold and sage"));
  assert.ok(brief.includes("15. What tone are you expecting to set for your wedding day"));
  assert.ok(brief.includes("21. What mattered most to you when choosing OAKS Wedding to capture your wedding?"));
  assert.ok(brief.includes("Your documentary storytelling and timeless colour palette"));
  assert.ok(!brief.includes("What matters most to you when choosing a wedding photography and filmmaking team?"));
  assert.ok(brief.includes("22. How comfortable are you with being guided or directed during portraits and filming?"));
  assert.ok(brief.includes("25. Who should be our primary point of contact for wedding-related communication and coordination?"));
  assert.ok(brief.includes("Ananya Rao"));
  assert.ok(brief.includes("Bride's side"));
  assert.ok(brief.includes("Role designation: Auntie"));
  assert.ok(brief.includes("26. Last but not least, we'd love to hear your story. How did your journey begin, and what would you love us to know about the two of you?"));
  assert.ok(brief.includes("We met at a design workshop and stayed best friends for years"));
  assert.ok(brief.includes("27. Is there anything else you'd like to let us know?"));
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

test("synthesizeEditorialBrief includes all 27 questions across 6 chapters, summarises long answers concisely, and marks missing answers as Not provided", () => {
  const longStory = [
    "So basically we first met back in 2018 during our postgraduate architecture studio in Bangalore when we got paired up on a late-night model project.",
    "Honestly neither of us expected to become close friends right away because Priya was super quiet and organized while Rohan talked endlessly about jazz records.",
    "Over the next three years we survived long distance between Chennai and Mumbai, flying back and forth every second weekend just to grab filter coffee together.",
    "Our families finally met at a quiet lunch in Kochi last December and everybody immediately clicked over grandmother's homemade stew.",
    "More than anything we just want our friends and grandparents to feel relaxed, avoid stiff group line-ups, and capture genuine laughter during the sangeet dances."
  ].join(" ");

  const sampleAnswers: QuestionnaireAnswers = {
    partner1: "Priya",
    partner2: "Rohan",
    q1_calls: { aCallsB: "Ro", bCallsA: "" },
    couplePhotoUrl: "https://example.com/priya-rohan.jpg",
    q2_workPassion: { partnerA: "Architect who loves pottery", partnerB: "Product manager" },
    q3_firstMeet: longStory,
    q4_firstImpression: { partnerA: "", partnerB: "" },
    q5_threeWords: ["Warm", "Grounded", ""],
    q6_activities: { selected: ["Food and cafes", "Music and concerts"], other: "" },
    q7_loveMost: { partnerA: "", partnerB: "" },
    q8_funnyStory: "",
    q9_proposal: { choice: "na", story: "" },
    q10_people: {
      familyMembers: [
        { id: "f1", name: "Meenakshi", relationship: "Grandmother", side: "sideA", mustCapture: true },
      ],
      treeNotes: "",
    },
    q11_filmFeel: { selected: ["Natural and candid", "Warm and nostalgic"], other: "" },
    q12_references: { links: [], images: [], notes: "" },
    weddingOutfits: { links: [], images: [], notes: "Ivory Kasavu saree" },
    decorMoodBoard: { links: [], images: [], notes: "" },
    q13_tone: { selected: ["Romantic & Intimate"], other: "" },
    q14_moments: { selected: ["Family blessings"], other: "" },
    q15_captureAvoid: { definitelyCapture: "Grandmother's reaction", pleaseAvoid: "Forced posing" },
    q16_nonNegotiables: "",
    q17_emotional: "Priya",
    q18_cameraVersatility: "Pretty comfortable",
    choosingOaks: "",
    q20_guidanceComfort: "",
    q21_comfortTips: { selected: [], notes: "" },
    q22_futureFeeling: "Joy and warmth",
    primaryContact: {
      role: "Someone else",
      side: "Groom's side",
      designation: "Brother",
      name: "Karthik Menon",
      phone: "+91 98765 00000",
    },
    loveStoryNarrative: "",
    q23_oneLastThing: { notes: "", images: [] },
  };

  const bullets = summarizeToPoints(longStory, { maxBullets: 4 });
  assert.ok(bullets.length >= 2 && bullets.length <= 4, `Expected 2-4 bullets, got ${bullets.length}`);

  const brief = synthesizeEditorialBrief(sampleAnswers);

  // Verify all 6 chapters exist
  assert.ok(brief.includes("EDITORIAL CREATIVE BRIEF — ALL 27 QUESTIONS"));
  assert.ok(brief.includes("CHAPTER 1 — YOUR STORY (Q1–Q9)"));
  assert.ok(brief.includes("CHAPTER 2 — YOUR PEOPLE (Q10)"));
  assert.ok(brief.includes("CHAPTER 3 — THE LOOK AND FEEL (Q11–Q15)"));
  assert.ok(brief.includes("CHAPTER 4 — YOUR DAY (Q16–Q19)"));
  assert.ok(brief.includes("CHAPTER 5 — WORKING TOGETHER (Q20–Q25)"));
  assert.ok(brief.includes("CHAPTER 6 — ONE LAST THING (Q26–Q27)"));
  assert.ok(brief.includes("Couple photo uploaded"));
  assert.ok(brief.includes("Q13. Have you finalised your wedding wardrobe? Share your outfit plans, colour preferences, and styling ideas. Knowing these details helps us plan your photography and films more thoughtfully."));
  assert.ok(brief.includes("Role: Someone else · Groom's side · Brother"));

  // Verify all Q01 through Q27 are present in exact sequential order
  let prevIdx = -1;
  for (let i = 1; i <= 27; i++) {
    const marker = `Q${String(i).padStart(2, "0")}. `;
    const foundIdx = brief.indexOf(marker);
    assert.ok(foundIdx > prevIdx, `Missing or out-of-order marker ${marker}`);
    prevIdx = foundIdx;
  }
  assert.equal(brief.includes("Q28."), false);

  // Verify answered + unanswered behavior
  assert.ok(brief.includes("Bride's Side: Meenakshi — Grandmother · Must capture"));
  assert.ok(brief.includes("- Not provided"));
  assert.equal(isOutdatedEditorialBrief(brief), false);

  // Legacy 8-section or 28-question brief must be detected as outdated so auto-upgrade runs
  const legacyEightSection = "RIYA & ROSHAN\n==================================================\n01 — THEIR STORY\n==================================================";
  assert.equal(isOutdatedEditorialBrief(legacyEightSection), true);
  assert.equal(isOutdatedEditorialBrief("RIYA & ROSHAN\nEDITORIAL CREATIVE BRIEF — ALL 28 QUESTIONS"), true);

  const parsed = parseEditorialBriefDocument(brief);
  assert.equal(parsed.length, 6);
  const totalParsedQuestions = parsed.reduce((sum, ch) => sum + ch.questions.length, 0);
  assert.equal(totalParsedQuestions, 27);
});

test("multi-event checklist helpers preserve legacy Wedding marks and isolate Sangeet, Wedding, and Reception resets", () => {
  const legacyChecklist = {
    items: {
      tech_camera_time_reset: "got_it" as const,
      tech_confirm_shooting_profile: "missed" as const,
    },
    productionManagers: ["Ajin Tom"],
    fileDetails: [],
  };

  // Legacy items map transparently to Wedding, while Sangeet and Reception start clean
  assert.equal(getEventChecklistItems(legacyChecklist, "wedding").tech_camera_time_reset, "got_it");
  assert.deepEqual(getEventChecklistItems(legacyChecklist, "sangeet"), {});
  assert.deepEqual(getEventChecklistItems(legacyChecklist, "reception"), {});

  // Toggling Sangeet keeps Wedding progress + shared managers intact
  const withSangeet = buildUpdatedChecklistData(
    legacyChecklist,
    "sangeet",
    { tech_camera_time_reset: "got_it" },
    ["Ajin Tom"],
    [],
    "admin@oakswedding.com"
  );
  assert.equal(countChecklistProgress(getEventChecklistItems(withSangeet, "sangeet")).gotIt, 1);
  assert.equal(countChecklistProgress(getEventChecklistItems(withSangeet, "wedding")).gotIt, 1);
  assert.equal(countChecklistProgress(getEventChecklistItems(withSangeet, "wedding")).missed, 1);
  assert.deepEqual(withSangeet.productionManagers, ["Ajin Tom"]);

  // Resetting Reception leaves Wedding & Sangeet + shared managers untouched
  const afterReceptionReset = buildUpdatedChecklistData(
    withSangeet,
    "reception",
    {},
    withSangeet.productionManagers || [],
    [],
    "admin@oakswedding.com"
  );
  assert.equal(countChecklistProgress(getEventChecklistItems(afterReceptionReset, "sangeet")).gotIt, 1);
  assert.equal(countChecklistProgress(getEventChecklistItems(afterReceptionReset, "wedding")).gotIt, 1);
  assert.deepEqual(afterReceptionReset.productionManagers, ["Ajin Tom"]);
});

test("per-event File Details moves legacy entries to Wedding and isolates Sangeet, Wedding, and Reception transfers", () => {
  const legacyFile = {
    id: "f_legacy_1",
    memberName: "Arjun Nair",
    role: "Photographer" as const,
    fileSize: 540,
    sizeUnit: "GB" as const,
    fileCount: 569,
    driveName: "SanDisk SSD 1",
    updatedAt: "2026-11-13T13:07:00.000Z",
  };

  const legacyData = {
    items: {},
    fileDetails: [legacyFile],
  };

  // Legacy entries appear under Wedding, while Sangeet and Reception start empty
  assert.equal(getEventFileDetails(legacyData, "wedding").length, 1);
  assert.equal(getEventFileDetails(legacyData, "sangeet").length, 0);
  assert.equal(getEventFileDetails(legacyData, "reception").length, 0);

  // Adding a Sangeet entry preserves Wedding's legacy entry
  const sangeetEntry = {
    id: "f_sangeet_1",
    memberName: "Rahul Ratna",
    role: "Videographer" as const,
    fileSize: 1.2,
    sizeUnit: "TB" as const,
    fileCount: 310,
    updatedAt: "2026-11-13T15:00:00.000Z",
  };

  const afterSangeetAdd = buildUpdatedChecklistData(
    legacyData,
    "sangeet",
    {},
    [],
    [sangeetEntry],
    "admin@oakswedding.com"
  );

  const sangeetFiles = getEventFileDetails(afterSangeetAdd, "sangeet");
  const weddingFiles = getEventFileDetails(afterSangeetAdd, "wedding");
  const receptionFiles = getEventFileDetails(afterSangeetAdd, "reception");

  assert.equal(sangeetFiles.length, 1);
  assert.equal(weddingFiles.length, 1);
  assert.equal(weddingFiles[0].memberName, "Arjun Nair");
  assert.equal(receptionFiles.length, 0);

  const combined = summarizeFileDetails([
    ...sangeetFiles,
    ...weddingFiles,
    ...receptionFiles,
  ]);
  assert.equal(combined.entries, 2);
  assert.equal(combined.totalFiles, 879);
  assert.equal(combined.formattedSize, "1.74 TB");
});

test("submitting an event allows Got it, Missed, or unmarked checklist items, enforces at least one File Details entry, and permanently locks that event", () => {
  const weddingFile = {
    id: "f_wed_1",
    memberName: "Arjun Nair",
    role: "Photographer" as const,
    cameraStarredStatus: "Starred" as const,
    fileSize: 540,
    sizeUnit: "GB" as const,
    fileCount: 569,
    driveName: "SanDisk SSD 1",
    updatedAt: "2026-11-13T13:07:00.000Z",
  };

  // Zero File Details entries must be blocked cleanly
  const noFilesState = buildUpdatedChecklistData(
    undefined,
    "wedding",
    buildAllMarkedItems(),
    ["Ajin Tom"],
    [],
    "ajin@oakswedding.com"
  );
  assert.throws(
    () =>
      buildSubmittedStandardEventData(
        noFilesState,
        "wedding",
        "Ajin Tom",
        "ajin@oakswedding.com"
      ),
    /at least one crew file entry/i
  );

  // Partial / unmarked + Missed checklist items MUST succeed when File Details has >= 1 entry
  const partialWithMissedState = buildUpdatedChecklistData(
    undefined,
    "wedding",
    { tech_camera_time_reset: "got_it", tech_audio_on_track: "missed" },
    ["Ajin Tom"],
    [weddingFile],
    "ajin@oakswedding.com"
  );
  const progress = isChecklistCompleteForSubmission(
    getEventChecklistItems(partialWithMissedState, "wedding")
  );
  assert.equal(progress.gotIt, 1);
  assert.equal(progress.missed, 1);
  assert.equal(progress.remaining, TOTAL_CHECKLIST_ITEMS - 2);

  // Confirm standard 'wedding' label is 'Wedding Day'
  assert.equal(
    CHECKLIST_EVENTS.find((ev) => ev.id === "wedding")?.label,
    "Wedding Day"
  );

  // Lock Wedding Day event (with Missed and unmarked items preserved)
  const submitTime = new Date("2026-11-13T19:45:00.000Z");
  const { nextChecklist, submissionRecord } = buildSubmittedStandardEventData(
    partialWithMissedState,
    "wedding",
    "Ajin Tom",
    "ajin@oakswedding.com",
    undefined,
    submitTime
  );

  assert.equal(isStandardEventLocked(nextChecklist, "wedding"), true);
  assert.equal(isStandardEventLocked(nextChecklist, "sangeet"), false);
  assert.equal(submissionRecord.eventName, "Wedding Day");
  assert.equal(submissionRecord.submittedBy, "Ajin Tom");
  assert.equal(submissionRecord.items.tech_camera_time_reset, "got_it");
  assert.equal(submissionRecord.items.tech_audio_on_track, "missed");
  assert.equal(submissionRecord.fileDetails.length, 1);
  assert.ok(submissionRecord.submissionDate.length > 0);
  assert.ok(submissionRecord.submissionTime.length > 0);

  // Trying to modify or re-submit the locked Wedding Day must throw
  assert.throws(
    () =>
      buildUpdatedChecklistData(
        nextChecklist,
        "wedding",
        {},
        ["Ajin Tom"],
        [],
        "hacker@oakswedding.com"
      ),
    /permanently locked/i
  );

  assert.throws(
    () =>
      buildSubmittedStandardEventData(
        nextChecklist,
        "wedding",
        "Someone Else",
        "other@oakswedding.com"
      ),
    /already been submitted/i
  );

  // Updating Sangeet or shared Production Managers still works AND preserves locked Wedding Day identically
  const afterSangeetUpdate = buildUpdatedChecklistData(
    nextChecklist,
    "sangeet",
    { tech_camera_time_reset: "got_it" },
    ["Ajin Tom"],
    [],
    "ajin@oakswedding.com"
  );

  assert.deepEqual(
    afterSangeetUpdate.events?.wedding,
    nextChecklist.events?.wedding
  );
  assert.deepEqual(afterSangeetUpdate.items, nextChecklist.items);
  assert.deepEqual(afterSangeetUpdate.fileDetails, nextChecklist.fileDetails);
  assert.equal(
    getEventChecklistItems(afterSangeetUpdate, "sangeet").tech_camera_time_reset,
    "got_it"
  );

  const afterManagerAdd = buildUpdatedManagersChecklistData(
    afterSangeetUpdate,
    ["Ajin Tom", "Rohan V"],
    "ajin@oakswedding.com"
  );
  assert.deepEqual(afterManagerAdd.productionManagers, ["Ajin Tom", "Rohan V"]);
  assert.deepEqual(
    afterManagerAdd.events?.wedding,
    nextChecklist.events?.wedding
  );
});

test("custom event deletion, empty/missed checklist acceptance with file entry gate, and submission lock rules", () => {
  // Standard events can never be deleted
  assert.equal(canDeleteEvent("wedding", false, false), false);
  assert.equal(canDeleteEvent("sangeet", false, false), false);
  assert.equal(canDeleteEvent("reception", false, false), false);

  // Unsubmitted custom event CAN be deleted
  assert.equal(canDeleteEvent("custom_haldi_123", true, false), true);

  // Submitted custom event CANNOT be deleted
  assert.equal(canDeleteEvent("custom_haldi_123", true, true), false);

  const haldiFile = {
    id: "f_haldi_1",
    memberName: "Meera Nair",
    role: "Photographer" as const,
    cameraStarredStatus: "Not Starred" as const,
    fileSize: 120,
    sizeUnit: "GB" as const,
    fileCount: 410,
    updatedAt: "2026-11-13T10:30:00.000Z",
  };

  const noFilesHaldi: CustomProductionEvent = {
    id: "custom_haldi_123",
    name: "Haldi",
    isCustom: true,
    items: buildAllMarkedItems(),
    fileDetails: [],
    submitted: false,
    createdAt: "2026-11-13T10:00:00.000Z",
    updatedAt: "2026-11-13T10:30:00.000Z",
  };

  // Custom event without File Details entry must be blocked
  assert.throws(
    () =>
      buildSubmittedCustomEventData(
        noFilesHaldi,
        "Meera Nair",
        "meera@oakswedding.com"
      ),
    /at least one crew file entry/i
  );

  // Custom event with Missed + unmarked checklist items succeeds once >= 1 File Details entry exists
  const partialHaldiWithFile: CustomProductionEvent = {
    ...noFilesHaldi,
    items: { tech_camera_time_reset: "missed" },
    fileDetails: [haldiFile],
  };

  const { nextCustomEvent, submissionRecord } = buildSubmittedCustomEventData(
    partialHaldiWithFile,
    "Meera Nair",
    "meera@oakswedding.com",
    ["Ajin Tom"]
  );

  assert.equal(nextCustomEvent.submitted, true);
  assert.equal(submissionRecord.eventName, "Haldi");
  assert.equal(submissionRecord.isCustom, true);
  assert.equal(submissionRecord.submittedBy, "Meera Nair");
  assert.equal(submissionRecord.fileDetails.length, 1);
  assert.equal(
    canDeleteEvent(nextCustomEvent.id, true, nextCustomEvent.submitted),
    false
  );

  assert.throws(
    () => buildSubmittedCustomEventData(nextCustomEvent, "Another User"),
    /already been submitted/i
  );
});

test("custom event main-document fallback helpers preserve locked Wedding Day and block deleting submitted fallback custom events", () => {
  const sampleFile = {
    id: "f_sample_1",
    memberName: "Arjun Nair",
    role: "Photographer" as const,
    cameraStarredStatus: "Starred" as const,
    fileSize: 200,
    sizeUnit: "GB" as const,
    fileCount: 620,
    updatedAt: "2026-11-13T11:00:00.000Z",
  };

  // Prepare a checklist where Wedding Day is already locked
  const weddingReady = buildUpdatedChecklistData(
    undefined,
    "wedding",
    buildAllMarkedItems(),
    ["Ajin Tom"],
    [sampleFile],
    "ajin@oakswedding.com"
  );
  const { nextChecklist: withLockedWedding } = buildSubmittedStandardEventData(
    weddingReady,
    "wedding",
    "Ajin Tom",
    "ajin@oakswedding.com"
  );

  const haldi: CustomProductionEvent = {
    id: "custom_haldi_fallback",
    name: "Haldi",
    isCustom: true,
    items: { tech_camera_time_reset: "missed" },
    fileDetails: [sampleFile],
    submitted: false,
    createdAt: "2026-11-13T11:00:00.000Z",
    updatedAt: "2026-11-13T11:00:00.000Z",
  };

  const withFallbackHaldi = buildCustomEventUpsertChecklistData(
    withLockedWedding,
    haldi,
    "ajin@oakswedding.com"
  );
  assert.equal(isStandardEventLocked(withFallbackHaldi, "wedding"), true);
  assert.equal(
    mergeCustomEvents([], withFallbackHaldi.customEvents).length,
    1
  );

  // Lock fallback Haldi
  const { nextCustomEvent: lockedHaldi } = buildSubmittedCustomEventData(
    haldi,
    "Ajin Tom",
    "ajin@oakswedding.com"
  );
  const withLockedHaldi = buildCustomEventUpsertChecklistData(
    withFallbackHaldi,
    lockedHaldi,
    "ajin@oakswedding.com"
  );

  assert.throws(
    () =>
      buildCustomEventUpsertChecklistData(
        withLockedHaldi,
        { ...lockedHaldi, items: {} },
        "hacker@oakswedding.com"
      ),
    /permanently locked/i
  );

  assert.throws(
    () =>
      buildCustomEventDeleteChecklistData(
        withLockedHaldi,
        haldi.id,
        "hacker@oakswedding.com"
      ),
    /cannot be deleted/i
  );
});

test("photographer cameraStarredStatus is saved and preserved in locked production event records", () => {
  const photographerFile = {
    id: "f_photo_star_1",
    memberName: "Arjun Nair",
    role: "Photographer" as const,
    cameraStarredStatus: "Starred" as const,
    fileSize: 540,
    sizeUnit: "GB" as const,
    fileCount: 1840,
    driveName: "SanDisk SSD 1",
    updatedAt: "2026-11-13T14:00:00.000Z",
  };
  const videographerFile = {
    id: "f_video_1",
    memberName: "Rahul Ratna",
    role: "Videographer" as const,
    fileSize: 345,
    sizeUnit: "GB" as const,
    fileCount: 123,
    updatedAt: "2026-11-13T14:05:00.000Z",
  };

  const state = buildUpdatedChecklistData(
    undefined,
    "wedding",
    buildAllMarkedItems(),
    ["Ajin Tom"],
    [photographerFile, videographerFile],
    "ajin@oakswedding.com"
  );

  assert.equal(
    getEventFileDetails(state, "wedding")[0].cameraStarredStatus,
    "Starred"
  );
  assert.equal(
    getEventFileDetails(state, "wedding")[1].cameraStarredStatus,
    undefined
  );

  const { nextChecklist, submissionRecord } = buildSubmittedStandardEventData(
    state,
    "wedding",
    "Ajin Tom",
    "ajin@oakswedding.com"
  );

  assert.equal(submissionRecord.fileDetails[0].cameraStarredStatus, "Starred");
  assert.equal(submissionRecord.fileDetails[1].cameraStarredStatus, undefined);
  assert.equal(
    nextChecklist.events?.wedding?.submission?.fileDetails[0].cameraStarredStatus,
    "Starred"
  );
});

function createBlankAnswers(): QuestionnaireAnswers {
  return {
    partner1: "Aarav",
    partner2: "Meera",
    q1_calls: { aCallsB: "", bCallsA: "" },
    q2_workPassion: { partnerA: "", partnerB: "" },
    q3_firstMeet: "",
    q4_firstImpression: { partnerA: "", partnerB: "" },
    q5_threeWords: ["", "", ""],
    q6_activities: { selected: [], other: "" },
    q7_loveMost: { partnerA: "", partnerB: "" },
    q8_funnyStory: "",
    q9_proposal: { choice: "", story: "" },
    q10_people: { familyMembers: [], treeNotes: "" },
    q11_filmFeel: { selected: [], other: "" },
    q12_references: { links: [], images: [], notes: "" },
    weddingOutfits: { links: [], images: [], notes: "" },
    decorMoodBoard: { links: [], images: [], notes: "" },
    q13_tone: { selected: [], other: "" },
    q14_moments: { selected: [], other: "" },
    q15_captureAvoid: { definitelyCapture: "", pleaseAvoid: "" },
    q16_nonNegotiables: "",
    q17_emotional: "",
    q18_cameraVersatility: "",
    choosingOaks: "",
    q19_whatMattersMost: { selected: [], other: "" },
    q20_guidanceComfort: "",
    q21_comfortTips: { selected: [], notes: "" },
    q22_futureFeeling: "",
    primaryContact: {
      role: "",
      side: "",
      designation: "",
      gender: "",
      name: "",
      phone: "",
    },
    loveStoryNarrative: "",
    q23_oneLastThing: { notes: "", images: [] },
  };
}

test("mandatory question list matches exact 18 required steps and allows skipping only optional steps", () => {
  const expectedMandatory = [1, 2, 3, 6, 7, 10, 11, 12, 13, 14, 15, 16, 18, 20, 21, 22, 25, 26];
  const expectedOptional = [4, 5, 8, 9, 17, 19, 23, 24, 27];

  assert.deepEqual([...MANDATORY_QUESTION_STEPS], expectedMandatory);

  const blank = createBlankAnswers();
  for (const step of expectedMandatory) {
    assert.equal(isQuestionMandatory(step), true, `Q${step} should be mandatory`);
    assert.equal(
      validateQuestionStep(step, blank).isComplete,
      false,
      `Blank Q${step} must block Continue`
    );
  }

  for (const step of expectedOptional) {
    assert.equal(isQuestionMandatory(step), false, `Q${step} should be optional`);
    assert.equal(
      validateQuestionStep(step, blank).isComplete,
      true,
      `Optional Q${step} must remain skippable`
    );
  }

  assert.deepEqual(getMissingMandatoryQuestions(blank), expectedMandatory);
});

test("mandatory step validation checks required partner pairs, optional couple photo, multi-part media steps, and complete submission", () => {
  const answers = createBlankAnswers();

  // Q1 requires both nicknames; couplePhotoUrl stays optional
  answers.q1_calls = { aCallsB: "Meer", bCallsA: "" };
  assert.equal(validateQuestionStep(1, answers).isComplete, false);
  answers.q1_calls = { aCallsB: "Meer", bCallsA: "Aaru" };
  assert.equal(validateQuestionStep(1, answers).isComplete, true);

  // Q2 and Q7 require both partners
  answers.q2_workPassion = { partnerA: "Architect", partnerB: "" };
  assert.equal(validateQuestionStep(2, answers).isComplete, false);
  answers.q2_workPassion = { partnerA: "Architect", partnerB: "Designer" };
  assert.equal(validateQuestionStep(2, answers).isComplete, true);

  answers.q3_firstMeet = "At an exhibition in Kochi";
  answers.q6_activities = { selected: [], other: "Late night drives" };
  answers.q7_loveMost = { partnerA: "Warmth", partnerB: "Calmness" };

  // Q10 now requires five named people with individual photos on both sides.
  answers.q10_people = {
    familyMembers: [],
    brideSide: {
      photos: [{ id: "bp1", url: "https://example.com/bride-tree.jpg", caption: "Bride family tree" }],
      notes: "",
    },
    groomSide: { photos: [], notes: "" },
    treeNotes: "",
  };
  assert.equal(validateQuestionStep(10, answers).isComplete, false);

  answers.q10_people = {
    familyMembers: [],
    brideSide: { photos: [], notes: "" },
    groomSide: { photos: [], notes: "Groom's parents & sister" },
    treeNotes: "",
  };
  assert.equal(validateQuestionStep(10, answers).isComplete, false);

  answers.q10_people = {
    familyMembers: [],
    brideSide: {
      photos: [{ id: "bp1", url: "https://example.com/bride-tree.jpg", caption: "Bride family tree" }],
      notes: "",
    },
    groomSide: { photos: [], notes: "Groom's parents & sister" },
    treeNotes: "",
  };
  assert.equal(validateQuestionStep(10, answers).isComplete, false);
  answers.q10_people.familyMembers = (["bride", "groom"] as const).flatMap(side =>
    Array.from({ length: 5 }, (_, i) => ({
      id: `${side}-${i}`, name: `Person ${i + 1}`, relationship: "Close friend", side,
      mustCapture: false, photoUrl: `https://example.com/${side}-${i}.jpg`,
    }))
  );
  assert.equal(validateQuestionStep(10, answers).isComplete, true);

  // Q11 requires exact 3
  answers.q11_filmFeel = { selected: ["Natural and candid", "Warm and nostalgic"], other: "" };
  assert.equal(validateQuestionStep(11, answers).isComplete, false);
  answers.q11_filmFeel = {
    selected: ["Natural and candid", "Warm and nostalgic", "Cinematic and dramatic"],
    other: "",
  };
  assert.equal(validateQuestionStep(11, answers).isComplete, true);

  // Q12, Q13, Q14 accept link, image, OR notes
  answers.q12_references = { links: ["https://pinterest.com/board"], images: [], notes: "" };
  answers.weddingOutfits = { links: [], images: [], notes: "Ivory silk saree and tuxedo" };
  answers.decorMoodBoard = { links: [], images: ["https://example.com/decor.jpg"], notes: "" };

  // Q15 allows 1 to 3
  answers.q13_tone = { selected: ["Romantic & Intimate"], other: "" };
  assert.equal(validateQuestionStep(15, answers).isComplete, true);

  answers.q14_moments = { selected: ["Ceremony and vows"], other: "" };
  answers.q16_nonNegotiables = "Clear vows audio";
  answers.q18_cameraVersatility = "Pretty comfortable";
  answers.choosingOaks = "Timeless documentary films";
  answers.q20_guidanceComfort = "Happy with gentle guidance";
  answers.primaryContact = {
    role: "Someone else",
    side: "Bride's side",
    designation: "Auntie",
    name: "Ananya",
    phone: "+91 98765 43210",
  };
  answers.loveStoryNarrative = "Best friends since college who grew up side by side.";

  assert.deepEqual(getMissingMandatoryQuestions(answers), []);
});

test("Q11 and Q15 enforce max 3 selection cap where users must uncheck one option before selecting another", () => {
  // Select 3 styles on Q11
  let q11 = toggleMultiSelectWithMax([], "Natural and candid", Q11_MAX_SELECTIONS);
  q11 = toggleMultiSelectWithMax(q11, "Emotional and intimate", Q11_MAX_SELECTIONS);
  q11 = toggleMultiSelectWithMax(q11, "Warm and nostalgic", Q11_MAX_SELECTIONS);
  assert.equal(q11.length, 3);

  // Attempting to select a 4th style without unchecking is ignored
  const q11Blocked = toggleMultiSelectWithMax(q11, "Cinematic and dramatic", Q11_MAX_SELECTIONS);
  assert.deepEqual(q11Blocked, q11);

  // Unchecking one frees a slot, allowing another option to be chosen
  const q11Unchecked = toggleMultiSelectWithMax(q11Blocked, "Emotional and intimate", Q11_MAX_SELECTIONS);
  assert.equal(q11Unchecked.length, 2);
  const q11Swapped = toggleMultiSelectWithMax(q11Unchecked, "Cinematic and dramatic", Q11_MAX_SELECTIONS);
  assert.deepEqual(q11Swapped, ["Natural and candid", "Warm and nostalgic", "Cinematic and dramatic"]);

  // Same max-3 cap + uncheck-to-swap behavior on Q15
  let q15 = toggleMultiSelectWithMax([], "Romantic & Intimate", Q15_MAX_SELECTIONS);
  q15 = toggleMultiSelectWithMax(q15, "Organic & Natural", Q15_MAX_SELECTIONS);
  q15 = toggleMultiSelectWithMax(q15, "Timeless & Elegant", Q15_MAX_SELECTIONS);
  assert.equal(q15.length, 3);

  const q15Blocked = toggleMultiSelectWithMax(q15, "Fun & Vibrant", Q15_MAX_SELECTIONS);
  assert.deepEqual(q15Blocked, q15);

  // Legacy answers with > 3 items fail validation until unchecked back to <= 3
  const oversized = createBlankAnswers();
  oversized.q11_filmFeel.selected = ["A", "B", "C", "D"];
  oversized.q13_tone.selected = ["A", "B", "C", "D"];
  assert.equal(validateQuestionStep(11, oversized).isComplete, false);
  assert.equal(validateQuestionStep(15, oversized).isComplete, false);

  // Even when oversized (>3), unchecking an already-selected item still works cleanly
  assert.deepEqual(
    toggleMultiSelectWithMax(oversized.q13_tone.selected, "D", Q15_MAX_SELECTIONS),
    ["A", "B", "C"]
  );
});

test("Reception and Sangeet checklists define dedicated Tech riders, Venue & Details (6 items), and Mandatory Family Portraits (10 items) and isolate progress", () => {
  const receptionSections = getChecklistSectionsForEvent("reception");
  const sangeetSections = getChecklistSectionsForEvent("sangeet");
  const weddingSections = getChecklistSectionsForEvent("wedding");

  assert.equal(receptionSections, RECEPTION_PRODUCTION_CHECKLIST);
  assert.equal(sangeetSections, SANGEET_PRODUCTION_CHECKLIST);
  assert.equal(weddingSections, WEDDING_PRODUCTION_CHECKLIST);

  assert.equal(getTotalChecklistItemsForEvent("reception"), 19);
  assert.equal(getTotalChecklistItemsForEvent("sangeet"), 19);
  assert.equal(getTotalChecklistItemsForEvent("wedding"), 17);

  for (const sections of [receptionSections, sangeetSections]) {
    assert.deepEqual(
      sections.map((s) => s.title),
      ["Tech riders", "Venue & Details", "Mandatory Family Portraits"]
    );
    assert.deepEqual(
      sections[0].items.map((it) => it.label),
      [
        "Camera time reset",
        "Confirm shooting profile",
        "Audio recording devices on track",
      ]
    );
    assert.deepEqual(
      sections[1].items.map((it) => it.label),
      [
        "Complete venue establishing shots.",
        "Stage and backdrop.",
        "Floral and lighting details.",
        "Guest seating arrangements.",
        "Table settings and food arrangements.",
        "Reception ambience before guests arrive.",
      ]
    );
    assert.equal(sections[2].items.length, 10);
  }

  // Marking Reception's 6 Venue & Details items does not affect Sangeet or Wedding Day
  const receptionOnly = buildUpdatedChecklistData(
    undefined,
    "reception",
    {
      venue_stage_and_backdrop: "got_it",
      venue_reception_ambience_before_guests: "missed",
    },
    [],
    [],
    "admin@oakswedding.com"
  );

  const recProgress = countChecklistProgress(
    getEventChecklistItems(receptionOnly, "reception"),
    "reception"
  );
  assert.equal(recProgress.total, 19);
  assert.equal(recProgress.gotIt, 1);
  assert.equal(recProgress.missed, 1);
  assert.equal(recProgress.remaining, 17);

  const sangeetProgress = countChecklistProgress(
    getEventChecklistItems(receptionOnly, "sangeet"),
    "sangeet"
  );
  assert.equal(sangeetProgress.total, 19);
  assert.equal(sangeetProgress.gotIt, 0);
  assert.equal(sangeetProgress.missed, 0);
  assert.equal(sangeetProgress.remaining, 19);

  // Full Reception completion checks all 19 Reception items
  const allReceptionItems: Record<string, ChecklistItemStatus> = {};
  for (const section of RECEPTION_PRODUCTION_CHECKLIST) {
    for (const item of section.items) {
      allReceptionItems[item.id] = "got_it";
    }
  }
  const completeReception = isChecklistCompleteForSubmission(
    allReceptionItems,
    "reception"
  );
  assert.equal(completeReception.isComplete, true);
  assert.equal(completeReception.total, 19);
  assert.equal(completeReception.remaining, 0);
});

test("admin allowlist authorizes rahulratna88@gmail.com, mywedding@oakswedding.com, and Oaksoperations@gmail.com case-insensitively", () => {
  assert.deepEqual([...AUTHORIZED_ADMIN_EMAILS], [
    "rahulratna88@gmail.com",
    "mywedding@oakswedding.com",
    "oaksoperations@gmail.com",
  ]);

  assert.equal(isAllowlistedAdminEmail("rahulratna88@gmail.com"), true);
  assert.equal(isAllowlistedAdminEmail("mywedding@oakswedding.com"), true);
  assert.equal(isAllowlistedAdminEmail("Oaksoperations@gmail.com"), true);
  assert.equal(isAllowlistedAdminEmail("  MYWEDDING@OAKSWEDDING.COM\u200B "), true);
  assert.equal(normalizeAdminEmail(" Oaksoperations@gmail.com "), "oaksoperations@gmail.com");

  assert.equal(isAllowlistedAdminEmail("unknown@gmail.com"), false);
  assert.equal(isAllowlistedAdminEmail(""), false);
  assert.equal(isAllowlistedAdminEmail(null), false);
});

test("Q10 helpers, brief summary, and cheat sheet group Bride's Side and Groom's Side with backward compatibility", () => {
  const grouped = getGroupedQ10People({
    familyMembers: [
      {
        id: "m1",
        name: "Meera Nair",
        relationship: "Mother",
        side: "sideA",
        mustCapture: true,
        photoUrl: "https://example.com/meera.jpg",
      },
      { id: "m2", name: "Thomas", relationship: "Father", side: "sideB", mustCapture: false },
      { id: "m3", name: "Bruno", relationship: "Dog", side: "both", mustCapture: false },
    ],
    brideSide: {
      photos: [
        { id: "p1", url: "https://example.com/bride-parents.jpg", caption: "Amma & Appa", mustCapture: true },
      ],
      notes: "Capture Amma welcoming guests",
    },
    groomSide: {
      photos: [
        { id: "p2", url: "https://example.com/groom-tree.jpg", caption: "Groom family chart", mustCapture: false },
      ],
      notes: "",
    },
    treePhotoUrl: "https://example.com/legacy-tree.jpg",
    treeNotes: "Legacy note",
  });

  assert.equal(grouped.hasBrideEntry, true);
  assert.equal(grouped.hasGroomEntry, true);
  assert.equal(grouped.bride.photos.length, 1);
  assert.equal(grouped.bride.members.length, 1);
  assert.equal(grouped.bride.members[0].photoUrl, "https://example.com/meera.jpg");
  assert.equal(grouped.groom.photos.length, 1);
  assert.equal(grouped.groom.members.length, 1);
  assert.equal(grouped.sharedMembers.length, 1);
  assert.equal(grouped.totalPhotos, 4);

  const vipOnlyAnswers = createBlankAnswers();
  vipOnlyAnswers.q10_people = {
    familyMembers: [
      {
        id: "v1",
        name: "Mamooty",
        relationship: "Uncle or Aunt",
        side: "bride",
        mustCapture: true,
        photoUrl: "https://example.com/mamooty.jpg",
      },
      {
        id: "v2",
        name: "Joseph",
        relationship: "Father",
        side: "groom",
        mustCapture: false,
      },
    ],
    treeNotes: "",
  };
  // A legacy list of two VIPs still renders, but no longer satisfies the five-per-partner rule.
  assert.equal(validateQuestionStep(10, vipOnlyAnswers).isComplete, false);

  const answers = createBlankAnswers();
  answers.partner1 = "Anjali";
  answers.partner2 = "Vikram";
  answers.q10_people = {
    familyMembers: [
      { id: "m1", name: "Lakshmi", relationship: "Grandmother", side: "bride", mustCapture: true },
      { id: "m2", name: "Raghav", relationship: "Brother", side: "groom", mustCapture: false },
    ],
    brideSide: {
      photos: [{ id: "bp1", url: "https://example.com/b1.jpg", caption: "Maternal grandparents", mustCapture: true }],
      notes: "Keep wheelchair seating accessible",
    },
    groomSide: {
      photos: [{ id: "gp1", url: "https://example.com/g1.jpg", caption: "Groom parents", mustCapture: false }],
      notes: "Dad arrives early",
    },
    treeNotes: "",
  };

  const summary = generateBriefSummary("OAKS WEDDING", answers);
  assert.ok(summary.includes("[Bride's Side]"));
  assert.ok(summary.includes("Photo 1: Maternal grandparents — [MUST CAPTURE]"));
  assert.ok(summary.includes("Lakshmi (Grandmother) — [MUST CAPTURE]"));
  assert.ok(summary.includes("[Groom's Side]"));
  assert.ok(summary.includes("Photo 1: Groom parents"));
  assert.ok(summary.includes("Raghav (Brother)"));

  const sheet = synthesizeCheatSheet(answers, "OAKS WEDDING");
  assert.ok(sheet.includes("Bride's Side:"));
  assert.ok(sheet.includes("Groom's Side:"));
  const parsedSheet = parseCheatSheetDocument(sheet, "Anjali", "Vikram");
  assert.ok(parsedSheet.importantPeople.some((p) => p.side === "bride" && p.name === "Lakshmi"));
  assert.ok(parsedSheet.importantPeople.some((p) => p.side === "groom" && p.name === "Raghav"));
});

test("Q13 wardrobe helpers, notes-only validation, brief summary, and editorial brief separate Bride and Groom wardrobes cleanly", () => {
  const splitAnswers = createBlankAnswers();
  splitAnswers.weddingOutfits = { links: [], images: [], notes: "" };
  splitAnswers.wardrobe = {
    bride: {
      notes: "Ivory Kanjeevaram silk saree for ceremony, pastel lehenga for sangeet",
      links: ["https://pinterest.com/bride-wardrobe"],
      photos: ["https://example.com/bride-saree.jpg"],
    },
    groom: {
      notes: "Off-white silk mundu & kurta for ceremony, tailored black bandhgala for reception",
      links: ["https://pinterest.com/groom-wardrobe"],
      photos: ["https://example.com/groom-bandhgala.jpg", "https://example.com/groom-kurta.jpg"],
    },
  };

  const grouped = getGroupedWardrobe(splitAnswers);
  assert.equal(grouped.hasBrideContent, true);
  assert.equal(grouped.hasGroomContent, true);
  assert.equal(grouped.hasBrideNotes, true);
  assert.equal(grouped.hasGroomNotes, true);
  assert.equal(grouped.hasAnyNotes, true);
  assert.equal(grouped.legacyShared, undefined);
  assert.deepEqual(grouped.bride.photos, ["https://example.com/bride-saree.jpg"]);
  assert.deepEqual(grouped.groom.photos, [
    "https://example.com/groom-bandhgala.jpg",
    "https://example.com/groom-kurta.jpg",
  ]);

  // Validation: empty fails
  const emptyWardrobe = createBlankAnswers();
  assert.equal(validateQuestionStep(13, emptyWardrobe).isComplete, false);

  // Validation: links and photos alone (without notes on either side) MUST fail
  emptyWardrobe.wardrobe = {
    bride: {
      notes: "   ",
      links: ["https://pinterest.com/bride"],
      photos: ["https://example.com/b1.jpg"],
    },
    groom: {
      notes: "",
      links: ["https://pinterest.com/groom"],
      photos: ["https://example.com/g1.jpg"],
    },
  };
  assert.equal(validateQuestionStep(13, emptyWardrobe).isComplete, false);

  // Validation: notes on Bride alone unlocks Continue
  emptyWardrobe.wardrobe.bride.notes = "Ivory silk saree";
  assert.equal(validateQuestionStep(13, emptyWardrobe).isComplete, true);

  // Validation: notes on Groom alone unlocks Continue
  emptyWardrobe.wardrobe.bride.notes = "";
  emptyWardrobe.wardrobe.groom.notes = "Tailored black bandhgala";
  assert.equal(validateQuestionStep(13, emptyWardrobe).isComplete, true);

  // Legacy unsplit submission fallback preserves existing data without breaking validation
  const legacyOnly = createBlankAnswers();
  legacyOnly.weddingOutfits = {
    notes: "Legacy ivory saree and dark suit",
    links: ["https://pinterest.com/legacy"],
    images: ["https://example.com/legacy.jpg"],
  };
  const legacyGrouped = getGroupedWardrobe(legacyOnly);
  assert.ok(legacyGrouped.legacyShared);
  assert.equal(legacyGrouped.hasAnyNotes, true);
  assert.equal(validateQuestionStep(13, legacyOnly).isComplete, true);

  // Brief summary and Editorial Brief both group into "Bride's wardrobe" and "Groom's wardrobe"
  const summary = generateBriefSummary("OAKS WEDDING", splitAnswers);
  assert.ok(summary.includes("[Bride's wardrobe]"));
  assert.ok(summary.includes("Ivory Kanjeevaram silk saree"));
  assert.ok(summary.includes("https://pinterest.com/bride-wardrobe"));
  assert.ok(summary.includes("[Groom's wardrobe]"));
  assert.ok(summary.includes("Off-white silk mundu & kurta"));
  assert.ok(summary.includes("https://pinterest.com/groom-wardrobe"));

  const editorial = synthesizeEditorialBrief(splitAnswers);
  assert.ok(editorial.includes("Bride's wardrobe:"));
  assert.ok(editorial.includes("Groom's wardrobe:"));
});

test("Q14 per-event decor helpers lock Wedding, allow renaming/removing Sangeet, enforce 8-event cap & uniqueness, validate any event, and preserve order in briefs", () => {
  // Default events: Wedding first & locked, Sangeet second & editable
  const defaults = createDefaultDecorEvents();
  assert.equal(defaults.length, 2);
  assert.equal(defaults[0].name, "Wedding");
  assert.equal(defaults[0].isLocked, true);
  assert.equal(defaults[1].name, "Sangeet");
  assert.equal(defaults[1].isLocked, false);

  // Wedding cannot be renamed or deleted
  const weddingRenameAttempt = renameDecorEventInList(defaults, "wedding", "Ceremony");
  assert.equal(weddingRenameAttempt.nextEvents[0].name, "Wedding");
  const weddingDeleteAttempt = removeDecorEventFromList(defaults, "wedding");
  assert.equal(weddingDeleteAttempt.length, 2);

  // Attach content to Sangeet, then rename inline -> id & saved data stay attached
  const withSangeetData = defaults.map((ev) =>
    ev.id === "sangeet"
      ? {
          ...ev,
          links: ["https://pinterest.com/sangeet-lights"],
          images: ["https://example.com/sangeet.jpg"],
          notes: "Mirrorball & warm amber spotlights",
        }
      : ev
  );
  const renamedSangeet = renameDecorEventInList(
    withSangeetData,
    "sangeet",
    "Sangeet & Cocktail Night"
  );
  assert.equal(renamedSangeet.error, undefined);
  assert.equal(renamedSangeet.nextEvents[1].id, "sangeet");
  assert.equal(renamedSangeet.nextEvents[1].name, "Sangeet & Cocktail Night");
  assert.equal(renamedSangeet.nextEvents[1].images.length, 1);
  assert.equal(renamedSangeet.nextEvents[1].notes, "Mirrorball & warm amber spotlights");

  // Duplicate event names rejected case-insensitively on both rename and add
  const dupAdd = addDecorEventToList(renamedSangeet.nextEvents, "  wedding ");
  assert.ok(dupAdd.error);
  const dupRename = renameDecorEventInList(
    renamedSangeet.nextEvents,
    "sangeet",
    "WEDDING"
  );
  assert.ok(dupRename.error);

  // Add events up to MAX_DECOR_EVENTS (8), then reject the 9th
  let list = renamedSangeet.nextEvents;
  const extraNames = ["Haldi", "Mehendi", "Reception", "Engagement", "Welcome Dinner", "After Party"];
  for (const name of extraNames) {
    const res = addDecorEventToList(list, name);
    assert.equal(res.error, undefined, `Should allow adding ${name}`);
    assert.ok(res.addedEvent);
    list = res.nextEvents;
  }
  assert.equal(list.length, MAX_DECOR_EVENTS);

  const overCap = addDecorEventToList(list, "Brunch");
  assert.ok(overCap.error);
  assert.equal(overCap.nextEvents.length, MAX_DECOR_EVENTS);

  // Removing Sangeet works cleanly while keeping Wedding
  const afterRemove = removeDecorEventFromList(renamedSangeet.nextEvents, "sangeet");
  assert.equal(afterRemove.length, 1);
  assert.equal(afterRemove[0].id, "wedding");

  // Validation: empty default events fail Q14; adding content to ONLY Sangeet passes
  const blankQ14 = createBlankAnswers();
  blankQ14.decorEvents = createDefaultDecorEvents();
  assert.equal(validateQuestionStep(14, blankQ14).isComplete, false);

  const sangeetOnlyAnswers = createBlankAnswers();
  sangeetOnlyAnswers.decorEvents = [
    ...createDefaultDecorEvents().slice(0, 1),
    {
      id: "sangeet",
      name: "Sangeet",
      isLocked: false,
      links: [],
      images: [],
      notes: "Fairy lights canopy",
    },
  ];
  assert.equal(validateQuestionStep(14, sangeetOnlyAnswers).isComplete, true);

  // Legacy single decorMoodBoard fallback still passes validation & groups cleanly
  const legacyDecorAnswers = createBlankAnswers();
  legacyDecorAnswers.decorMoodBoard = {
    links: ["https://pinterest.com/legacy-decor"],
    images: [],
    notes: "White jasmine & brass lamps",
  };
  assert.equal(validateQuestionStep(14, legacyDecorAnswers).isComplete, true);
  const groupedLegacy = getGroupedDecorEvents(legacyDecorAnswers);
  assert.equal(groupedLegacy.populatedEvents.length, 1);
  assert.equal(groupedLegacy.populatedEvents[0].name, "Wedding");

  // Brief summary and Editorial Brief preserve couple's event order
  const orderedAnswers = createBlankAnswers();
  orderedAnswers.decorEvents = [
    {
      id: "wedding",
      name: "Wedding",
      isLocked: true,
      links: ["https://pinterest.com/mandap"],
      images: ["https://example.com/mandap.jpg"],
      notes: "Muted sage & ivory mandap",
    },
    {
      id: "sangeet",
      name: "Sangeet & Cocktail Night",
      isLocked: false,
      links: [],
      images: [],
      notes: "Moody candlelit tables",
    },
    {
      id: "evt_haldi",
      name: "Haldi",
      isLocked: false,
      links: ["https://pinterest.com/haldi"],
      images: ["https://example.com/haldi.jpg"],
      notes: "Marigold & sunlit courtyard",
    },
  ];

  const summary = generateBriefSummary("OAKS WEDDING", orderedAnswers);
  const idxWed = summary.indexOf("[Wedding]:");
  const idxSang = summary.indexOf("[Sangeet & Cocktail Night]:");
  const idxHaldi = summary.indexOf("[Haldi]:");
  assert.ok(idxWed > 0 && idxSang > idxWed && idxHaldi > idxSang);
  assert.ok(summary.includes("Muted sage & ivory mandap"));
  assert.ok(summary.includes("https://pinterest.com/haldi"));

  const editorial = synthesizeEditorialBrief(orderedAnswers);
  const edWed = editorial.indexOf("Wedding links:");
  const edSang = editorial.indexOf("Sangeet & Cocktail Night:");
  const edHaldi = editorial.indexOf("Haldi links:");
  assert.ok(edWed > 0 && edSang > edWed && edHaldi > edSang);
});

test("photo upload validator enforces 15 MB pre-compression limit, accepts JPEG/PNG/WebP/HEIC, and returns friendly oversized error", () => {
  assert.equal(MAX_PHOTO_UPLOAD_BYTES, 15 * 1024 * 1024);

  // Exact 15 MB boundary passes for JPEG, PNG, WebP, and HEIC (including empty browser MIME type)
  assert.equal(
    validatePhotoFileBeforeCompression({
      size: 15 * 1024 * 1024,
      type: "image/jpeg",
      name: "portrait.jpg",
    }).ok,
    true
  );
  assert.equal(
    validatePhotoFileBeforeCompression({
      size: 8 * 1024 * 1024,
      type: "image/png",
      name: "sketch.png",
    }).ok,
    true
  );
  assert.equal(
    validatePhotoFileBeforeCompression({
      size: 6 * 1024 * 1024,
      type: "image/webp",
      name: "decor.webp",
    }).ok,
    true
  );

  // iPhone HEIC often reports empty MIME type in browsers
  const heicFile = { size: 12 * 1024 * 1024, type: "", name: "IMG_4821.HEIC" };
  assert.equal(isHeicPhotoFile(heicFile), true);
  assert.equal(validatePhotoFileBeforeCompression(heicFile).ok, true);

  // > 15 MB before compression fails with exact user-friendly error
  const oversized = validatePhotoFileBeforeCompression({
    size: 15 * 1024 * 1024 + 1,
    type: "image/heic",
    name: "RAW_HEIC.HEIC",
  });
  assert.equal(oversized.ok, false);
  if (!oversized.ok) {
    assert.equal(oversized.message, TOO_LARGE_PHOTO_ERROR);
    assert.equal(
      oversized.message,
      "This photo is too large. Please choose a smaller one"
    );
  }

  // Non-image files are rejected
  assert.equal(
    validatePhotoFileBeforeCompression({
      size: 500_000,
      type: "application/pdf",
      name: "schedule.pdf",
    }).ok,
    false
  );
});

test("submissionSizeGuard blocks inline base64 across every photo section and verifies heavy submission stays well under Firestore's 1 MB limit", () => {
  const storagePath = (name: string) =>
    `submissions/draft_1760000000000_ab12cd/1760000001000_9x8y7_${name}.jpg`;

  const heavyAnswers: QuestionnaireAnswers = {
    ...createBlankAnswers(),
    partner1: "Ananya Krishnan",
    partner2: "Siddharth Menon",
    weddingDate: "2027-01-24",
    phone: "+91 98765 43210",
    email: "ananya.siddharth@example.com",
    couplePhotoUrl: storagePath("couple_photo"),
    q1_calls: { aCallsB: "Sid", bCallsA: "Anu" },
    q2_workPassion: {
      partnerA: "Architectural conservationist working across heritage courtyard homes in Kerala and Chennai, deeply drawn to tactile crafts, lime plaster, and quiet morning light.",
      partnerB: "Documentary sound designer and vinyl collector who builds field recordings from monsoon rains and street markets.",
    },
    q3_firstMeet: "We met five years ago during a rainy architectural Biennale walk in Fort Kochi when we shared an umbrella waiting for a ferry and talked for four hours straight.",
    q4_firstImpression: { partnerA: "Warm laugh and instant calm", partnerB: "Unfiltered curiosity and grace" },
    q5_threeWords: ["Grounded", "Playful", "Intimate"],
    q6_activities: { selected: ["Travelling", "Food and cafes", "Music and concerts"], other: "Analog film photography" },
    q7_loveMost: { partnerA: "His patience and quiet loyalty", partnerB: "Her warmth with everyone around her" },
    q8_funnyStory: "Missed the overnight train in Rajasthan and ended up celebrating on a rooftop dhaba with a brass band practicing next door.",
    q9_proposal: { choice: "story", story: "Sunrise walk along Varkala cliffs with a hand-bound sketchbook of our five years together." },
    q10_people: {
      familyMembers: Array.from({ length: 16 }, (_, idx) => ({
        id: `vip_${idx + 1}`,
        name: `Family Member ${idx + 1}`,
        relationship: idx % 2 === 0 ? "Grandparent" : "Sibling",
        side: idx < 8 ? ("bride" as const) : ("groom" as const),
        mustCapture: idx < 6,
        photoUrl: storagePath(`vip_${idx + 1}`),
      })),
      brideSide: {
        photos: Array.from({ length: 10 }, (_, idx) => ({
          id: `bp_${idx + 1}`,
          url: storagePath(`bride_tree_${idx + 1}`),
          caption: `Bride family group photo ${idx + 1}`,
          mustCapture: idx < 3,
        })),
        notes: "Maternal grandparents need gentle seating close to the mandap.",
      },
      groomSide: {
        photos: Array.from({ length: 10 }, (_, idx) => ({
          id: `gp_${idx + 1}`,
          url: storagePath(`groom_tree_${idx + 1}`),
          caption: `Groom family group photo ${idx + 1}`,
          mustCapture: idx < 3,
        })),
        notes: "Groom's uncle arrives directly before the baraat.",
      },
      treeNotes: "",
    },
    q11_filmFeel: { selected: ["Natural and candid", "Warm and nostalgic", "Documentary"], other: "" },
    q12_references: {
      links: ["https://pinterest.com/oaks-ref-1", "https://vimeo.com/123456789"],
      images: Array.from({ length: 6 }, (_, idx) => storagePath(`reference_${idx + 1}`)),
      notes: "Natural skin tones, soft film grain, unhurried emotional pacing.",
    },
    wardrobe: {
      bride: {
        notes: "Ivory gold Kasavu Kanjeevaram silk saree for the morning ceremony; emerald velvet lehenga for sangeet.",
        links: ["https://pinterest.com/bride-saree"],
        photos: Array.from({ length: 6 }, (_, idx) => storagePath(`bride_outfit_${idx + 1}`)),
      },
      groom: {
        notes: "Handloom off-white silk mundu and tailored Bandhgala with antique brass buttons.",
        links: ["https://pinterest.com/groom-bandhgala"],
        photos: Array.from({ length: 6 }, (_, idx) => storagePath(`groom_outfit_${idx + 1}`)),
      },
    },
    decorEvents: [
      { id: "wedding", name: "Wedding", isLocked: true, links: ["https://pinterest.com/wed"], images: Array.from({ length: 4 }, (_, i) => storagePath(`decor_wed_${i}`)), notes: "Jasmine and brass lamps." },
      { id: "sangeet", name: "Sangeet", isLocked: false, links: ["https://pinterest.com/sang"], images: Array.from({ length: 4 }, (_, i) => storagePath(`decor_sang_${i}`)), notes: "Amber Edison bulbs and mirrorball." },
      { id: "evt_haldi", name: "Haldi", isLocked: false, links: ["https://pinterest.com/haldi"], images: Array.from({ length: 3 }, (_, i) => storagePath(`decor_haldi_${i}`)), notes: "Marigold courtyard canopies." },
      { id: "evt_rec", name: "Reception", isLocked: false, links: ["https://pinterest.com/rec"], images: Array.from({ length: 3 }, (_, i) => storagePath(`decor_rec_${i}`)), notes: "Candlelit long tables." },
    ],
    q13_tone: { selected: ["Romantic & Intimate", "Joyful & Energetic"], other: "" },
    q14_moments: { selected: ["First look or first glance", "Family blessings", "Speeches and toasts"], other: "" },
    q15_captureAvoid: { definitelyCapture: "Grandparents reactions, candid prepping laughter", pleaseAvoid: "Forced stiff poses" },
    q16_nonNegotiables: "Clean wireless audio on ceremony mantras and evening toasts.",
    q17_emotional: "Both of our fathers",
    q18_cameraVersatility: "Pretty comfortable once we warm up",
    choosingOaks: "Your documentary warmth and timeless colour palette.",
    q20_guidanceComfort: "Gentle natural prompts",
    q21_comfortTips: { selected: ["A moment alone as a couple"], notes: "Just give us 10 quiet minutes after the ceremony." },
    q22_futureFeeling: "Deep warmth, gratitude, and our real voices.",
    primaryContact: { role: "Bride", name: "Ananya Krishnan", phone: "+91 98765 43210" },
    loveStoryNarrative: "We grew from studio friends into lifelong travel partners over rainy coffees, family dinners, and quiet Sunday afternoons.",
    q23_oneLastThing: {
      notes: "Our dog Pepper is joining portraits before dinner.",
      images: Array.from({ length: 4 }, (_, idx) => storagePath(`last_${idx + 1}`)),
    },
  };

  // Passes zero-base64 guard cleanly (73 Storage paths total, zero inline images)
  assertNoBase64Images(heavyAnswers);

  const fullRecordPayload = {
    id: "sub_099_1760000009999",
    sequenceNumber: 99,
    displayId: "#099",
    submittedAt: "2026-11-20T12:00:00.000Z",
    status: "new" as const,
    partner1: heavyAnswers.partner1,
    partner2: heavyAnswers.partner2,
    weddingDate: heavyAnswers.weddingDate || "",
    phone: heavyAnswers.phone || "",
    email: heavyAnswers.email || "",
    answers: heavyAnswers,
    coupleLetter: synthesizeCoupleLetter(heavyAnswers),
    editorialBrief: synthesizeEditorialBrief(heavyAnswers),
    interviewQuestions: synthesizeInterviewQuestions(heavyAnswers),
    cheatSheet: synthesizeCheatSheet(heavyAnswers),
    privateNotes: "",
  };

  const bytes = estimateFirestoreRecordBytes(fullRecordPayload);
  console.log(
    `[submissionSizeGuard] Full 73-photo submission payload size: ${bytes} bytes (${(
      bytes / 1024
    ).toFixed(2)} KB) vs Firestore limit ${FIRESTORE_DOC_LIMIT_BYTES} bytes`
  );
  assert.ok(bytes < 60 * 1024, `Expected payload < 60 KB, got ${bytes} bytes`);
  assert.ok(bytes < FIRESTORE_DOC_LIMIT_BYTES * 0.06);

  // Injecting base64 into ANY photo field must be caught immediately
  const base64Checks: Array<(clone: QuestionnaireAnswers) => void> = [
    (c) => { c.couplePhotoUrl = "data:image/jpeg;base64,AAA"; },
    (c) => { c.q10_people.treePhotoUrl = "data:image/jpeg;base64,AAA"; },
    (c) => { c.q10_people.familyMembers[0].photoUrl = "data:image/png;base64,AAA"; },
    (c) => { c.q10_people.brideSide!.photos[0].url = "data:image/jpeg;base64,AAA"; },
    (c) => { c.q10_people.groomSide!.photos[0].url = "data:image/jpeg;base64,AAA"; },
    (c) => { c.q12_references.images[0] = "data:image/webp;base64,AAA"; },
    (c) => { c.wardrobe!.bride.photos[0] = "data:image/jpeg;base64,AAA"; },
    (c) => { c.wardrobe!.groom.photos[0] = "data:image/jpeg;base64,AAA"; },
    (c) => { c.decorEvents![0].images[0] = "data:image/jpeg;base64,AAA"; },
    (c) => { c.q23_oneLastThing.images[0] = "data:image/jpeg;base64,AAA"; },
  ];

  for (const mutate of base64Checks) {
    const mutated: QuestionnaireAnswers = JSON.parse(JSON.stringify(heavyAnswers));
    mutate(mutated);
    assert.ok(findBase64ImagePaths(mutated).length > 0);
    assert.throws(() => assertNoBase64Images(mutated), /Inline image data detected/i);
  }
});









