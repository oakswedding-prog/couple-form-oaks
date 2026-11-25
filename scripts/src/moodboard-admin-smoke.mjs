import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

const projectId = "oaks-couple-questionnaire";
const bucket = `${projectId}.appspot.com`;
const authUrl = "http://127.0.0.1:29099/identitytoolkit.googleapis.com/v1";
const firestoreUrl = `http://127.0.0.1:28080/v1/projects/${projectId}/databases/(default)/documents`;
const storageUrl = `http://127.0.0.1:29199/v0/b/${bucket}/o`;
const outputDir = "generated-artifacts/moodboard-admin-smoke";
const appUrl = "http://127.0.0.1:4178";
const submissionId = `moodboard-admin-${randomUUID()}`;
const legacySubmissionId = `moodboard-legacy-${randomUUID()}`;
const cleanupResumeToken = `delete-test-resume-${randomUUID()}`;
const cleanupErrorId = `delete-test-error-${randomUUID()}`;
const password = `emulator-${randomUUID()}`;

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
  if (!response.ok) throw new Error(`${options.method || "GET"} ${url} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

async function createAuthUser(data) {
  return requestJson(`${authUrl}/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true, ...data }),
  });
}

function toFirestoreValue(value) {
  if (value === null) return { nullValue: "NULL_VALUE" };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toFirestoreValue(item)])) } };
}

async function uploadPhoto(coupleToken, objectPath, png) {
  await requestJson(`${storageUrl}?uploadType=media&name=${encodeURIComponent(objectPath)}`, {
    method: "POST",
    headers: {
      Authorization: `Firebase ${coupleToken}`,
      "Content-Type": "image/png",
    },
    body: png,
  });
}

async function seedSubmission(id, coupleToken, coupleUid, answers, resumeToken) {
  const record = {
    id,
    ownerUid: coupleUid,
    participantUids: [coupleUid],
    ...(resumeToken ? { resumeToken } : {}),
    partner1: "Maya",
    partner2: "Leo",
    weddingDate: "2027-02-14",
    submittedAt: new Date().toISOString(),
    status: "new",
    answers,
  };
  await requestJson(`${firestoreUrl}/submissions?documentId=${encodeURIComponent(id)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${coupleToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: Object.fromEntries(Object.entries(record).map(([key, value]) => [key, toFirestoreValue(value)])),
    }),
  });
}

async function seedFirestoreDocument(collectionPath, documentId, token, data) {
  return requestJson(
    `${firestoreUrl}/${collectionPath}?documentId=${encodeURIComponent(documentId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])
        ),
      }),
    }
  );
}

async function assertFirestoreDocumentMissing(documentPath, token) {
  const response = await fetch(`${firestoreUrl}/${documentPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 404, `${documentPath} should be deleted`);
}

async function waitForApp() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(appUrl);
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`The test Vite server did not start at ${appUrl}`);
}

const adminAllowlist = await readFile("artifacts/oaks-questionnaire/src/lib/adminAllowlist.ts", "utf8");
const adminEmail = adminAllowlist.match(/"([^"]+@[^"]+)"/)?.[1];
assert.ok(adminEmail, "No built-in admin address was found for emulator authentication");

const admin = await createAuthUser({ email: adminEmail, password });
const verificationRequest = await requestJson(`${authUrl}/accounts:sendOobCode?key=fake-api-key`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken: admin.idToken }),
});
const oobCodes = await requestJson(`http://127.0.0.1:29099/emulator/v1/projects/${projectId}/oobCodes`);
const verificationCode = verificationRequest.oobCode
  || oobCodes.oobCodes?.find((entry) => entry.email === adminEmail && entry.requestType === "VERIFY_EMAIL")?.oobCode;
if (!verificationCode) {
  throw new Error("Auth emulator did not expose the local email verification code");
}
await requestJson(`${authUrl}/accounts:update?key=fake-api-key`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ oobCode: verificationCode, returnSecureToken: true }),
});
const verifiedAdmin = await requestJson(`${authUrl}/accounts:signInWithPassword?key=fake-api-key`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: adminEmail, password, returnSecureToken: true }),
});
const authClaims = JSON.parse(Buffer.from(verifiedAdmin.idToken.split(".")[1], "base64url").toString());
assert.equal(authClaims.email_verified, true, "Emulator admin account must have a verified email");
const couple = await createAuthUser({});
const coupleUid = couple.localId;
const photoPaths = [
  `submissions/${submissionId}/${coupleUid}/bride.png`,
  `submissions/${submissionId}/${coupleUid}/groom.png`,
  `submissions/${submissionId}/${coupleUid}/legacy.png`,
];
const legacyPhotoPath = `submissions/${legacySubmissionId}/${coupleUid}/shared.png`;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVQI12Nc2R7FwMAAAAgPAYyA+b7LAAAAAElFTkSuQmCC", "base64");

for (const objectPath of photoPaths) await uploadPhoto(couple.idToken, objectPath, png);
await uploadPhoto(couple.idToken, legacyPhotoPath, png);

const answers = {
  partner1: "Maya",
  partner2: "Leo",
  q10_people: { familyMembers: [], treeNotes: "" },
  wardrobe: {
    bride: {
      notes: "Ivory silk outfit",
      links: [],
      photos: [photoPaths[0], photoPaths[2]],
      photoEvents: ["Mehendi", ""],
    },
    groom: {
      notes: "Classic wedding look",
      links: [],
      photos: [photoPaths[1]],
      photoEvents: ["Wedding"],
    },
  },
  weddingOutfits: { notes: "", links: [], images: [] },
  decorEvents: [],
  q12_references: { images: [], links: [], notes: "" },
};
await seedSubmission(
  submissionId,
  couple.idToken,
  coupleUid,
  answers,
  cleanupResumeToken
);
await seedFirestoreDocument("drafts", cleanupResumeToken, couple.idToken, {
  submissionId,
  ownerUid: coupleUid,
  status: "draft",
  currentStep: 1,
});
await seedFirestoreDocument("submissionErrors", cleanupErrorId, couple.idToken, {
  submissionId,
  step: "post_save_notify_email",
  errorCode: "test/delete",
});
await seedSubmission(legacySubmissionId, couple.idToken, coupleUid, {
  partner1: "Maya",
  partner2: "Leo",
  q10_people: { familyMembers: [], treeNotes: "" },
  wardrobe: {
    bride: { notes: "", links: [], photos: [] },
    groom: { notes: "", links: [], photos: [] },
  },
  weddingOutfits: { notes: "Older shared outfit references", links: [], images: [legacyPhotoPath] },
});

await mkdir(outputDir, { recursive: true });
const vite = spawn("pnpm", [
  "--filter",
  "@workspace/oaks-questionnaire",
  "run",
  "dev",
], {
  stdio: "inherit",
  detached: true,
  env: {
    ...process.env,
    BASE_PATH: "/",
    PORT: "4178",
    VITE_USE_FIREBASE_EMULATORS: "true",
  },
});
let browser;
try {
  await waitForApp();
  browser = await chromium.launch({
    executablePath: "/repl/tools/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400) console.error("Browser HTTP error:", response.status(), response.url());
  });
  page.on("console", message => {
    if (message.type() === "error") console.error("Browser console:", message.text());
  });

  await page.goto(`${appUrl}/admin/couple/${submissionId}`, { waitUntil: "networkidle" });
  await page.locator("#admin-email-input").fill(adminEmail);
  await page.locator("#admin-password-input").fill(password);
  await page.locator("#admin-password-input").press("Enter");
  try {
    await page.getByTestId("tab-moodboard").waitFor({ timeout: 30000 });
    const tabsAreOrdered = await page.evaluate(() => {
      const moodboard = document.querySelector('[data-testid="tab-moodboard"]');
      const fullResponses = document.querySelector('[data-testid="tab-full-responses"]');
      return Boolean(moodboard && fullResponses
        && (moodboard.compareDocumentPosition(fullResponses) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    assert.equal(tabsAreOrdered, true, "Wedding Moodboard appears immediately before Full Responses");
  } catch (error) {
    console.error("Admin sign-in did not reach the couple page. Current page:", page.url());
    console.error((await page.locator("body").innerText()).slice(0, 2500));
    await page.screenshot({ path: `${outputDir}/admin-login-error.jpg`, fullPage: true });
    throw error;
  }
  await page.getByTestId("tab-moodboard").click();
  await page.getByTestId("moodboard-view").waitFor();

  for (const format of ["pdf", "pptx"]) {
    const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
    await page.getByTestId(`button-export-${format}`).click();
    const download = await downloadPromise;
    const filePath = `${outputDir}/${format}-${submissionId}.${format}`;
    await download.saveAs(filePath);
    const bytes = await readFile(filePath);
    assert.ok(bytes.length > 1000, `${format.toUpperCase()} export is empty`);
    if (format === "pdf") assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
    else assert.equal(bytes.subarray(0, 2).toString(), "PK");
  }

  await page.getByTestId("tab-full-responses").click();
  await page.getByTestId("thumbnail-image-label").filter({ hasText: "Mehendi" }).waitFor();
  await page.getByTestId("thumbnail-image-label").filter({ hasText: "Wedding" }).waitFor();
  assert.equal(await page.getByTestId("thumbnail-image-label").count(), 2,
    "Labeled photos show their event; the unlabeled legacy photo remains unlabeled");

  await page.goto(`${appUrl}/admin/couple/${legacySubmissionId}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("tab-moodboard").waitFor();
  await page.getByTestId("tab-moodboard").click();
  await page.getByTestId("button-section-wardrobe").click();
  await page.getByTestId("button-next-page").click();
  const legacyWardrobeText = await page.locator('[data-testid="moodboard-view"] svg text').allTextContents();
  assert.ok(legacyWardrobeText.some(text => /Wedding outfit references/i.test(text)),
    "A saved legacy shared wardrobe stays in a shared board without guessed ownership");

  await seedFirestoreDocument(
    `submissions/${submissionId}/adminMeta`,
    "main",
    verifiedAdmin.idToken,
    { privateNotes: "test-only private note", status: "new" }
  );
  const now = new Date().toISOString();
  await seedFirestoreDocument(
    `submissions/${submissionId}/productionEvents`,
    "delete-test-event",
    verifiedAdmin.idToken,
    {
      id: "delete-test-event",
      name: "Delete test event",
      isCustom: true,
      items: {},
      fileDetails: [],
      submitted: false,
      createdAt: now,
      updatedAt: now,
    }
  );
  await seedFirestoreDocument(
    `submissions/${submissionId}/eventSubmissions`,
    "wedding",
    verifiedAdmin.idToken,
    {
      eventId: "wedding",
      eventName: "Wedding",
      isCustom: false,
      submittedBy: adminEmail,
      submissionDate: "2026-11-25",
      submissionTime: "12:00",
      submittedAt: now,
      items: {},
      fileDetails: [],
    }
  );

  const coupleDeleteAttempt = await fetch(
    `${firestoreUrl}/submissions/${submissionId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${couple.idToken}` } }
  );
  assert.equal(coupleDeleteAttempt.status, 403, "Couples must not delete submissions");
  const couplePhotoDeleteAttempt = await fetch(
    `${storageUrl}/${encodeURIComponent(photoPaths[0])}`,
    { method: "DELETE", headers: { Authorization: `Firebase ${couple.idToken}` } }
  );
  assert.equal(couplePhotoDeleteAttempt.status, 403, "Couples must not delete Storage files");

  await page.goto(`${appUrl}/admin/couple/${submissionId}`, { waitUntil: "domcontentloaded" });
  await page.getByTitle("Delete this submission").first().click();
  const confirmation = page.locator("#delete-submission-confirmation");
  const permanentDeleteButton = page.getByRole("button", { name: "Delete permanently" });
  assert.equal(await permanentDeleteButton.isDisabled(), true,
    "Permanent delete stays disabled until typed confirmation");
  await confirmation.fill("Maya & Leo");
  assert.equal(await permanentDeleteButton.isDisabled(), false);
  await permanentDeleteButton.click();
  await page.waitForURL("**/admin", { timeout: 30000 });
  await page.getByText(/Deleted submission .* and its 3 photos/i).waitFor({ timeout: 15000 });

  await assertFirestoreDocumentMissing(`submissions/${submissionId}`, verifiedAdmin.idToken);
  await assertFirestoreDocumentMissing(`drafts/${cleanupResumeToken}`, verifiedAdmin.idToken);
  await assertFirestoreDocumentMissing(`submissionErrors/${cleanupErrorId}`, verifiedAdmin.idToken);
  await assertFirestoreDocumentMissing(
    `submissions/${submissionId}/adminMeta/main`,
    verifiedAdmin.idToken
  );
  await assertFirestoreDocumentMissing(
    `submissions/${submissionId}/productionEvents/delete-test-event`,
    verifiedAdmin.idToken
  );
  await assertFirestoreDocumentMissing(
    `submissions/${submissionId}/eventSubmissions/wedding`,
    verifiedAdmin.idToken
  );
  const remainingStorage = await requestJson(
    `${storageUrl}?prefix=${encodeURIComponent(`submissions/${submissionId}/`)}`,
    { headers: { Authorization: `Firebase ${verifiedAdmin.idToken}` } }
  );
  assert.equal(remainingStorage.items?.length || 0, 0, "Submission Storage folder must be empty");

  await page.goto(`${appUrl}/admin`, { waitUntil: "domcontentloaded" });
  await page.getByTitle("Delete Maya & Leo's submission").click();
  const dashboardConfirmation = page.locator("#delete-submission-confirmation");
  const dashboardDeleteButton = page.getByRole("button", { name: "Delete permanently" });
  await dashboardConfirmation.fill("DELETE");
  await dashboardDeleteButton.click();
  await page.getByText(/Deleted submission .* and its 1 photo/i).waitFor({ timeout: 15000 });
  await assertFirestoreDocumentMissing(`submissions/${legacySubmissionId}`, verifiedAdmin.idToken);
  const remainingLegacyStorage = await requestJson(
    `${storageUrl}?prefix=${encodeURIComponent(`submissions/${legacySubmissionId}/`)}`,
    { headers: { Authorization: `Firebase ${verifiedAdmin.idToken}` } }
  );
  assert.equal(remainingLegacyStorage.items?.length || 0, 0,
    "Dashboard deletion must clean up the legacy Storage folder");

  assert.deepEqual(pageErrors, [], "No uncaught errors occurred in the authenticated admin page");

  await page.screenshot({ path: `${outputDir}/admin-wardrobe.jpg`, fullPage: true });
  await context.close();
  console.log("PASS: Firebase Auth, Firestore, and Storage emulators served a real signed-in admin session.");
  console.log("PASS: the saved couple loaded, both moodboard exports downloaded, and wardrobe labels rendered without labeling the legacy photo.");
  console.log("PASS: legacy shared outfit data stays shared and is not assigned to either partner.");
  console.log("PASS: admin deletion removed three Storage files, the resume draft, error and related Firestore records.");
  console.log("PASS: dashboard deletion used the typed DELETE confirmation and cleaned up the legacy photo.");
  console.log("PASS: couple deletion was denied by Firestore and Storage rules.");
  console.log("All records, users, and images were created only in local emulators; no production requests were made.");
} finally {
  if (browser) await browser.close();
  if (vite.exitCode === null) {
    const exited = new Promise(resolve => vite.once("exit", resolve));
    try { process.kill(-vite.pid, "SIGTERM"); } catch { vite.kill("SIGTERM"); }
    await Promise.race([exited, delay(5000)]);
    if (vite.exitCode === null) {
      try { process.kill(-vite.pid, "SIGKILL"); } catch { vite.kill("SIGKILL"); }
    }
  }
}
