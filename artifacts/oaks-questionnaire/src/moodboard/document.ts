import type { SubmissionRecord, FamilyMember, DecorEventBoard } from "../types/questionnaire.ts";
import { getGroupedQ10People } from "../utils/familyPeople.ts";
import { getGroupedDecorEvents } from "../utils/decorEvents.ts";
import { getGroupedWardrobe, getWardrobePhotoEvents } from "../utils/wardrobe.ts";
import { decorMapToEvents } from "../utils/splitModeHelpers.ts";
import type { MoodboardDocument, MoodboardPage, MoodboardPerson, MoodboardSection } from "./types.ts";

const chunks = <T,>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
const strings = (items: unknown): string[] => Array.isArray(items) ? items.filter((s): s is string => typeof s === "string" && Boolean(s.trim())) : [];

export function familyGroup(relationship: string): MoodboardPerson["group"] {
  const value = (relationship || "").trim().toLowerCase();
  if (!value || ["other", "unknown", "relative", "not specified"].includes(value)) return "Relationship not specified";
  if (/^(grandmother|grandfather|grandparent|grandparents|grandma|grandpa)$/.test(value)) return "Grandparents";
  if (/^(father|mother|parent|parents|dad|mom|mum)$/.test(value)) return "Parents";
  if (/^(brother|sister|sibling|siblings)$/.test(value)) return "Siblings";
  return "Family & friends";
}

/** Keep all submitted wording without allowing one long paragraph to overflow a slide. */
export function paginateNotes(notes: string, maxChars = 700): string[][] {
  const words = notes.trim().split(/\s+/).filter(Boolean);
  const blocks: string[] = [];
  let block = "";
  for (const word of words) {
    // Long unbroken strings also need wrapping; no content is discarded.
    for (let start = 0; start < word.length; start += 80) {
      const part = word.slice(start, start + 80);
      if (block.length + part.length + 1 > maxChars) { blocks.push(block); block = ""; }
      block += (block ? " " : "") + part;
    }
  }
  if (block) blocks.push(block);
  return blocks.map(b => [b]);
}

/** Read-only normalization: never infer an event from an unlabelled image or a person's gender from a photo. */
export function buildMoodboardDocument(submission: SubmissionRecord): MoodboardDocument {
  const a = submission.answers;
  const p1 = submission.partner1 || a.partner1 || "Bride";
  const p2 = submission.partner2 || a.partner2 || "Groom";
  const title = `${p1} & ${p2}`;
  const pages: MoodboardPage[] = [];
  let seq = 0;
  const page = (section: MoodboardSection, kind: MoodboardPage["kind"], heading: string, extra: Partial<MoodboardPage> = {}) => {
    pages.push({ id: `moodboard-${++seq}`, section, kind, title: heading, subtitle: "", images: [], lines: [], links: [], people: [], ...extra });
  };
  page("cover", "cover", title, { subtitle: "Wedding Visual Moodboard", lines: [submission.weddingDate || a.weddingDate || ""].filter(Boolean) });
  if (a.couplePhotoUrl) page("cover", "gallery", "The couple", { subtitle: title, images: [{ id: "couple", src: a.couplePhotoUrl, label: title }] });
  const addContent = (section: MoodboardSection, heading: string, photos: string[], links: string[], notes: string, subtitle = "") => {
    chunks(strings(photos), 6).forEach((batch, index) => page(section, "gallery", heading, {
      subtitle: [subtitle, index ? `Continued · ${index + 1}` : ""].filter(Boolean).join(" · "),
      images: batch.map((src, i) => ({ id: `${seq}-${i}`, src, label: `${heading} · Reference ${index * 6 + i + 1}` })),
    }));
    // Links remain links: a Pinterest/Instagram page is not an embeddable photo.
    const linkPages: { href: string; label: string }[][] = [];
    let linkBatch: { href: string; label: string }[] = [];
    let linkCost = 0;
    for (const href of strings(links)) for (let start = 0; start < href.length; start += 400) {
      const label = href.slice(start, start + 400);
      if (linkBatch.length && (linkBatch.length >= 5 || linkCost + label.length + 80 > 800)) {
        linkPages.push(linkBatch); linkBatch = []; linkCost = 0;
      }
      linkBatch.push({ href, label }); linkCost += label.length + 80;
    }
    if (linkBatch.length) linkPages.push(linkBatch);
    linkPages.forEach((batch, index) => page(section, "details", `${heading} — Links`, {
      subtitle: [subtitle, index ? "Continued" : ""].filter(Boolean).join(" · "),
      links: batch.map(l => l.href), linkLabels: batch.map(l => l.label),
    }));
    paginateNotes(notes || "").forEach((lines, index) => page(section, "details", `${heading} — Notes`, {
      subtitle: [subtitle, index ? "Continued" : ""].filter(Boolean).join(" · "), lines,
    }));
  };

  let decor: DecorEventBoard[] = getGroupedDecorEvents(a).populatedEvents;
  if (a.decorEventsMap) {
    // Map is authoritative for collaboration, while retaining array-only legacy events.
    const mapped = decorMapToEvents(a.decorEventsMap);
    const mappedIds = new Set(Object.keys(a.decorEventsMap));
    decor = getGroupedDecorEvents({ decorEvents: [...mapped, ...decor.filter(e => !mappedIds.has(e.id))] }).populatedEvents;
  }
  if (decor.length) {
    page("decor", "divider", "Wedding Decor", { subtitle: "Moodboard" });
    // Preserve sample sequence (Mehendi before Wedding) and all other events in saved order.
    const mehendi = decor.filter(e => /mehandi|mehendi|mehndi/i.test(e.name));
    const ordered = [...mehendi, ...decor.filter(e => !mehendi.includes(e))];
    ordered.forEach(e => addContent("decor", e.name, e.images, e.links, e.notes,
      e.splitSide === "partnerA" ? p1 : e.splitSide === "partnerB" ? p2 : ""));
  }

  const wardrobe = getGroupedWardrobe(a);
  const boards: { heading: string; data: typeof wardrobe.bride }[] = [];
  const addWardrobeBoards = (heading: string, data: typeof wardrobe.bride) => {
    const events = getWardrobePhotoEvents(data);
    const unlabelledPhotos: string[] = [];
    const eventPhotos = new Map<string, { label: string; photos: string[] }>();
    data.photos.forEach((photo, index) => {
      const label = events[index];
      if (!label) {
        unlabelledPhotos.push(photo);
        return;
      }
      const key = label.toLocaleLowerCase();
      const group = eventPhotos.get(key) || { label, photos: [] };
      group.photos.push(photo);
      eventPhotos.set(key, group);
    });
    if (unlabelledPhotos.length || data.links.length || data.notes.trim()) {
      boards.push({ heading, data: { ...data, photos: unlabelledPhotos } });
    }
    for (const { label, photos } of eventPhotos.values()) {
      boards.push({
        heading: `${heading} — ${label} Outfits`,
        data: { ...data, photos, links: [], notes: "", photoEvents: undefined },
      });
    }
  };
  if (wardrobe.legacyShared) addWardrobeBoards("Wedding outfit references", wardrobe.legacyShared);
  addWardrobeBoards(`${p1} — Bride's wardrobe`, wardrobe.bride);
  addWardrobeBoards(`${p2} — Groom's wardrobe`, wardrobe.groom);
  // Preserve legacy references that coexist with newer partner-specific boards without inventing ownership.
  if (!wardrobe.legacyShared && a.weddingOutfits && (a.weddingOutfits.images?.length || a.weddingOutfits.links?.length || a.weddingOutfits.notes?.trim())) {
    const knownPhotos = new Set(boards.flatMap(b => b.data.photos));
    const knownLinks = new Set(boards.flatMap(b => b.data.links));
    const legacy = { photos: strings(a.weddingOutfits.images).filter(s => !knownPhotos.has(s)), links: strings(a.weddingOutfits.links).filter(s => !knownLinks.has(s)), notes: a.weddingOutfits.notes || "" };
    if (legacy.photos.length || legacy.links.length || legacy.notes.trim()) boards.push({ heading: "Shared outfit references", data: legacy });
  }
  if (boards.length) {
    page("wardrobe", "divider", "Wedding Wardrobe", { subtitle: "Moodboard" });
    boards.forEach(b => addContent("wardrobe", b.heading, b.data.photos, b.data.links, b.data.notes));
  }

  const ref = a.q12_references;
  const extraPhotos = [
    ...strings(a.q23_oneLastThing?.images),
    ...strings(a.partnerAnswers?.partnerA?.q23_oneLastThing?.images),
    ...strings(a.partnerAnswers?.partnerB?.q23_oneLastThing?.images),
  ];
  if (ref?.images?.length || ref?.links?.length || ref?.notes?.trim() || extraPhotos.length) {
    page("inspiration", "divider", "Inspo Pictures and Film", { subtitle: "Moodboard" });
    const isFilm = (link: string) => {
      try {
        const u = new URL(link);
        return /(^|\.)(youtu\.be|youtube\.com|vimeo\.com)$/.test(u.hostname) || /\/reels?\//i.test(u.pathname);
      } catch { return false; }
    };
    addContent("inspiration", "Inspo Pictures", strings(ref?.images), strings(ref?.links).filter(l => !isFilm(l)), "");
    addContent("inspiration", "Inspo Film", [], strings(ref?.links).filter(isFilm), "");
    addContent("inspiration", "Reference notes", [], [], ref?.notes || "");
    addContent("inspiration", "Additional visual references", [...new Set(extraPhotos)], [], "");
  }

  const family = getGroupedQ10People(a.q10_people);
  const total = family.totalMembers;
  if (total || family.totalPhotos || family.legacyTreeNotes || family.bride.notes || family.groom.notes) {
    page("family", "divider", "Family Tree", { subtitle: "The people who matter" });
    const addPeople = (heading: string, subject: string | undefined, side: "bride" | "groom" | "shared", people: FamilyMember[]) => {
      const groups: MoodboardPerson["group"][] = ["Grandparents", "Parents", "Siblings", "Family & friends", "Relationship not specified"];
      for (const group of groups) {
        const members = people.filter(m => familyGroup(m.relationship) === group);
        const batchSize = members.some(m => m.name.length > 65 || m.relationship.length > 40) ? 3 : 6;
        chunks(members, batchSize).forEach((batch, i) => page("family", "family", heading, {
          subject, side, group, subtitle: `${group}${i ? ` · Continued ${i + 1}` : ""}`,
          people: batch.map(m => ({ ...m, group })),
        }));
      }
    };
    for (const [side, subject, heading] of [["groom", p2, "Groom's Family Tree"], ["bride", p1, "Bride's Family Tree"]] as const) {
      addPeople(heading, subject, side, family[side].members);
      for (const batch of chunks(family[side].photos, 6)) page("family", "gallery", `${subject} — Family references`, {
        images: batch.map(p => ({ id: p.id, src: p.url, label: p.caption?.trim() || "Family reference" })),
      });
      addContent("family", `${subject} — Family notes`, [], [], family[side].notes);
    }
    addPeople("Shared / unassigned people", undefined, "shared", family.sharedMembers);
    addContent("family", "Shared family references", family.legacyTreePhotoUrl ? [family.legacyTreePhotoUrl] : [], [], family.legacyTreeNotes);
  }
  const imageCount = pages.reduce((n, p) => n + p.images.length + p.people.filter(m => m.photoUrl).length, 0);
  return { title, filename: `OAKS_Wedding_Moodboard_${p1}_${p2}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_"), pages, imageCount, personCount: total };
}
