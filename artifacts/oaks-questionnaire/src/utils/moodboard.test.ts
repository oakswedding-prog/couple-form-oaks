import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import type { QuestionnaireAnswers, SubmissionRecord, FamilyMember } from "../types/questionnaire.ts";
import { buildMoodboardDocument, familyGroup, paginateNotes } from "../moodboard/document.ts";
import { buildMoodboardScene, wrapText } from "../moodboard/layout.ts";
import { containImage, safeExternalLink } from "../moodboard/geometry.ts";
import { renderMoodboardPdf } from "../moodboard/renderPdf.ts";
import { renderMoodboardPptx } from "../moodboard/renderPptx.ts";
import type { MoodboardDocument } from "../moodboard/types.ts";

function submission(answers: Partial<QuestionnaireAnswers> = {}): SubmissionRecord {
  return {
    id: "moodboard-test-only", partner1: "Maya", partner2: "Leo", weddingDate: "2027-01-01",
    phone: "", email: "", submittedAt: "2026-01-01",
    answers: { partner1: "Maya", partner2: "Leo", q10_people: { familyMembers: [], treeNotes: "" }, ...answers } as QuestionnaireAnswers,
  };
}
function people(side: FamilyMember["side"], count: number): FamilyMember[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${side}-${i}`, side, name: `Person ${side} ${i + 1}`, relationship: i % 3 ? "Close friend" : "Mother",
    mustCapture: i === 0, photoUrl: i % 5 ? `test-${side}-${i}.jpg` : undefined,
  }));
}
const sources = (doc: MoodboardDocument) => doc.pages.flatMap(p => [...p.images.map(i => i.src), ...p.people.flatMap(m => m.photoUrl ? [m.photoUrl] : [])]);

test("moodboard uses actual photos, correct section order, legacy and split assets without mutating the submission", () => {
  const record = submission({
    fillMode: "separate", couplePhotoUrl: "couple.jpg",
    q10_people: {
      familyMembers: [...people("bride", 17), ...people("groom", 19), ...people("both", 2)],
      brideSide: { photos: [{ id: "sketch", url: "bride-sketch.jpg", caption: "Aunt and Uncle" }], notes: "" },
      treePhotoUrl: "shared-tree.jpg", treeNotes: "",
    },
    decorEvents: [
      { id: "wedding", name: "Wedding", images: ["wedding.jpg"], links: [], notes: "" },
      { id: "mehendi", name: "Mehendi", images: Array.from({ length: 14 }, (_, i) => `mehendi-${i}.jpg`), links: [], notes: "" },
      { id: "s-a", name: "Maya's Sangeet", splitSide: "partnerA", splitGroupId: "s", images: ["maya-sangeet.jpg"], links: [], notes: "" },
      { id: "s-b", name: "Leo's Sangeet", splitSide: "partnerB", splitGroupId: "s", images: ["leo-sangeet.jpg"], links: [], notes: "" },
    ],
    wardrobe: {
      bride: { photos: ["bride-outfit.jpg"], photoEvents: ["Mehendi"], links: [], notes: "Ivory silk" },
      groom: { photos: ["groom-outfit.jpg"], photoEvents: ["Cocktail"], links: [], notes: "" },
    },
    weddingOutfits: { images: ["legacy-outfit.jpg"], links: [], notes: "" },
    q12_references: { images: ["inspiration.jpg"], links: ["https://youtu.be/demo", "https://www.instagram.com/reel/abc/", "https://pinterest.com/pin/123"], notes: "" },
    q23_oneLastThing: { images: ["shared-extra.jpg"], notes: "" },
    partnerAnswers: { partnerA: { q23_oneLastThing: { images: ["maya-extra.jpg"], notes: "" } }, partnerB: { q23_oneLastThing: { images: ["leo-extra.jpg"], notes: "" } } },
  });
  const before = JSON.stringify(record);
  const doc = buildMoodboardDocument(record);
  assert.deepEqual([...new Set(doc.pages.map(p => p.section))], ["cover", "decor", "wardrobe", "inspiration", "family"]);
  assert.equal(doc.pages.filter(p => p.section === "decor" && p.kind === "gallery")[0].title, "Mehendi");
  const brideWardrobePage = doc.pages.find(p => p.title.includes("Maya") && p.title.includes("Mehendi Outfits"));
  const groomWardrobePage = doc.pages.find(p => p.title.includes("Leo") && p.title.includes("Cocktail Outfits"));
  assert.deepEqual(brideWardrobePage?.images.map(image => image.src), ["bride-outfit.jpg"]);
  assert.deepEqual(groomWardrobePage?.images.map(image => image.src), ["groom-outfit.jpg"]);
  const sharedLegacyPage = doc.pages.find(p => p.title === "Shared outfit references");
  assert.deepEqual(sharedLegacyPage?.images.map(image => image.src), ["legacy-outfit.jpg"]);
  const allPeople = doc.pages.flatMap(p => p.people);
  assert.equal(allPeople.length, 38);
  assert.equal(new Set(allPeople.map(p => p.id)).size, 38);
  assert.equal(doc.personCount, 38);
  for (const page of doc.pages.filter(p => p.kind === "family")) {
    assert.ok(page.people.length <= 6);
    assert.ok(page.people.every(p => p.side === (page.side === "shared" ? "both" : page.side)));
  }
  const familyPages = doc.pages.filter(p => p.kind === "family");
  assert.equal(familyPages[0].side, "groom");
  for (const src of ["couple.jpg", "bride-sketch.jpg", "shared-tree.jpg", "bride-outfit.jpg", "groom-outfit.jpg", "legacy-outfit.jpg", "inspiration.jpg", "shared-extra.jpg", "maya-extra.jpg", "leo-extra.jpg", "maya-sangeet.jpg", "leo-sangeet.jpg", ...Array.from({length:14},(_,i)=>`mehendi-${i}.jpg`)]) assert.ok(sources(doc).includes(src), src);
  assert.equal(doc.imageCount, sources(doc).length);
  const films = doc.pages.filter(p => p.title.includes("Inspo Film")).flatMap(p => p.links);
  assert.deepEqual(films, ["https://youtu.be/demo", "https://www.instagram.com/reel/abc/"]);
  assert.equal(JSON.stringify(record), before);
});

test("unknown relationships and shared people are never assigned a guessed family connection", () => {
  for (const rel of ["", "Other", "unknown", "relative"]) assert.equal(familyGroup(rel), "Relationship not specified");
  assert.equal(familyGroup("Grandmother"), "Grandparents");
  assert.equal(familyGroup("Father"), "Parents");
  assert.equal(familyGroup("Sister"), "Siblings");
  assert.equal(familyGroup("Aunt"), "Family & friends");
  const doc = buildMoodboardDocument(submission({ q10_people: { familyMembers: [
    { ...people("sideA", 1)[0], relationship: "" },
    { ...people("sideB", 1)[0], relationship: "Sister" },
    { ...people("both", 1)[0], relationship: "Mother" },
  ], treeNotes: "" } }));
  const unknown = doc.pages.find(p => p.group === "Relationship not specified")!;
  const scene = buildMoodboardScene(unknown, 0, 1);
  // Only footer separator: there must be no family connectors.
  assert.equal(scene.elements.filter(e => e.type === "line").length, 1);
  assert.equal(unknown.side, "bride");
  const shared = doc.pages.find(p => p.side === "shared")!;
  assert.equal(buildMoodboardScene(shared, 0, 1).elements.filter(e => e.type === "line").length, 1);
});

test("collaborative decor map wins over stale arrays, including deletions and order", () => {
  const doc = buildMoodboardDocument(submission({
    decorEventsMap: {
      a: { id: "a", name: "Wedding", order: 0, notes: "", linksById: {}, imagesById: { one: "fresh.jpg" } },
      b: { id: "b", name: "Removed", deleted: true, order: 1, notes: "", linksById: {}, imagesById: { old: "deleted.jpg" } },
    },
    decorEvents: [{ id:"a", name:"Wedding", notes:"", links:[], images:["stale.jpg"] }, { id:"b", name:"Removed", notes:"", links:[], images:["deleted.jpg"] }],
  }));
  assert.ok(sources(doc).includes("fresh.jpg"));
  assert.ok(!sources(doc).includes("stale.jpg"));
  assert.ok(!sources(doc).includes("deleted.jpg"));
});

test("empty, notes-only and legacy submissions do not generate empty section pages", () => {
  const empty = buildMoodboardDocument(submission());
  assert.equal(empty.pages.length, 1);
  const legacy = buildMoodboardDocument(submission({
    decorMoodBoard: { images: ["legacy-decor.jpg"], links: [], notes: "" },
    weddingOutfits: { images: ["legacy-outfit.jpg"], links: [], notes: "" },
  }));
  assert.deepEqual(sources(legacy), ["legacy-decor.jpg", "legacy-outfit.jpg"]);
  for (const page of legacy.pages.filter(p => p.kind !== "divider" && p.kind !== "cover")) assert.ok(page.images.length || page.lines.length || page.links.length || page.people.length);
  assert.equal(buildMoodboardDocument(submission({ q12_references: { images:[], links:[], notes: "Muted colours" } })).pages.filter(p => p.section === "inspiration").length, 2);
});

test("long names, notes and multiple photos remain inside page boundaries", () => {
  const record = submission({
    q10_people: { treeNotes: "", familyMembers: people("bride", 15).map(p => ({...p, name: `${p.name} With A Very Long Family Name And Several More Names In Full`, relationship: "Close friend"})) },
    q12_references: { images:Array.from({length:15},(_,i)=>`${i}.jpg`), links:["https://example.com/" + "W".repeat(2000), ...Array.from({length:9},(_,i)=>`https://example.com/${i}/${"a".repeat(300)}`)], notes: "A thoughtful short reference. ".repeat(100) },
  });
  const doc = buildMoodboardDocument(record);
  const noteWords = paginateNotes(record.answers.q12_references.notes).flat().join(" ").split(/\s+/);
  assert.equal(noteWords.length, record.answers.q12_references.notes.trim().split(/\s+/).length);
  assert.ok(wrapText("WWWWWWWWWWWWWWWWWW", 100, 20).length > 1);
  for (const [index, page] of doc.pages.entries()) {
    const scene = buildMoodboardScene(page, index, doc.pages.length);
    assert.equal(scene.width / scene.height, 16 / 9);
    for (const el of scene.elements) {
      assert.ok(el.x >= 0 && el.y >= 0, `${page.title}: positive position`);
      if (el.type !== "line") {
        assert.ok(el.w > 0 && el.h > 0, `${page.title}: positive bounds`);
        assert.ok(el.y + el.h <= 810, `${page.title}: ${el.type} beyond bottom (${el.y+el.h})`);
        assert.ok(el.x + el.w <= 1440.1, `${page.title}: beyond right edge`);
      }
    }
  }
});

test("images are contained at original aspect ratio and export hyperlinks allow only web URLs", () => {
  assert.deepEqual(containImage({x:0,y:0,w:400,h:200},100,200), {x:150,y:0,w:100,h:200});
  assert.deepEqual(containImage({x:0,y:0,w:200,h:400},400,100), {x:0,y:175,w:200,h:50});
  assert.equal(safeExternalLink("javascript:alert(1)"), undefined);
  assert.equal(safeExternalLink("https://example.com"), "https://example.com/");
});

test("PDF and editable PPTX files contain every page, event labels, and original photos; missing media fails explicitly", async () => {
  const doc = buildMoodboardDocument(submission({
    q12_references: { images:["test-pixel"], links:["https://example.com/reference"], notes:"Café reference" },
    wardrobe: { bride: { photos:["test-pixel"], photoEvents:["Mehendi"], links:[], notes:"" }, groom: { photos:[], links:[], notes:"" } },
    q10_people: {familyMembers:[{id:"1",name:"Zoë Müller",side:"bride",relationship:"Mother",mustCapture:true}],treeNotes:""},
  }));
  const scenes = doc.pages.map((p,i)=>buildMoodboardScene(p,i,doc.pages.length));
  const wardrobePage = doc.pages.find(p => p.title.includes("Mehendi Outfits"))!;
  assert.ok(buildMoodboardScene(wardrobePage, doc.pages.indexOf(wardrobePage), doc.pages.length).elements.some(
    element => element.type === "text" && element.text.includes("Mehendi Outfits"),
  ));
  const data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVQI12Nc2R7FwMAAAAgPAYyA+b7LAAAAAElFTkSuQmCC";
  const assets = new Map([["test-pixel",{ data, width:2, height:1, format:"PNG" as const }]]);
  const serif = readFileSync(new URL("../../public/fonts/OAKS-Serif.ttf", import.meta.url)).toString("base64");
  const sans = readFileSync(new URL("../../public/fonts/OAKS-Sans.ttf", import.meta.url)).toString("base64");
  const pdf = renderMoodboardPdf(scenes, assets, {serif,sans});
  assert.equal(pdf.getNumberOfPages(), doc.pages.length);
  const out = resolve("../../generated-artifacts/moodboard-tests");
  mkdirSync(out, { recursive:true });
  const pdfPath = `${out}/moodboard.pdf`;
  writeFileSync(pdfPath, Buffer.from(pdf.output("arraybuffer")));
  const pdfText = execFileSync("pdftotext", [pdfPath, "-"]).toString();
  assert.match(pdfText, /Zoë Müller/);
  assert.match(pdfText, /Café reference/);
  assert.match(pdfText, /Mehendi Outfits/);
  const pptx = renderMoodboardPptx(scenes, assets, doc.title);
  const bytes = await pptx.write({ outputType: "nodebuffer" });
  const pptxPath = `${out}/moodboard.pptx`;
  writeFileSync(pptxPath, bytes as Buffer);
  const entries = execFileSync("unzip", ["-Z1",pptxPath]).toString().split("\n");
  assert.equal(entries.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, doc.pages.length);
  assert.ok(entries.some(n=>n.startsWith("ppt/media/")));
  const allXml = execFileSync("unzip", ["-p",pptxPath,"ppt/slides/slide*.xml"]).toString();
  assert.match(allXml, /Zoë Müller/);
  assert.match(allXml, /Mehendi Outfits/);
  assert.match(allXml, /<a:t>MOTHER/); // editable text, not a flattened screenshot
  assert.match(allXml, /<p:pic>/);
  assert.throws(() => renderMoodboardPdf(scenes, new Map(), {serif,sans}), /Image unavailable/);
});
