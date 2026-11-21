import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { QuestionnaireAnswers, SubmissionRecord } from "../types/questionnaire.ts";
import {
  generateResumeToken,
  generateStableSubmissionId,
  isValidResumeToken,
  buildResumeUrl,
  computePersistedStep,
  redactResumeTokens,
  detectDeviceAndBrowser,
  isInAppBrowser,
} from "../lib/coupleSession.ts";
import {
  buildSafeSubmissionErrorPayload,
  extractShortErrorCode,
} from "../lib/errorLogger.ts";
import {
  isChunkLoadError,
  checkForNewDeployment,
  getCurrentBuildId,
} from "../lib/versionGuard.ts";
import {
  MAX_PHOTO_UPLOAD_BYTES,
  TOO_LARGE_PHOTO_ERROR,
  isHeicPhotoFile,
  validatePhotoFileBeforeCompression,
  resolveSafeFallbackBlob,
} from "./imageCompressor.ts";
import { readFileSync } from "node:fs";
import {
  PENDING_PHOTO_PREFIX,
  sanitizeAnswersForFirestore,
  waitForCoupleUidBeforeUpload,
  findMissingPhotoSlots,
  __setPhotoEntryForTest,
  __clearPhotoEntriesForTest,
} from "../lib/photoUploadManager.ts";
import {
  executeBulletproofSubmit,
  findResumeTokenForSubmission,
  getSubmissionAttentionReasons,
  getSubmissionDeliveryState,
  parseNotifyApiResponse,
  sortSubmissionsNewestFirst,
} from "../lib/submissions.ts";
import notifyHandler from "../../api/notify.ts";

function makeSampleAnswers(overrides: Partial<QuestionnaireAnswers> = {}): QuestionnaireAnswers {
  return {
    partner1: "Gloria",
    partner2: "Tejas",
    weddingDate: "2026-12-18",
    phone: "+91 9876543210",
    email: "gloria.tejas@example.com",
    q1_calls: { aCallsB: "Glo", bCallsA: "Tej" },
    q2_workPassion: { partnerA: "Architecture", partnerB: "Product design" },
    q3_firstMeet: "Met at a mutual friend's dinner in Bengaluru.",
    q4_firstImpression: { partnerA: "Warm laugh", partnerB: "Effortlessly kind" },
    q5_threeWords: ["Warm", "Joyful", "Grounded"],
    q6_activities: { selected: ["Travel", "Cooking"], other: "" },
    q7_loveMost: { partnerA: "Calm presence", partnerB: "Sense of humour" },
    q8_funnyStory: "Missed our flight to Goa because we got lost looking for filter coffee.",
    q9_proposal: { choice: "story", story: "Sunset by the cliffs in Varkala." },
    q10_people: {
      familyMembers: [
        {
          id: "vip_1",
          name: "Grandma Rose",
          relationship: "Grandparent",
          side: "bride",
          mustCapture: true,
        },
      ],
      treeNotes: "Both sets of grandparents sit in the front row.",
      brideSide: { photos: [], notes: "Bride's aunt Mary is flying in from London." },
      groomSide: { photos: [], notes: "Groom's uncle Ravi gives the main toast." },
    },
    q11_filmFeel: { selected: ["Timeless & Classic"], other: "" },
    q12_references: { links: ["https://pinterest.com/sample"], images: [], notes: "Warm candlelight." },
    wardrobe: {
      bride: { notes: "Ivory silk saree", links: [], photos: [] },
      groom: { notes: "Off-white raw silk sherwani", links: [], photos: [] },
    },
    weddingOutfits: { links: [], images: [], notes: "" },
    decorMoodBoard: { links: [], images: [], notes: "" },
    decorEvents: [
      { id: "wedding", name: "Wedding", links: [], images: [], notes: "Jasmine & brass" },
      { id: "sangeet", name: "Sangeet", links: [], images: [], notes: "Warm string lights" },
    ],
    q13_tone: { selected: ["Candid & Unscripted"], other: "" },
    q14_moments: { selected: ["First look", "Parents' reactions"], other: "" },
    q15_captureAvoid: { definitelyCapture: "Grandma blessing us", pleaseAvoid: "Stiff posed shots" },
    q16_nonNegotiables: "Golden hour portraits after pheras.",
    q17_emotional: "Definitely Tejas during the vows.",
    q18_cameraVersatility: "Comfortable once we relax.",
    choosingOaks: "Loved the documentary honesty of your films.",
    q19_whatMattersMost: { selected: ["Family emotions"], other: "" },
    q20_guidanceComfort: "Gentle prompts work great.",
    q21_comfortTips: { selected: ["Keep it candid"], notes: "" },
    q22_futureFeeling: "Like we are right back in the warmth of that evening.",
    q23_oneLastThing: { notes: "Thank you for taking such care!", images: [] },
    ...overrides,
  };
}

describe("Bulletproof Couple Questionnaire Reliability Suite (11 Scenarios)", () => {
  beforeEach(() => {
    __clearPhotoEntriesForTest();
  });

  // Scenario 1: Submitting with no photos
  it("1. No photos: saves main record cleanly with 0 pending photos and status 'submitted'", async () => {
    const writtenDocs: Array<{ id: string; payload: Record<string, unknown> }> = [];
    const answers = makeSampleAnswers();
    const submissionId = generateStableSubmissionId();

    const result = await executeBulletproofSubmit(
      {
        submissionId,
        resumeToken: generateResumeToken(),
        ownerUid: "anon_uid_1",
        answers,
      },
      {
        writeSubmissionDoc: async (id, payload) => {
          writtenDocs.push({ id, payload });
        },
        assignDisplayNumber: async () => ({ sequenceNumber: 21, displayId: "#021" }),
        markDraftDone: async () => {},
        notifyStudioAndCouple: async () => {},
        retryDelaysMs: [1, 1],
      }
    );

    assert.equal(result.id, submissionId);
    assert.equal(result.pendingPhotoCount, 0);
    assert.equal(result.failedPhotoCount, 0);
    assert.equal(writtenDocs.length, 1);
    assert.equal(writtenDocs[0].id, submissionId);
    assert.equal(writtenDocs[0].payload.submissionState, "submitted");
  });

  // Scenario 2: Submitting with 15 large photos (up to 15 MB) — Firestore stays tiny, zero base64
  it("2. 15 large photos (up to 15 MB): allows 15 MB, rejects >15 MB, stores only Storage paths (<100 KB JSON)", () => {
    const fourteenMbFile = new File(["x"], "wedding-photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(fourteenMbFile, "size", { value: 14.9 * 1024 * 1024 });
    assert.deepEqual(validatePhotoFileBeforeCompression(fourteenMbFile), { ok: true });

    const sixteenMbFile = new File(["x"], "huge-raw.jpg", { type: "image/jpeg" });
    Object.defineProperty(sixteenMbFile, "size", { value: MAX_PHOTO_UPLOAD_BYTES + 1024 });
    assert.deepEqual(validatePhotoFileBeforeCompression(sixteenMbFile), {
      ok: false,
      message: TOO_LARGE_PHOTO_ERROR,
    });

    const submissionId = generateStableSubmissionId();
    const uploadedPaths: string[] = [];
    for (let i = 1; i <= 15; i++) {
      const token = `${PENDING_PHOTO_PREFIX}photo_${i}`;
      const finalPath = `submissions/${submissionId}/anon_uid_2/photo_${i}.jpg`;
      __setPhotoEntryForTest({
        localToken: token,
        targetStoragePath: finalPath,
        uploadedStoragePath: finalPath,
        previewUrl: `blob:photo_${i}`,
        category: "wardrobe",
        status: "uploaded",
        progress: 100,
        blob: new Blob(["img"], { type: "image/jpeg" }),
        contentType: "image/jpeg",
        attempts: 1,
        updatedAt: new Date().toISOString(),
      });
      uploadedPaths.push(token);
    }

    const answers = makeSampleAnswers({
      couplePhotoUrl: uploadedPaths[0],
      wardrobe: {
        bride: { notes: "Saree", links: [], photos: uploadedPaths.slice(1, 8) },
        groom: { notes: "Sherwani", links: [], photos: uploadedPaths.slice(8, 15) },
      },
    });

    const sanitized = sanitizeAnswersForFirestore(answers);
    assert.equal(sanitized.uploadedCount, 15);
    assert.equal(sanitized.pendingCount, 0);
    assert.equal(sanitized.failedCount, 0);

    const serialized = JSON.stringify(sanitized.answers);
    assert.equal(serialized.includes("data:image/"), false, "Must never contain base64");
    assert.equal(serialized.includes(PENDING_PHOTO_PREFIX), false, "Must replace tokens with real paths");
    assert.ok(serialized.length < 25_000, `Expected tiny Firestore doc (<25 KB), got ${serialized.length} bytes`);
  });

  // Scenario 3: iPhone HEIC photos — detected and NEVER mislabeled as image/jpeg if conversion fails
  it("3. iPhone HEIC: detects .heic/.heif and refuses to mislabel unconverted HEIC as image/jpeg", () => {
    const heicByExt = { name: "IMG_4821.HEIC", type: "" };
    const heicByMime = { name: "photo", type: "image/heic" };
    const heifByExt = { name: "portrait.heif", type: "application/octet-stream" };
    assert.equal(isHeicPhotoFile(heicByExt), true);
    assert.equal(isHeicPhotoFile(heicByMime), true);
    assert.equal(isHeicPhotoFile(heifByExt), true);

    // Simulate a File whose HEIC conversion failed — resolveSafeFallbackBlob MUST throw (never lie as JPEG)
    const rawHeicFile = new File(["fake-heic-bytes"], "IMG_4821.HEIC", { type: "image/heic" });
    assert.throws(
      () => resolveSafeFallbackBlob(rawHeicFile, true),
      /convert this iPhone HEIC photo/i
    );

    // By contrast, a valid JPEG under 15 MB can safely fall back to its true image/jpeg MIME
    const validJpeg = new File(["fake-jpeg-bytes"], "IMG_4822.JPG", { type: "image/jpeg" });
    const fallback = resolveSafeFallbackBlob(validJpeg, false);
    assert.ok(fallback);
    assert.equal(fallback.contentType, "image/jpeg");
    assert.equal(fallback.extension, "jpg");
  });

  // Scenario 4: Slow connection / offline moment during Send — auto-retries same ID & never blocked by pending/failed photos
  it("4. Slow/offline Send: retries up to 3 times reusing same submissionId & submits even with pending/failed photos", async () => {
    const submissionId = generateStableSubmissionId();
    const pendingToken = `${PENDING_PHOTO_PREFIX}slow_1`;
    const failedToken = `${PENDING_PHOTO_PREFIX}failed_2`;

    __setPhotoEntryForTest({
      localToken: pendingToken,
      targetStoragePath: `submissions/${submissionId}/anon_uid_4/slow_1.jpg`,
      previewUrl: "blob:slow_1",
      category: "decor",
      status: "uploading",
      progress: 45,
      blob: new Blob(["img"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
      attempts: 1,
      updatedAt: new Date().toISOString(),
    });
    __setPhotoEntryForTest({
      localToken: failedToken,
      targetStoragePath: `submissions/${submissionId}/anon_uid_4/failed_2.jpg`,
      previewUrl: "blob:failed_2",
      category: "decor",
      status: "error",
      progress: 0,
      blob: new Blob(["img"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
      error: "storage/retry-limit-exceeded",
      attempts: 3,
      updatedAt: new Date().toISOString(),
    });

    const answers = makeSampleAnswers({
      q12_references: { links: [], images: [pendingToken, failedToken], notes: "" },
    });

    const attemptedIds: string[] = [];
    let attemptCount = 0;
    const savedPayloads: Record<string, unknown>[] = [];

    const result = await executeBulletproofSubmit(
      {
        submissionId,
        ownerUid: "anon_uid_4",
        answers,
      },
      {
        writeSubmissionDoc: async (id, payload) => {
          attemptedIds.push(id);
          attemptCount++;
          if (attemptCount < 3) {
            throw Object.assign(new Error("Temporary network timeout"), { code: "unavailable" });
          }
          savedPayloads.push(payload);
        },
        assignDisplayNumber: async () => ({ sequenceNumber: 22, displayId: "#022" }),
        retryDelaysMs: [1, 1],
      }
    );

    assert.equal(attemptCount, 3, "Should auto-retry up to 3 attempts");
    assert.deepEqual(attemptedIds, [submissionId, submissionId, submissionId], "Must reuse identical submissionId (no duplicates)");
    assert.equal(result.id, submissionId);
    assert.equal(result.pendingPhotoCount, 1);
    assert.equal(result.failedPhotoCount, 1);
    // Unuploaded/failed photo tokens MUST NOT be saved as Storage paths in answers
    const savedAnswers = savedPayloads[0].answers as QuestionnaireAnswers;
    assert.deepEqual(savedAnswers.q12_references.images, []);
    assert.equal(savedPayloads[0].submissionState, "needs_attention");
  });

  // Scenario 5: In-app browser (WhatsApp / Instagram) detection & safe error payload extraction
  it("5. In-app browser (WhatsApp/Instagram): detects in-app browser cleanly and extracts short error code", () => {
    const igUA =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F79 Instagram 330.0.0.23.92";
    const waUA =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.11";
    const safariUA =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

    assert.equal(isInAppBrowser(igUA), true);
    assert.equal(isInAppBrowser(waUA), true);
    assert.equal(isInAppBrowser(safariUA), false);
    assert.equal(detectDeviceAndBrowser(igUA), "iOS · Instagram In-App Browser");
    assert.equal(detectDeviceAndBrowser(waUA), "Android · WhatsApp In-App Browser");

    assert.equal(
      extractShortErrorCode({ code: "permission-denied", message: "Missing or insufficient permissions" }),
      "permission-denied"
    );
  });

  // Scenario 6: Resume link across different browser — 192-bit token, URL builder, and strict log redaction
  it("6. Resume link: generates >=128-bit random token, builds ?resume URL, and strips token from error logs", () => {
    const token = generateResumeToken();
    assert.ok(token.length >= 32, `Expected 32-char (192-bit) base64url token, got length ${token.length}`);
    assert.equal(isValidResumeToken(token), true);
    assert.equal(isValidResumeToken("short"), false);

    const url = buildResumeUrl(token, "https://coupleform-oaks.vercel.app");
    assert.equal(url, `https://coupleform-oaks.vercel.app/?resume=${encodeURIComponent(token)}`);

    const leakedText = `Failed to load https://coupleform-oaks.vercel.app/?resume=${token} for draft`;
    const redacted = redactResumeTokens(leakedText, token);
    assert.equal(redacted.includes(token), false, "Resume token must NEVER appear in redacted text");

    const errorPayload = buildSafeSubmissionErrorPayload({
      step: "load_resume_draft",
      error: new Error(`Failed loading ${url}`),
      submissionId: "sub_abc",
      photoCount: 2,
    });
    assert.equal(JSON.stringify(errorPayload).includes(token), false, "submissionErrors payload must never leak resumeToken");
    assert.equal("answers" in errorPayload, false, "submissionErrors must never include couple answers");
  });

  // Scenario 7: Close half-way and reopen — Step 0 MUST NEVER overwrite saved step
  it("7. Close half-way & reopen: Step 0 never overwrites saved step progress", () => {
    assert.equal(computePersistedStep(0, 14), 14, "Reopening on Welcome (Step 0) must preserve Step 14");
    assert.equal(computePersistedStep(0, 0), 0);
    assert.equal(computePersistedStep(15, 14), 15, "Advancing to Step 15 updates saved step");
    assert.equal(computePersistedStep(8, 14), 8, "Explicitly navigating back to Step 8 updates saved step");
  });

  // Scenario 8: Post-save failures (counter/number failure or email failure) NEVER turn a saved submission into an error
  it("8. Post-save failure: main record still succeeds even if display counter & email notifications fail", async () => {
    const loggedErrors: Array<{ step: string; submissionId: string }> = [];
    const submissionId = generateStableSubmissionId();

    const result = await executeBulletproofSubmit(
      {
        submissionId,
        resumeToken: generateResumeToken(),
        ownerUid: "anon_uid_8",
        answers: makeSampleAnswers(),
      },
      {
        writeSubmissionDoc: async () => {
          // Main Firestore save succeeds!
        },
        assignDisplayNumber: async () => {
          throw new Error("Counter transaction permission denied");
        },
        markDraftDone: async () => {
          throw new Error("Draft update failed");
        },
        notifyStudioAndCouple: async () => {
          throw new Error("Resend 500 error");
        },
        logError: async (step, _err, subId) => {
          loggedErrors.push({ step, submissionId: subId });
        },
        retryDelaysMs: [1, 1],
      }
    );

    // Allow microtasks from background post-save block to settle
    await new Promise((r) => setTimeout(r, 25));

    assert.equal(result.id, submissionId);
    assert.equal(result.displayId, undefined, "Must leave unnumbered rather than faking a clock-based number");
    assert.ok(
      loggedErrors.some((e) => e.step === "post_save_assign_number"),
      "Post-save numbering failure should be quietly logged"
    );
    assert.ok(
      loggedErrors.some((e) => e.step === "post_save_notify_email"),
      "Post-save email failure should be quietly logged"
    );
  });

  // Scenario 9: Dashboard visibility for submissions missing sequenceNumber, displayId, or status
  it("9. Missing sequenceNumber/status: still visible, sorts chronologically, flagged as 'needs_attention'", () => {
    const normalOlder: SubmissionRecord = {
      id: "sub_older",
      sequenceNumber: 18,
      displayId: "#018",
      submittedAt: "2026-11-18T10:00:00.000Z",
      status: "new",
      partner1: "Asha",
      partner2: "Vikram",
      weddingDate: "2026-12-01",
      phone: "",
      email: "",
      answers: makeSampleAnswers(),
    };
    const unnumberedNewer: SubmissionRecord = {
      id: "sub_unnumbered",
      submittedAt: "2026-11-21T11:00:00.000Z",
      partner1: "Sunoon",
      partner2: "Faizan",
      weddingDate: "2026-12-10",
      phone: "",
      email: "",
      answers: makeSampleAnswers(),
    };

    const sorted = sortSubmissionsNewestFirst([normalOlder, unnumberedNewer]);
    assert.equal(sorted.length, 2);
    assert.equal(sorted[0].id, "sub_unnumbered", "Unnumbered newer submission must sort first by submittedAt");
    assert.equal(getSubmissionDeliveryState(normalOlder), "submitted");
    assert.equal(getSubmissionDeliveryState(unnumberedNewer), "needs_attention");
  });

  // Scenario 10: Two couples submitting at the exact same millisecond — zero ID or token collisions
  it("10. Concurrent couples: generates unique stable submissionIds and resumeTokens with zero collisions", () => {
    const ids = new Set<string>();
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateStableSubmissionId());
      tokens.add(generateResumeToken());
    }
    assert.equal(ids.size, 100, "All 100 generated submissionIds must be unique");
    assert.equal(tokens.size, 100, "All 100 generated resumeTokens must be unique");
  });

  // Scenario 11: Site update deployed mid-session — detects chunk load errors & new build version.json
  it("11. Mid-session site update: detects Vite chunk load failure and mismatched /version.json buildId", async () => {
    assert.equal(
      isChunkLoadError(new Error("Failed to fetch dynamically imported module: /assets/ThankYouScreen-abc123.js")),
      true
    );
    assert.equal(isChunkLoadError({ name: "ChunkLoadError", message: "Loading chunk 4 failed" }), true);
    assert.equal(isChunkLoadError(new Error("Regular validation error")), false);

    const simulatedBuild = "2026-11-21T12:00:00.000Z";
    const sameBuild = await checkForNewDeployment(
      async () => ({
        ok: true,
        json: async () => ({ buildId: simulatedBuild }),
      }) as Response,
      simulatedBuild
    );
    assert.equal(sameBuild, false);

    const newerBuild = await checkForNewDeployment(
      async () => ({
        ok: true,
        json: async () => ({ buildId: "2026-11-21T12:05:00.000Z" }),
      }) as Response,
      simulatedBuild
    );
    assert.equal(newerBuild, true);
    assert.ok(typeof getCurrentBuildId() === "string");
  });

  // Scenario 12 (Fix 3): vercel.json does NOT intercept /api/* routes, and parseNotifyApiResponse catches HTML/errors
  it("12. Fix 3 (Emails): vercel.json excludes /api/* from SPA rewrite and parseNotifyApiResponse catches HTML & Resend errors", async () => {
    const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf-8"));
    const rewriteSource: string = vercelConfig.rewrites?.[0]?.source || "";
    assert.equal(rewriteSource, "/((?!api/).*)");
    const regex = new RegExp(`^${rewriteSource}$`);
    assert.equal(regex.test("/api/notify"), false, "/api/notify MUST NOT match SPA index.html rewrite");
    assert.equal(regex.test("/admin"), true, "/admin should still route to SPA index.html");
    assert.equal(regex.test("/admin/couple/sub_123"), true);

    // Catch HTML 200 OK returned by misconfigured SPA fallback
    await assert.rejects(
      () =>
        parseNotifyApiResponse({
          ok: true,
          status: 200,
          headers: { get: () => "text/html; charset=utf-8" },
          text: async () => "<!doctype html><html><body>SPA</body></html>",
        }),
      /non-JSON response/i
    );

    // Catch HTTP 502 with Resend error detail
    await assert.rejects(
      () =>
        parseNotifyApiResponse({
          ok: false,
          status: 502,
          headers: { get: () => "application/json" },
          text: async () =>
            JSON.stringify({
              success: false,
              notified: false,
              errors: ["Studio alert failed (HTTP 403): Domain not verified"],
            }),
        }),
      /Domain not verified/i
    );

    // Accept valid JSON success
    const okRes = await parseNotifyApiResponse({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () =>
        JSON.stringify({
          success: true,
          notified: true,
          coupleReceiptSent: true,
          errors: [],
        }),
    });
    assert.deepEqual(okRes, { notified: true, coupleReceiptSent: true });
  });

  // Scenario 13 (Fix 3): /api/notify sends studio alert + couple receipt with reply_to & "Photos: X of Y uploaded", and returns non-200 on error
  it("13. Fix 3 (/api/notify): sets reply_to default, includes 'Photos: X of Y uploaded', and returns 500/502 on missing env or Resend failure", async () => {
    const originalFetch = globalThis.fetch;
    const savedEnv = {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      NOTIFY_EMAILS: process.env.NOTIFY_EMAILS,
      RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
      RESEND_REPLY_TO: process.env.RESEND_REPLY_TO,
    };

    const runHandler = async (body: Record<string, unknown>) => {
      let statusCode = 200;
      let jsonBody: any = null;
      const req = { method: "POST", body };
      const res = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: any) {
          jsonBody = payload;
          return this;
        },
      };
      await notifyHandler(req, res);
      return { statusCode, jsonBody };
    };

    try {
      // 1. Missing RESEND_API_KEY returns HTTP 500 (not 200!)
      delete process.env.RESEND_API_KEY;
      process.env.NOTIFY_EMAILS = "studio@oakswedding.com";
      const missingKeyRes = await runHandler({
        partner1: "Boss",
        partner2: "Queen",
        email: "boss@example.com",
      });
      assert.equal(missingKeyRes.statusCode, 500);
      assert.equal(missingKeyRes.jsonBody.success, false);

      // 2. Valid env sends both studio alert & couple receipt with default reply_to and photo count line
      process.env.RESEND_API_KEY = "re_test_key";
      process.env.NOTIFY_EMAILS = "mywedding@oakswedding.com, team@oakswedding.com";
      process.env.RESEND_FROM_EMAIL = "OAKS Wedding <hello@mail.oakswedding.com>";
      delete process.env.RESEND_REPLY_TO;

      const sentPayloads: any[] = [];
      globalThis.fetch = (async (_url: any, init: any) => {
        sentPayloads.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ id: `email_${sentPayloads.length}` }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const ok = await runHandler({
        submissionId: "sub_022",
        displayId: "#022",
        partner1: "Boss",
        partner2: "Queen",
        weddingDate: "2026-11-21",
        phone: "+91 8590118094",
        email: "couple@example.com",
        uploadedPhotoCount: 7,
        totalPhotoCount: 10,
      });

      assert.equal(ok.statusCode, 200);
      assert.equal(ok.jsonBody.success, true);
      assert.equal(ok.jsonBody.notified, true);
      assert.equal(ok.jsonBody.coupleReceiptSent, true);
      assert.equal(sentPayloads.length, 2);
      // Studio email checks
      assert.equal(sentPayloads[0].from, "OAKS Wedding <hello@mail.oakswedding.com>");
      assert.equal(sentPayloads[0].reply_to, "mywedding@oakswedding.com");
      assert.ok(String(sentPayloads[0].html).includes("Photos: 7 of 10 uploaded"));
      assert.ok(String(sentPayloads[0].text).includes("Photos: 7 of 10 uploaded"));
      // Couple receipt checks
      assert.deepEqual(sentPayloads[1].to, ["couple@example.com"]);
      assert.equal(sentPayloads[1].reply_to, "mywedding@oakswedding.com");

      // 3. Resend failure returns non-200 status and explicit errors array
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ message: "Invalid API key" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch;

      const failedRes = await runHandler({
        submissionId: "sub_023",
        partner1: "Boss",
        partner2: "Queen",
        email: "couple@example.com",
        uploadedPhotoCount: 0,
        totalPhotoCount: 0,
      });
      assert.equal(failedRes.statusCode, 403);
      assert.equal(failedRes.jsonBody.success, false);
      assert.equal(failedRes.jsonBody.notified, false);
      assert.ok(failedRes.jsonBody.errors.length >= 1);
    } finally {
      globalThis.fetch = originalFetch;
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  // Scenario 14 (Fix 2): "Needs attention" lists every plain-English reason and auto-clears once resolved
  it("14. Fix 2 (Needs attention badge): explains exact reasons, checks submissionErrors for email failure, and clears back to Submitted when resolved", () => {
    const brokenRecord: SubmissionRecord = {
      id: "sub_broken_22",
      submittedAt: "2026-11-21T10:00:00.000Z",
      partner1: "Boss",
      partner2: "Queen",
      weddingDate: "2026-11-21",
      phone: "",
      email: "couple@example.com",
      answers: makeSampleAnswers(),
      photoStatuses: {
        p1: { id: "p1", category: "couple_photo", status: "uploaded", updatedAt: "2026-11-21T10:00:00.000Z" },
        p2: { id: "p2", category: "bride_outfit", status: "failed", errorCode: "storage/unauthorized", updatedAt: "2026-11-21T10:00:00.000Z" },
        p3: { id: "p3", category: "decor", status: "failed", errorCode: "storage/upload-timeout", updatedAt: "2026-11-21T10:00:00.000Z" },
      },
    };

    const errorLogs = [
      {
        id: "err_1",
        timestamp: "2026-11-21T10:00:05.000Z",
        step: "post_save_notify_email",
        errorCode: "email/invalid-response",
        message: "Notify endpoint returned non-JSON response",
        deviceBrowser: "Desktop · Chrome",
        photoCount: 3,
        submissionId: "sub_broken_22",
      },
    ];

    const reasons = getSubmissionAttentionReasons(brokenRecord, errorLogs);
    assert.deepEqual(reasons, [
      "2 photos failed to upload",
      "Missing submission number",
      "Missing status",
      "Email not sent",
    ]);
    assert.equal(getSubmissionDeliveryState(brokenRecord, errorLogs), "needs_attention");

    // Once resolved (photos uploaded, number assigned, status set, email sent), badge clears back to "submitted" automatically!
    const fixedRecord: SubmissionRecord = {
      ...brokenRecord,
      sequenceNumber: 22,
      displayId: "#022",
      status: "new",
      emailNotificationStatus: "sent",
      photoStatuses: {
        p1: { id: "p1", category: "couple_photo", status: "uploaded", updatedAt: "2026-11-21T10:05:00.000Z" },
        p2: { id: "p2", category: "bride_outfit", status: "uploaded", updatedAt: "2026-11-21T10:05:00.000Z" },
        p3: { id: "p3", category: "decor", status: "uploaded", updatedAt: "2026-11-21T10:05:00.000Z" },
      },
    };

    assert.deepEqual(getSubmissionAttentionReasons(fixedRecord, errorLogs), []);
    assert.equal(getSubmissionDeliveryState(fixedRecord, errorLogs), "submitted");

    // Resume token lookup works from either record.resumeToken or drafts fallback
    const token = generateResumeToken();
    assert.equal(findResumeTokenForSubmission({ id: "sub_1", resumeToken: token }), token);
    assert.equal(
      findResumeTokenForSubmission({ id: "sub_2" }, [
        {
          id: token,
          submissionId: "sub_2",
          ownerUid: "u1",
          status: "submitted",
          currentStep: 28,
          furthestStep: 28,
          partner1: "A",
          partner2: "B",
          weddingDate: "2026-12-18",
          phone: "",
          email: "",
          answers: makeSampleAnswers(),
          answeredCount: 27,
          mandatoryRemaining: 0,
          createdAt: "2026-11-21T10:00:00.000Z",
          updatedAt: "2026-11-21T10:00:00.000Z",
        },
      ]),
      token
    );
  });

  // Scenario 15 (Fix 1): waitForCoupleUidBeforeUpload retries auth and NEVER returns "anon_pending"
  it("15. Fix 1 (Strict auth wait): retries anonymous sign-in and never falls back to 'anon_pending'", async () => {
    let calls = 0;
    const uid = await waitForCoupleUidBeforeUpload(async () => {
      calls++;
      if (calls < 3) return null;
      return { uid: "real_firebase_anon_uid_99" };
    }, [1, 1, 1]);

    assert.equal(calls, 3);
    assert.equal(uid, "real_firebase_anon_uid_99");

    // If auth stays unavailable, returns null (keeps photo queued) — NEVER "anon_pending"
    const failedUid = await waitForCoupleUidBeforeUpload(
      async () => ({ uid: "anon_pending" }),
      [1, 1]
    );
    assert.equal(failedUid, null);
  });

  // Scenario 16 (Fix 1): findMissingPhotoSlots identifies unrecoverable photos after cleared storage/new phone
  it("16. Fix 1 (Missing photos checklist): detects missing slots across answers & saved photoStatuses and excludes uploaded ones", () => {
    const missingToken = `${PENDING_PHOTO_PREFIX}lost_on_other_phone_1`;
    const uploadedToken = `${PENDING_PHOTO_PREFIX}already_uploaded_2`;

    __setPhotoEntryForTest({
      localToken: uploadedToken,
      targetStoragePath: "submissions/sub_x/uid_1/ok.jpg",
      uploadedStoragePath: "submissions/sub_x/uid_1/ok.jpg",
      previewUrl: "blob:ok",
      category: "couple_photo",
      status: "uploaded",
      progress: 100,
      blob: new Blob(["ok"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
      attempts: 1,
      updatedAt: new Date().toISOString(),
    });

    const answers = makeSampleAnswers({
      couplePhotoUrl: uploadedToken,
      wardrobe: {
        bride: { notes: "Lehenga", links: [], photos: [missingToken] },
        groom: { notes: "", links: [], photos: [] },
      },
    });

    const savedPhotoStatuses = {
      failed_decor_1: {
        id: "failed_decor_1",
        category: "decor_sangeet",
        status: "failed" as const,
        errorCode: "storage/unauthorized",
        updatedAt: new Date().toISOString(),
      },
    };

    const missing = findMissingPhotoSlots(answers, savedPhotoStatuses);
    assert.equal(missing.length, 2);
    assert.equal(missing[0].category, "bride_outfit");
    assert.equal(missing[0].stepNumber, 13);
    assert.equal(missing[1].category, "decor_sangeet");
    assert.equal(missing[1].stepNumber, 14);
    assert.equal(missing[1].errorCode, "storage/unauthorized");
  });

  // Scenario 17 (Fix 3 + Fix 1): executeBulletproofSubmit fires email immediately with uploadedPhotoCount & totalPhotoCount
  it("17. Fix 3 (Immediate email with photo counts): sends studio alert & couple receipt right after save with 'uploadedPhotoCount' & 'totalPhotoCount'", async () => {
    const uploadedToken = `${PENDING_PHOTO_PREFIX}imm_up_1`;
    const pendingToken = `${PENDING_PHOTO_PREFIX}imm_pend_2`;

    __setPhotoEntryForTest({
      localToken: uploadedToken,
      targetStoragePath: "submissions/sub_17/uid_17/up1.jpg",
      uploadedStoragePath: "submissions/sub_17/uid_17/up1.jpg",
      previewUrl: "blob:up1",
      category: "couple_photo",
      status: "uploaded",
      progress: 100,
      blob: new Blob(["ok"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
      attempts: 1,
      updatedAt: new Date().toISOString(),
    });
    __setPhotoEntryForTest({
      localToken: pendingToken,
      targetStoragePath: "",
      previewUrl: "blob:pend2",
      category: "decor",
      status: "uploading",
      waitingForAuth: true,
      progress: 10,
      blob: new Blob(["ok"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
      attempts: 1,
      updatedAt: new Date().toISOString(),
    });

    let notifyBody: Record<string, unknown> | null = null;
    const emailStatusUpdates: string[] = [];

    const result = await executeBulletproofSubmit(
      {
        submissionId: "sub_17",
        resumeToken: generateResumeToken(),
        ownerUid: "uid_17",
        answers: makeSampleAnswers({
          couplePhotoUrl: uploadedToken,
          q23_oneLastThing: { notes: "Hi", images: [pendingToken] },
        }),
      },
      {
        writeSubmissionDoc: async () => {},
        notifyStudioAndCouple: async (payload) => {
          notifyBody = payload;
        },
        updateEmailStatus: async (_id, st) => {
          emailStatusUpdates.push(st);
        },
        retryDelaysMs: [1],
      }
    );

    await new Promise((r) => setTimeout(r, 25));

    assert.equal(result.uploadedPhotoCount, 1);
    assert.equal(result.totalPhotoCount, 2);
    assert.equal(result.pendingPhotoCount, 1);
    assert.ok(notifyBody, "notifyStudioAndCouple must be called immediately after main save");
    assert.equal((notifyBody as any).uploadedPhotoCount, 1);
    assert.equal((notifyBody as any).totalPhotoCount, 2);
    assert.deepEqual(emailStatusUpdates, ["sent"]);
  });
});
