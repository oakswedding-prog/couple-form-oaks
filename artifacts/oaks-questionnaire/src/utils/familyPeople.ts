/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  FamilyMember,
  FamilySide,
  FamilySideData,
  QuestionnaireAnswers,
  SideFamilyPhoto,
} from "../types/questionnaire.ts";

export type NormalizedSide = "bride" | "groom" | "shared";

export interface GroupedQ10Side {
  photos: SideFamilyPhoto[];
  members: FamilyMember[];
  notes: string;
}

export interface GroupedQ10People {
  bride: GroupedQ10Side;
  groom: GroupedQ10Side;
  sharedMembers: FamilyMember[];
  legacyTreePhotoUrl?: string;
  legacyTreeNotes: string;
  totalPhotos: number;
  totalMembers: number;
  hasBrideEntry: boolean;
  hasGroomEntry: boolean;
}

export function normalizeFamilySide(side: FamilySide | string | undefined): NormalizedSide {
  if (side === "bride" || side === "sideA") return "bride";
  if (side === "groom" || side === "sideB") return "groom";
  return "shared";
}

function sanitizePhotoList(raw: unknown): SideFamilyPhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is SideFamilyPhoto => Boolean(item && typeof item === "object" && typeof (item as SideFamilyPhoto).url === "string" && (item as SideFamilyPhoto).url.trim()))
    .map((item, idx) => ({
      id: typeof item.id === "string" && item.id ? item.id : `photo_${idx}_${Date.now()}`,
      url: item.url,
      caption: typeof item.caption === "string" ? item.caption : "",
      mustCapture: Boolean(item.mustCapture),
    }));
}

export function sanitizeSideData(raw: unknown): FamilySideData {
  if (!raw || typeof raw !== "object") {
    return { photos: [], notes: "" };
  }
  const obj = raw as Partial<FamilySideData>;
  return {
    photos: sanitizePhotoList(obj.photos),
    notes: typeof obj.notes === "string" ? obj.notes : "",
  };
}

export function getGroupedQ10People(
  q10?: QuestionnaireAnswers["q10_people"] | null
): GroupedQ10People {
  const safeQ10 = q10 || { familyMembers: [], treeNotes: "" };
  const allMembers = Array.isArray(safeQ10.familyMembers) ? safeQ10.familyMembers : [];

  const brideMembers = allMembers.filter((m) => normalizeFamilySide(m.side) === "bride");
  const groomMembers = allMembers.filter((m) => normalizeFamilySide(m.side) === "groom");
  const sharedMembers = allMembers.filter((m) => normalizeFamilySide(m.side) === "shared");

  const brideSide = sanitizeSideData(safeQ10.brideSide);
  const groomSide = sanitizeSideData(safeQ10.groomSide);

  const legacyTreePhotoUrl =
    typeof safeQ10.treePhotoUrl === "string" && safeQ10.treePhotoUrl.trim()
      ? safeQ10.treePhotoUrl.trim()
      : undefined;
  const legacyTreeNotes =
    typeof safeQ10.treeNotes === "string" ? safeQ10.treeNotes.trim() : "";

  const hasBrideEntry =
    brideSide.photos.length > 0 ||
    brideMembers.length > 0 ||
    brideSide.notes.trim().length > 0;

  const hasGroomEntry =
    groomSide.photos.length > 0 ||
    groomMembers.length > 0 ||
    groomSide.notes.trim().length > 0;

  const totalPhotos =
    brideSide.photos.length +
    groomSide.photos.length +
    allMembers.filter((m) => Boolean(m.photoUrl)).length +
    (legacyTreePhotoUrl ? 1 : 0);

  return {
    bride: {
      photos: brideSide.photos,
      members: brideMembers,
      notes: brideSide.notes,
    },
    groom: {
      photos: groomSide.photos,
      members: groomMembers,
      notes: groomSide.notes,
    },
    sharedMembers,
    legacyTreePhotoUrl,
    legacyTreeNotes,
    totalPhotos,
    totalMembers: allMembers.length,
    hasBrideEntry,
    hasGroomEntry,
  };
}
