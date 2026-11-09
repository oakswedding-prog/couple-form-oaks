/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase.ts";
import {
  QuestionnaireAnswers,
  SubmissionRecord,
  SubmissionStatus,
} from "../types/questionnaire.ts";
import { synthesizeEditorialBrief } from "../utils/editorialBriefGenerator.ts";
import { synthesizeInterviewQuestions } from "../utils/interviewQuestionsGenerator.ts";
import { synthesizeCheatSheet } from "../utils/cheatSheetGenerator.ts";
import { synthesizeCoupleLetter } from "../utils/coupleLetterGenerator.ts";

/**
 * In-memory cache for resolved Firebase Storage URLs
 */
const resolvedUrlCache = new Map<string, string>();

/**
 * Resolves a storage path ("submissions/...") or URI to an accessible signed download URL.
 * Signed-in admins have read permissions on Firebase Storage.
 */
export async function resolveMediaUrl(pathOrUrl: string | undefined | null): Promise<string> {
  if (!pathOrUrl) return "";
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return "";

  // Already a full web URL, data URI, or blob URL
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }

  // In-memory cache hit
  if (resolvedUrlCache.has(trimmed)) {
    return resolvedUrlCache.get(trimmed)!;
  }

  // Handle Firebase Storage path (e.g. "submissions/sub_.../tree.jpg" or "gs://...")
  try {
    let cleanPath = trimmed;
    if (cleanPath.startsWith("gs://")) {
      const parts = cleanPath.split("/").slice(3);
      cleanPath = parts.join("/");
    }
    const storageRef = ref(storage, cleanPath);
    const url = await getDownloadURL(storageRef);
    resolvedUrlCache.set(trimmed, url);
    return url;
  } catch (err) {
    console.warn(`Could not resolve storage path "${trimmed}":`, err);
    return "";
  }
}

/**
 * Resolves all image paths (Q10 tree/members, Q12 references, Q23 photos) in a SubmissionRecord.
 * Ensures the admin UI and export utilities receive ready-to-display https download URLs.
 */
export async function resolveSubmissionMedia(record: SubmissionRecord): Promise<SubmissionRecord> {
  if (!record || !record.answers) return record;

  const cloned: SubmissionRecord = JSON.parse(JSON.stringify(record));
  const ans = cloned.answers;

  // Resolve Q10 tree photo
  if (ans.q10_people?.treePhotoUrl) {
    ans.q10_people.treePhotoUrl = await resolveMediaUrl(ans.q10_people.treePhotoUrl);
  }

  // Resolve Q10 family members
  if (Array.isArray(ans.q10_people?.familyMembers)) {
    for (const m of ans.q10_people.familyMembers) {
      if (m.photoUrl) {
        m.photoUrl = await resolveMediaUrl(m.photoUrl);
      }
    }
  }

  // Resolve Q12 reference images
  if (Array.isArray(ans.q12_references?.images)) {
    const resolved: string[] = [];
    for (const img of ans.q12_references.images) {
      const url = await resolveMediaUrl(img);
      if (url) resolved.push(url);
    }
    ans.q12_references.images = resolved;
  }

  // Resolve Q23 one last thing images
  if (Array.isArray(ans.q23_oneLastThing?.images)) {
    const resolved: string[] = [];
    for (const img of ans.q23_oneLastThing.images) {
      const url = await resolveMediaUrl(img);
      if (url) resolved.push(url);
    }
    ans.q23_oneLastThing.images = resolved;
  }

  // Auto-synthesize couple letter if not yet generated on earlier submissions
  if (!cloned.coupleLetter && cloned.answers) {
    try {
      cloned.coupleLetter = synthesizeCoupleLetter(cloned.answers);
    } catch {
      // ignore
    }
  }

  return cloned;
}

/**
 * Uploads a base64 image data URL to Firebase Storage under submissions/{folder}/{name}.
 * Since couples are unauthenticated and storage rules enforce `allow read: if isAdmin();`,
 * attempting getDownloadURL right after upload throws storage/unauthorized for couples.
 *
 * When this occurs, we store the storagePath (e.g. "submissions/...").
 * The authenticated admin dashboard resolves storage paths to signed download URLs on demand.
 * This guarantees the Firestore document stays tiny (<10KB) and avoids Firestore's 1MB limit.
 */
async function uploadMediaFile(
  submissionFolder: string,
  fileName: string,
  dataUrl: string
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return dataUrl;
  }

  // Derive mime type and file extension
  const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,/);
  const contentType = mimeMatch ? mimeMatch[1] : "image/jpeg";
  let ext = "jpg";
  if (contentType === "image/png") ext = "png";
  else if (contentType === "image/webp") ext = "webp";

  const storagePath = `submissions/${submissionFolder}/${Date.now()}_${fileName}.${ext}`;
  const storageRef = ref(storage, storagePath);

  try {
    await uploadString(storageRef, dataUrl, "data_url", {
      contentType,
    });
  } catch (uploadErr: any) {
    console.error(`Firebase Storage upload failed for ${fileName}:`, uploadErr);
    throw new Error(
      `Failed to upload ${fileName.replace(/_/g, " ")}. Please check your internet connection and try again.`
    );
  }

  // File was successfully uploaded to Storage.
  // Now attempt to obtain a download URL; if unauthenticated (expected for couples),
  // return the storagePath so the authenticated admin can resolve it securely.
  try {
    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch {
    return storagePath;
  }
}

/**
 * Processes all image fields in questionnaire answers and uploads to storage.
 */
async function processAllImages(
  answers: QuestionnaireAnswers,
  submissionFolder: string
): Promise<QuestionnaireAnswers> {
  const updatedAnswers: QuestionnaireAnswers = JSON.parse(JSON.stringify(answers));

  // Process family tree photo if present
  if (updatedAnswers.q10_people?.treePhotoUrl?.startsWith("data:image/")) {
    updatedAnswers.q10_people.treePhotoUrl = await uploadMediaFile(
      submissionFolder,
      "family_tree",
      updatedAnswers.q10_people.treePhotoUrl
    );
  }

  // Process family member photos
  if (Array.isArray(updatedAnswers.q10_people?.familyMembers)) {
    for (let i = 0; i < updatedAnswers.q10_people.familyMembers.length; i++) {
      const member = updatedAnswers.q10_people.familyMembers[i];
      if (member.photoUrl?.startsWith("data:image/")) {
        member.photoUrl = await uploadMediaFile(
          submissionFolder,
          `family_member_${i + 1}`,
          member.photoUrl
        );
      }
    }
  }

  // Process Q12 reference mood images
  if (Array.isArray(updatedAnswers.q12_references?.images)) {
    for (let i = 0; i < updatedAnswers.q12_references.images.length; i++) {
      const img = updatedAnswers.q12_references.images[i];
      if (img?.startsWith("data:image/")) {
        updatedAnswers.q12_references.images[i] = await uploadMediaFile(
          submissionFolder,
          `reference_${i + 1}`,
          img
        );
      }
    }
  }

  // Process Q23 one last thing images
  if (Array.isArray(updatedAnswers.q23_oneLastThing?.images)) {
    for (let i = 0; i < updatedAnswers.q23_oneLastThing.images.length; i++) {
      const img = updatedAnswers.q23_oneLastThing.images[i];
      if (img?.startsWith("data:image/")) {
        updatedAnswers.q23_oneLastThing.images[i] = await uploadMediaFile(
          submissionFolder,
          `last_thing_${i + 1}`,
          img
        );
      }
    }
  }

  return updatedAnswers;
}

/**
 * Saves a questionnaire submission with atomic sequential numbering (#001, #002...)
 * and automatic retry (up to 3 times) on network errors.
 */
export async function createSubmission(
  answers: QuestionnaireAnswers
): Promise<{ id: string; displayId: string; sequenceNumber: number }> {
  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      // 1. Determine sequential number via Firestore transaction
      const counterRef = doc(db, "counters", "submissions");
      let nextSeq = 1;

      try {
        nextSeq = await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          let current = 0;
          if (counterDoc.exists()) {
            current = counterDoc.data()?.current || 0;
          }
          const next = current + 1;
          transaction.set(counterRef, { current: next }, { merge: true });
          return next;
        });
      } catch (counterErr) {
        console.warn("Counter transaction issue, falling back to timestamp-based sequence", counterErr);
        nextSeq = Date.now() % 10000;
      }

      const displayId = `#${String(nextSeq).padStart(3, "0")}`;
      const submissionId = `sub_${String(nextSeq).padStart(3, "0")}_${Date.now()}`;

      // 2. Upload any base64 images
      const processedAnswers = await processAllImages(answers, submissionId);

      // Generate editorial brief, 11 interview questions, shoot day cheat sheet & couple letter
      const editorialBrief = synthesizeEditorialBrief(processedAnswers);
      const interviewQuestions = synthesizeInterviewQuestions(processedAnswers);
      const cheatSheet = synthesizeCheatSheet(processedAnswers);
      const coupleLetter = synthesizeCoupleLetter(processedAnswers);

      const submissionDocRef = doc(db, "submissions", submissionId);
      const submissionData: SubmissionRecord = {
        id: submissionId,
        sequenceNumber: nextSeq,
        displayId,
        submittedAt: new Date().toISOString(),
        status: "new",
        partner1: (answers.partner1 || "Partner 1").trim(),
        partner2: (answers.partner2 || "Partner 2").trim(),
        weddingDate: answers.weddingDate || "",
        phone: answers.phone || "",
        email: answers.email || "",
        answers: processedAnswers,
        coupleLetter,
        editorialBrief,
        interviewQuestions,
        cheatSheet,
        privateNotes: "",
      };

      await setDoc(submissionDocRef, {
        ...submissionData,
        createdAt: serverTimestamp(),
      });

      // 3. Fire-and-forget notification to Vercel API
      try {
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submissionId,
            displayId,
            partner1: submissionData.partner1,
            partner2: submissionData.partner2,
            weddingDate: submissionData.weddingDate,
            phone: submissionData.phone,
            email: submissionData.email,
            submittedAt: submissionData.submittedAt,
          }),
        }).catch(() => {
          // Non-blocking notification failure is fine
        });
      } catch {
        // Ignore notification errors
      }

      return { id: submissionId, displayId, sequenceNumber: nextSeq };
    } catch (err: any) {
      console.error(`Submission attempt ${attempt} failed:`, err);
      if (attempt >= maxAttempts) {
        throw new Error(
          err?.message || "Failed to save submission after 3 attempts. Please try again."
        );
      }
      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }

  throw new Error("Unable to save submission.");
}

const SESSION_CACHE_KEY = "oaks_submissions_cache_v1";
let memorySubmissionsCache: SubmissionRecord[] | null = null;

function saveToSessionCache(records: SubmissionRecord[]) {
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(records));
  } catch {
    // sessionStorage quota or disabled
  }
}

function loadFromSessionCache(): SubmissionRecord[] | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return null;
}

function updateLocalCacheRecord(id: string, updater: (record: SubmissionRecord) => SubmissionRecord) {
  if (memorySubmissionsCache) {
    memorySubmissionsCache = memorySubmissionsCache.map((rec) => (rec.id === id ? updater(rec) : rec));
    saveToSessionCache(memorySubmissionsCache);
  }
}

function removeFromLocalCache(id: string) {
  if (memorySubmissionsCache) {
    memorySubmissionsCache = memorySubmissionsCache.filter((rec) => rec.id !== id);
    saveToSessionCache(memorySubmissionsCache);
  }
}

async function fetchSubmissionsFromServer(): Promise<SubmissionRecord[]> {
  const submissionsRef = collection(db, "submissions");
  const q = query(submissionsRef, orderBy("sequenceNumber", "desc"));
  const snapshot = await getDocs(q);

  const results: SubmissionRecord[] = [];
  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data() as SubmissionRecord;
    results.push({
      ...data,
      id: docSnapshot.id,
    });
  });
  return results;
}

/**
 * Admin: Fetch all submissions ordered by newest sequence number first.
 * Employs SWR (Stale-While-Revalidate) with in-memory & sessionStorage caching
 * so repeat visits and back navigation appear in 0ms without blank screens.
 */
export async function getSubmissions(forceRefresh = false): Promise<SubmissionRecord[]> {
  // 1. In-memory cache hit (fastest, 0ms)
  if (!forceRefresh && memorySubmissionsCache && memorySubmissionsCache.length > 0) {
    // Background revalidation
    fetchSubmissionsFromServer().then((fresh) => {
      memorySubmissionsCache = fresh;
      saveToSessionCache(fresh);
    }).catch(() => {});
    return memorySubmissionsCache;
  }

  // 2. SessionStorage cache hit (preserves data across page reloads/tab navigation)
  if (!forceRefresh && !memorySubmissionsCache) {
    const sessionData = loadFromSessionCache();
    if (sessionData && sessionData.length > 0) {
      memorySubmissionsCache = sessionData;
      // Background revalidation
      fetchSubmissionsFromServer().then((fresh) => {
        memorySubmissionsCache = fresh;
        saveToSessionCache(fresh);
      }).catch(() => {});
      return sessionData;
    }
  }

  // 3. Network fetch
  const fresh = await fetchSubmissionsFromServer();
  memorySubmissionsCache = fresh;
  saveToSessionCache(fresh);
  return fresh;
}

/**
 * Admin: Fetch a single couple submission by ID.
 * Returns immediately from cache when available.
 */
export async function getSubmissionById(id: string): Promise<SubmissionRecord | null> {
  // Check memory cache
  if (memorySubmissionsCache) {
    const found = memorySubmissionsCache.find((r) => r.id === id);
    if (found) {
      const resolved = await resolveSubmissionMedia(found);
      return resolved;
    }
  }
  // Check session storage
  const sessionData = loadFromSessionCache();
  if (sessionData) {
    const found = sessionData.find((r) => r.id === id);
    if (found) {
      const resolved = await resolveSubmissionMedia(found);
      return resolved;
    }
  }

  const submissionRef = doc(db, "submissions", id);
  const snapshot = await getDoc(submissionRef);
  if (!snapshot.exists()) return null;
  const rawRecord = { ...(snapshot.data() as SubmissionRecord), id: snapshot.id };
  const record = await resolveSubmissionMedia(rawRecord);

  if (memorySubmissionsCache) {
    const idx = memorySubmissionsCache.findIndex((r) => r.id === id);
    if (idx >= 0) {
      memorySubmissionsCache[idx] = record;
    } else {
      memorySubmissionsCache.push(record);
    }
    saveToSessionCache(memorySubmissionsCache);
  }
  return record;
}

/**
 * Admin: Update submission review status ('new' | 'reviewed' | 'shared').
 */
export async function updateSubmissionStatus(
  id: string,
  status: SubmissionStatus
): Promise<void> {
  updateLocalCacheRecord(id, (rec) => ({ ...rec, status }));
  const submissionRef = doc(db, "submissions", id);
  await updateDoc(submissionRef, { status });
}

/**
 * Admin: Update private team notes for a couple.
 */
export async function updateSubmissionNotes(
  id: string,
  privateNotes: string
): Promise<void> {
  updateLocalCacheRecord(id, (rec) => ({ ...rec, privateNotes }));
  const submissionRef = doc(db, "submissions", id);
  await updateDoc(submissionRef, { privateNotes });
}

/**
 * Admin: Update or save newly generated editorial brief for a couple.
 */
export async function updateSubmissionEditorialBrief(
  id: string,
  editorialBrief: string
): Promise<void> {
  updateLocalCacheRecord(id, (rec) => ({ ...rec, editorialBrief }));
  const submissionRef = doc(db, "submissions", id);
  await updateDoc(submissionRef, { editorialBrief });
}

/**
 * Admin: Update or save newly generated interview questions for a couple.
 */
export async function updateSubmissionInterviewQuestions(
  id: string,
  interviewQuestions: string
): Promise<void> {
  updateLocalCacheRecord(id, (rec) => ({ ...rec, interviewQuestions }));
  const submissionRef = doc(db, "submissions", id);
  await updateDoc(submissionRef, { interviewQuestions });
}

/**
 * Admin: Update or save newly generated couple letter for a couple.
 */
export async function updateSubmissionCoupleLetter(
  id: string,
  coupleLetter: string
): Promise<void> {
  updateLocalCacheRecord(id, (rec) => ({ ...rec, coupleLetter }));
  const submissionRef = doc(db, "submissions", id);
  await updateDoc(submissionRef, { coupleLetter });
}

/**
 * Admin: Update or save newly generated shoot day cheat sheet for a couple.
 */
export async function updateSubmissionCheatSheet(
  id: string,
  cheatSheet: string
): Promise<void> {
  updateLocalCacheRecord(id, (rec) => ({ ...rec, cheatSheet }));
  const submissionRef = doc(db, "submissions", id);
  await updateDoc(submissionRef, { cheatSheet });
}

/**
 * Admin: Permanently delete a submission.
 */
export async function deleteSubmission(id: string): Promise<void> {
  removeFromLocalCache(id);
  const submissionRef = doc(db, "submissions", id);
  await deleteDoc(submissionRef);
}


