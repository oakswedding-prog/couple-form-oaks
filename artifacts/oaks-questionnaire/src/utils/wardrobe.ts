/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { QuestionnaireAnswers, WardrobeSideData } from "../types/questionnaire.ts";

export type WardrobeSideKey = "bride" | "groom";

export interface GroupedWardrobe {
  bride: WardrobeSideData;
  groom: WardrobeSideData;
  legacyShared?: WardrobeSideData;
  hasBrideContent: boolean;
  hasGroomContent: boolean;
  hasBrideNotes: boolean;
  hasGroomNotes: boolean;
  hasLegacyNotes: boolean;
  hasAnyNotes: boolean;
}

export function createEmptyWardrobeSide(): WardrobeSideData {
  return {
    notes: "",
    links: [],
    photos: [],
  };
}

/** Return one normalized event label per photo without changing the saved photo order. */
export function getWardrobePhotoEvents(side: Pick<WardrobeSideData, "photos" | "photoEvents">): string[] {
  return side.photos.map((_, index) => side.photoEvents?.[index]?.trim() || "");
}

/** Keep labels attached to the same image when the uploader removes photos or appends new ones. */
export function reconcileWardrobePhotoEvents(
  previousPhotos: string[],
  previousEvents: string[] | undefined,
  nextPhotos: string[],
): string[] {
  const eventsByPhoto = new Map<string, string[]>();
  previousPhotos.forEach((photo, index) => {
    const events = eventsByPhoto.get(photo) || [];
    events.push(previousEvents?.[index]?.trim() || "");
    eventsByPhoto.set(photo, events);
  });
  return nextPhotos.map((photo) => eventsByPhoto.get(photo)?.shift() || "");
}

export function withWardrobePhotoEvents(
  side: WardrobeSideData,
  photoEvents: string[],
): WardrobeSideData {
  return {
    ...side,
    photoEvents: photoEvents.some((event) => event.trim()) ? photoEvents : undefined,
  };
}

export function sanitizeWardrobeSide(raw: unknown): WardrobeSideData {
  if (!raw || typeof raw !== "object") {
    return createEmptyWardrobeSide();
  }
  const obj = raw as Partial<WardrobeSideData> & { images?: unknown };
  const rawPhotos = Array.isArray(obj.photos)
    ? obj.photos
    : Array.isArray(obj.images)
    ? obj.images
    : [];

  const photosWithEvents = rawPhotos
    .map((photo, index) => ({
      photo,
      event: Array.isArray(obj.photoEvents) && typeof obj.photoEvents[index] === "string"
        ? obj.photoEvents[index].trim()
        : "",
    }))
    .filter(({ photo }) => typeof photo === "string" && photo.trim().length > 0);

  return {
    notes: typeof obj.notes === "string" ? obj.notes : "",
    links: Array.isArray(obj.links)
      ? obj.links.filter((l): l is string => typeof l === "string" && l.trim().length > 0)
      : [],
    photos: photosWithEvents.map(({ photo }) => photo as string),
    ...(photosWithEvents.some(({ event }) => event)
      ? { photoEvents: photosWithEvents.map(({ event }) => event) }
      : {}),
  };
}

export function sanitizeWardrobe(
  raw: unknown
): { bride: WardrobeSideData; groom: WardrobeSideData } {
  if (!raw || typeof raw !== "object") {
    return {
      bride: createEmptyWardrobeSide(),
      groom: createEmptyWardrobeSide(),
    };
  }
  const obj = raw as { bride?: unknown; groom?: unknown };
  return {
    bride: sanitizeWardrobeSide(obj.bride),
    groom: sanitizeWardrobeSide(obj.groom),
  };
}

export function hasWardrobeSideContent(side: WardrobeSideData | undefined): boolean {
  if (!side) return false;
  return (
    side.notes.trim().length > 0 ||
    side.links.length > 0 ||
    side.photos.length > 0
  );
}

export function hasWardrobeSideNotes(side: WardrobeSideData | undefined): boolean {
  return Boolean(side && side.notes.trim().length > 0);
}

export function getGroupedWardrobe(
  answers: Pick<QuestionnaireAnswers, "wardrobe" | "weddingOutfits"> | undefined | null
): GroupedWardrobe {
  const bride = sanitizeWardrobeSide(answers?.wardrobe?.bride);
  const groom = sanitizeWardrobeSide(answers?.wardrobe?.groom);
  const hasBrideContent = hasWardrobeSideContent(bride);
  const hasGroomContent = hasWardrobeSideContent(groom);
  const hasBrideNotes = hasWardrobeSideNotes(bride);
  const hasGroomNotes = hasWardrobeSideNotes(groom);

  let legacyShared: WardrobeSideData | undefined;
  const legacyRaw = answers?.weddingOutfits;
  if (!hasBrideContent && !hasGroomContent && legacyRaw) {
    const normalizedLegacy = sanitizeWardrobeSide({
      notes: legacyRaw.notes,
      links: legacyRaw.links,
      photos: legacyRaw.images,
    });
    if (hasWardrobeSideContent(normalizedLegacy)) {
      legacyShared = normalizedLegacy;
    }
  }

  const hasLegacyNotes = Boolean(legacyShared && hasWardrobeSideNotes(legacyShared));

  return {
    bride,
    groom,
    legacyShared,
    hasBrideContent,
    hasGroomContent,
    hasBrideNotes,
    hasGroomNotes,
    hasLegacyNotes,
    hasAnyNotes: hasBrideNotes || hasGroomNotes || hasLegacyNotes,
  };
}
