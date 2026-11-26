import { createHash } from "node:crypto";
import {
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const FIREBASE_PROJECT_ID = "oaks-couple-questionnaire";
const FIREBASE_WEB_API_KEY = "AIzaSyDWpU42Owb-yd2YvrUPJyb9A5VC_UYZUtw";
const DEFAULT_STORAGE_BUCKET = "oaks-couple-questionnaire.firebasestorage.app";
const STORAGE_BUCKETS = new Set([
  DEFAULT_STORAGE_BUCKET,
  "oaks-couple-questionnaire.appspot.com",
]);
const ADMIN_EMAILS = new Set([
  "rahulratna88@gmail.com",
  "mywedding@oakswedding.com",
  "oaksoperations@gmail.com",
]);
const MAX_ATOMIC_WRITES = 500;

interface VerifiedFirebaseIdentity {
  uid: string;
  email?: string;
  email_verified?: boolean;
}

export type NumberingAction =
  | "assign"
  | "preview-renumber"
  | "check-delete"
  | "renumber"
  | "delete";

export interface NumberingChange {
  id: string;
  partner1: string;
  partner2: string;
  fromDisplayId: string | null;
  toDisplayId: string | null;
  fromSequenceNumber: number | null;
  toSequenceNumber: number | null;
}

interface NumberingRecord {
  id: string;
  ref: DocumentReference<DocumentData>;
  data: DocumentData;
  submittedAtMs: number | null;
  createTimeMs: number | null;
}

interface NumberingPlan {
  count: number;
  changes: NumberingChange[];
  revision: string;
  numberById: Map<string, { sequenceNumber: number; displayId: string }>;
}

export function calculateSubmissionNumbering(records: Array<{
  id: string;
  data: DocumentData;
  createTimeMs?: number | null;
}>): {
  submissionCount: number;
  revision: string;
  changes: NumberingChange[];
  numbersById: Record<string, { sequenceNumber: number; displayId: string }>;
} {
  const plan = buildNumberingPlan(
    records.map((record) => ({
      ...record,
      ref: null as unknown as DocumentReference<DocumentData>,
      submittedAtMs: parseSubmittedAt(record.data.submittedAt),
      createTimeMs: record.createTimeMs ?? null,
    }))
  );
  return {
    submissionCount: plan.count,
    revision: plan.revision,
    changes: plan.changes,
    numbersById: Object.fromEntries(plan.numberById),
  };
}

export interface NumberingRequest {
  action: NumberingAction;
  submissionId?: string;
  expectedRevision?: string;
}

export interface NumberingHttpResult {
  status: number;
  body: Record<string, unknown>;
}

export class NumberingServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "NumberingServiceError";
  }
}

let cachedApp: App | null = null;

function getFirebaseApp(): App {
  if (cachedApp) return cachedApp;

  const existingApp = getApps().find(
    (candidate) => candidate.name === "oaks-submission-numbering"
  );
  if (existingApp) {
    cachedApp = existingApp;
    return existingApp;
  }

  const usingEmulators =
    Boolean(process.env.FIRESTORE_EMULATOR_HOST) ||
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

  if (!usingEmulators && !serviceAccountJson) {
    throw new NumberingServiceError(
      503,
      "numbering_not_configured",
      "Secure submission numbering is not configured on the server."
    );
  }

  let credentialOptions: { credential?: ReturnType<typeof cert> } = {};
  if (serviceAccountJson) {
    try {
      credentialOptions = {
        credential: cert(JSON.parse(serviceAccountJson)),
      };
    } catch {
      throw new NumberingServiceError(
        503,
        "invalid_firebase_service_account",
        "The server Firebase credential is invalid."
      );
    }
  }

  cachedApp = initializeApp(
    { projectId: FIREBASE_PROJECT_ID, ...credentialOptions },
    "oaks-submission-numbering"
  );
  return cachedApp;
}

function parseSubmittedAt(value: unknown): number | null {
  let time: number;
  if (typeof value === "string") {
    time = Date.parse(value);
  } else if (value instanceof Date) {
    time = value.getTime();
  } else if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    time = (value.toDate as () => Date)().getTime();
  } else {
    return null;
  }
  return Number.isFinite(time) && time > 0 ? time : null;
}

function currentDisplayId(sequenceNumber: number): string {
  return `#${String(sequenceNumber).padStart(3, "0")}`;
}

function currentNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function buildNumberingPlan(records: NumberingRecord[]): NumberingPlan {
  const ordered = [...records]
    .filter((record) => record.submittedAtMs !== null)
    .sort((left, right) => {
      const timeDifference = left.submittedAtMs! - right.submittedAtMs!;
      const creationTimeDifference =
        (left.createTimeMs ?? 0) - (right.createTimeMs ?? 0);
      return (
        timeDifference ||
        creationTimeDifference ||
        left.id.localeCompare(right.id)
      );
    });
  const eligibleIds = new Set(ordered.map((record) => record.id));
  const changes: NumberingChange[] = [];
  const numberById = new Map<
    string,
    { sequenceNumber: number; displayId: string }
  >();

  ordered.forEach((record, index) => {
    const sequenceNumber = index + 1;
    const displayId = currentDisplayId(sequenceNumber);
    numberById.set(record.id, { sequenceNumber, displayId });

    if (
      record.data.sequenceNumber !== sequenceNumber ||
      record.data.displayId !== displayId
    ) {
      changes.push({
        id: record.id,
        partner1: String(record.data.partner1 || "Partner 1"),
        partner2: String(record.data.partner2 || "Partner 2"),
        fromDisplayId:
          typeof record.data.displayId === "string"
            ? record.data.displayId
            : null,
        toDisplayId: displayId,
        fromSequenceNumber: currentNumber(record.data.sequenceNumber),
        toSequenceNumber: sequenceNumber,
      });
    }
  });

  for (const record of records) {
    if (eligibleIds.has(record.id)) continue;
    if (record.data.sequenceNumber == null && record.data.displayId == null) {
      continue;
    }
    changes.push({
      id: record.id,
      partner1: String(record.data.partner1 || "Partner 1"),
      partner2: String(record.data.partner2 || "Partner 2"),
      fromDisplayId:
        typeof record.data.displayId === "string" ? record.data.displayId : null,
      toDisplayId: null,
      fromSequenceNumber: currentNumber(record.data.sequenceNumber),
      toSequenceNumber: null,
    });
  }

  const revisionPayload = records
    .map((record) => ({
      id: record.id,
      submittedAtMs: record.submittedAtMs,
      createTimeMs: record.createTimeMs,
      displayId: record.data.displayId ?? null,
      sequenceNumber: record.data.sequenceNumber ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const revision = createHash("sha256")
    .update(JSON.stringify(revisionPayload))
    .digest("hex");

  return { count: ordered.length, changes, revision, numberById };
}

async function readSubmissionRecords(
  db: Firestore,
  transaction?: Transaction
): Promise<NumberingRecord[]> {
  const collection = db.collection("submissions");
  const snapshot = transaction
    ? await transaction.get(collection)
    : await collection.get();
  return snapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      ref: document.ref,
      data,
      submittedAtMs: parseSubmittedAt(data.submittedAt),
      createTimeMs: document.createTime?.toMillis() ?? null,
    };
  });
}

async function isAdminIdentity(
  db: Firestore,
  decoded: VerifiedFirebaseIdentity
): Promise<boolean> {
  if (typeof decoded.email !== "string") return false;

  const email = decoded.email.toLowerCase();
  if (decoded.email_verified === true && ADMIN_EMAILS.has(email)) return true;

  const adminDoc = await db.collection("admins").doc(email).get();
  return adminDoc.exists && adminDoc.data()?.active !== false;
}

function readBearerToken(authorization?: string): string {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new NumberingServiceError(
      401,
      "authentication_required",
      "Sign in is required for this operation."
    );
  }
  return match[1].trim();
}

async function verifyProductionIdToken(
  token: string
): Promise<VerifiedFirebaseIdentity> {
  let response: Response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
        signal: AbortSignal.timeout(8_000),
      }
    );
  } catch {
    throw new NumberingServiceError(
      503,
      "identity_verification_unavailable",
      "Sign-in verification is temporarily unavailable. Please try again."
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        users?: Array<{
          localId?: string;
          email?: string;
          emailVerified?: boolean;
          disabled?: boolean;
        }>;
      }
    | null;

  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      throw new NumberingServiceError(
        401,
        "invalid_authentication",
        "Your sign-in expired. Please sign in again."
      );
    }
    throw new NumberingServiceError(
      503,
      "identity_verification_unavailable",
      "Sign-in verification is temporarily unavailable. Please try again."
    );
  }

  const user = payload?.users?.[0];
  if (!user?.localId || user.disabled) {
    throw new NumberingServiceError(
      401,
      "invalid_authentication",
      "Your sign-in expired. Please sign in again."
    );
  }
  return {
    uid: user.localId,
    email: user.email,
    email_verified: user.emailVerified === true,
  };
}

function validateRequest(value: unknown): NumberingRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NumberingServiceError(400, "invalid_request", "Invalid request.");
  }
  const request = value as Record<string, unknown>;
  const actions: NumberingAction[] = [
    "assign",
    "preview-renumber",
    "check-delete",
    "renumber",
    "delete",
  ];
  if (!actions.includes(request.action as NumberingAction)) {
    throw new NumberingServiceError(400, "invalid_action", "Unknown numbering action.");
  }
  if (
    (request.action === "assign" || request.action === "delete" || request.action === "check-delete") &&
    (typeof request.submissionId !== "string" ||
      request.submissionId.length === 0 ||
      request.submissionId.length > 200)
  ) {
    throw new NumberingServiceError(
      400,
      "invalid_submission_id",
      "A valid submission ID is required."
    );
  }
  if (
    request.action === "renumber" &&
    (typeof request.expectedRevision !== "string" ||
      !/^[a-f0-9]{64}$/.test(request.expectedRevision))
  ) {
    throw new NumberingServiceError(
      400,
      "invalid_preview_revision",
      "Refresh the renumber preview and try again."
    );
  }
  return request as unknown as NumberingRequest;
}

function assertAtomicWriteLimit(writeCount: number): void {
  if (writeCount > MAX_ATOMIC_WRITES) {
    throw new NumberingServiceError(
      413,
      "too_many_submissions",
      "There are too many submission-number changes for one safe atomic update. No numbers were changed."
    );
  }
}

function applyNumberingChanges(
  transaction: Transaction,
  records: NumberingRecord[],
  plan: NumberingPlan
): void {
  const recordById = new Map(records.map((record) => [record.id, record]));
  for (const change of plan.changes) {
    const record = recordById.get(change.id);
    if (!record) continue;
    if (change.toSequenceNumber === null || change.toDisplayId === null) {
      transaction.update(record.ref, {
        sequenceNumber: FieldValue.delete(),
        displayId: FieldValue.delete(),
      });
    } else {
      transaction.update(record.ref, {
        sequenceNumber: change.toSequenceNumber,
        displayId: change.toDisplayId,
      });
    }
  }
}

async function getAuthorizedContext(authorization?: string) {
  const app = getFirebaseApp();
  const token = readBearerToken(authorization);
  let decoded: VerifiedFirebaseIdentity;
  try {
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      const { getAuth } = await import("firebase-admin/auth");
      decoded = await getAuth(app).verifyIdToken(token);
    } else {
      decoded = await verifyProductionIdToken(token);
    }
  } catch (error) {
    if (error instanceof NumberingServiceError) throw error;
    throw new NumberingServiceError(
      401,
      "invalid_authentication",
      "Your sign-in expired. Please sign in again."
    );
  }
  return { app, db: getFirestore(app), decoded };
}

export function parseFirebaseMoodboardImageSource(source: string): {
  bucket: string;
  objectPath: string;
} {
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      throw new NumberingServiceError(400, "invalid_media_source", "Invalid image source.");
    }
  };
  const value = source.trim();
  let bucket = DEFAULT_STORAGE_BUCKET;
  let objectPath = value;

  if (value.startsWith("gs://")) {
    const match = value.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new NumberingServiceError(400, "invalid_media_source", "Invalid image source.");
    }
    bucket = match[1];
    objectPath = match[2];
  } else if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new NumberingServiceError(400, "invalid_media_source", "Invalid image source.");
    }
    if (url.protocol !== "https:") {
      throw new NumberingServiceError(400, "invalid_media_source", "Invalid image source.");
    }
    if (url.hostname === "firebasestorage.googleapis.com") {
      const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (!match) {
        throw new NumberingServiceError(400, "invalid_media_source", "Invalid image source.");
      }
      bucket = decode(match[1]);
      objectPath = decode(match[2]);
    } else if (url.hostname === "storage.googleapis.com") {
      const downloadMatch = url.pathname.match(/^\/download\/storage\/v1\/b\/([^/]+)\/o\/(.+)$/);
      const directMatch = url.pathname.match(/^\/([^/]+)\/(.+)$/);
      const match = downloadMatch || directMatch;
      if (!match) {
        throw new NumberingServiceError(400, "invalid_media_source", "Invalid image source.");
      }
      bucket = decode(match[1]);
      objectPath = decode(match[2]);
    } else {
      throw new NumberingServiceError(400, "invalid_media_source", "Image is not in Firebase Storage.");
    }
  }

  const segments = objectPath.split("/");
  if (
    !STORAGE_BUCKETS.has(bucket) ||
    !objectPath.startsWith("submissions/") ||
    objectPath.length > 1024 ||
    objectPath.includes("\\") ||
    segments.some((segment) => !segment || segment === "." || segment === "..") ||
    /[\u0000-\u001f]/.test(objectPath)
  ) {
    throw new NumberingServiceError(403, "media_not_allowed", "This image cannot be exported.");
  }
  return { bucket, objectPath };
}

export async function readAdminMoodboardImage(input: {
  authorization?: string;
  source: string;
}): Promise<{ bytes: Buffer; contentType: string }> {
  const { app, db, decoded } = await getAuthorizedContext(input.authorization);
  if (!(await isAdminIdentity(db, decoded))) {
    throw new NumberingServiceError(403, "admin_required", "Admin access is required.");
  }

  const { bucket, objectPath } = parseFirebaseMoodboardImageSource(input.source);
  const file = getStorage(app).bucket(bucket).file(objectPath);
  try {
    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new NumberingServiceError(415, "not_an_image", "The selected file is not an image.");
    }
    const [bytes] = await file.download();
    if (metadata.size && bytes.byteLength !== Number(metadata.size)) {
      throw new NumberingServiceError(502, "incomplete_image", "The original image could not be read completely.");
    }
    return { bytes, contentType };
  } catch (error) {
    if (error instanceof NumberingServiceError) throw error;
    const code = (error as { code?: number | string })?.code;
    if (code === 404 || code === "404") {
      throw new NumberingServiceError(404, "image_not_found", "The original image could not be found.");
    }
    throw new NumberingServiceError(502, "image_unavailable", "The original image could not be downloaded.");
  }
}

export async function handleSubmissionNumberingRequest(input: {
  authorization?: string;
  body: unknown;
}): Promise<NumberingHttpResult> {
  try {
    const request = validateRequest(input.body);
    const { db, decoded } = await getAuthorizedContext(input.authorization);
    const admin = await isAdminIdentity(db, decoded);
    const collection = db.collection("submissions");
    const counterRef = db.collection("counters").doc("submissions");

    if (request.action === "check-delete") {
      if (!admin) {
        throw new NumberingServiceError(403, "admin_required", "Admin access is required.");
      }
      const [records, counter] = await Promise.all([
        readSubmissionRecords(db),
        counterRef.get(),
      ]);
      if (!records.some((record) => record.id === request.submissionId)) {
        throw new NumberingServiceError(404, "submission_not_found", "Submission not found.");
      }
      const plan = buildNumberingPlan(
        records.filter((record) => record.id !== request.submissionId)
      );
      const counterNeedsWrite =
        !counter.exists || Number(counter.data()?.current || 0) !== plan.count;
      assertAtomicWriteLimit(plan.changes.length + 1 + (counterNeedsWrite ? 1 : 0));
      return { status: 200, body: { success: true, action: request.action } };
    }

    if (request.action === "preview-renumber") {
      if (!admin) {
        throw new NumberingServiceError(403, "admin_required", "Admin access is required.");
      }
      const records = await readSubmissionRecords(db);
      const plan = buildNumberingPlan(records);
      return {
        status: 200,
        body: {
          success: true,
          action: request.action,
          revision: plan.revision,
          submissionCount: plan.count,
          changes: plan.changes,
        },
      };
    }

    if (request.action === "renumber") {
      if (!admin) {
        throw new NumberingServiceError(403, "admin_required", "Admin access is required.");
      }
      const result = await db.runTransaction(async (transaction) => {
        const [records, counter] = await Promise.all([
          readSubmissionRecords(db, transaction),
          transaction.get(counterRef),
        ]);
        const plan = buildNumberingPlan(records);
        if (plan.revision !== request.expectedRevision) {
          throw new NumberingServiceError(
            409,
            "preview_outdated",
            "The submissions changed after the preview. Refresh the preview and confirm again."
          );
        }
        const counterNeedsWrite =
          !counter.exists || Number(counter.data()?.current || 0) !== plan.count;
        assertAtomicWriteLimit(plan.changes.length + (counterNeedsWrite ? 1 : 0));
        applyNumberingChanges(transaction, records, plan);
        if (counterNeedsWrite) {
          transaction.set(counterRef, { current: plan.count }, { merge: true });
        }
        return { submissionCount: plan.count, changes: plan.changes };
      });
      return {
        status: 200,
        body: {
          success: true,
          action: request.action,
          submissionCount: result.submissionCount,
          changes: result.changes,
        },
      };
    }

    if (request.action === "delete") {
      if (!admin) {
        throw new NumberingServiceError(403, "admin_required", "Admin access is required.");
      }
      const targetRef = collection.doc(request.submissionId!);
      const result = await db.runTransaction(async (transaction) => {
        const [records, target, counter] = await Promise.all([
          readSubmissionRecords(db, transaction),
          transaction.get(targetRef),
          transaction.get(counterRef),
        ]);
        if (!target.exists) {
          throw new NumberingServiceError(404, "submission_not_found", "Submission not found.");
        }
        const remaining = records.filter((record) => record.id !== targetRef.id);
        const plan = buildNumberingPlan(remaining);
        const counterNeedsWrite =
          !counter.exists || Number(counter.data()?.current || 0) !== plan.count;
        assertAtomicWriteLimit(
          plan.changes.length + 1 + (counterNeedsWrite ? 1 : 0)
        );
        applyNumberingChanges(transaction, remaining, plan);
        transaction.delete(targetRef);
        if (counterNeedsWrite) {
          transaction.set(counterRef, { current: plan.count }, { merge: true });
        }
        return {
          deletedDisplayId:
            typeof target.data()?.displayId === "string"
              ? target.data()!.displayId
              : null,
          deletedSequenceNumber: currentNumber(target.data()?.sequenceNumber),
          submissionCount: plan.count,
          changes: plan.changes,
        };
      });
      return {
        status: 200,
        body: {
          success: true,
          action: request.action,
          ...result,
        },
      };
    }

    const targetRef = collection.doc(request.submissionId!);
    const result = await db.runTransaction(async (transaction) => {
      const [records, counter] = await Promise.all([
        readSubmissionRecords(db, transaction),
        transaction.get(counterRef),
      ]);
      const target = records.find((record) => record.id === targetRef.id);
      if (!target) {
        throw new NumberingServiceError(404, "submission_not_found", "Submission not found.");
      }
      if (
        !admin &&
        target.data.ownerUid !== decoded.uid &&
        !(Array.isArray(target.data.participantUids) &&
          target.data.participantUids.includes(decoded.uid))
      ) {
        throw new NumberingServiceError(
          403,
          "submission_access_denied",
          "You can only number your own submitted form."
        );
      }
      if (target.submittedAtMs === null) {
        throw new NumberingServiceError(
          409,
          "submission_timestamp_missing",
          "This submission has no valid submission time, so it cannot be numbered."
        );
      }

      const plan = buildNumberingPlan(records);
      const counterNeedsWrite =
        !counter.exists || Number(counter.data()?.current || 0) !== plan.count;
      assertAtomicWriteLimit(
        plan.changes.length + (counterNeedsWrite ? 1 : 0)
      );
      applyNumberingChanges(transaction, records, plan);
      if (counterNeedsWrite) {
        transaction.set(counterRef, { current: plan.count }, { merge: true });
      }
      return {
        number: plan.numberById.get(target.id)!,
        submissionCount: plan.count,
        changes: plan.changes,
      };
    });
    return {
      status: 200,
      body: {
        success: true,
        action: request.action,
        number: result.number,
      },
    };
  } catch (error) {
    if (error instanceof NumberingServiceError) {
      return {
        status: error.status,
        body: { success: false, code: error.code, error: error.message },
      };
    }
    return {
      status: 500,
      body: {
        success: false,
        code: "numbering_failed",
        error: "Could not safely update submission numbers. No numbering transaction was committed.",
      },
    };
  }
}
