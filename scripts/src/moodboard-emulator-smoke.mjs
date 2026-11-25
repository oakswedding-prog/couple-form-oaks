import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Run only under `firebase emulators:exec`; this project ID is intentionally demo-only.
const projectId = "demo-oaks-moodboard";
const authHost = "127.0.0.1:29099";
const firestoreHost = "127.0.0.1:28080";
const storageHost = "127.0.0.1:29199";
const appPort = 4178;
const origin = `http://127.0.0.1:${appPort}`;
const output = resolve(dirname(fileURLToPath(import.meta.url)), "../../generated-artifacts/moodboard-emulator");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const adminEmail = "oaksoperations@gmail.com";
const adminPassword = "local-emulator-only-password";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVQI12Nc2R7FwMAAAAgPAYyA+b7LAAAAAElFTkSuQmCC",
  "base64",
);

for (const [name, value] of [
  ["FIREBASE_AUTH_EMULATOR_HOST", process.env.FIREBASE_AUTH_EMULATOR_HOST],
  ["FIRESTORE_EMULATOR_HOST", process.env.FIRESTORE_EMULATOR_HOST],
]) {
  assert.equal(value, name === "FIREBASE_AUTH_EMULATOR_HOST" ? authHost : firestoreHost, `${name} must target the local emulator`);
}
assert.equal(process.env.GCLOUD_PROJECT, projectId, "The test must run under its isolated demo project.");

const toFirestoreValue = (value) => {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toFirestoreValue(item)])) } };
};

async function jsonRequest(url, { method = "GET", token, body, headers = {} } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
  assert.ok(response.ok, `${method} ${url} failed (${response.status}): ${JSON.stringify(data)}`);
  return data;
}

async function createAdmin() {
  const authBase = `http://${authHost}/identitytoolkit.googleapis.com/v1`;
  const created = await jsonRequest(`${authBase}/accounts:signUp?key=emulator-key`, {
    method: "POST",
    body: { email: adminEmail, password: adminPassword, returnSecureToken: true },
  });
  await jsonRequest(`${authBase}/accounts:update?key=emulator-key`, {
    method: "POST",
    body: { idToken: created.idToken, emailVerified: true, returnSecureToken: true },
  });
  const verifiedSignIn = await jsonRequest(`${authBase}/accounts:signInWithPassword?key=emulator-key`, {
    method: "POST",
    body: { email: adminEmail, password: adminPassword, returnSecureToken: true },
  });
  // Seed the allow-list using the emulator's owner token; the admin UI then follows
  // the same Firestore-backed authorization path used by non-built-in team accounts.
  await jsonRequest(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/admins/${encodeURIComponent(adminEmail)}`,
    {
      method: "PATCH",
      token: "owner",
      body: { fields: { email: toFirestoreValue(adminEmail), active: toFirestoreValue(true), role: toFirestoreValue("admin") } },
    },
  );
  return { uid: created.localId, idToken: verifiedSignIn.idToken };
}

async function putSubmission(token, id, record) {
  const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/submissions/${id}`;
  await jsonRequest(url, {
    method: "PATCH",
    token,
    body: { fields: Object.fromEntries(Object.entries(record).map(([key, value]) => [key, toFirestoreValue(value)])) },
  });
}

async function putStorageImage(token, path) {
  const url = `http://${storageHost}/v0/b/${projectId}.appspot.com/o?uploadType=media&name=${encodeURIComponent(path)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "image/png",
    },
    body: png,
  });
  const text = await response.text();
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  assert.ok(
    response.ok,
    `Storage fixture upload failed (${response.status}) for uid ${claims.sub} and path ${path}; token project ${claims.aud}: ${text}`,
  );
}

function fixture(id, uid, mode) {
  const mediaPath = (file) => `submissions/${id}/${uid}/${file}`;
  const answers = {
    partner1: mode === "separate" ? "Maya" : mode === "legacy" ? "Asha" : "Maya",
    partner2: mode === "legacy" ? "Dev" : "Leo",
    weddingDate: "2027-06-12",
    q10_people: { familyMembers: [], treeNotes: "" },
    decorEvents: [{
      id: "mehendi",
      name: "Mehendi",
      images: [mediaPath("decor.png")],
      links: [],
      notes: `${mode} decor note retained`,
    }],
    q12_references: { images: [mediaPath("inspiration.png")], links: [], notes: "" },
  };
  if (mode === "legacy") {
    answers.weddingOutfits = {
      images: [mediaPath("legacy-wardrobe.png")],
      links: [],
      notes: "Legacy shared wardrobe note retained",
    };
  } else if (mode === "separate") {
    answers.wardrobe = {
      bride: { photos: [mediaPath("bride-wardrobe.png")], photoEvents: ["Mehendi"], links: [], notes: "Separate bride wardrobe note retained" },
      groom: { photos: [mediaPath("groom-wardrobe.png")], photoEvents: ["Reception"], links: [], notes: "Separate groom wardrobe note retained" },
    };
    answers.partnerAnswers = {
      partnerA: { q23_oneLastThing: { images: [mediaPath("maya-inspiration.png")], notes: "Maya separate-mode inspiration" } },
      partnerB: { q23_oneLastThing: { images: [mediaPath("leo-inspiration.png")], notes: "Leo separate-mode inspiration" } },
    };
  } else {
    answers.wardrobe = {
      bride: { photos: [mediaPath("bride-wardrobe.png")], photoEvents: ["Mehendi"], links: [], notes: "Bride wardrobe detail" },
      groom: { photos: [mediaPath("groom-wardrobe.png")], photoEvents: ["Reception"], links: [], notes: "Groom wardrobe detail" },
    };
  }
  return {
    id,
    ownerUid: uid,
    partner1: answers.partner1,
    partner2: answers.partner2,
    weddingDate: answers.weddingDate,
    phone: "",
    email: "",
    submittedAt: "2026-01-01T00:00:00.000Z",
    status: "new",
    finalized: true,
    ...(mode === "separate" ? { fillMode: "separate" } : {}),
    answers,
  };
}

function collectStoragePaths(value) {
  const paths = new Set();
  const visit = (item) => {
    if (typeof item === "string" && item.startsWith("submissions/")) paths.add(item);
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === "object") Object.values(item).forEach(visit);
  };
  visit(value);
  return [...paths];
}

async function waitForServer(child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite exited before startup (code ${child.exitCode}).`);
    try {
      const response = await fetch(`${origin}/admin`);
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error("Vite did not start within 90 seconds.");
}

async function openCouple(page, id) {
  await page.goto(`${origin}/admin/couple/${id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Wedding Moodboard" }).waitFor({ timeout: 30_000 });
  const moodboardTab = page.locator('[data-testid="tab-moodboard"]');
  const fullResponsesTab = page.getByRole("button", { name: /Full Responses/ });
  const positions = await page.locator("button").evaluateAll((buttons, targets) => {
    const labels = buttons.map((button) => button.textContent?.replace(/\s+/g, " ").trim());
    return targets.map((target) => labels.findIndex((label) => label?.includes(target)));
  }, ["Wedding Moodboard", "Full Responses"]);
  assert.deepEqual(positions[1], positions[0] + 1, "Wedding Moodboard must sit immediately before Full Responses.");
  await moodboardTab.click();
  await page.getByTestId("moodboard-view").waitFor();
  assert.ok(await fullResponsesTab.isVisible());
}

async function exportAndCheck(page, id, formats, expectedText = []) {
  for (const format of formats) {
    const downloadEvent = page.waitForEvent("download", { timeout: 90_000 });
    await page.getByTestId(`button-export-${format}`).click();
    const download = await downloadEvent;
    const filePath = resolve(output, `${id}.${format}`);
    await download.saveAs(filePath);
    const bytes = await readFile(filePath);
    assert.ok(bytes.length > 20_000, `${id} ${format} export should contain the full moodboard.`);
    const text = format === "pdf"
      ? execFileSync("pdftotext", [filePath, "-"]).toString()
      : execFileSync("unzip", ["-p", filePath, "ppt/slides/slide*.xml"], { maxBuffer: 20_000_000 }).toString();
    for (const expected of expectedText) assert.ok(text.includes(expected), `${id} ${format} export omitted: ${expected}`);
  }
}

const appDirectory = resolve(root, "artifacts/oaks-questionnaire");
const vite = spawn(resolve(appDirectory, "node_modules/.bin/vite"), [
  "--config", "vite.config.ts", "--host", "0.0.0.0", "--port", String(appPort),
], {
  cwd: appDirectory,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    PORT: String(appPort),
    BASE_PATH: "/",
    VITE_USE_FIREBASE_EMULATORS: "true",
    VITE_FIREBASE_EMULATOR_PROJECT_ID: projectId,
  },
});
let viteOutput = "";
vite.stdout.on("data", (chunk) => { viteOutput += chunk.toString(); });
vite.stderr.on("data", (chunk) => { viteOutput += chunk.toString(); });

let browser;
try {
  await mkdir(output, { recursive: true });
  await waitForServer(vite);
  const admin = await createAdmin();
  const cases = [
    { id: "moodboard-emulator-valid", mode: "standard", text: ["Mehendi", "Bride wardrobe detail"] },
    { id: "moodboard-emulator-legacy", mode: "legacy", text: ["Legacy shared wardrobe note retained"] },
    { id: "moodboard-emulator-separate", mode: "separate", text: ["Separate bride wardrobe note retained", "Separate groom wardrobe note retained"] },
  ];
  for (const item of cases) {
    const record = fixture(item.id, admin.uid, item.mode);
    for (const path of collectStoragePaths(record.answers)) await putStorageImage(admin.idToken, path);
    await putSubmission(admin.idToken, item.id, record);
  }
  const missingId = "moodboard-emulator-missing-media";
  const missing = fixture(missingId, admin.uid, "standard");
  const missingPath = `submissions/${missingId}/${admin.uid}/missing-image.png`;
  missing.answers.q12_references.images = [missingPath];
  for (const path of collectStoragePaths(missing.answers)) {
    if (path !== missingPath) await putStorageImage(admin.idToken, path);
  }
  await putSubmission(admin.idToken, missingId, missing);

  const expiredId = "moodboard-emulator-expired-token";
  const expired = fixture(expiredId, admin.uid, "standard");
  const expiredObjectPath = `submissions/${expiredId}/${admin.uid}/inspiration.png`;
  const expiredUrl = `http://${storageHost}/v0/b/${projectId}.appspot.com/o/${encodeURIComponent(expiredObjectPath)}?alt=media&token=revoked-emulator-download-token`;
  expired.answers.q12_references.images = [expiredUrl];
  for (const path of collectStoragePaths(expired.answers)) await putStorageImage(admin.idToken, path);
  await putStorageImage(admin.idToken, expiredObjectPath);
  await putSubmission(admin.idToken, expiredId, expired);

  browser = await chromium.launch({
    executablePath: "/repl/tools/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const unexpectedCloudRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if ([
      "identitytoolkit.googleapis.com",
      "securetoken.googleapis.com",
      "firestore.googleapis.com",
      "firebasestorage.googleapis.com",
    ].includes(host)) {
      unexpectedCloudRequests.push(request.url());
    }
  });

  await page.goto(`${origin}/admin`, { waitUntil: "networkidle" });
  await page.locator("#admin-email-input").fill(adminEmail);
  await page.locator("#admin-password-input").fill(adminPassword);
  await page.locator("#admin-password-input").press("Enter");
  await page.getByRole("button", { name: /Sign Out/i }).waitFor({ timeout: 30_000 });

  await openCouple(page, cases[0].id);
  await exportAndCheck(page, cases[0].id, ["pdf", "pptx"], cases[0].text);

  for (const item of cases.slice(1)) {
    await openCouple(page, item.id);
    await exportAndCheck(page, item.id, ["pdf", "pptx"], item.text);
  }

  const unexpectedDownloads = [];
  page.on("download", (download) => unexpectedDownloads.push(download));
  for (const id of [missingId, expiredId]) {
    await openCouple(page, id);
    for (const format of ["pdf", "pptx"]) {
      await page.getByTestId(`button-export-${format}`).click();
      await page.getByRole("status").filter({ hasText: "No incomplete file was downloaded" }).waitFor({ timeout: 30_000 });
      assert.equal(unexpectedDownloads.length, 0, `${format} must not produce an incomplete file for ${id}.`);
    }
  }

  assert.deepEqual(errors, [], "The signed-in admin flow must not throw browser errors.");
  assert.deepEqual(unexpectedCloudRequests, [], "Every Firebase request must remain on the local emulators.");
  await context.close();
  console.log("PASS: authenticated admin login, saved-couple navigation, tab order, multiple emulator Storage image paths, PDF/PPTX exports, legacy/separate-mode content, and explicit missing-file/revoked-token failures. All data stayed in Firebase emulators.");
} catch (error) {
  console.error(viteOutput);
  throw error;
} finally {
  await browser?.close();
  vite.kill("SIGTERM");
}
