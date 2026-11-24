/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DecorEventBoard, QuestionnaireAnswers } from "../types/questionnaire.ts";

export const MAX_DECOR_EVENTS = 8;

export const SUGGESTED_DECOR_EVENTS: readonly string[] = [
  "Haldi",
  "Mehendi",
  "Reception",
  "Engagement",
  "Cocktail Night",
];

export interface GroupedDecorEvents {
  events: DecorEventBoard[];
  populatedEvents: DecorEventBoard[];
  hasAnyContent: boolean;
  totalImages: number;
}

export function createDefaultDecorEvents(): DecorEventBoard[] {
  return [
    {
      id: "wedding",
      name: "Wedding",
      isLocked: true,
      links: [],
      images: [],
      notes: "",
    },
    {
      id: "sangeet",
      name: "Sangeet",
      isLocked: false,
      links: [],
      images: [],
      notes: "",
    },
  ];
}

export function hasDecorEventContent(
  event: Pick<DecorEventBoard, "links" | "images" | "notes"> | undefined | null
): boolean {
  if (!event) return false;
  return (
    event.links.length > 0 ||
    event.images.length > 0 ||
    event.notes.trim().length > 0
  );
}

export function normalizeEventName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function isDuplicateDecorEventName(
  candidateName: string,
  events: readonly DecorEventBoard[],
  excludeEventId?: string
): boolean {
  const clean = normalizeEventName(candidateName).toLowerCase();
  if (!clean) return false;
  return events.some(
    (ev) =>
      ev.id !== excludeEventId &&
      normalizeEventName(ev.name).toLowerCase() === clean
  );
}

export function createDecorEventId(
  name: string,
  existingEvents: readonly DecorEventBoard[]
): string {
  const existingIds = new Set(existingEvents.map((e) => e.id));
  const baseSlug =
    normalizeEventName(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "event";
  const baseId = `evt_${baseSlug}`;
  if (!existingIds.has(baseId)) return baseId;
  let counter = 2;
  while (existingIds.has(`${baseId}_${counter}`)) {
    counter += 1;
  }
  return `${baseId}_${counter}`;
}

export function sanitizeDecorEvent(
  raw: unknown,
  fallbackId: string
): DecorEventBoard | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<DecorEventBoard>;
  const name = typeof obj.name === "string" ? normalizeEventName(obj.name) : "";
  if (!name) return null;

  const id =
    typeof obj.id === "string" && obj.id.trim().length > 0
      ? obj.id.trim()
      : fallbackId;
  const isWedding = id === "wedding" || name.toLowerCase() === "wedding";

  return {
    id,
    name: isWedding ? "Wedding" : name,
    isLocked: isWedding ? true : Boolean(obj.isLocked),
    links: Array.isArray(obj.links)
      ? obj.links.filter(
          (l): l is string => typeof l === "string" && l.trim().length > 0
        )
      : [],
    images: Array.isArray(obj.images)
      ? obj.images.filter(
          (img): img is string =>
            typeof img === "string" && img.trim().length > 0
        )
      : [],
    notes: typeof obj.notes === "string" ? obj.notes : "",
    ...(typeof obj.splitGroupId === "string" && obj.splitGroupId
      ? { splitGroupId: obj.splitGroupId }
      : {}),
    ...(obj.splitSide === "partnerA" || obj.splitSide === "partnerB"
      ? { splitSide: obj.splitSide }
      : {}),
  };
}

export function sanitizeDecorEvents(
  rawEvents: unknown,
  legacyDecor?: QuestionnaireAnswers["decorMoodBoard"]
): DecorEventBoard[] {
  if (Array.isArray(rawEvents) && rawEvents.length > 0) {
    const seenIds = new Set<string>();
    const cleaned: DecorEventBoard[] = [];
    for (let i = 0; i < rawEvents.length; i++) {
      const item = sanitizeDecorEvent(rawEvents[i], `evt_${i + 1}`);
      if (!item || seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      cleaned.push(item);
    }

    if (cleaned.length > 0) {
      const hasLockedWedding = cleaned.some((ev) => ev.isLocked || ev.id === "wedding");
      if (!hasLockedWedding) {
        cleaned.unshift({
          id: "wedding",
          name: "Wedding",
          isLocked: true,
          links: [],
          images: [],
          notes: "",
        });
      }
      return cleaned.slice(0, MAX_DECOR_EVENTS);
    }
  }

  const defaults = createDefaultDecorEvents();
  if (legacyDecor) {
    const legacyLinks = Array.isArray(legacyDecor.links)
      ? legacyDecor.links.filter(
          (l): l is string => typeof l === "string" && l.trim().length > 0
        )
      : [];
    const legacyImages = Array.isArray(legacyDecor.images)
      ? legacyDecor.images.filter(
          (img): img is string =>
            typeof img === "string" && img.trim().length > 0
        )
      : [];
    const legacyNotes =
      typeof legacyDecor.notes === "string" ? legacyDecor.notes : "";

    if (legacyLinks.length > 0 || legacyImages.length > 0 || legacyNotes.trim()) {
      defaults[0] = {
        ...defaults[0],
        links: legacyLinks,
        images: legacyImages,
        notes: legacyNotes,
      };
    }
  }

  return defaults;
}

export function addDecorEventToList(
  events: readonly DecorEventBoard[],
  rawName: string
): { nextEvents: DecorEventBoard[]; addedEvent?: DecorEventBoard; error?: string } {
  if (events.length >= MAX_DECOR_EVENTS) {
    return {
      nextEvents: [...events],
      error: `You can add up to ${MAX_DECOR_EVENTS} events in total.`,
    };
  }

  const cleanName = normalizeEventName(rawName);
  if (!cleanName) {
    return {
      nextEvents: [...events],
      error: "Please enter an event name.",
    };
  }

  if (isDuplicateDecorEventName(cleanName, events)) {
    return {
      nextEvents: [...events],
      error: `"${cleanName}" is already in your event list.`,
    };
  }

  const newEvent: DecorEventBoard = {
    id: createDecorEventId(cleanName, events),
    name: cleanName,
    isLocked: false,
    links: [],
    images: [],
    notes: "",
  };

  return {
    nextEvents: [...events, newEvent],
    addedEvent: newEvent,
  };
}

export function renameDecorEventInList(
  events: readonly DecorEventBoard[],
  eventId: string,
  rawNewName: string
): { nextEvents: DecorEventBoard[]; error?: string } {
  const target = events.find((ev) => ev.id === eventId);
  if (!target) {
    return { nextEvents: [...events] };
  }
  if (target.isLocked || target.id === "wedding") {
    return { nextEvents: [...events] };
  }

  const cleanName = normalizeEventName(rawNewName);
  if (!cleanName) {
    return {
      nextEvents: [...events],
      error: "Event name cannot be empty.",
    };
  }

  if (isDuplicateDecorEventName(cleanName, events, eventId)) {
    return {
      nextEvents: [...events],
      error: `"${cleanName}" is already in your event list.`,
    };
  }

  return {
    nextEvents: events.map((ev) =>
      ev.id === eventId ? { ...ev, name: cleanName } : ev
    ),
  };
}

export function removeDecorEventFromList(
  events: readonly DecorEventBoard[],
  eventId: string
): DecorEventBoard[] {
  const target = events.find((ev) => ev.id === eventId);
  if (!target || target.isLocked || target.id === "wedding") {
    return [...events];
  }
  return events.filter((ev) => ev.id !== eventId);
}

/**
 * Returns Question 14 decor events in the exact order stored by the couple,
 * with transparent fallback to legacy single `decorMoodBoard` records.
 */
export function getGroupedDecorEvents(
  answers:
    | Pick<QuestionnaireAnswers, "decorEvents" | "decorMoodBoard">
    | undefined
    | null
): GroupedDecorEvents {
  let events: DecorEventBoard[] = [];

  if (Array.isArray(answers?.decorEvents) && answers.decorEvents.length > 0) {
    for (let i = 0; i < answers.decorEvents.length; i++) {
      const cleaned = sanitizeDecorEvent(answers.decorEvents[i], `evt_${i + 1}`);
      if (cleaned) events.push(cleaned);
    }
  }

  const hasAnyInEvents = events.some((ev) => hasDecorEventContent(ev));

  if (!hasAnyInEvents && answers?.decorMoodBoard) {
    const legacy = sanitizeDecorEvent(
      {
        id: "wedding",
        name: "Wedding",
        isLocked: true,
        links: answers.decorMoodBoard.links,
        images: answers.decorMoodBoard.images,
        notes: answers.decorMoodBoard.notes,
      },
      "wedding"
    );
    if (legacy && hasDecorEventContent(legacy)) {
      if (events.length === 0) {
        events = [legacy];
      } else {
        const weddingIdx = events.findIndex(
          (ev) => ev.id === "wedding" || ev.isLocked
        );
        if (weddingIdx >= 0) {
          events[weddingIdx] = legacy;
        } else {
          events = [legacy, ...events];
        }
      }
    }
  }

  const populatedEvents = events.filter((ev) => hasDecorEventContent(ev));
  const totalImages = populatedEvents.reduce(
    (sum, ev) => sum + ev.images.length,
    0
  );

  return {
    events,
    populatedEvents,
    hasAnyContent: populatedEvents.length > 0,
    totalImages,
  };
}

/** True when the board is one half of an event split "Separate for each side". */
export function isSplitDecorEvent(
  ev: Pick<DecorEventBoard, "splitGroupId"> | undefined | null
): boolean {
  return Boolean(ev?.splitGroupId);
}

/**
 * Splits one shared (non-Wedding) event into two boards, one per partner, e.g.
 * "Maya's Sangeet" and "Leo's Sangeet". Whatever was already on the shared event stays
 * with the partner who is splitting it, so nothing is lost.
 */
export function splitDecorEventBySide(
  events: readonly DecorEventBoard[],
  eventId: string,
  names: { partnerA: string; partnerB: string },
  keepContentWith: "partnerA" | "partnerB" = "partnerA"
): DecorEventBoard[] {
  const idx = events.findIndex((ev) => ev.id === eventId);
  const target = events[idx];
  if (!target || target.isLocked || target.id === "wedding" || target.splitGroupId) {
    return [...events];
  }
  if (events.length >= MAX_DECOR_EVENTS) return [...events];

  const nameA = normalizeEventName(names.partnerA) || "Partner 1";
  const nameB = normalizeEventName(names.partnerB) || "Partner 2";
  const groupId = target.id;
  const make = (slot: "partnerA" | "partnerB"): DecorEventBoard => {
    const keeps = slot === keepContentWith;
    return {
      id: `${groupId}__${slot === "partnerA" ? "a" : "b"}`,
      name: `${slot === "partnerA" ? nameA : nameB}'s ${target.name}`,
      isLocked: false,
      links: keeps ? [...target.links] : [],
      images: keeps ? [...target.images] : [],
      notes: keeps ? target.notes : "",
      splitGroupId: groupId,
      splitSide: slot,
    };
  };
  const next = [...events];
  next.splice(idx, 1, make("partnerA"), make("partnerB"));
  return next;
}

/** Joins the two halves of a split event back into one shared event (content is combined, never dropped). */
export function mergeSplitDecorEvent(
  events: readonly DecorEventBoard[],
  groupId: string,
  baseName: string
): DecorEventBoard[] {
  const halves = events.filter((ev) => ev.splitGroupId === groupId);
  if (halves.length === 0) return [...events];
  const firstIdx = events.findIndex((ev) => ev.splitGroupId === groupId);
  const uniq = (list: string[]) => Array.from(new Set(list));
  const merged: DecorEventBoard = {
    id: groupId,
    name: baseName,
    isLocked: false,
    links: uniq(halves.flatMap((h) => h.links)),
    images: uniq(halves.flatMap((h) => h.images)),
    notes: halves.map((h) => h.notes.trim()).filter(Boolean).join("\n\n"),
  };
  const next: DecorEventBoard[] = [];
  events.forEach((ev, i) => {
    if (ev.splitGroupId === groupId) {
      if (i === firstIdx) next.push(merged);
      return;
    }
    next.push(ev);
  });
  return next;
}

/** The shared "Wedding" board (the only decor board with minimums). */
export function getWeddingDecorEvent(
  answers:
    | Pick<QuestionnaireAnswers, "decorEvents" | "decorMoodBoard">
    | undefined
    | null
): DecorEventBoard | undefined {
  const grouped = getGroupedDecorEvents(answers);
  return grouped.events.find((ev) => ev.id === "wedding" || ev.isLocked);
}
