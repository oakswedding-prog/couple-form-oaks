/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  PhotoStatusEntry,
  QuestionnaireAnswers,
} from "../types/questionnaire.ts";

export type NormalizedPhotoState =
  | "uploaded"
  | "uploading"
  | "not_added"
  | "failed";

export type NormalizedPhotoStateLabel =
  | "Uploaded"
  | "Still uploading"
  | "Not added by couple"
  | "Upload failed";

export interface NormalizedPhotoItem {
  id: string;
  slotKey: string;
  category: string;
  label: string;
  status: NormalizedPhotoState;
  statusLabel: NormalizedPhotoStateLabel;
  storagePath?: string;
  errorCode?: string;
  updatedAt?: string;
}

export interface NormalizedPhotoReport {
  items: NormalizedPhotoItem[];
  uploadedCount: number;
  notAddedCount: number;
  failedCount: number;
  uploadingCount: number;
  summaryLine: string;
  emailSummaryLine: string;
}

const STATE_LABEL_MAP: Record<NormalizedPhotoState, NormalizedPhotoStateLabel> = {
  uploaded: "Uploaded",
  uploading: "Still uploading",
  not_added: "Not added by couple",
  failed: "Upload failed",
};

/**
 * Legacy error codes that came from stale/empty placeholders (not real Storage upload errors).
 * Treated as "Not added by couple" on display and NEVER trigger "Needs attention".
 */
export function isLegacyNonFailurePhotoError(errorCode?: string): boolean {
  const code = (errorCode || "").trim().toLowerCase();
  return !code || code === "photo/not-uploaded";
}

/**
 * Extracts a canonical Storage path key from either a raw Storage path ("submissions/..."),
 * a gs:// URI, or a resolved Firebase Storage HTTPS download URL so deduplication works
 * identically before and after media URLs are resolved.
 */
export function normalizeMediaPathKey(pathOrUrl: string | undefined | null): string {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return "";
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("gs://")) {
    return trimmed.split("/").slice(3).join("/");
  }

  // Firebase Storage HTTPS download URL: .../o/<encodedPath>?alt=media...
  const firebaseMatch = trimmed.match(/\/o\/([^?]+)/);
  if (firebaseMatch && firebaseMatch[1]) {
    try {
      return decodeURIComponent(firebaseMatch[1]);
    } catch {
      return firebaseMatch[1];
    }
  }

  return trimmed;
}

function isConfirmedUploadedValue(val: string | undefined | null): val is string {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (
    trimmed.startsWith("pending_photo:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("data:image/")
  ) {
    return false;
  }
  return (
    trimmed.startsWith("submissions/") ||
    trimmed.startsWith("gs://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://")
  );
}

function slugifyDecorName(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "decor"
  );
}

export function getCanonicalSlotKey(category: string): string {
  const slug = (category || "").trim().toLowerCase();
  if (slug === "couple_photo") return "couple_photo";
  if (slug.startsWith("bride_vip") || slug.startsWith("bride_family")) {
    return "bride_people";
  }
  if (slug.startsWith("groom_vip") || slug.startsWith("groom_family")) {
    return "groom_people";
  }
  if (slug === "family_tree" || slug === "family_member") return "family_legacy";
  if (slug === "reference") return "reference";
  if (slug === "bride_outfit") return "bride_outfit";
  if (slug === "groom_outfit") return "groom_outfit";
  if (slug === "outfit" || slug === "wardrobe") return "outfit_legacy";
  if (slug.startsWith("decor_")) return slug;
  if (slug === "decor") return "decor_legacy";
  if (slug === "last_thing") return "last_thing";
  return slug || "photo";
}

function getReadableSlotLabel(category: string, fallbackEventName?: string): string {
  const slug = (category || "").trim().toLowerCase();
  if (slug === "couple_photo") return "Couple Photo (Q1)";
  if (slug === "bride_people") return "Bride's Side Photo (Q10)";
  if (slug === "groom_people") return "Groom's Side Photo (Q10)";
  if (slug.startsWith("bride_vip")) return "Bride's Side VIP Photo (Q10)";
  if (slug.startsWith("groom_vip")) return "Groom's Side VIP Photo (Q10)";
  if (slug.startsWith("bride_family")) return "Bride's Side Family Photo (Q10)";
  if (slug.startsWith("groom_family")) return "Groom's Side Family Photo (Q10)";
  if (slug === "family_tree") return "Family Tree Photo (Q10)";
  if (slug === "family_member") return "VIP Reference Photo (Q10)";
  if (slug === "reference") return "Visual Reference (Q12)";
  if (slug === "bride_outfit") return "Bride's Wardrobe Photo (Q13)";
  if (slug === "groom_outfit") return "Groom's Wardrobe Photo (Q13)";
  if (slug === "outfit" || slug === "wardrobe") return "Wardrobe Photo (Q13)";
  if (slug.startsWith("decor_")) {
    if (fallbackEventName) return `${fallbackEventName} Decor Photo (Q14)`;
    const rawEvent = slug.replace(/^decor_/, "").replace(/_/g, " ").trim();
    const prettyEvent = rawEvent
      ? rawEvent.replace(/\b\w/g, (c) => c.toUpperCase())
      : "Decor";
    return `${prettyEvent} Decor Photo (Q14)`;
  }
  if (slug === "decor") return "Decor Mood Board Photo (Q14)";
  if (slug === "last_thing") return "One Last Thing Photo (Q27)";
  return "Uploaded Photo";
}

interface InternalEntry {
  id: string;
  slotKey: string;
  category: string;
  label: string;
  status: NormalizedPhotoState;
  storagePath?: string;
  normalizedPath?: string;
  errorCode?: string;
  updatedAt?: string;
}

interface CanonicalSlotDef {
  slotKey: string;
  category: string;
  label: string;
}

function buildCanonicalSlots(answers?: QuestionnaireAnswers): CanonicalSlotDef[] {
  const slots: CanonicalSlotDef[] = [
    { slotKey: "couple_photo", category: "couple_photo", label: "Couple Photo (Q1)" },
    { slotKey: "bride_people", category: "bride_people", label: "Bride's Side Photo (Q10)" },
    { slotKey: "groom_people", category: "groom_people", label: "Groom's Side Photo (Q10)" },
    { slotKey: "reference", category: "reference", label: "Visual Reference (Q12)" },
    { slotKey: "bride_outfit", category: "bride_outfit", label: "Bride's Wardrobe Photo (Q13)" },
    { slotKey: "groom_outfit", category: "groom_outfit", label: "Groom's Wardrobe Photo (Q13)" },
  ];

  const decorEvents =
    Array.isArray(answers?.decorEvents) && answers.decorEvents.length > 0
      ? answers.decorEvents
      : [
          { id: "wedding", name: "Wedding" },
          { id: "sangeet", name: "Sangeet" },
        ];

  const seenDecorSlots = new Set<string>();
  for (const ev of decorEvents) {
    const slug = slugifyDecorName(ev?.id || ev?.name || "wedding");
    const slotKey = `decor_${slug}`;
    if (seenDecorSlots.has(slotKey)) continue;
    seenDecorSlots.add(slotKey);
    const evName = (ev?.name || slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())).trim();
    slots.push({
      slotKey,
      category: slotKey,
      label: `${evName} Decor Photo (Q14)`,
    });
  }

  slots.push({
    slotKey: "last_thing",
    category: "last_thing",
    label: "One Last Thing Photo (Q27)",
  });

  return slots;
}

function extractUploadedFromAnswers(
  answers: QuestionnaireAnswers | undefined
): InternalEntry[] {
  if (!answers) return [];
  const found: InternalEntry[] = [];
  let seq = 0;

  const pushIfUploaded = (
    raw: string | undefined | null,
    category: string,
    customLabel?: string
  ) => {
    if (!isConfirmedUploadedValue(raw)) return;
    seq++;
    const normalizedPath = normalizeMediaPathKey(raw);
    found.push({
      id: `ans_${category}_${seq}`,
      slotKey: getCanonicalSlotKey(category),
      category,
      label: customLabel || getReadableSlotLabel(category),
      status: "uploaded",
      storagePath: raw,
      normalizedPath,
    });
  };

  pushIfUploaded(answers.couplePhotoUrl, "couple_photo");
  pushIfUploaded(answers.q10_people?.treePhotoUrl, "family_tree");

  answers.q10_people?.familyMembers?.forEach((m) => {
    const cat =
      m.side === "bride"
        ? "bride_vip"
        : m.side === "groom"
        ? "groom_vip"
        : "family_member";
    pushIfUploaded(m.photoUrl, cat);
  });
  answers.q10_people?.brideSide?.photos?.forEach((p) =>
    pushIfUploaded(p.url, "bride_family")
  );
  answers.q10_people?.groomSide?.photos?.forEach((p) =>
    pushIfUploaded(p.url, "groom_family")
  );
  answers.q12_references?.images?.forEach((img) => pushIfUploaded(img, "reference"));
  answers.wardrobe?.bride?.photos?.forEach((img) =>
    pushIfUploaded(img, "bride_outfit")
  );
  answers.wardrobe?.groom?.photos?.forEach((img) =>
    pushIfUploaded(img, "groom_outfit")
  );
  answers.weddingOutfits?.images?.forEach((img) => pushIfUploaded(img, "outfit"));

  if (Array.isArray(answers.decorEvents)) {
    answers.decorEvents.forEach((ev) => {
      const slug = slugifyDecorName(ev?.id || ev?.name || "wedding");
      const cat = `decor_${slug}`;
      const label = `${ev?.name || "Wedding"} Decor Photo (Q14)`;
      ev?.images?.forEach((img) => pushIfUploaded(img, cat, label));
    });
  }
  answers.decorMoodBoard?.images?.forEach((img) => pushIfUploaded(img, "decor"));
  answers.q23_oneLastThing?.images?.forEach((img) =>
    pushIfUploaded(img, "last_thing")
  );
  answers.partnerAnswers?.partnerA?.q23_oneLastThing?.images?.forEach((img) =>
    pushIfUploaded(img, "last_thing")
  );
  answers.partnerAnswers?.partnerB?.q23_oneLastThing?.images?.forEach((img) =>
    pushIfUploaded(img, "last_thing")
  );

  return found;
}

/**
 * Produces a clean, deduplicated, single-source-of-truth photo status report for a couple's submission:
 * - Every photo / slot gets exactly ONE of 4 states:
 *   "uploaded" ("Uploaded"), "uploading" ("Still uploading"),
 *   "not_added" ("Not added by couple"), or "failed" ("Upload failed").
 * - Legacy stale "photo/not-uploaded" entries are treated as "Not added by couple" (never red alerts)
 *   and dropped entirely whenever that slot already has an uploaded photo.
 * - Duplicate entries for the same photo (same id or same storagePath) are collapsed using the latest status,
 *   and an uploaded photo always supersedes any older failed entry for the same photo.
 * - Empty questionnaire photo slots appear ONCE as neutral "Not added by couple".
 */
export function buildNormalizedPhotoReport(
  answers?: QuestionnaireAnswers,
  rawPhotoStatuses?: Record<string, PhotoStatusEntry>
): NormalizedPhotoReport {
  const uploadedByPath = new Map<string, InternalEntry>();
  const uploadedById = new Map<string, InternalEntry>();
  const uploadingById = new Map<string, InternalEntry>();
  const failedById = new Map<string, InternalEntry>();

  // 1. Ingest photoStatuses sorted oldest -> newest so latest update always wins
  const rawEntries = rawPhotoStatuses
    ? Object.entries(rawPhotoStatuses).sort(([, a], [, b]) =>
        (a?.updatedAt || "").localeCompare(b?.updatedAt || "")
      )
    : [];

  for (const [key, raw] of rawEntries) {
    if (!raw) continue;
    const id = raw.id || key;
    const category = raw.category || "photo";
    const slotKey = getCanonicalSlotKey(category);
    const label = raw.label || getReadableSlotLabel(category);
    const normalizedPath = normalizeMediaPathKey(raw.storagePath);

    if (raw.status === "uploaded") {
      const item: InternalEntry = {
        id,
        slotKey,
        category,
        label,
        status: "uploaded",
        storagePath: raw.storagePath,
        normalizedPath,
        updatedAt: raw.updatedAt,
      };
      if (normalizedPath) {
        uploadedByPath.set(normalizedPath, item);
      } else {
        uploadedById.set(id, item);
      }
      // Uploaded photo supersedes any earlier pending/failed entry for the same photo id
      uploadingById.delete(id);
      failedById.delete(id);
    } else if (raw.status === "pending") {
      if (!uploadedById.has(id) && !(normalizedPath && uploadedByPath.has(normalizedPath))) {
        uploadingById.set(id, {
          id,
          slotKey,
          category,
          label,
          status: "uploading",
          storagePath: raw.storagePath,
          normalizedPath,
          updatedAt: raw.updatedAt,
        });
        failedById.delete(id);
      }
    } else if (raw.status === "failed") {
      // Legacy "photo/not-uploaded" (or blank error code) is NOT a real upload failure
      if (isLegacyNonFailurePhotoError(raw.errorCode)) {
        continue;
      }
      if (
        !uploadedById.has(id) &&
        !uploadingById.has(id) &&
        !(normalizedPath && uploadedByPath.has(normalizedPath))
      ) {
        failedById.set(id, {
          id,
          slotKey,
          category,
          label,
          status: "failed",
          storagePath: raw.storagePath,
          normalizedPath,
          errorCode: raw.errorCode,
          updatedAt: raw.updatedAt,
        });
      }
    }
  }

  // 2. Merge confirmed uploaded photos from `answers` (handles older records without photoStatuses
  //    AND ensures any newly attached Storage paths appear even if photoStatuses lagged).
  const answerUploaded = extractUploadedFromAnswers(answers);
  const answerUploadedSlots = new Set(answerUploaded.map((e) => e.slotKey));

  // If a legacy uploaded entry had no storagePath, avoid duplicating if answers already holds the real path for that slot
  for (const [id, entry] of Array.from(uploadedById.entries())) {
    if (!entry.normalizedPath && answerUploadedSlots.has(entry.slotKey)) {
      uploadedById.delete(id);
    }
  }

  for (const ansEntry of answerUploaded) {
    if (ansEntry.normalizedPath) {
      if (!uploadedByPath.has(ansEntry.normalizedPath)) {
        uploadedByPath.set(ansEntry.normalizedPath, ansEntry);
      }
    } else {
      uploadedById.set(ansEntry.id, ansEntry);
    }
  }

  // 3. Drop any uploading/failed entry whose normalizedPath is now confirmed uploaded
  for (const [id, entry] of Array.from(uploadingById.entries())) {
    if (entry.normalizedPath && uploadedByPath.has(entry.normalizedPath)) {
      uploadingById.delete(id);
    }
  }
  for (const [id, entry] of Array.from(failedById.entries())) {
    if (entry.normalizedPath && uploadedByPath.has(entry.normalizedPath)) {
      failedById.delete(id);
    }
  }

  // Group all active items (uploaded, uploading, failed) by canonical slotKey
  const activeItems: InternalEntry[] = [
    ...uploadedByPath.values(),
    ...uploadedById.values(),
    ...uploadingById.values(),
    ...failedById.values(),
  ];

  const activeBySlot = new Map<string, InternalEntry[]>();
  for (const item of activeItems) {
    const list = activeBySlot.get(item.slotKey) || [];
    list.push(item);
    activeBySlot.set(item.slotKey, list);
  }

  // 4. Assemble final ordered list across canonical questionnaire slots + any extra active slots
  const canonicalSlots = buildCanonicalSlots(answers);
  const canonicalSlotKeys = new Set(canonicalSlots.map((s) => s.slotKey));
  const finalItems: NormalizedPhotoItem[] = [];

  const appendSlotItems = (itemsForSlot: InternalEntry[]) => {
    // Sort within slot: failed first, then uploading, then uploaded
    const rank: Record<NormalizedPhotoState, number> = {
      failed: 0,
      uploading: 1,
      uploaded: 2,
      not_added: 3,
    };
    const sorted = [...itemsForSlot].sort((a, b) => rank[a.status] - rank[b.status]);

    // Count label occurrences so 2 distinct photos in the same slot get clear "#1", "#2" suffixes
    const labelTotals = new Map<string, number>();
    for (const item of sorted) {
      labelTotals.set(item.label, (labelTotals.get(item.label) || 0) + 1);
    }
    const labelSeen = new Map<string, number>();

    for (const item of sorted) {
      const totalForLabel = labelTotals.get(item.label) || 1;
      const idx = (labelSeen.get(item.label) || 0) + 1;
      labelSeen.set(item.label, idx);
      const displayLabel =
        totalForLabel > 1 ? `${item.label} #${idx}` : item.label;

      finalItems.push({
        id: item.id,
        slotKey: item.slotKey,
        category: item.category,
        label: displayLabel,
        status: item.status,
        statusLabel: STATE_LABEL_MAP[item.status],
        storagePath: item.storagePath,
        errorCode: item.status === "failed" ? item.errorCode : undefined,
        updatedAt: item.updatedAt,
      });
    }
  };

  for (const slot of canonicalSlots) {
    const slotEntries = activeBySlot.get(slot.slotKey);
    if (slotEntries && slotEntries.length > 0) {
      appendSlotItems(slotEntries);
    } else {
      finalItems.push({
        id: `empty_${slot.slotKey}`,
        slotKey: slot.slotKey,
        category: slot.category,
        label: slot.label,
        status: "not_added",
        statusLabel: STATE_LABEL_MAP.not_added,
      });
    }
  }

  // Append any extra non-canonical slots that have genuine active photos (e.g., legacy tree/outfit/recovered)
  for (const [slotKey, slotEntries] of activeBySlot.entries()) {
    if (canonicalSlotKeys.has(slotKey)) continue;
    appendSlotItems(slotEntries);
  }

  const uploadedCount = finalItems.filter((i) => i.status === "uploaded").length;
  const notAddedCount = finalItems.filter((i) => i.status === "not_added").length;
  const failedCount = finalItems.filter((i) => i.status === "failed").length;
  const uploadingCount = finalItems.filter((i) => i.status === "uploading").length;

  const summaryLine = `Photos: ${uploadedCount} uploaded, ${notAddedCount} not added by couple, ${failedCount} failed, ${uploadingCount} uploading`;
  const emailSummaryLine = `Photos: ${uploadedCount} uploaded, ${notAddedCount} not added by couple, ${failedCount} failed`;

  return {
    items: finalItems,
    uploadedCount,
    notAddedCount,
    failedCount,
    uploadingCount,
    summaryLine,
    emailSummaryLine,
  };
}
