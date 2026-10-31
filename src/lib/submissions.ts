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

/**
 * Uploads a base64 image data URL to Firebase Storage.
 * Falls back to returning the original data URL if storage is unconfigured or fails,
 * ensuring couples' media is never lost.
 */
async function uploadMediaFile(
  submissionFolder: string,
  fileName: string,
  dataUrl: string
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return dataUrl;
  }

  try {
    const storagePath = `submissions/${submissionFolder}/${Date.now()}_${fileName}.jpg`;
    const storageRef = ref(storage, storagePath);
    await uploadString(storageRef, dataUrl, "data_url");
    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (err) {
    console.warn("Storage upload fallback: using local media URL", err);
    return dataUrl;
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

      // Generate editorial brief & 11 interview questions for the submission
      const editorialBrief = synthesizeEditorialBrief(processedAnswers);
      const interviewQuestions = synthesizeInterviewQuestions(processedAnswers);

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
        editorialBrief,
        interviewQuestions,
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

/**
 * Admin: Fetch all submissions ordered by newest sequence number first.
 */
export async function getSubmissions(): Promise<SubmissionRecord[]> {
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
 * Admin: Fetch a single couple submission by ID.
 */
export async function getSubmissionById(id: string): Promise<SubmissionRecord | null> {
  const submissionRef = doc(db, "submissions", id);
  const snapshot = await getDoc(submissionRef);
  if (!snapshot.exists()) return null;
  return { ...(snapshot.data() as SubmissionRecord), id: snapshot.id };
}

/**
 * Admin: Update submission review status ('new' | 'reviewed' | 'shared').
 */
export async function updateSubmissionStatus(
  id: string,
  status: SubmissionStatus
): Promise<void> {
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
  const submissionRef = doc(db, "submissions", id);
  await updateDoc(submissionRef, { interviewQuestions });
}
