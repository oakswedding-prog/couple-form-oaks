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
  onSnapshot,
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { db, storage, auth } from "./firebase.ts";
import {
  QuestionnaireAnswers,
  SubmissionRecord,
  SubmissionStatus,
  ProductionChecklistData,
  CustomProductionEvent,
  EventSubmissionRecord,
  ChecklistItemStatus,
  FileDetailEntry,
} from "../types/questionnaire.ts";
import {
  buildCustomEventDeleteChecklistData,
  buildCustomEventUpsertChecklistData,
} from "../constants/productionChecklist.ts";
import { synthesizeEditorialBrief } from "../utils/editorialBriefGenerator.ts";
import { synthesizeInterviewQuestions } from "../utils/interviewQuestionsGenerator.ts";
import { synthesizeCheatSheet } from "../utils/cheatSheetGenerator.ts";
import {
  synthesizeCoupleLetter,
  upgradeCoupleLetterIfNeeded,
} from "../utils/coupleLetterGenerator.ts";

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

  // Resolve Q1 couple photo
  if (ans.couplePhotoUrl) {
    ans.couplePhotoUrl = await resolveMediaUrl(ans.couplePhotoUrl);
  }

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

  // Resolve Q13 wedding outfit images
  if (Array.isArray(ans.weddingOutfits?.images)) {
    const resolved: string[] = [];
    for (const img of ans.weddingOutfits.images) {
      const url = await resolveMediaUrl(img);
      if (url) resolved.push(url);
    }
    ans.weddingOutfits.images = resolved;
  }

  // Resolve Q14 decor mood board images
  if (Array.isArray(ans.decorMoodBoard?.images)) {
    const resolved: string[] = [];
    for (const img of ans.decorMoodBoard.images) {
      const url = await resolveMediaUrl(img);
      if (url) resolved.push(url);
    }
    ans.decorMoodBoard.images = resolved;
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

  // Auto-synthesize or upgrade legacy couple letter on open
  if (cloned.answers) {
    try {
      const { letter, wasUpgraded } = upgradeCoupleLetterIfNeeded(
        cloned.coupleLetter,
        cloned.answers
      );
      if (wasUpgraded) {
        cloned.coupleLetter = letter;
        if (cloned.id) {
          updateLocalCacheRecord(cloned.id, (rec) => ({ ...rec, coupleLetter: letter }));
          const submissionRef = doc(db, "submissions", cloned.id);
          updateDoc(submissionRef, { coupleLetter: letter }).catch(() => {});
        }
      }
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

  // Process Q1 couple photo if present
  if (updatedAnswers.couplePhotoUrl?.startsWith("data:image/")) {
    updatedAnswers.couplePhotoUrl = await uploadMediaFile(
      submissionFolder,
      "couple_photo",
      updatedAnswers.couplePhotoUrl
    );
  }

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

  // Process Q13 wedding outfit images
  if (Array.isArray(updatedAnswers.weddingOutfits?.images)) {
    for (let i = 0; i < updatedAnswers.weddingOutfits.images.length; i++) {
      const img = updatedAnswers.weddingOutfits.images[i];
      if (img?.startsWith("data:image/")) {
        updatedAnswers.weddingOutfits.images[i] = await uploadMediaFile(
          submissionFolder,
          `outfit_${i + 1}`,
          img
        );
      }
    }
  }

  // Process Q14 decor mood board images
  if (Array.isArray(updatedAnswers.decorMoodBoard?.images)) {
    for (let i = 0; i < updatedAnswers.decorMoodBoard.images.length; i++) {
      const img = updatedAnswers.decorMoodBoard.images[i];
      if (img?.startsWith("data:image/")) {
        updatedAnswers.decorMoodBoard.images[i] = await uploadMediaFile(
          submissionFolder,
          `decor_${i + 1}`,
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

function stripUndefinedDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function logAndThrowFirestoreError(
  error: unknown,
  operationType: "create" | "update" | "delete" | "get" | "write",
  path: string,
  fallbackMessage: string
): never {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
    },
  };
  console.error("Firestore Error:", JSON.stringify(errInfo));
  throw new Error(error instanceof Error ? error.message : fallbackMessage);
}

function isPermissionDeniedError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "permission-denied") return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("missing or insufficient permissions");
}

async function canFallbackToMainChecklistCustomEvents(
  submissionId: string,
  eventId: string
): Promise<boolean> {
  try {
    const snap = await getDoc(
      doc(db, "submissions", submissionId, "productionEvents", eventId)
    );
    // If subcollection read succeeds and doc exists, subcollection rules ARE deployed.
    // Never fall back if the subcollection doc is already locked.
    if (snap.exists()) {
      const data = snap.data() as Partial<CustomProductionEvent> | undefined;
      if (data?.submitted || data?.submission) {
        return false;
      }
    }
    return !snap.exists();
  } catch (readErr) {
    // Subcollection read itself denied -> subcollection rules are not yet published
    return isPermissionDeniedError(readErr);
  }
}

/**
 * Admin: Save updated Wedding Production Checklist status map for a couple.
 */
export async function updateSubmissionChecklist(
  id: string,
  productionChecklist: ProductionChecklistData
): Promise<void> {
  const cleanChecklist = stripUndefinedDeep(productionChecklist);
  updateLocalCacheRecord(id, (rec) => ({ ...rec, productionChecklist: cleanChecklist }));
  const path = `submissions/${id}`;
  try {
    const submissionRef = doc(db, "submissions", id);
    await updateDoc(submissionRef, { productionChecklist: cleanChecklist });
  } catch (error) {
    logAndThrowFirestoreError(
      error,
      "update",
      path,
      "Failed to save checklist changes to Firestore."
    );
  }
}

/**
 * Admin: Submit and permanently lock a standard production event
 * ('sangeet' | 'wedding' | 'reception').
 * Writes the lock & complete submission metadata onto the primary couple submission
 * document first so submission succeeds immediately under live admin rules, then
 * mirrors a write-once archival copy to eventSubmissions when subcollection rules allow.
 */
export async function submitStandardChecklistEvent(
  id: string,
  nextChecklist: ProductionChecklistData,
  submissionRecord: EventSubmissionRecord
): Promise<void> {
  const cleanChecklist = stripUndefinedDeep(nextChecklist);
  const cleanRecord = stripUndefinedDeep(submissionRecord);
  const path = `submissions/${id}`;

  try {
    await updateDoc(doc(db, "submissions", id), {
      productionChecklist: cleanChecklist,
    });
    updateLocalCacheRecord(id, (rec) => ({
      ...rec,
      productionChecklist: cleanChecklist,
    }));
  } catch (error) {
    logAndThrowFirestoreError(
      error,
      "update",
      path,
      "Failed to submit and lock event in Firestore."
    );
  }

  // Secondary write-once archive mirror (non-blocking if subcollection rules are pending deployment)
  try {
    await setDoc(
      doc(db, "submissions", id, "eventSubmissions", submissionRecord.eventId),
      cleanRecord
    );
  } catch (archiveErr) {
    if (!isPermissionDeniedError(archiveErr)) {
      console.warn("Non-blocking eventSubmissions archive write failed:", archiveErr);
    }
  }
}

/**
 * Admin: Subscribe to real-time updates for a couple's production checklist.
 */
export function subscribeSubmissionChecklist(
  id: string,
  onUpdate: (checklist: ProductionChecklistData | undefined) => void,
  onError: (err: Error) => void
): () => void {
  const path = `submissions/${id}`;
  const submissionRef = doc(db, "submissions", id);
  return onSnapshot(
    submissionRef,
    (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as SubmissionRecord;
      updateLocalCacheRecord(id, (rec) => ({
        ...rec,
        productionChecklist: data.productionChecklist,
      }));
      onUpdate(data.productionChecklist);
    },
    (error) => {
      const errInfo = {
        error: error instanceof Error ? error.message : String(error),
        operationType: "get",
        path,
        authInfo: {
          userId: auth.currentUser?.uid ?? null,
          email: auth.currentUser?.email ?? null,
          emailVerified: auth.currentUser?.emailVerified ?? null,
        },
      };
      console.error("Firestore Listener Error:", JSON.stringify(errInfo));
      onError(
        error instanceof Error
          ? error
          : new Error("Failed to sync checklist updates.")
      );
    }
  );
}

/**
 * Admin: Subscribe to custom production events created for a couple.
 * Gracefully degrades to empty list if subcollection rules are not yet deployed.
 */
export function subscribeCustomProductionEvents(
  submissionId: string,
  onUpdate: (events: CustomProductionEvent[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = `submissions/${submissionId}/productionEvents`;
  const q = query(
    collection(db, "submissions", submissionId, "productionEvents"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: CustomProductionEvent[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...(docSnap.data() as CustomProductionEvent), id: docSnap.id });
      });
      onUpdate(list);
    },
    (error) => {
      if (isPermissionDeniedError(error)) {
        onUpdate([]);
        return;
      }
      console.error("Firestore Custom Events Listener Error:", path, error);
      onError(
        error instanceof Error
          ? error
          : new Error("Failed to sync custom wedding events.")
      );
    }
  );
}

/**
 * Admin: Subscribe to immutable archived event submission receipts.
 * Gracefully degrades to empty map if subcollection rules are not yet deployed.
 */
export function subscribeEventSubmissions(
  submissionId: string,
  onUpdate: (archivedByEventId: Record<string, EventSubmissionRecord>) => void,
  onError: (err: Error) => void
): () => void {
  const path = `submissions/${submissionId}/eventSubmissions`;
  return onSnapshot(
    collection(db, "submissions", submissionId, "eventSubmissions"),
    (snapshot) => {
      const map: Record<string, EventSubmissionRecord> = {};
      snapshot.forEach((docSnap) => {
        map[docSnap.id] = docSnap.data() as EventSubmissionRecord;
      });
      onUpdate(map);
    },
    (error) => {
      if (isPermissionDeniedError(error)) {
        onUpdate({});
        return;
      }
      console.error("Firestore Event Submissions Listener Error:", path, error);
      onError(
        error instanceof Error
          ? error
          : new Error("Failed to sync submitted event records.")
      );
    }
  );
}

/**
 * Admin: Create a new unsubmitted custom production event for a couple.
 */
export async function createCustomProductionEvent(
  submissionId: string,
  eventId: string,
  name: string,
  createdBy: string,
  previousChecklist?: ProductionChecklistData
): Promise<{ event: CustomProductionEvent; fallbackChecklist?: ProductionChecklistData }> {
  const now = new Date().toISOString();
  const payload: CustomProductionEvent = stripUndefinedDeep({
    id: eventId,
    name: name.trim(),
    isCustom: true,
    items: {},
    fileDetails: [],
    submitted: false,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,
  });
  const path = `submissions/${submissionId}/productionEvents/${eventId}`;
  try {
    await setDoc(doc(db, "submissions", submissionId, "productionEvents", eventId), payload);
    return { event: payload };
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      const fallbackChecklist = stripUndefinedDeep(
        buildCustomEventUpsertChecklistData(previousChecklist, payload, createdBy)
      );
      await updateSubmissionChecklist(submissionId, fallbackChecklist);
      return { event: payload, fallbackChecklist };
    }
    logAndThrowFirestoreError(error, "create", path, "Failed to create custom event.");
  }
}

/**
 * Admin: Update an unsubmitted custom event's checklist items and/or file details.
 * Firestore security rules reject this automatically once submitted == true.
 */
export async function updateCustomProductionEvent(
  submissionId: string,
  event: CustomProductionEvent,
  updates: {
    items?: Record<string, ChecklistItemStatus>;
    fileDetails?: FileDetailEntry[];
    updatedBy?: string;
  },
  previousChecklist?: ProductionChecklistData
): Promise<{ fallbackChecklist?: ProductionChecklistData }> {
  const now = new Date().toISOString();
  const cleanUpdates = stripUndefinedDeep({
    ...updates,
    updatedAt: now,
  });
  const path = `submissions/${submissionId}/productionEvents/${event.id}`;

  if (previousChecklist?.customEvents?.[event.id]) {
    const updatedEvent: CustomProductionEvent = stripUndefinedDeep({
      ...event,
      ...cleanUpdates,
    });
    const fallbackChecklist = stripUndefinedDeep(
      buildCustomEventUpsertChecklistData(
        previousChecklist,
        updatedEvent,
        updates.updatedBy || "Admin"
      )
    );
    await updateSubmissionChecklist(submissionId, fallbackChecklist);
    return { fallbackChecklist };
  }

  try {
    await updateDoc(
      doc(db, "submissions", submissionId, "productionEvents", event.id),
      cleanUpdates
    );
    return {};
  } catch (error) {
    if (
      isPermissionDeniedError(error) &&
      (await canFallbackToMainChecklistCustomEvents(submissionId, event.id))
    ) {
      const updatedEvent: CustomProductionEvent = stripUndefinedDeep({
        ...event,
        ...cleanUpdates,
      });
      const fallbackChecklist = stripUndefinedDeep(
        buildCustomEventUpsertChecklistData(
          previousChecklist,
          updatedEvent,
          updates.updatedBy || "Admin"
        )
      );
      await updateSubmissionChecklist(submissionId, fallbackChecklist);
      return { fallbackChecklist };
    }
    logAndThrowFirestoreError(
      error,
      "update",
      path,
      "Failed to update custom event. Submitted events cannot be modified."
    );
  }
}

/**
 * Admin: Submit and permanently lock a custom event and mirror its immutable archive doc.
 */
export async function submitCustomProductionEvent(
  submissionId: string,
  nextCustomEvent: CustomProductionEvent,
  submissionRecord: EventSubmissionRecord,
  previousChecklist?: ProductionChecklistData
): Promise<{ fallbackChecklist?: ProductionChecklistData }> {
  const cleanEvent = stripUndefinedDeep(nextCustomEvent);
  const cleanRecord = stripUndefinedDeep(submissionRecord);
  const path = `submissions/${submissionId}/productionEvents/${nextCustomEvent.id}`;
  let fallbackChecklistResult: ProductionChecklistData | undefined;

  if (previousChecklist?.customEvents?.[nextCustomEvent.id]) {
    const fallbackChecklist = stripUndefinedDeep(
      buildCustomEventUpsertChecklistData(
        previousChecklist,
        cleanEvent,
        cleanEvent.updatedBy || cleanRecord.submittedBy
      )
    );
    await updateSubmissionChecklist(submissionId, fallbackChecklist);
    fallbackChecklistResult = fallbackChecklist;
  } else {
    try {
      await updateDoc(
        doc(db, "submissions", submissionId, "productionEvents", nextCustomEvent.id),
        {
          items: cleanEvent.items,
          fileDetails: cleanEvent.fileDetails,
          submitted: true,
          submission: cleanRecord,
          updatedAt: cleanRecord.submittedAt,
          updatedBy: cleanEvent.updatedBy || cleanRecord.submittedBy,
        }
      );
    } catch (error) {
      if (
        isPermissionDeniedError(error) &&
        (await canFallbackToMainChecklistCustomEvents(submissionId, nextCustomEvent.id))
      ) {
        const fallbackChecklist = stripUndefinedDeep(
          buildCustomEventUpsertChecklistData(
            previousChecklist,
            cleanEvent,
            cleanEvent.updatedBy || cleanRecord.submittedBy
          )
        );
        await updateSubmissionChecklist(submissionId, fallbackChecklist);
        fallbackChecklistResult = fallbackChecklist;
      } else {
        logAndThrowFirestoreError(
          error,
          "write",
          path,
          "Failed to submit and permanently lock custom event."
        );
      }
    }
  }

  // Secondary write-once archive mirror (non-blocking if subcollection rules are pending)
  try {
    await setDoc(
      doc(db, "submissions", submissionId, "eventSubmissions", nextCustomEvent.id),
      cleanRecord
    );
  } catch (archiveErr) {
    if (!isPermissionDeniedError(archiveErr)) {
      console.warn("Non-blocking eventSubmissions archive write failed:", archiveErr);
    }
  }

  return { fallbackChecklist: fallbackChecklistResult };
}

/**
 * Admin: Delete an unsubmitted custom event. Submitted or standard events cannot be deleted.
 */
export async function deleteCustomProductionEvent(
  submissionId: string,
  eventId: string,
  updatedBy: string = "Admin",
  previousChecklist?: ProductionChecklistData
): Promise<{ fallbackChecklist?: ProductionChecklistData }> {
  const path = `submissions/${submissionId}/productionEvents/${eventId}`;

  if (previousChecklist?.customEvents?.[eventId]) {
    const fallbackChecklist = stripUndefinedDeep(
      buildCustomEventDeleteChecklistData(previousChecklist, eventId, updatedBy)
    );
    await updateSubmissionChecklist(submissionId, fallbackChecklist);
    return { fallbackChecklist };
  }

  try {
    await deleteDoc(doc(db, "submissions", submissionId, "productionEvents", eventId));
    return {};
  } catch (error) {
    if (
      isPermissionDeniedError(error) &&
      (await canFallbackToMainChecklistCustomEvents(submissionId, eventId))
    ) {
      const fallbackChecklist = stripUndefinedDeep(
        buildCustomEventDeleteChecklistData(previousChecklist, eventId, updatedBy)
      );
      await updateSubmissionChecklist(submissionId, fallbackChecklist);
      return { fallbackChecklist };
    }
    logAndThrowFirestoreError(
      error,
      "delete",
      path,
      "Failed to delete custom event. Submitted events cannot be deleted."
    );
  }
}





