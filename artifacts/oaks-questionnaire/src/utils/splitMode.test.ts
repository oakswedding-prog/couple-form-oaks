/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ENABLE_SPLIT_MODE,
  LINK_EXPIRY_DAYS,
  LINK_EXPIRY_MS,
  LOCKED_LINK_MESSAGE,
  QUESTION_CONFIG,
  isSplitModeEnabled,
} from "../config/splitMode.ts";
import {
  buildPartnerProgressSnapshot,
  decorEventsToMap,
  decorMapToEvents,
  describeDraftPartnerStatus,
  detectSharedFieldConflict,
  getCombinedCrewPriorities,
  getDraftLinkInactiveReason,
  getFirstUnansweredStepForPartner,
  getLabelledOverlayDisplay,
  getPartnerAnsweredCount,
  getPartnerOverlayValue,
  hasSplitOverlayAnswers,
  isDraftLinkCurrentlyActive,
  isSameForBothForStep,
  mergeDecorEventMaps,
  setPartnerOverlayValue,
  setSameForBothForStep,
  shouldShowLockedLinkScreen,
  validateQuestionStepForContext,
} from "./splitModeHelpers.ts";
import { mergeAdminMetaIntoSubmission } from "../lib/adminMeta.ts";
import { buildNormalizedPhotoReport } from "./photoStatusSummary.ts";
import {
  executeBulletproofSubmit,
  getSubmissionDeliveryState,
} from "../lib/submissions.ts";
import { generateBriefSummary } from "./briefGenerator.ts";
import { synthesizeEditorialBrief } from "./editorialBriefGenerator.ts";
import { synthesizeCheatSheet } from "./cheatSheetGenerator.ts";
import type {
  DraftRecord,
  QuestionnaireAnswers,
  SubmissionRecord,
} from "../types/questionnaire.ts";

function createBaseAnswers(): QuestionnaireAnswers {
  return {
    partner1: "Maya",
    partner2: "Leo",
    weddingDate: "2026-12-18",
    phone: "+91 9876543210",
    email: "maya.leo@example.com",
    q1_calls: { aCallsB: "Lee", bCallsA: "Mimi" },
    q2_workPassion: { partnerA: "Architect", partnerB: "Chef" },
    q3_firstMeet: "Coffee shop in Kochi during a monsoon evening.",
    q4_firstImpression: { partnerA: "Warm smile", partnerB: "Great energy" },
    q5_threeWords: ["Warm", "Playful", "Grounded"],
    q6_activities: { selected: ["Travel", "Cooking"], other: "" },
    q7_loveMost: { partnerA: "His calm kindness", partnerB: "Her laughter" },
    q8_funnyStory: "Missed the ferry together on our first trip.",
    q9_proposal: { choice: "story", story: "Sunset walk in Fort Kochi." },
    q10_people: {
      familyMembers: [
        { id: "b1", name: "Meera", relationship: "Mother", side: "bride", mustCapture: true },
        { id: "g1", name: "Thomas", relationship: "Father", side: "groom", mustCapture: true },
      ],
      treeNotes: "",
      brideSide: {
        photos: [],
        notes: "",
      },
      groomSide: {
        photos: [],
        notes: "",
      },
    },
    q11_filmFeel: { selected: ["Natural & Candid", "Cinematic", "Editorial"], other: "" },
    q12_references: { links: [], images: [], notes: "" },
    wardrobe: {
      bride: { notes: "Ivory silk saree", links: [], photos: [] },
      groom: { notes: "Beige bandhgala", links: [], photos: [] },
    },
    decorEvents: [
      { id: "wedding", name: "Wedding", isLocked: true, links: [], images: [], notes: "White jasmine & brass" },
      { id: "sangeet", name: "Sangeet", isLocked: false, links: [], images: [], notes: "Warm fairy lights" },
    ],
    q13_tone: { selected: ["Intimate & Warm"], other: "" },
    q14_moments: { selected: ["First Look", "Vows"], other: "" },
    q15_captureAvoid: {
      definitelyCapture: "Grandma's blessing",
      pleaseAvoid: "Stiff group poses",
    },
    q16_nonNegotiables: "Clear audio of vows",
    q17_emotional: "Leo",
    q18_cameraVersatility: "Pretty comfortable",
    choosingOaks: "Natural candid storytelling",
    q20_guidanceComfort: "Gentle guidance",
    q21_comfortTips: { selected: ["Show occasional previews"], notes: "" },
    q22_futureFeeling: "Like reliving the exact warmth of the day",
    primaryContact: { role: "Bride", name: "Maya", phone: "+91 9876543210" },
    loveStoryNarrative: "Six years of friendship turned into forever.",
    q23_oneLastThing: { notes: "", images: [] },
  };
}

describe("Together or Separately Filling + Phase 0 Security Hardening Suite", () => {
  test("1. Feature switch is ON with override support and QUESTION_CONFIG classifies all 27 questions cleanly (Q25 & Q26 shared)", () => {
    assert.equal(ENABLE_SPLIT_MODE, true);
    assert.equal(isSplitModeEnabled(), true);
    assert.equal(isSplitModeEnabled(false), false);
    assert.equal(QUESTION_CONFIG.length, 27);
    assert.equal(QUESTION_CONFIG.find((q) => q.number === 25)?.type, "shared");
    assert.equal(QUESTION_CONFIG.find((q) => q.number === 26)?.type, "shared");
    assert.equal(QUESTION_CONFIG.find((q) => q.number === 11)?.type, "perPerson");
    assert.equal(QUESTION_CONFIG.find((q) => q.number === 20)?.type, "perPerson");
    assert.equal(QUESTION_CONFIG.find((q) => q.number === 27)?.type, "perPerson");
    assert.equal(LINK_EXPIRY_DAYS, 7);
    assert.equal(LINK_EXPIRY_MS, 7 * 24 * 60 * 60 * 1000);
    assert.equal(
      LOCKED_LINK_MESSAGE,
      "This link is no longer active. Please contact the studio."
    );
  });

  test("2. Phase 0 #1: adminMeta isolates privateNotes/status with zero-migration fallback, and new submissions omit privateNotes", async () => {
    const legacyRecord: SubmissionRecord = {
      id: "sub_legacy_1",
      displayId: "#010",
      sequenceNumber: 10,
      partner1: "A",
      partner2: "B",
      weddingDate: "2026-11-10",
      phone: "9999999999",
      email: "a@b.com",
      status: "reviewed",
      submittedAt: "2026-10-01T10:00:00.000Z",
      answers: createBaseAnswers(),
      privateNotes: "Legacy internal studio note",
    };

    // Fallback when no adminMeta doc exists yet
    const mergedFallback = mergeAdminMetaIntoSubmission(legacyRecord, null);
    assert.equal(mergedFallback.privateNotes, "Legacy internal studio note");
    assert.equal(mergedFallback.status, "reviewed");

    // AdminMeta overrides top-level once edited
    const mergedNew = mergeAdminMetaIntoSubmission(legacyRecord, {
      privateNotes: "Updated admin-only note",
      status: "shared",
      updatedAt: "2026-10-02T10:00:00.000Z",
    });
    assert.equal(mergedNew.privateNotes, "Updated admin-only note");
    assert.equal(mergedNew.status, "shared");

    // New couple submissions must never write privateNotes onto the shared record
    const writtenPayloads: Record<string, any>[] = [];
    const result = await executeBulletproofSubmit(
      {
        submissionId: "sub_new_isolated",
        resumeToken: "a".repeat(48),
        ownerUid: "anon_uid_1",
        answers: createBaseAnswers(),
      },
      {
        writeSubmissionDoc: async (_id, payload) => {
          writtenPayloads.push(payload);
        },
        assignDisplayNumber: async () => ({ sequenceNumber: 42, displayId: "#042" }),
        markDraftDone: async () => {},
        notifyStudioAndCouple: async () => {},
        logError: async () => {},
        retryDelaysMs: [0],
      }
    );
    assert.equal(result.id, "sub_new_isolated");
    assert.equal(writtenPayloads.length, 1);
    assert.equal("privateNotes" in writtenPayloads[0], false);
  });

  test("3. Phase 0 #2 & #3: firestore.rules enforces adminMeta isolation, 7-day expiry, link locking, participant cap, and zero list/delete for couples + backup exists", () => {
    const rootDir = process.cwd();
    const rulesPath = path.resolve(rootDir, "../../firestore.rules");
    const backupPath = path.resolve(rootDir, "../../firestore.rules.backup");
    assert.equal(fs.existsSync(backupPath), true, "firestore.rules.backup must exist");
    const rules = fs.readFileSync(rulesPath, "utf8");

    // Admin-only private notes/status subcollection
    assert.match(rules, /match\s+\/adminMeta\/\{metaId\}/);
    assert.match(rules, /allow\s+read,\s*write:\s*if\s+isAdmin\(\);/);

    // 7-day server-enforced expiry + linkLocked + revoked
    assert.match(rules, /function\s+isDraftLinkActive\(draftData\)/);
    assert.match(rules, /draftData\.get\('linkLocked',\s*false\)\s*!=\s*true/);
    assert.match(rules, /draftData\.get\('revoked',\s*false\)\s*!=\s*true/);
    assert.match(rules, /request\.time\s*<\s*draftData\.linkExpiresAt/);

    // Partner participant cap (<= 4) & no list/delete for couples
    assert.match(rules, /function\s+isDraftParticipant\(draftData\)/);
    assert.match(rules, /size\(\)\s*<=\s*4/);
    assert.match(rules, /allow\s+list:\s*if\s+isAdmin\(\);/);
    assert.match(rules, /allow\s+delete:\s*if\s+isAdmin\(\);/);

    // Couple cannot write or mutate privateNotes or status
    assert.match(rules, /!\('privateNotes'\s+in\s+request\.resource\.data\)/);
    assert.match(rules, /request\.resource\.data\.get\('privateNotes',\s*null\)\s*==\s*resource\.data\.get\('privateNotes',\s*null\)/);
    assert.match(rules, /request\.resource\.data\.get\('status',\s*null\)\s*==\s*resource\.data\.get\('status',\s*null\)/);
  });

  test("4. Link lifecycle: active vs locked vs revoked vs expired (> 7 days) checks work accurately", () => {
    const now = Date.parse("2026-11-23T12:00:00.000Z");
    const activeDraft: Partial<DraftRecord> = {
      id: "tok_active",
      linkLocked: false,
      revoked: false,
      linkExpiresAtIso: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
    };
    assert.equal(getDraftLinkInactiveReason(activeDraft, now), null);
    assert.equal(isDraftLinkCurrentlyActive(activeDraft, now), true);

    assert.equal(
      getDraftLinkInactiveReason({ ...activeDraft, linkLocked: true }, now),
      "locked"
    );
    assert.equal(
      getDraftLinkInactiveReason({ ...activeDraft, revoked: true }, now),
      "revoked"
    );
    assert.equal(
      getDraftLinkInactiveReason(
        { ...activeDraft, linkExpiresAtIso: new Date(now - 1000).toISOString() },
        now
      ),
      "expired"
    );
    assert.equal(getDraftLinkInactiveReason(null, now), "revoked");
  });

  test("a successful submission keeps Thank You visible even after its resume link locks", () => {
    assert.equal(shouldShowLockedLinkScreen(true, 28), true);
    assert.equal(shouldShowLockedLinkScreen(true, 29), false);
    assert.equal(shouldShowLockedLinkScreen(false, 29), false);
  });

  test("5. Per-person overlay answers isolate Partner A and Partner B without overwriting + Same-for-both toggle seeds cleanly", () => {
    let ans = createBaseAnswers();
    ans.fillMode = "together";

    // Default Together mode uses same answer for both
    assert.equal(isSameForBothForStep(ans, 20), true);
    assert.equal(hasSplitOverlayAnswers(ans, "q18_cameraVersatility"), false);

    // Unticking "Same answer for both of us" seeds both partners from canonical
    ans = setSameForBothForStep(ans, 20, false);
    assert.equal(isSameForBothForStep(ans, 20), false);
    assert.equal(getPartnerOverlayValue(ans, "partnerA", "q18_cameraVersatility"), "Pretty comfortable");
    assert.equal(getPartnerOverlayValue(ans, "partnerB", "q18_cameraVersatility"), "Pretty comfortable");

    // Partner A & Partner B write independently without clobbering
    ans = setPartnerOverlayValue(ans, "partnerA", "q18_cameraVersatility", "Very comfortable");
    ans = setPartnerOverlayValue(ans, "partnerB", "q18_cameraVersatility", "A bit camera-shy");
    assert.equal(getPartnerOverlayValue(ans, "partnerA", "q18_cameraVersatility"), "Very comfortable");
    assert.equal(getPartnerOverlayValue(ans, "partnerB", "q18_cameraVersatility"), "A bit camera-shy");
    assert.equal(hasSplitOverlayAnswers(ans, "q18_cameraVersatility"), true);
  });

  test("6. Q14 decorEventsMap concurrent merge preserves simultaneous Partner A & Partner B edits across events", () => {
    const initial = decorEventsToMap([
      { id: "wedding", name: "Wedding", isLocked: true, links: ["https://pin.it/base"], images: [], notes: "Ivory" },
      { id: "sangeet", name: "Sangeet", isLocked: false, links: [], images: [], notes: "" },
    ]);

    const partnerAVersion = {
      ...initial,
      wedding: {
        ...initial.wedding,
        linksById: {
          ...initial.wedding.linksById,
          lnk_a: "https://pin.it/maya-wedding",
        },
        imagesById: {
          img_a: "submissions/sub1/decor_wedding_a.jpg",
        },
        updatedAt: "2026-11-23T10:00:01.000Z",
        updatedBy: "partnerA" as const,
      },
    };

    const partnerBVersion = {
      ...initial,
      sangeet: {
        ...initial.sangeet,
        linksById: {
          lnk_b: "https://pin.it/leo-sangeet",
        },
        imagesById: {
          img_b: "submissions/sub1/decor_sangeet_b.jpg",
        },
        notes: "Neon lights & mirrors",
        updatedAt: "2026-11-23T10:00:02.000Z",
        updatedBy: "partnerB" as const,
      },
      haldi: {
        id: "haldi",
        name: "Haldi",
        order: 2,
        isLocked: false,
        notes: "Marigold yellow",
        linksById: { lnk_h: "https://pin.it/haldi" },
        imagesById: {},
        updatedAt: "2026-11-23T10:00:03.000Z",
        updatedBy: "partnerB" as const,
      },
    };

    const mergedMap = mergeDecorEventMaps(partnerAVersion, partnerBVersion);
    const mergedList = decorMapToEvents(mergedMap);
    assert.equal(mergedList.length, 3);
    const wedding = mergedList.find((e) => e.id === "wedding")!;
    const sangeet = mergedList.find((e) => e.id === "sangeet")!;
    const haldi = mergedList.find((e) => e.id === "haldi")!;
    assert.ok(wedding.links.includes("https://pin.it/base"));
    assert.ok(wedding.links.includes("https://pin.it/maya-wedding"));
    assert.ok(wedding.images.includes("submissions/sub1/decor_wedding_a.jpg"));
    assert.ok(sangeet.links.includes("https://pin.it/leo-sangeet"));
    assert.ok(sangeet.images.includes("submissions/sub1/decor_sangeet_b.jpg"));
    assert.equal(haldi.notes, "Marigold yellow");
  });

  test("7. Shared-field conflict detector fires only for simultaneous edits by the OTHER partner", () => {
    const conflict = detectSharedFieldConflict({
      fieldKey: "q3_firstMeet",
      activePartner: "partnerA",
      localValue: "Coffee shop in Kochi",
      remoteValue: "Bookstore in Fort Kochi",
      remoteMeta: { updatedBy: "partnerB", updatedAt: "2026-11-23T10:00:00.000Z" },
      partnerNames: { partner1: "Maya", partner2: "Leo" },
      isFieldLocallyDirty: true,
    });
    assert.ok(conflict);
    assert.equal(conflict.otherPartnerName, "Leo");

    // No conflict if same partner updated it
    const samePartner = detectSharedFieldConflict({
      fieldKey: "q3_firstMeet",
      activePartner: "partnerA",
      localValue: "A",
      remoteValue: "B",
      remoteMeta: { updatedBy: "partnerA", updatedAt: "2026-11-23T10:00:00.000Z" },
      partnerNames: { partner1: "Maya", partner2: "Leo" },
      isFieldLocallyDirty: true,
    });
    assert.equal(samePartner, null);

    // No conflict if not locally dirty
    const cleanField = detectSharedFieldConflict({
      fieldKey: "q3_firstMeet",
      activePartner: "partnerA",
      localValue: "A",
      remoteValue: "B",
      remoteMeta: { updatedBy: "partnerB", updatedAt: "2026-11-23T10:00:00.000Z" },
      partnerNames: { partner1: "Maya", partner2: "Leo" },
      isFieldLocallyDirty: false,
    });
    assert.equal(cleanField, null);
  });

  test("8. Separate mode validates & counts each partner independently and resumes at first unanswered question", () => {
    let ans = createBaseAnswers();
    ans.fillMode = "separate";
    // Partner A filled their side of Q1, Q2, Q7, Q11, Q20; Partner B hasn't filled Q1, Q2, Q11, Q20 yet
    ans.q1_calls = { aCallsB: "Lee", bCallsA: "" };
    ans.q2_workPassion = { partnerA: "Architect", partnerB: "" };
    ans = setPartnerOverlayValue(ans, "partnerA", "q11_filmFeel", {
      selected: ["Natural & Candid", "Cinematic", "Editorial"],
      other: "",
    });
    ans = setPartnerOverlayValue(ans, "partnerA", "q18_cameraVersatility", "Very comfortable");

    assert.equal(validateQuestionStepForContext(1, ans, "separate", "partnerA").isComplete, true);
    assert.equal(validateQuestionStepForContext(1, ans, "separate", "partnerB").isComplete, false);
    assert.equal(validateQuestionStepForContext(11, ans, "separate", "partnerA").isComplete, true);
    assert.equal(validateQuestionStepForContext(11, ans, "separate", "partnerB").isComplete, false);
    assert.equal(validateQuestionStepForContext(20, ans, "separate", "partnerA").isComplete, true);
    assert.equal(validateQuestionStepForContext(20, ans, "separate", "partnerB").isComplete, false);

    assert.ok(getPartnerAnsweredCount(ans, "partnerA") > getPartnerAnsweredCount(ans, "partnerB"));
    assert.equal(getFirstUnansweredStepForPartner(ans, "partnerB"), 1);

    const draft: DraftRecord = {
      id: "tok_sep",
      submissionId: "sub_sep",
      ownerUid: "u1",
      status: "draft",
      fillMode: "separate",
      partnerProgress: buildPartnerProgressSnapshot(ans, {
        partnerA: { done: true, answeredCount: 27 },
        partnerB: { done: false, answeredCount: 0 },
      }),
      currentStep: 12,
      furthestStep: 28,
      partner1: "Maya",
      partner2: "Leo",
      weddingDate: "2026-12-18",
      phone: "+91 9876543210",
      email: "maya.leo@example.com",
      answers: ans,
      photoStatuses: {},
      answeredCount: 20,
      mandatoryRemaining: 2,
      createdAt: "2026-11-23T08:00:00.000Z",
      updatedAt: "2026-11-23T09:00:00.000Z",
    };
    const statusLine = describeDraftPartnerStatus(draft);
    assert.ok(statusLine && statusLine.startsWith("Waiting for Leo ("));
  });

  test("9. Untouched partner photo slots stay 'Not added by couple' and never trigger Upload failed or Needs attention", () => {
    let ans = createBaseAnswers();
    ans.fillMode = "separate";
    // Only Partner A uploaded a Q27 photo; Partner B left Q27 completely untouched
    ans = setPartnerOverlayValue(ans, "partnerA", "q23_oneLastThing", {
      notes: "Here is our venue sketch",
      images: ["submissions/sub_photo_1/q27_maya.jpg"],
    });

    const report = buildNormalizedPhotoReport(ans, {
      q27_a_1: {
        id: "q27_a_1",
        category: "last_thing",
        label: "One Last Thing Photo (Q27)",
        status: "uploaded",
        storagePath: "submissions/sub_photo_1/q27_maya.jpg",
        updatedAt: "2026-11-23T10:00:00.000Z",
      },
    });
    assert.equal(report.uploadedCount, 1);
    assert.equal(report.failedCount, 0);
    assert.equal(report.uploadingCount, 0);

    const record: SubmissionRecord = {
      id: "sub_photo_1",
      displayId: "#050",
      sequenceNumber: 50,
      partner1: "Maya",
      partner2: "Leo",
      weddingDate: "2026-12-18",
      phone: "+91 9876543210",
      email: "maya.leo@example.com",
      status: "new",
      submittedAt: "2026-11-23T10:00:00.000Z",
      answers: ans,
      photoStatuses: {
        q27_a_1: {
          id: "q27_a_1",
          category: "last_thing",
          label: "One Last Thing Photo (Q27)",
          status: "uploaded",
          storagePath: "submissions/sub_photo_1/q27_maya.jpg",
          updatedAt: "2026-11-23T10:00:00.000Z",
        },
      },
    };
    assert.equal(getSubmissionDeliveryState(record), "submitted");
  });

  test("10. Briefs & Shoot Day Cheat Sheet label split answers, combine both partners' priorities, highlight differences, and keep legacy output clean", () => {
    // Legacy unsplit submission
    const legacyAnswers = createBaseAnswers();
    const legacyCheat = synthesizeCheatSheet(legacyAnswers);
    assert.equal(legacyCheat.includes("Partner differences:"), false);

    // Split submission with distinct preferences
    let splitAnswers = createBaseAnswers();
    splitAnswers.fillMode = "separate";
    splitAnswers = setPartnerOverlayValue(splitAnswers, "partnerA", "q11_filmFeel", {
      selected: ["Editorial", "Cinematic", "Timeless"],
      other: "",
    });
    splitAnswers = setPartnerOverlayValue(splitAnswers, "partnerB", "q11_filmFeel", {
      selected: ["Natural & Candid", "Documentary", "Fun"],
      other: "",
    });
    splitAnswers = setPartnerOverlayValue(splitAnswers, "partnerA", "q15_captureAvoid", {
      definitelyCapture: "Mom putting on my veil",
      pleaseAvoid: "Harsh flash",
    });
    splitAnswers = setPartnerOverlayValue(splitAnswers, "partnerB", "q15_captureAvoid", {
      definitelyCapture: "Groomsmen toast",
      pleaseAvoid: "Long posed sessions",
    });
    splitAnswers = setPartnerOverlayValue(splitAnswers, "partnerA", "q16_nonNegotiables", "Golden hour portraits");
    splitAnswers = setPartnerOverlayValue(splitAnswers, "partnerB", "q16_nonNegotiables", "Clear vow audio");
    splitAnswers = setPartnerOverlayValue(splitAnswers, "partnerA", "q18_cameraVersatility", "Very comfortable");
    splitAnswers = setPartnerOverlayValue(splitAnswers, "partnerB", "q18_cameraVersatility", "A bit camera-shy");
    splitAnswers = setPartnerOverlayValue(splitAnswers, "partnerA", "q20_guidanceComfort", "Full creative direction");
    splitAnswers = setPartnerOverlayValue(splitAnswers, "partnerB", "q20_guidanceComfort", "Mostly candid");

    const crewPriorities = getCombinedCrewPriorities(splitAnswers);
    assert.equal(crewPriorities.mustCaptureEntries.length, 2);
    assert.equal(crewPriorities.pleaseAvoidEntries.length, 2);
    assert.equal(crewPriorities.nonNegotiableEntries.length, 2);
    assert.ok(crewPriorities.partnerDifferences.length >= 3);

    const shortBrief = generateBriefSummary("OAKS Wedding", splitAnswers);
    assert.ok(shortBrief.includes("Maya: Very comfortable"));
    assert.ok(shortBrief.includes("Leo: A bit camera-shy"));
    assert.ok(shortBrief.includes("Maya — Definitely capture: Mom putting on my veil"));
    assert.ok(shortBrief.includes("Leo — Definitely capture: Groomsmen toast"));

    const editorial = synthesizeEditorialBrief(splitAnswers);
    assert.ok(editorial.includes("Maya: Very comfortable"));
    assert.ok(editorial.includes("Leo: A bit camera-shy"));
    assert.ok(editorial.includes("Maya — Please avoid: Harsh flash"));
    assert.ok(editorial.includes("Leo — Please avoid: Long posed sessions"));

    const cheatSheet = synthesizeCheatSheet(splitAnswers);
    assert.ok(cheatSheet.includes("Maya: Mom putting on my veil"));
    assert.ok(cheatSheet.includes("Leo: Groomsmen toast"));
    assert.ok(cheatSheet.includes("Maya: Harsh flash"));
    assert.ok(cheatSheet.includes("Leo: Long posed sessions"));
    assert.ok(cheatSheet.includes("Camera comfort: Maya: Very comfortable · Leo: A bit camera-shy"));
    assert.ok(cheatSheet.includes("Direction: Maya: Full creative direction · Leo: Mostly candid"));
    assert.ok(cheatSheet.includes("Partner differences:"));
    assert.ok(cheatSheet.includes("Maya: Golden hour portraits"));
    assert.ok(cheatSheet.includes("Leo: Clear vow audio"));

    const camDisp = getLabelledOverlayDisplay(splitAnswers, "q18_cameraVersatility");
    assert.equal(camDisp.isSplit, true);
    assert.equal(camDisp.hasDifference, true);
  });

  test("11. .env.example never declares VITE_PUBLIC_APP_URL or VITE_ENABLE_SPLIT_MODE (avoids AI Studio secret modal)", () => {
    const envExamplePath = path.join(process.cwd(), ".env.example");
    if (fs.existsSync(envExamplePath)) {
      const content = fs.readFileSync(envExamplePath, "utf8");
      assert.equal(content.includes("VITE_PUBLIC_APP_URL"), false);
      assert.equal(content.includes("VITE_ENABLE_SPLIT_MODE"), false);
    }
  });
});
