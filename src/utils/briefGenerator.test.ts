/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { cleanSentenceText, deduplicateTranscript } from "./textCleaner.ts";
import { generateBriefSummary } from "./briefGenerator.ts";
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

