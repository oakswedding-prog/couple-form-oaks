/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubmissionRecord } from "../types/questionnaire.ts";
import { STUDIO_NAME } from "../constants.ts";
import {
  isOutdatedEditorialBrief,
  synthesizeEditorialBrief,
} from "./editorialBriefGenerator.ts";
import {
  synthesizeInterviewQuestions,
  parseInterviewDocument,
} from "./interviewQuestionsGenerator.ts";
import {
  synthesizeCheatSheet,
  parseCheatSheetDocument,
} from "./cheatSheetGenerator.ts";
import { upgradeCoupleLetterIfNeeded } from "./coupleLetterGenerator.ts";
import {
  loadImageAsDataUrl,
  loadImageAsUint8Array,
} from "./imageLoader.ts";
import { getGroupedQ10People } from "./familyPeople.ts";
import { getGroupedWardrobe } from "./wardrobe.ts";
import { getGroupedDecorEvents } from "./decorEvents.ts";
import {
  hasUnresolvedMediaPaths,
  resolveSubmissionMedia,
} from "../lib/submissions.ts";
import {
  getLabelledOverlayDisplay,
  hasSplitOverlayAnswers,
  OverlayFieldKey,
} from "./splitModeHelpers.ts";

function formatSplitTextForExport(
  answers: SubmissionRecord["answers"],
  key: OverlayFieldKey,
  legacyText: string,
  separator: string = "\n"
): string {
  const disp = getLabelledOverlayDisplay(answers, key);
  if (!disp.isSplit) return legacyText;
  return [
    `${disp.partnerALabel}: ${disp.partnerAValue || "Not answered"}`,
    `${disp.partnerBLabel}: ${disp.partnerBValue || "Not answered"}`,
  ].join(separator);
}

function getAllQ27ImagesForExport(answers: SubmissionRecord["answers"]): string[] {
  const urls: string[] = [];
  if (hasSplitOverlayAnswers(answers, "q23_oneLastThing")) {
    urls.push(...(answers.partnerAnswers?.partnerA?.q23_oneLastThing?.images || []));
    urls.push(...(answers.partnerAnswers?.partnerB?.q23_oneLastThing?.images || []));
  }
  urls.push(...(answers.q23_oneLastThing?.images || []));
  return Array.from(new Set(urls.filter(Boolean)));
}

async function ensureExportMediaResolved(
  submission: SubmissionRecord
): Promise<SubmissionRecord> {
  if (!hasUnresolvedMediaPaths(submission)) return submission;
  try {
    return await resolveSubmissionMedia(submission);
  } catch {
    return submission;
  }
}

/**
 * Downloads a binary blob as a named file in the browser.
 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export submission as branded PDF using jsPDF
 */
export async function exportToPdf(rawSubmission: SubmissionRecord) {
  const [submission, { jsPDF }] = await Promise.all([
    ensureExportMediaResolved(rawSubmission),
    import("jspdf"),
  ]);
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const p1 = submission.partner1 || "Partner 1";
  const p2 = submission.partner2 || "Partner 2";
  const title = `${p1} & ${p2}`;
  const displayLabel = submission.displayId || "OAKS";
  const filename = `${displayLabel}_${p1}_${p2}_OAKS_Brief.pdf`.replace(/[^a-zA-Z0-9_-]/g, "_");

  let y = 18;
  const left = 16;
  const pageWidth = 210;
  const contentWidth = 178;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(176, 141, 87); // Gold #B08D57
  doc.text(`${STUDIO_NAME.toUpperCase()} · SHOOT DAY CHEAT SHEET`, left, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(submission.displayId || "Unnumbered", pageWidth - left - 22, y);

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(26, 26, 26);
  doc.text(title, left, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  const weddingStr = submission.weddingDate
    ? `Wedding Date: ${submission.weddingDate}`
    : "Wedding Date: TBD";
  const contactStr = [submission.phone, submission.email].filter(Boolean).join("  ·  ");
  doc.text(`${weddingStr}  |  ${contactStr}`, left, y);

  y += 4;
  doc.setDrawColor(26, 26, 26);
  doc.setLineWidth(0.6);
  doc.line(left, y, left + contentWidth, y);

  y += 8;

  // PAGE 1: SHOOT DAY CHEAT SHEET (30–60s Crew Production Cue Sheet)
  const isOutdatedCheatSheet = Boolean(
    !submission.cheatSheet ||
      submission.cheatSheet.includes("Who will cry first:") ||
      submission.cheatSheet.includes("Camera Versatility:") ||
      submission.cheatSheet.includes("Quiet Notes & Surprises") ||
      !submission.cheatSheet.includes("01 — THE VIBE") ||
      !submission.cheatSheet.includes("02 — TOP PRIORITIES")
  );
  const cheatSheetText = isOutdatedCheatSheet
    ? synthesizeCheatSheet(submission.answers)
    : submission.cheatSheet!;
  const cheatSheetDoc = parseCheatSheetDocument(cheatSheetText, p1, p2);

  // 01 — THE VIBE (Across Top)
  doc.setFillColor(250, 248, 245);
  doc.rect(left, y, contentWidth, 20, "F");
  doc.setDrawColor(229, 221, 210);
  doc.rect(left, y, contentWidth, 20, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(176, 141, 87);
  doc.text("01 — THE VIBE", left + 3.5, y + 4.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(26, 26, 26);
  doc.text(cheatSheetDoc.vibeWords, left + 38, y + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(45, 45, 45);
  const vibeWrapped = doc.splitTextToSize(cheatSheetDoc.vibeDescription, contentWidth - 7);
  doc.text(vibeWrapped, left + 3.5, y + 9.5);
  y += 23;

  // Left & Right Columns
  const colW = 86;
  const colGap = 6;
  const col2X = left + colW + colGap;
  const colStartY = y;

  // LEFT COL: 02 - TOP PRIORITIES & 05 - PLEASE AVOID
  let leftY = colStartY;

  // 02 - TOP PRIORITIES
  doc.setFillColor(250, 248, 245);
  doc.rect(left, leftY, colW, 46, "F");
  doc.setDrawColor(229, 221, 210);
  doc.rect(left, leftY, colW, 46, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(176, 141, 87);
  doc.text("02 — TOP PRIORITIES", left + 3.5, leftY + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 40);
  let pY = leftY + 9.5;
  cheatSheetDoc.topPriorities.slice(0, 4).forEach((item) => {
    const wrapped = doc.splitTextToSize(`• ${item}`, colW - 6);
    doc.text(wrapped, left + 3.5, pY);
    pY += wrapped.length * 3.4 + 1.2;
  });
  leftY += 49;

  // 05 - PLEASE AVOID
  doc.setFillColor(254, 242, 242);
  doc.rect(left, leftY, colW, 46, "F");
  doc.setDrawColor(254, 202, 202);
  doc.rect(left, leftY, colW, 46, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(185, 28, 28);
  doc.text("05 — PLEASE AVOID", left + 3.5, leftY + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(50, 20, 20);
  let aY = leftY + 9.5;
  cheatSheetDoc.pleaseAvoid.slice(0, 4).forEach((item) => {
    const wrapped = doc.splitTextToSize(`✕ ${item}`, colW - 6);
    doc.text(wrapped, left + 3.5, aY);
    aY += wrapped.length * 3.4 + 1.2;
  });
  leftY += 49;

  // RIGHT COL: 03 - MUST-CAPTURE & 04 - IMPORTANT PEOPLE
  let rightY = colStartY;

  // 03 - MUST-CAPTURE MOMENTS
  doc.setFillColor(250, 248, 245);
  doc.rect(col2X, rightY, colW, 46, "F");
  doc.setDrawColor(229, 221, 210);
  doc.rect(col2X, rightY, colW, 46, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(176, 141, 87);
  doc.text("03 — MUST-CAPTURE MOMENTS", col2X + 3.5, rightY + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 40);
  let mY = rightY + 9.5;
  cheatSheetDoc.mustCaptureMoments.slice(0, 5).forEach((item) => {
    const wrapped = doc.splitTextToSize(`* ${item}`, colW - 6);
    doc.text(wrapped, col2X + 3.5, mY);
    mY += wrapped.length * 3.3 + 1;
  });
  rightY += 49;

  // 04 - IMPORTANT PEOPLE
  doc.setFillColor(250, 248, 245);
  doc.rect(col2X, rightY, colW, 46, "F");
  doc.setDrawColor(229, 221, 210);
  doc.rect(col2X, rightY, colW, 46, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(176, 141, 87);
  doc.text("04 — IMPORTANT PEOPLE", col2X + 3.5, rightY + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 40);
  let famY = rightY + 9.5;
  cheatSheetDoc.importantPeople.slice(0, 5).forEach((p) => {
    const sidePrefix =
      p.side === "bride" ? "[Bride] " : p.side === "groom" ? "[Groom] " : "";
    doc.text(`• ${sidePrefix}${p.name} — ${p.relationship}`, col2X + 3.5, famY);
    famY += 3.8;
  });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.8);
  doc.setTextColor(80, 80, 80);
  const noteWrapped = doc.splitTextToSize(cheatSheetDoc.importantPeopleNote, colW - 6);
  doc.text(noteWrapped, col2X + 3.5, famY + 1.5);
  rightY += 49;

  y = Math.max(leftY, rightY) + 1;

  // 06 — WORKING WITH THE COUPLE (Across bottom)
  doc.setFillColor(250, 248, 245);
  doc.rect(left, y, contentWidth, 22, "F");
  doc.setDrawColor(229, 221, 210);
  doc.rect(left, y, contentWidth, 22, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(176, 141, 87);
  doc.text("06 — WORKING WITH THE COUPLE", left + 3.5, y + 4.5);

  let workX = left + 3.5;
  const workCellW = (contentWidth - 7) / Math.max(1, cheatSheetDoc.workingWithCouple.length);
  cheatSheetDoc.workingWithCouple.forEach((w) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(176, 141, 87);
    doc.text(w.label, workX, y + 9.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(30, 30, 30);
    const valWrapped = doc.splitTextToSize(w.value, workCellW - 3);
    doc.text(valWrapped, workX, y + 13.5);
    workX += workCellW;
  });
  y += 25;

  // TECHNICAL NON-NEGOTIABLE (if present)
  if (cheatSheetDoc.technicalNonNegotiable) {
    doc.setFillColor(255, 249, 238);
    doc.rect(left, y, contentWidth, 14, "F");
    doc.setDrawColor(176, 141, 87);
    doc.setLineWidth(0.4);
    doc.rect(left, y, contentWidth, 14, "D");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(176, 141, 87);
    doc.text("TECHNICAL NON-NEGOTIABLE", left + 3.5, y + 4.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(26, 26, 26);
    const techWrapped = doc.splitTextToSize(cheatSheetDoc.technicalNonNegotiable, contentWidth - 7);
    doc.text(techWrapped, left + 3.5, y + 9);
  }

  // PAGE 2: THE COUPLE LETTER — OUR UNDERSTANDING OF YOUR WEDDING
  const { letter: coupleLetterText } = upgradeCoupleLetterIfNeeded(
    submission.coupleLetter,
    submission.answers
  );
  doc.addPage();
  y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(176, 141, 87);
  doc.text(`${STUDIO_NAME.toUpperCase()} · THE COUPLE LETTER`, left, y);

  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(26, 26, 26);
  doc.text("Our Understanding of Your Wedding", left, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`A personalized message from OAKS Wedding for ${title}`, left, y);

  y += 4;
  doc.setDrawColor(229, 221, 210);
  doc.setLineWidth(0.4);
  doc.line(left, y, left + contentWidth, y);
  y += 8;

  const letterLines = coupleLetterText.split("\n");
  letterLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      y += 2.5;
      return;
    }
    const isSectionHeading = /^\d{2}\s*—/.test(trimmed) || trimmed.startsWith("### ");
    if (isSectionHeading) {
      if (y > 255) {
        doc.addPage();
        y = 20;
      }
      y += 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(176, 141, 87);
      doc.text(trimmed.replace(/^###\s+/, ""), left, y);
      y += 5.5;
    } else if (
      trimmed.startsWith("THE COUPLE LETTER") ||
      trimmed.startsWith("---") ||
      trimmed.includes("====") ||
      trimmed.startsWith("Our Understanding of Your Wedding") ||
      trimmed === `${p1.toUpperCase()} & ${p2.toUpperCase()}`
    ) {
      // skip repeated banner headers
    } else {
      if (y > 268) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(45, 45, 45);
      const wrapped = doc.splitTextToSize(trimmed, contentWidth);
      doc.text(wrapped, left, y);
      y += wrapped.length * 4.2 + 2;
    }
  });

  // PAGE 3: EDITORIAL CREATIVE BRIEF (ALL 27 QUESTIONS)
  const briefText = isOutdatedEditorialBrief(submission.editorialBrief)
    ? synthesizeEditorialBrief(submission.answers)
    : (submission.editorialBrief as string);
  doc.addPage();
  y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(176, 141, 87);
  doc.text(`${STUDIO_NAME.toUpperCase()} · EDITORIAL CREATIVE BRIEF`, left, y);

  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(26, 26, 26);
  doc.text(`The Couple Story & Creative Direction`, left, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`${title} · All 27 questionnaire answers summarised across 6 chapters`, left, y);

  y += 4;
  doc.setDrawColor(229, 221, 210);
  doc.setLineWidth(0.4);
  doc.line(left, y, left + contentWidth, y);
  y += 8;

  const briefLines = briefText.split("\n");
  briefLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      y += 2;
      return;
    }
    const isChapterHeading =
      /^CHAPTER\s+\d+/i.test(trimmed) ||
      /^\d{2}\s*—/.test(trimmed) ||
      trimmed === "THE FINAL THOUGHT" ||
      trimmed.startsWith("### ");
    const isQuestionHeading = /^Q\d{2}\.\s+/.test(trimmed);

    if (isChapterHeading) {
      if (y > 255) {
        doc.addPage();
        y = 20;
      }
      y += 3.5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(176, 141, 87);
      doc.text(trimmed.replace(/^###\s+/, ""), left, y);
      y += 5.5;
    } else if (isQuestionHeading) {
      if (y > 262) {
        doc.addPage();
        y = 20;
      }
      y += 1.5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(26, 26, 26);
      const wrappedQ = doc.splitTextToSize(trimmed, contentWidth);
      doc.text(wrappedQ, left, y);
      y += wrappedQ.length * 4.2 + 1;
    } else if (
      trimmed.startsWith("OAKS WEDDING") ||
      trimmed.startsWith("---") ||
      trimmed.includes("====") ||
      trimmed.startsWith("EDITORIAL CREATIVE BRIEF") ||
      trimmed === "THE COUPLE STORY & WEDDING BRIEF" ||
      trimmed === `${p1.toUpperCase()} & ${p2.toUpperCase()}`
    ) {
      // skip title banner lines and divider bars
    } else {
      if (y > 268) {
        doc.addPage();
        y = 20;
      }
      const isNotProvided = trimmed === "- Not provided" || trimmed === "Not provided";
      doc.setFont("helvetica", isNotProvided ? "italic" : "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(isNotProvided ? 130 : 45, isNotProvided ? 125 : 45, isNotProvided ? 118 : 45);
      const wrapped = doc.splitTextToSize(trimmed, contentWidth - 4);
      doc.text(wrapped, left + 2, y);
      y += wrapped.length * 4 + 1.5;
    }
  });

  // PAGE 3: 11 COUPLE INTERVIEW & TESTIMONIAL QUESTIONS
  const isOutdatedInterviewV1 = Boolean(
    submission.interviewQuestions &&
      (submission.interviewQuestions.includes("rushing through your chest") ||
        submission.interviewQuestions.includes("eyes tell you that words never could") ||
        submission.interviewQuestions.includes("mean to your souls") ||
        submission.interviewQuestions.includes("paths first crossed ("))
  );
  const interviewText = (!submission.interviewQuestions || isOutdatedInterviewV1)
    ? synthesizeInterviewQuestions(submission.answers)
    : submission.interviewQuestions;
  const interviewDoc = parseInterviewDocument(interviewText, p1, p2);
  doc.addPage();
  y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(176, 141, 87);
  doc.text(`${STUDIO_NAME.toUpperCase()} · 11 TESTIMONIAL & INTERVIEW QUESTIONS`, left, y);

  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(26, 26, 26);
  doc.text(`Videographer Interview Cue Sheet`, left, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`${title} · On-day prompts for emotional & candid soundbites`, left, y);

  y += 4;
  doc.setDrawColor(229, 221, 210);
  doc.setLineWidth(0.4);
  doc.line(left, y, left + contentWidth, y);
  y += 8;

  interviewDoc.questions.forEach((q) => {
    if (y > 255) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(176, 141, 87);
    doc.text(`Q${String(q.number).padStart(2, "0")} — ${q.title}  [Ask: ${q.askTarget}]`, left, y);
    y += 4.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);
    const qWrapped = doc.splitTextToSize(`"${q.question}"`, contentWidth - 4);
    doc.text(qWrapped, left + 2, y);
    y += qWrapped.length * 4 + 1.5;

    if (q.followUp) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(110, 100, 90);
      const fWrapped = doc.splitTextToSize(`Follow-up cue: "${q.followUp}"`, contentWidth - 6);
      doc.text(fWrapped, left + 4, y);
      y += fWrapped.length * 3.5 + 3.5;
    } else {
      y += 2.5;
    }
  });

  // PAGE 4+: FULL ANSWERS
  doc.addPage();
  y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(26, 26, 26);
  doc.text(`Full Questionnaire Answers · ${title}`, left, y);
  y += 8;

  const ans = submission.answers;
  const threeWords = (ans.q5_threeWords || []).filter(Boolean).join(", ");
  const groupedPeople = getGroupedQ10People(ans.q10_people);
  const formatPdfSideText = (
    label: string,
    sideData: typeof groupedPeople.bride
  ): string | null => {
    const parts: string[] = [];
    if (sideData.photos.length > 0) {
      const caps = sideData.photos
        .map((ph) => ph.caption?.trim())
        .filter((c): c is string => Boolean(c));
      parts.push(
        `${sideData.photos.length} ${sideData.photos.length === 1 ? "photo" : "photos"}${
          caps.length > 0 ? ` (${caps.join(", ")})` : ""
        }`
      );
    }
    if (sideData.members.length > 0) {
      parts.push(
        sideData.members
          .map((m) => `${m.name} (${m.relationship})${m.mustCapture ? " [Must capture]" : ""}`)
          .join(", ")
      );
    }
    if (sideData.notes.trim()) {
      parts.push(`Notes: ${sideData.notes.trim()}`);
    }
    return parts.length > 0 ? `${label}: ${parts.join(" | ")}` : null;
  };
  const q10AnswerLines = [
    formatPdfSideText("Bride's Side", groupedPeople.bride),
    formatPdfSideText("Groom's Side", groupedPeople.groom),
    groupedPeople.sharedMembers.length > 0
      ? `Both Sides: ${groupedPeople.sharedMembers
          .map((m) => `${m.name} (${m.relationship})`)
          .join(", ")}`
      : null,
    groupedPeople.legacyTreeNotes ? `Notes: ${groupedPeople.legacyTreeNotes}` : null,
  ].filter((x): x is string => Boolean(x));
  const filmFeelStr = Array.isArray((ans.q11_filmFeel as any)?.selected)
    ? [
        ...((ans.q11_filmFeel as any).selected || []),
        (ans.q11_filmFeel as any).other ? `Other: ${(ans.q11_filmFeel as any).other}` : null,
      ].filter(Boolean).join(", ")
    : typeof ans.q11_filmFeel === "string"
    ? ans.q11_filmFeel
    : "N/A";
  const toneStr = Array.isArray((ans.q13_tone as any)?.selected)
    ? [
        ...((ans.q13_tone as any).selected || []),
        (ans.q13_tone as any).other ? `Other: ${(ans.q13_tone as any).other}` : null,
      ].filter(Boolean).join(", ")
    : typeof ans.q13_tone === "string"
    ? ans.q13_tone
    : "N/A";

  const groupedWardrobe = getGroupedWardrobe(ans);
  const formatWardrobePdfSideText = (
    heading: string,
    side: typeof groupedWardrobe.bride
  ): string | null => {
    const parts: string[] = [];
    if (side.notes.trim()) parts.push(`Notes: ${side.notes.trim()}`);
    if (side.links.length > 0) parts.push(`Links: ${side.links.join(", ")}`);
    if (side.photos.length > 0) parts.push(`Photos: ${side.photos.length}`);
    return parts.length > 0 ? `${heading}:\n${parts.join("\n")}` : null;
  };
  const q13PdfAnswerText = groupedWardrobe.legacyShared
    ? `Notes: ${groupedWardrobe.legacyShared.notes || "None"}\nLinks: ${groupedWardrobe.legacyShared.links.join(", ") || "None"}`
    : [
        formatWardrobePdfSideText("Bride's wardrobe", groupedWardrobe.bride) || "Bride's wardrobe: None",
        formatWardrobePdfSideText("Groom's wardrobe", groupedWardrobe.groom) || "Groom's wardrobe: None",
      ].join("\n\n");

  const groupedDecor = getGroupedDecorEvents(ans);
  const q14PdfAnswerText =
    groupedDecor.populatedEvents.length > 0
      ? groupedDecor.populatedEvents
          .map((ev) => {
            const parts: string[] = [];
            if (ev.links.length > 0) parts.push(`Links: ${ev.links.join(", ")}`);
            if (ev.notes.trim()) parts.push(`Notes: ${ev.notes.trim()}`);
            if (ev.images.length > 0) parts.push(`Images: ${ev.images.length}`);
            return `${ev.name}:\n${parts.join("\n")}`;
          })
          .join("\n\n")
      : "Not answered";

  const fullQuestions = [
    {
      q: "Q1. What do you call each other?",
      a: `${p1} calls ${p2}: "${ans.q1_calls?.aCallsB || ""}" · ${p2} calls ${p1}: "${ans.q1_calls?.bCallsA || ""}"${ans.couplePhotoUrl ? "\nCouple photo attached: Yes" : ""}`,
    },
    { q: "Q2. What do you do for living & passions?", a: `${p1}: ${ans.q2_workPassion?.partnerA || "N/A"}\n${p2}: ${ans.q2_workPassion?.partnerB || "N/A"}` },
    { q: "Q3. How did you first meet?", a: ans.q3_firstMeet || "Not answered" },
    { q: "Q4. First impression of each other?", a: `${p1}: ${ans.q4_firstImpression?.partnerA || "N/A"}\n${p2}: ${ans.q4_firstImpression?.partnerB || "N/A"}` },
    { q: "Q5. Couple in three words?", a: threeWords || "Not answered" },
    { q: "Q6. What do you enjoy doing together?", a: `${(ans.q6_activities?.selected || []).join(", ")} ${ans.q6_activities?.other || ""}` },
    { q: "Q7. What do you love most about each other?", a: `${p1}: ${ans.q7_loveMost?.partnerA || "N/A"}\n${p2}: ${ans.q7_loveMost?.partnerB || "N/A"}` },
    { q: "Q8. Funny story / inside joke?", a: ans.q8_funnyStory || "Not answered" },
    { q: "Q9. How did the proposal happen?", a: ans.q9_proposal?.story || "Not answered" },
    { q: "Q10. Family members & tree (Bride & Groom sides)", a: q10AnswerLines.join("\n") || "None" },
    { q: "Q11. Film & photo feel?", a: formatSplitTextForExport(ans, "q11_filmFeel", filmFeelStr || "Not answered") },
    { q: "Q12. References & Links", a: `Links: ${(ans.q12_references?.links || []).join(", ") || "None"}\nNotes: ${ans.q12_references?.notes || "None"}` },
    { q: "Q13. Have you finalised your wedding wardrobe? Share your outfit plans, colour preferences, and styling ideas. Knowing these details helps us plan your photography and films more thoughtfully.", a: q13PdfAnswerText },
    { q: "Q14. Wedding Decor Mood Board & References", a: q14PdfAnswerText },
    { q: "Q15. Wedding day tone?", a: formatSplitTextForExport(ans, "q13_tone", toneStr || "Not answered") },
    { q: "Q16. Moments looking forward to?", a: formatSplitTextForExport(ans, "q14_moments", `${(ans.q14_moments?.selected || []).join(", ")} ${ans.q14_moments?.other || ""}`) },
    { q: "Q17. Definitely capture / avoid?", a: formatSplitTextForExport(ans, "q15_captureAvoid", `Capture: ${ans.q15_captureAvoid?.definitelyCapture || "N/A"}\nAvoid: ${ans.q15_captureAvoid?.pleaseAvoid || "N/A"}`) },
    { q: "Q18. Non-negotiables?", a: formatSplitTextForExport(ans, "q16_nonNegotiables", ans.q16_nonNegotiables || "Not answered") },
    { q: "Q19. Who will be more emotional?", a: formatSplitTextForExport(ans, "q17_emotional", ans.q17_emotional || "Not answered") },
    { q: "Q20. Camera versatility?", a: formatSplitTextForExport(ans, "q18_cameraVersatility", ans.q18_cameraVersatility || "Not answered") },
    { q: "Q21. What mattered most when choosing OAKS Wedding?", a: formatSplitTextForExport(ans, "choosingOaks", ans.choosingOaks || "Not answered") },
    { q: "Q22. Guidance comfort?", a: formatSplitTextForExport(ans, "q20_guidanceComfort", ans.q20_guidanceComfort || "Not answered") },
    { q: "Q23. Comfort tips?", a: formatSplitTextForExport(ans, "q21_comfortTips", `${(ans.q21_comfortTips?.selected || []).join(", ")} ${ans.q21_comfortTips?.notes || ""}`) },
    { q: "Q24. Future film feeling?", a: formatSplitTextForExport(ans, "q22_futureFeeling", ans.q22_futureFeeling || "Not answered") },
    {
      q: "Q25. Primary point of contact?",
      a: ans.primaryContact?.role
        ? [
            `Role: ${ans.primaryContact.role}`,
            ans.primaryContact.role === "Someone else" && ans.primaryContact.side ? `Side: ${ans.primaryContact.side}` : null,
            ans.primaryContact.role === "Someone else" && (ans.primaryContact.designation || ans.primaryContact.gender)
              ? `Role designation: ${ans.primaryContact.designation || ans.primaryContact.gender}`
              : null,
            `Name: ${ans.primaryContact.name || "N/A"}`,
            `Phone / WhatsApp: ${ans.primaryContact.phone || "N/A"}`,
          ]
            .filter(Boolean)
            .join("\n")
        : "Not answered",
    },
    { q: "Q26. Your story & journey?", a: ans.loveStoryNarrative || "Not answered" },
    { q: "Q27. Is there anything else you'd like to let us know?", a: formatSplitTextForExport(ans, "q23_oneLastThing", `${ans.q23_oneLastThing?.notes || "Not answered"}`) },
  ];

  for (const item of fullQuestions) {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(26, 26, 26);
    const wrappedQuestion = doc.splitTextToSize(item.q, contentWidth);
    doc.text(wrappedQuestion, left, y);
    y += wrappedQuestion.length * 4.5 + 1;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    const splitA = doc.splitTextToSize(item.a, contentWidth);
    doc.text(splitA, left, y);
    y += splitA.length * 4.2 + 3;

    // Embed Q1 Couple Photo
    if (item.q.startsWith("Q1.") && ans.couplePhotoUrl) {
      const couplePhotoData = await loadImageAsDataUrl(ans.couplePhotoUrl);
      if (couplePhotoData) {
        if (y > 220) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(176, 141, 87);
        doc.text("Couple Photo Attached:", left, y);
        y += 4;
        try {
          doc.addImage(couplePhotoData, "JPEG", left, y, 42, 42);
          y += 46;
        } catch {
          // ignore
        }
      }
    }

    // Embed Q10 Images (Bride's Side & Groom's Side photos + legacy fallbacks)
    if (item.q.startsWith("Q10.")) {
      const renderPdfSidePhotos = async (
        sideHeading: string,
        photos: { url: string; label?: string }[]
      ) => {
        if (photos.length === 0) return;
        if (y > 222) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(176, 141, 87);
        doc.text(`${sideHeading} (${photos.length}):`, left, y);
        y += 4;

        let mx = left;
        for (const pItem of photos.slice(0, 12)) {
          const mData = await loadImageAsDataUrl(pItem.url);
          if (mData) {
            if (mx + 32 > left + contentWidth) {
              mx = left;
              y += 30;
              if (y > 250) {
                doc.addPage();
                y = 20;
              }
            }
            try {
              doc.addImage(mData, "JPEG", mx, y, 28, 21);
              if (pItem.label) {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(6.5);
                doc.setTextColor(40, 40, 40);
                doc.text(pItem.label.slice(0, 18), mx, y + 24.5);
              }
              mx += 32;
            } catch {
              // ignore
            }
          }
        }
        y += 30;
      };

      await renderPdfSidePhotos("Bride's Side Family & VIP Photos", [
        ...groupedPeople.bride.photos.map((ph, idx) => ({
          url: ph.url,
          label: ph.caption?.trim() || `Photo ${idx + 1}`,
        })),
        ...groupedPeople.bride.members
          .filter((m) => Boolean(m.photoUrl))
          .map((m) => ({ url: m.photoUrl!, label: m.name })),
      ]);

      await renderPdfSidePhotos("Groom's Side Family & VIP Photos", [
        ...groupedPeople.groom.photos.map((ph, idx) => ({
          url: ph.url,
          label: ph.caption?.trim() || `Photo ${idx + 1}`,
        })),
        ...groupedPeople.groom.members
          .filter((m) => Boolean(m.photoUrl))
          .map((m) => ({ url: m.photoUrl!, label: m.name })),
      ]);

      // Legacy tree photo fallback
      if (groupedPeople.legacyTreePhotoUrl) {
        const treeData = await loadImageAsDataUrl(groupedPeople.legacyTreePhotoUrl);
        if (treeData) {
          if (y > 215) {
            doc.addPage();
            y = 20;
          }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(176, 141, 87);
          doc.text("Family Tree / Sketch Attached:", left, y);
          y += 4;
          try {
            doc.addImage(treeData, "JPEG", left, y, 75, 48);
            y += 52;
          } catch {
            // ignore
          }
        }
      }

      // Legacy shared member photos fallback
      const sharedWithPhotos = groupedPeople.sharedMembers.filter((m) =>
        Boolean(m.photoUrl)
      );
      if (sharedWithPhotos.length > 0) {
        await renderPdfSidePhotos(
          "Mutual / Shared VIP Photos",
          sharedWithPhotos.map((m) => ({ url: m.photoUrl!, label: m.name }))
        );
      }
    }

    // Embed Q12 Images (Reference Mood Photos)
    if (item.q.startsWith("Q12.")) {
      const refImages = ans.q12_references?.images || [];
      if (refImages.length > 0) {
        if (y > 225) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(176, 141, 87);
        doc.text(`Reference Inspiration Photos (${refImages.length}):`, left, y);
        y += 4;

        let rx = left;
        for (const img of refImages.slice(0, 6)) {
          const rData = await loadImageAsDataUrl(img);
          if (rData) {
            if (rx + 42 > left + contentWidth) {
              rx = left;
              y += 32;
              if (y > 255) {
                doc.addPage();
                y = 20;
              }
            }
            try {
              doc.addImage(rData, "JPEG", rx, y, 38, 27);
              rx += 42;
            } catch {
              // ignore
            }
          }
        }
        y += 32;
      }
    }

    // Embed Q13 Images (Bride's wardrobe, Groom's wardrobe, and legacy fallback)
    if (item.q.startsWith("Q13.")) {
      const renderPdfWardrobePhotos = async (
        headingLabel: string,
        imagesList: string[]
      ) => {
        if (imagesList.length === 0) return;
        if (y > 225) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(176, 141, 87);
        doc.text(`${headingLabel} (${imagesList.length}):`, left, y);
        y += 4;

        let ox = left;
        for (const img of imagesList.slice(0, 12)) {
          const oData = await loadImageAsDataUrl(img);
          if (oData) {
            if (ox + 42 > left + contentWidth) {
              ox = left;
              y += 32;
              if (y > 255) {
                doc.addPage();
                y = 20;
              }
            }
            try {
              doc.addImage(oData, "JPEG", ox, y, 38, 27);
              ox += 42;
            } catch {
              // ignore
            }
          }
        }
        y += 32;
      };

      if (groupedWardrobe.legacyShared) {
        await renderPdfWardrobePhotos(
          "Wedding Outfit Photos",
          groupedWardrobe.legacyShared.photos
        );
      } else {
        await renderPdfWardrobePhotos(
          "Bride's wardrobe — Outfit Photos",
          groupedWardrobe.bride.photos
        );
        await renderPdfWardrobePhotos(
          "Groom's wardrobe — Outfit Photos",
          groupedWardrobe.groom.photos
        );
      }
    }

    // Embed Q14 Images (Per-event Decor Mood Board Photos in couple's order)
    if (item.q.startsWith("Q14.")) {
      for (const ev of groupedDecor.populatedEvents) {
        if (ev.images.length === 0) continue;
        if (y > 225) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(176, 141, 87);
        doc.text(`${ev.name} — Decor Mood Board Photos (${ev.images.length}):`, left, y);
        y += 4;

        let dx = left;
        for (const img of ev.images.slice(0, 12)) {
          const dData = await loadImageAsDataUrl(img);
          if (dData) {
            if (dx + 42 > left + contentWidth) {
              dx = left;
              y += 32;
              if (y > 255) {
                doc.addPage();
                y = 20;
              }
            }
            try {
              doc.addImage(dData, "JPEG", dx, y, 38, 27);
              dx += 42;
            } catch {
              // ignore
            }
          }
        }
        y += 32;
      }
    }

    // Embed Q27 Images (Attached Photos — includes both partners' images when split)
    if (item.q.startsWith("Q27.")) {
      const lastImages = getAllQ27ImagesForExport(ans);
      if (lastImages.length > 0) {
        if (y > 225) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(176, 141, 87);
        doc.text(`Attached Photos (${lastImages.length}):`, left, y);
        y += 4;

        let lx = left;
        for (const img of lastImages.slice(0, 6)) {
          const lData = await loadImageAsDataUrl(img);
          if (lData) {
            if (lx + 42 > left + contentWidth) {
              lx = left;
              y += 32;
              if (y > 255) {
                doc.addPage();
                y = 20;
              }
            }
            try {
              doc.addImage(lData, "JPEG", lx, y, 38, 27);
              lx += 42;
            } catch {
              // ignore
            }
          }
        }
        y += 32;
      }
    }

    y += 3;
  }

  doc.save(filename);
}

/**
 * Export submission as Word (.docx) document
 */
export async function exportToDocx(rawSubmission: SubmissionRecord) {
  const submission = await ensureExportMediaResolved(rawSubmission);
  const p1 = submission.partner1 || "Partner 1";
  const p2 = submission.partner2 || "Partner 2";
  const ans = submission.answers;
  const docxDisplayId = submission.displayId || "OAKS";
  const filename = `${docxDisplayId}_${p1}_${p2}_OAKS_Brief.docx`.replace(/[^a-zA-Z0-9_-]/g, "_");

  const filmFeelDocxStr = Array.isArray((ans.q11_filmFeel as any)?.selected)
    ? [
        ...((ans.q11_filmFeel as any).selected || []),
        (ans.q11_filmFeel as any).other ? `Other: ${(ans.q11_filmFeel as any).other}` : null,
      ].filter(Boolean).join(", ")
    : typeof ans.q11_filmFeel === "string"
    ? ans.q11_filmFeel
    : "Not answered";

  const toneDocxStr = Array.isArray((ans.q13_tone as any)?.selected)
    ? [
        ...((ans.q13_tone as any).selected || []),
        (ans.q13_tone as any).other ? `Other: ${(ans.q13_tone as any).other}` : null,
      ].filter(Boolean).join(", ")
    : typeof ans.q13_tone === "string"
    ? ans.q13_tone
    : "Not answered";

  const isOutdatedCheatSheetDocx = Boolean(
    !submission.cheatSheet ||
      submission.cheatSheet.includes("Who will cry first:") ||
      submission.cheatSheet.includes("Camera Versatility:") ||
      submission.cheatSheet.includes("Quiet Notes & Surprises") ||
      !submission.cheatSheet.includes("01 — THE VIBE") ||
      !submission.cheatSheet.includes("02 — TOP PRIORITIES")
  );
  const docxCheatSheetText = isOutdatedCheatSheetDocx
    ? synthesizeCheatSheet(submission.answers)
    : submission.cheatSheet!;

  const isOutdatedInterviewV1Docx = Boolean(
    submission.interviewQuestions &&
      (submission.interviewQuestions.includes("rushing through your chest") ||
        submission.interviewQuestions.includes("eyes tell you that words never could") ||
        submission.interviewQuestions.includes("mean to your souls") ||
        submission.interviewQuestions.includes("paths first crossed ("))
  );
  const docxInterviewText = (!submission.interviewQuestions || isOutdatedInterviewV1Docx)
    ? synthesizeInterviewQuestions(submission.answers)
    : submission.interviewQuestions;

  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } = await import("docx");

  // Pre-load image bytes asynchronously for embedding
  const groupedDocxPeople = getGroupedQ10People(ans.q10_people);
  const couplePhotoBytes = await loadImageAsUint8Array(ans.couplePhotoUrl);
  const treePhotoBytes = await loadImageAsUint8Array(groupedDocxPeople.legacyTreePhotoUrl);
  const brideSidePhotoBytes = await Promise.all(
    [
      ...groupedDocxPeople.bride.photos.map((ph, idx) => ({
        name: ph.caption?.trim() || `Bride's Side Photo ${idx + 1}`,
        url: ph.url,
      })),
      ...groupedDocxPeople.bride.members
        .filter((m) => Boolean(m.photoUrl))
        .map((m) => ({ name: m.name, url: m.photoUrl! })),
    ]
      .slice(0, 12)
      .map(async (item) => ({
        name: item.name,
        bytes: await loadImageAsUint8Array(item.url),
      }))
  );
  const groomSidePhotoBytes = await Promise.all(
    [
      ...groupedDocxPeople.groom.photos.map((ph, idx) => ({
        name: ph.caption?.trim() || `Groom's Side Photo ${idx + 1}`,
        url: ph.url,
      })),
      ...groupedDocxPeople.groom.members
        .filter((m) => Boolean(m.photoUrl))
        .map((m) => ({ name: m.name, url: m.photoUrl! })),
    ]
      .slice(0, 12)
      .map(async (item) => ({
        name: item.name,
        bytes: await loadImageAsUint8Array(item.url),
      }))
  );
  const sharedVipPhotoBytes = await Promise.all(
    groupedDocxPeople.sharedMembers
      .filter((m) => Boolean(m.photoUrl))
      .slice(0, 6)
      .map(async (m) => ({
        name: m.name,
        bytes: await loadImageAsUint8Array(m.photoUrl),
      }))
  );
  const refPhotoBytes = await Promise.all(
    (ans.q12_references?.images || [])
      .slice(0, 6)
      .map(async (img) => await loadImageAsUint8Array(img))
  );
  const groupedDocxWardrobe = getGroupedWardrobe(ans);
  const outfitPhotoBytes = await Promise.all(
    (groupedDocxWardrobe.legacyShared?.photos || [])
      .slice(0, 12)
      .map(async (img) => await loadImageAsUint8Array(img))
  );
  const brideOutfitPhotoBytes = await Promise.all(
    groupedDocxWardrobe.bride.photos
      .slice(0, 12)
      .map(async (img) => await loadImageAsUint8Array(img))
  );
  const groomOutfitPhotoBytes = await Promise.all(
    groupedDocxWardrobe.groom.photos
      .slice(0, 12)
      .map(async (img) => await loadImageAsUint8Array(img))
  );
  const groupedDocxDecor = getGroupedDecorEvents(ans);
  const decorEventDocxEntries = await Promise.all(
    groupedDocxDecor.populatedEvents.map(async (ev) => ({
      event: ev,
      photoBytes: await Promise.all(
        ev.images
          .slice(0, 12)
          .map(async (img) => await loadImageAsUint8Array(img))
      ),
    }))
  );
  const lastPhotoBytes = await Promise.all(
    getAllQ27ImagesForExport(ans)
      .slice(0, 12)
      .map(async (img) => await loadImageAsUint8Array(img))
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Header
          new Paragraph({
            text: `${STUDIO_NAME.toUpperCase()} · SHOOT DAY CHEAT SHEET`,
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `${p1} & ${p2} (${submission.displayId || "Unnumbered"})`, bold: true, size: 36 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Wedding Date: ${submission.weddingDate || "TBD"}`, bold: true }),
              new TextRun({ text: `  |  Phone: ${submission.phone || "N/A"}` }),
              new TextRun({ text: `  |  Email: ${submission.email || "N/A"}` }),
            ],
          }),
          new Paragraph({ text: "" }),

          // Shoot Day Cheat Sheet Section (01–06 + Technical)
          new Paragraph({
            text: "SHOOT DAY PRODUCTION CHEAT SHEET",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Quick-reference production cue sheet for ${p1} & ${p2} (30–60s scan · ~150–220 words)`,
                italics: true,
                color: "666666",
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          ...docxCheatSheetText
            .split("\n")
            .filter((l) => {
              const t = l.trim();
              return (
                !t.startsWith("OAKS WEDDING") &&
                t !== `${p1.toUpperCase()} & ${p2.toUpperCase()}` &&
                t !== "WEDDING DAY CHEAT SHEET"
              );
            })
            .map((line) => {
              const trimmed = line.trim();
              if (!trimmed) return new Paragraph({ text: "" });
              const isSectionHeading =
                /^\d{2}\s*—/.test(trimmed) || trimmed === "TECHNICAL NON-NEGOTIABLE";
              if (isSectionHeading) {
                return new Paragraph({
                  text: trimmed,
                  heading: HeadingLevel.HEADING_3,
                });
              }
              if (trimmed.startsWith("*") || trimmed.startsWith("-")) {
                return new Paragraph({
                  bullet: { level: 0 },
                  children: [
                    new TextRun({
                      text: trimmed.replace(/^[*•\-]\s*/, ""),
                    }),
                  ],
                });
              }
              return new Paragraph({
                children: [new TextRun({ text: trimmed })],
              });
            }),

          new Paragraph({ text: "" }),

          // The Couple Letter Section
          new Paragraph({
            text: "THE COUPLE LETTER — OUR UNDERSTANDING OF YOUR WEDDING",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Personalized client-facing letter for ${p1} & ${p2} (~400–600 words)`,
                italics: true,
                color: "666666",
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          ...upgradeCoupleLetterIfNeeded(
            submission.coupleLetter,
            submission.answers
          ).letter
            .split("\n")
            .filter((l) => {
              const t = l.trim();
              return (
                !t.startsWith("THE COUPLE LETTER") &&
                !t.startsWith("---") &&
                !t.includes("====") &&
                t !== "Our Understanding of Your Wedding" &&
                t !== `${p1.toUpperCase()} & ${p2.toUpperCase()}`
              );
            })
            .map((line) => {
              const t = line.trim();
              if (!t) return new Paragraph({ text: "" });
              const isSectionHeading = /^\d{2}\s*—/.test(t) || t.startsWith("### ");
              if (isSectionHeading) {
                return new Paragraph({
                  text: t.replace(/^###\s+/, ""),
                  heading: HeadingLevel.HEADING_3,
                });
              }
              return new Paragraph({
                children: [new TextRun({ text: t })],
              });
            }),

          new Paragraph({ text: "" }),

          // Editorial Creative Brief Section (All 27 Questions)
          new Paragraph({
            text: "EDITORIAL CREATIVE BRIEF",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `All 27 questionnaire answers summarised for ${p1} & ${p2} across 6 chapters`,
                italics: true,
                color: "666666",
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          ...(isOutdatedEditorialBrief(submission.editorialBrief)
            ? synthesizeEditorialBrief(submission.answers)
            : (submission.editorialBrief as string))
            .split("\n")
            .filter((l) => {
              const t = l.trim();
              return (
                !t.startsWith("OAKS WEDDING") &&
                !t.startsWith("---") &&
                !t.includes("====") &&
                !t.startsWith("EDITORIAL CREATIVE BRIEF") &&
                t !== "THE COUPLE STORY & WEDDING BRIEF" &&
                t !== `${p1.toUpperCase()} & ${p2.toUpperCase()}`
              );
            })
            .map((line) => {
              const t = line.trim();
              if (!t) return new Paragraph({ text: "" });
              const isChapterHeading =
                /^CHAPTER\s+\d+/i.test(t) ||
                /^\d{2}\s*—/.test(t) ||
                t === "THE FINAL THOUGHT" ||
                t.startsWith("### ");
              if (isChapterHeading) {
                return new Paragraph({
                  text: t.replace(/^###\s+/, ""),
                  heading: HeadingLevel.HEADING_3,
                });
              }
              const isQuestionHeading = /^Q\d{2}\.\s+/.test(t);
              if (isQuestionHeading) {
                return new Paragraph({
                  children: [new TextRun({ text: t, bold: true })],
                });
              }
              return new Paragraph({
                children: [new TextRun({ text: t })],
              });
            }),

          new Paragraph({ text: "" }),

          // 11 Testimonial & Interview Questions Section
          new Paragraph({
            text: "11 PERSONALIZED COUPLE INTERVIEW & TESTIMONIAL QUESTIONS",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `On-day documentary interview cue sheet for ${p1} & ${p2}`,
                italics: true,
                color: "666666",
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          ...parseInterviewDocument(
            docxInterviewText,
            p1,
            p2
          ).questions.flatMap((q) => [
            new Paragraph({
              children: [
                new TextRun({
                  text: `Q${String(q.number).padStart(2, "0")} — ${q.title} [Ask: ${q.askTarget}]`,
                  bold: true,
                  color: "B08D57",
                }),
              ],
            }),
            new Paragraph({
              children: [new TextRun({ text: `"${q.question}"` })],
            }),
            q.followUp
              ? new Paragraph({
                  children: [
                    new TextRun({
                      text: `Follow-up cue: "${q.followUp}"`,
                      italics: true,
                      color: "777777",
                    }),
                  ],
                })
              : new Paragraph({ text: "" }),
            new Paragraph({ text: "" }),
          ]),

          new Paragraph({ text: "" }),
          new Paragraph({
            text: "FULL QUESTIONNAIRE RESPONSES",
            heading: HeadingLevel.HEADING_2,
          }),

          // Q1
          new Paragraph({ children: [new TextRun({ text: "1. What do you call each other?", bold: true })] }),
          new Paragraph({ text: `${p1} calls ${p2}: "${ans.q1_calls?.aCallsB || ""}" · ${p2} calls ${p1}: "${ans.q1_calls?.bCallsA || ""}"` }),
          ...(couplePhotoBytes
            ? [
                new Paragraph({
                  children: [new TextRun({ text: "Couple Photo Attached:", bold: true, italics: true })],
                }),
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: couplePhotoBytes,
                      transformation: { width: 160, height: 160 },
                      type: "jpg",
                    }),
                  ],
                }),
              ]
            : []),
          new Paragraph({ text: "" }),

          // Q2
          new Paragraph({ children: [new TextRun({ text: "2. Work & Passions", bold: true })] }),
          new Paragraph({ text: `${p1}: ${ans.q2_workPassion?.partnerA || "N/A"} | ${p2}: ${ans.q2_workPassion?.partnerB || "N/A"}` }),
          new Paragraph({ text: "" }),

          // Q3
          new Paragraph({ children: [new TextRun({ text: "3. How did you first meet?", bold: true })] }),
          new Paragraph({ text: ans.q3_firstMeet || "Not answered" }),
          new Paragraph({ text: "" }),

          // Q4
          new Paragraph({ children: [new TextRun({ text: "4. First impressions", bold: true })] }),
          new Paragraph({ text: `${p1}: ${ans.q4_firstImpression?.partnerA || "N/A"} | ${p2}: ${ans.q4_firstImpression?.partnerB || "N/A"}` }),
          new Paragraph({ text: "" }),

          // Q5
          new Paragraph({ children: [new TextRun({ text: "5. Three words", bold: true })] }),
          new Paragraph({ text: (ans.q5_threeWords || []).filter(Boolean).join(", ") || "Not answered" }),
          new Paragraph({ text: "" }),

          // Q6
          new Paragraph({ children: [new TextRun({ text: "6. Activities together", bold: true })] }),
          new Paragraph({ text: `${(ans.q6_activities?.selected || []).join(", ")} ${ans.q6_activities?.other || ""}` }),
          new Paragraph({ text: "" }),

          // Q7
          new Paragraph({ children: [new TextRun({ text: "7. Love most about each other", bold: true })] }),
          new Paragraph({ text: `${p1}: ${ans.q7_loveMost?.partnerA || "N/A"} | ${p2}: ${ans.q7_loveMost?.partnerB || "N/A"}` }),
          new Paragraph({ text: "" }),

          // Q8
          new Paragraph({ children: [new TextRun({ text: "8. Funny story / inside joke", bold: true })] }),
          new Paragraph({ text: ans.q8_funnyStory || "Not answered" }),
          new Paragraph({ text: "" }),

          // Q9
          new Paragraph({ children: [new TextRun({ text: "9. Proposal", bold: true })] }),
          new Paragraph({ text: ans.q9_proposal?.story || "Not answered" }),
          new Paragraph({ text: "" }),

          // Q10
          new Paragraph({ children: [new TextRun({ text: "10. Family & People (Bride & Groom Sides)", bold: true })] }),
          new Paragraph({
            children: [new TextRun({ text: "Bride's Side:", bold: true })],
          }),
          new Paragraph({
            text:
              [
                groupedDocxPeople.bride.photos.length > 0
                  ? `${groupedDocxPeople.bride.photos.length} photos uploaded`
                  : null,
                ...groupedDocxPeople.bride.members.map(
                  (m) => `${m.name} (${m.relationship})${m.mustCapture ? " [MUST CAPTURE]" : ""}`
                ),
                groupedDocxPeople.bride.notes.trim()
                  ? `Notes: ${groupedDocxPeople.bride.notes.trim()}`
                  : null,
              ]
                .filter(Boolean)
                .join(" | ") || "None",
          }),
          ...brideSidePhotoBytes
            .filter((vp) => vp.bytes !== null)
            .map(
              (vp) =>
                new Paragraph({
                  children: [
                    new TextRun({ text: `• ${vp.name}: `, bold: true }),
                    new ImageRun({
                      data: vp.bytes!,
                      transformation: { width: 120, height: 90 },
                      type: "jpg",
                    }),
                  ],
                })
            ),
          new Paragraph({
            children: [new TextRun({ text: "Groom's Side:", bold: true })],
          }),
          new Paragraph({
            text:
              [
                groupedDocxPeople.groom.photos.length > 0
                  ? `${groupedDocxPeople.groom.photos.length} photos uploaded`
                  : null,
                ...groupedDocxPeople.groom.members.map(
                  (m) => `${m.name} (${m.relationship})${m.mustCapture ? " [MUST CAPTURE]" : ""}`
                ),
                groupedDocxPeople.groom.notes.trim()
                  ? `Notes: ${groupedDocxPeople.groom.notes.trim()}`
                  : null,
              ]
                .filter(Boolean)
                .join(" | ") || "None",
          }),
          ...groomSidePhotoBytes
            .filter((vp) => vp.bytes !== null)
            .map(
              (vp) =>
                new Paragraph({
                  children: [
                    new TextRun({ text: `• ${vp.name}: `, bold: true }),
                    new ImageRun({
                      data: vp.bytes!,
                      transformation: { width: 120, height: 90 },
                      type: "jpg",
                    }),
                  ],
                })
            ),
          ...(groupedDocxPeople.sharedMembers.length > 0
            ? [
                new Paragraph({
                  text: `Mutual / Both: ${groupedDocxPeople.sharedMembers
                    .map((m) => `${m.name} (${m.relationship})${m.mustCapture ? " [MUST CAPTURE]" : ""}`)
                    .join("; ")}`,
                }),
              ]
            : []),
          ...(groupedDocxPeople.legacyTreeNotes
            ? [new Paragraph({ text: `Notes: ${groupedDocxPeople.legacyTreeNotes}` })]
            : []),
          ...(treePhotoBytes
            ? [
                new Paragraph({
                  children: [new TextRun({ text: "Family Tree / Sketch Attached:", bold: true, italics: true })],
                }),
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: treePhotoBytes,
                      transformation: { width: 340, height: 210 },
                      type: "jpg",
                    }),
                  ],
                }),
              ]
            : []),
          ...sharedVipPhotoBytes
            .filter((vp) => vp.bytes !== null)
            .map(
              (vp) =>
                new Paragraph({
                  children: [
                    new TextRun({ text: `• ${vp.name}: `, bold: true }),
                    new ImageRun({
                      data: vp.bytes!,
                      transformation: { width: 75, height: 75 },
                      type: "jpg",
                    }),
                  ],
                })
            ),
          new Paragraph({ text: "" }),

          // Q11
          new Paragraph({ children: [new TextRun({ text: "11. Film & Photo feel", bold: true })] }),
          new Paragraph({ text: formatSplitTextForExport(ans, "q11_filmFeel", filmFeelDocxStr, " | ") }),
          new Paragraph({ text: "" }),

          // Q12
          new Paragraph({ children: [new TextRun({ text: "12. References & Links", bold: true })] }),
          new Paragraph({ text: `Links: ${(ans.q12_references?.links || []).join(", ") || "None"} | Notes: ${ans.q12_references?.notes || "None"}` }),
          ...refPhotoBytes
            .filter((b): b is Uint8Array => b !== null)
            .map(
              (b) =>
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: b,
                      transformation: { width: 180, height: 130 },
                      type: "jpg",
                    }),
                  ],
                })
            ),
          new Paragraph({ text: "" }),

          // Q13
          new Paragraph({
            children: [
              new TextRun({
                text: "13. Have you finalised your wedding wardrobe? Share your outfit plans, colour preferences, and styling ideas. Knowing these details helps us plan your photography and films more thoughtfully.",
                bold: true,
              }),
            ],
          }),
          ...(groupedDocxWardrobe.legacyShared
            ? [
                new Paragraph({
                  text: `Notes: ${groupedDocxWardrobe.legacyShared.notes || "None"} | Links: ${
                    groupedDocxWardrobe.legacyShared.links.join(", ") || "None"
                  }`,
                }),
                ...outfitPhotoBytes
                  .filter((b): b is Uint8Array => b !== null)
                  .map(
                    (b) =>
                      new Paragraph({
                        children: [
                          new ImageRun({
                            data: b,
                            transformation: { width: 180, height: 130 },
                            type: "jpg",
                          }),
                        ],
                      })
                  ),
              ]
            : [
                new Paragraph({
                  children: [new TextRun({ text: "Bride's wardrobe", bold: true })],
                }),
                new Paragraph({
                  text: `Notes: ${groupedDocxWardrobe.bride.notes || "None"} | Links: ${
                    groupedDocxWardrobe.bride.links.join(", ") || "None"
                  }`,
                }),
                ...brideOutfitPhotoBytes
                  .filter((b): b is Uint8Array => b !== null)
                  .map(
                    (b) =>
                      new Paragraph({
                        children: [
                          new ImageRun({
                            data: b,
                            transformation: { width: 180, height: 130 },
                            type: "jpg",
                          }),
                        ],
                      })
                  ),
                new Paragraph({
                  children: [new TextRun({ text: "Groom's wardrobe", bold: true })],
                }),
                new Paragraph({
                  text: `Notes: ${groupedDocxWardrobe.groom.notes || "None"} | Links: ${
                    groupedDocxWardrobe.groom.links.join(", ") || "None"
                  }`,
                }),
                ...groomOutfitPhotoBytes
                  .filter((b): b is Uint8Array => b !== null)
                  .map(
                    (b) =>
                      new Paragraph({
                        children: [
                          new ImageRun({
                            data: b,
                            transformation: { width: 180, height: 130 },
                            type: "jpg",
                          }),
                        ],
                      })
                  ),
              ]),
          new Paragraph({ text: "" }),

          // Q14
          new Paragraph({ children: [new TextRun({ text: "14. Wedding Decor Mood Board & References", bold: true })] }),
          ...(decorEventDocxEntries.length === 0
            ? [new Paragraph({ text: "Not answered" })]
            : decorEventDocxEntries.flatMap(({ event: ev, photoBytes }) => [
                new Paragraph({
                  children: [new TextRun({ text: ev.name, bold: true })],
                }),
                new Paragraph({
                  text: `Links: ${ev.links.join(", ") || "None"} | Notes: ${
                    ev.notes.trim() || "None"
                  }`,
                }),
                ...photoBytes
                  .filter((b): b is Uint8Array => b !== null)
                  .map(
                    (b) =>
                      new Paragraph({
                        children: [
                          new ImageRun({
                            data: b,
                            transformation: { width: 180, height: 130 },
                            type: "jpg",
                          }),
                        ],
                      })
                  ),
              ])),
          new Paragraph({ text: "" }),

          // Q15 (previously Q13)
          new Paragraph({ children: [new TextRun({ text: "15. Day Tone", bold: true })] }),
          new Paragraph({ text: formatSplitTextForExport(ans, "q13_tone", toneDocxStr, " | ") }),
          new Paragraph({ text: "" }),

          // Q16 (previously Q14)
          new Paragraph({ children: [new TextRun({ text: "16. Key Moments", bold: true })] }),
          new Paragraph({ text: formatSplitTextForExport(ans, "q14_moments", `${(ans.q14_moments?.selected || []).join(", ")} ${ans.q14_moments?.other || ""}`, " | ") }),
          new Paragraph({ text: "" }),

          // Q17 (previously Q15)
          new Paragraph({ children: [new TextRun({ text: "17. Capture vs Avoid", bold: true })] }),
          new Paragraph({ text: formatSplitTextForExport(ans, "q15_captureAvoid", `Capture: ${ans.q15_captureAvoid?.definitelyCapture || "N/A"} | Avoid: ${ans.q15_captureAvoid?.pleaseAvoid || "N/A"}`, " | ") }),
          new Paragraph({ text: "" }),

          // Q18 (previously Q16)
          new Paragraph({ children: [new TextRun({ text: "18. Non-negotiables", bold: true })] }),
          new Paragraph({ text: formatSplitTextForExport(ans, "q16_nonNegotiables", ans.q16_nonNegotiables || "Not answered", " | ") }),
          new Paragraph({ text: "" }),

          // Q19 (previously Q17)
          new Paragraph({ children: [new TextRun({ text: "19. Emotional", bold: true })] }),
          new Paragraph({ text: formatSplitTextForExport(ans, "q17_emotional", ans.q17_emotional || "Not answered", " | ") }),
          new Paragraph({ text: "" }),

          // Q20 (previously Q18)
          new Paragraph({ children: [new TextRun({ text: "20. Camera Versatility", bold: true })] }),
          new Paragraph({ text: formatSplitTextForExport(ans, "q18_cameraVersatility", ans.q18_cameraVersatility || "Not answered", " | ") }),
          new Paragraph({ text: "" }),

          // Q21 (previously Q19)
          new Paragraph({ children: [new TextRun({ text: "21. What mattered most when choosing OAKS Wedding", bold: true })] }),
          new Paragraph({ text: formatSplitTextForExport(ans, "choosingOaks", ans.choosingOaks || "Not answered", " | ") }),
          new Paragraph({ text: "" }),

          // Q22
          new Paragraph({ children: [new TextRun({ text: "22. Guidance comfort", bold: true })] }),
          new Paragraph({ text: formatSplitTextForExport(ans, "q20_guidanceComfort", ans.q20_guidanceComfort || "Not answered", " | ") }),
          new Paragraph({ text: "" }),

          // Q23
          new Paragraph({ children: [new TextRun({ text: "23. Comfort tips", bold: true })] }),
          new Paragraph({ text: formatSplitTextForExport(ans, "q21_comfortTips", `${(ans.q21_comfortTips?.selected || []).join(", ")} ${ans.q21_comfortTips?.notes || ""}`, " | ") }),
          new Paragraph({ text: "" }),

          // Q24
          new Paragraph({ children: [new TextRun({ text: "24. Future film feeling", bold: true })] }),
          new Paragraph({ text: formatSplitTextForExport(ans, "q22_futureFeeling", ans.q22_futureFeeling || "Not answered", " | ") }),
          new Paragraph({ text: "" }),

          // Q25: Primary Point of Contact
          new Paragraph({ children: [new TextRun({ text: "25. Primary point of contact", bold: true })] }),
          new Paragraph({
            text: ans.primaryContact?.role
              ? [
                  `${ans.primaryContact.role}${
                    ans.primaryContact.role === "Someone else" &&
                    (ans.primaryContact.side || ans.primaryContact.designation || ans.primaryContact.gender)
                      ? ` (${[
                          ans.primaryContact.side,
                          ans.primaryContact.designation || ans.primaryContact.gender,
                        ]
                          .filter(Boolean)
                          .join(", ")})`
                      : ""
                  }`,
                  `Name: ${ans.primaryContact.name || "N/A"}`,
                  `Phone / WhatsApp: ${ans.primaryContact.phone || "N/A"}`,
                ].join(" | ")
              : "Not answered",
          }),
          new Paragraph({ text: "" }),

          // Q26
          new Paragraph({ children: [new TextRun({ text: "26. Your story & journey", bold: true })] }),
          new Paragraph({ text: ans.loveStoryNarrative || "Not answered" }),
          new Paragraph({ text: "" }),

          // Q27
          new Paragraph({ children: [new TextRun({ text: "27. Is there anything else you'd like to let us know?", bold: true })] }),
          new Paragraph({ text: formatSplitTextForExport(ans, "q23_oneLastThing", ans.q23_oneLastThing?.notes || "Not answered", " | ") }),
          ...lastPhotoBytes
            .filter((b): b is Uint8Array => b !== null)
            .map(
              (b) =>
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: b,
                      transformation: { width: 180, height: 130 },
                      type: "jpg",
                    }),
                  ],
                })
            ),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, filename);
}

/**
 * Export ONLY the Couple Letter as an elegant client-facing PDF document
 */
export async function exportCoupleLetterPdf(
  submission: SubmissionRecord,
  letterTextProp?: string
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const p1 = submission.partner1 || "Partner 1";
  const p2 = submission.partner2 || "Partner 2";
  const title = `${p1} & ${p2}`;
  const filename = `${submission.displayId || "OAKS"}_${p1}_${p2}_Couple_Letter.pdf`.replace(
    /[^a-zA-Z0-9_-]/g,
    "_"
  );

  const { letter: coupleLetterText } = upgradeCoupleLetterIfNeeded(
    letterTextProp || submission.coupleLetter,
    submission.answers
  );

  let y = 22;
  const left = 20;
  const pageWidth = 210;
  const contentWidth = 170;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(176, 141, 87); // Gold #B08D57
  doc.text(`${STUDIO_NAME.toUpperCase()} · CLIENT-FACING MESSAGE`, left, y);

  if (submission.displayId) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(submission.displayId, pageWidth - left - 15, y);
  }

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(26, 26, 26);
  doc.text("THE COUPLE LETTER", left, y);

  y += 6;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(11);
  doc.setTextColor(140, 112, 67); // #8C7043
  doc.text(`Our Understanding of Your Wedding · ${title}`, left, y);

  y += 5;
  doc.setDrawColor(26, 26, 26);
  doc.setLineWidth(0.6);
  doc.line(left, y, left + contentWidth, y);
  y += 10;

  const letterLines = coupleLetterText.split("\n");
  letterLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      y += 3;
      return;
    }
    const isSectionHeading = /^\d{2}\s*—/.test(trimmed) || trimmed.startsWith("### ");
    if (isSectionHeading) {
      if (y > 255) {
        doc.addPage();
        y = 22;
      }
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(176, 141, 87);
      doc.text(trimmed.replace(/^###\s+/, ""), left, y);
      y += 6;
    } else if (
      trimmed.startsWith("THE COUPLE LETTER") ||
      trimmed.startsWith("---") ||
      trimmed.includes("====") ||
      trimmed.startsWith("Our Understanding of Your Wedding") ||
      trimmed === `${p1.toUpperCase()} & ${p2.toUpperCase()}`
    ) {
      // skip duplicate header text
    } else {
      if (y > 265) {
        doc.addPage();
        y = 22;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(35, 35, 35);
      const wrapped = doc.splitTextToSize(trimmed, contentWidth);
      doc.text(wrapped, left, y);
      y += wrapped.length * 4.8 + 3;
    }
  });

  doc.save(filename);
}

/**
 * Export ONLY the Shoot Day Cheat Sheet as a 1-page A4 reference PDF
 */
export async function exportCheatSheetPdf(rawSubmission: SubmissionRecord) {
  const [submission, { jsPDF }] = await Promise.all([
    ensureExportMediaResolved(rawSubmission),
    import("jspdf"),
  ]);
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const p1 = submission.partner1 || "Partner 1";
  const p2 = submission.partner2 || "Partner 2";
  const title = `${p1} & ${p2}`;
  const filename = `${submission.displayId || "OAKS"}_${p1}_${p2}_Shoot_Day_Cheat_Sheet.pdf`.replace(
    /[^a-zA-Z0-9_-]/g,
    "_"
  );

  let y = 18;
  const left = 16;
  const pageWidth = 210;
  const contentWidth = 178;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(176, 141, 87); // Gold #B08D57
  doc.text(`${STUDIO_NAME.toUpperCase()} · SHOOT DAY CHEAT SHEET`, left, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(submission.displayId || "", pageWidth - left - 15, y);

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(26, 26, 26);
  doc.text(title, left, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  const weddingStr = submission.weddingDate
    ? `Wedding Date: ${submission.weddingDate}`
    : "Wedding Date: TBD";
  const contactStr = [submission.phone, submission.email].filter(Boolean).join("  ·  ");
  doc.text(`${weddingStr}  |  ${contactStr}`, left, y);

  y += 4;
  doc.setDrawColor(26, 26, 26);
  doc.setLineWidth(0.6);
  doc.line(left, y, left + contentWidth, y);

  y += 8;

  const isOutdatedCheatSheet = Boolean(
    !submission.cheatSheet ||
      submission.cheatSheet.includes("Who will cry first:") ||
      submission.cheatSheet.includes("Camera Versatility:") ||
      submission.cheatSheet.includes("Quiet Notes & Surprises") ||
      !submission.cheatSheet.includes("01 — THE VIBE") ||
      !submission.cheatSheet.includes("02 — TOP PRIORITIES")
  );
  const cheatSheetText = isOutdatedCheatSheet
    ? synthesizeCheatSheet(submission.answers)
    : submission.cheatSheet!;
  const cheatSheetDoc = parseCheatSheetDocument(cheatSheetText, p1, p2);

  // 01 — THE VIBE (Across Top)
  doc.setFillColor(250, 248, 245);
  doc.rect(left, y, contentWidth, 20, "F");
  doc.setDrawColor(229, 221, 210);
  doc.rect(left, y, contentWidth, 20, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(176, 141, 87);
  doc.text("01 — THE VIBE", left + 3.5, y + 4.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(26, 26, 26);
  doc.text(cheatSheetDoc.vibeWords, left + 38, y + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(45, 45, 45);
  const vibeWrapped = doc.splitTextToSize(cheatSheetDoc.vibeDescription, contentWidth - 7);
  doc.text(vibeWrapped, left + 3.5, y + 9.5);
  y += 23;

  // Left & Right Columns
  const colW = 86;
  const colGap = 6;
  const col2X = left + colW + colGap;
  const colStartY = y;

  let leftY = colStartY;

  // 02 - TOP PRIORITIES
  doc.setFillColor(250, 248, 245);
  doc.rect(left, leftY, colW, 46, "F");
  doc.setDrawColor(229, 221, 210);
  doc.rect(left, leftY, colW, 46, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(176, 141, 87);
  doc.text("02 — TOP PRIORITIES", left + 3.5, leftY + 4.5);

  let py = leftY + 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 40);
  cheatSheetDoc.topPriorities.slice(0, 4).forEach((p) => {
    const pWrapped = doc.splitTextToSize(`• ${p}`, colW - 7);
    doc.text(pWrapped, left + 3.5, py);
    py += pWrapped.length * 3.8 + 1;
  });

  leftY += 49;

  // 05 - PLEASE AVOID
  doc.setFillColor(254, 242, 242);
  doc.rect(left, leftY, colW, 42, "F");
  doc.setDrawColor(254, 202, 202);
  doc.rect(left, leftY, colW, 42, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(185, 28, 28);
  doc.text("05 — PLEASE AVOID (NON-NEGOTIABLE)", left + 3.5, leftY + 4.5);

  let ay = leftY + 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(127, 29, 29);
  cheatSheetDoc.pleaseAvoid.slice(0, 3).forEach((a) => {
    const aWrapped = doc.splitTextToSize(`• ${a}`, colW - 7);
    doc.text(aWrapped, left + 3.5, ay);
    ay += aWrapped.length * 3.8 + 1;
  });

  // RIGHT COL: 03, 04, 06
  let rightY = colStartY;

  // 03 - PEOPLE TO WATCH
  doc.setFillColor(250, 248, 245);
  doc.rect(col2X, rightY, colW, 46, "F");
  doc.setDrawColor(229, 221, 210);
  doc.rect(col2X, rightY, colW, 46, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(176, 141, 87);
  doc.text("04 — IMPORTANT PEOPLE", col2X + 3.5, rightY + 4.5);

  let pwy = rightY + 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 40);
  cheatSheetDoc.importantPeople.slice(0, 4).forEach((person) => {
    const pLine = person.relationship ? `${person.name} — ${person.relationship}` : person.name;
    const pwWrapped = doc.splitTextToSize(`• ${pLine}`, colW - 7);
    doc.text(pwWrapped, col2X + 3.5, pwy);
    pwy += pwWrapped.length * 3.8 + 1;
  });

  rightY += 49;

  // 04 - MUST-CAPTURE MOMENTS
  doc.setFillColor(250, 248, 245);
  doc.rect(col2X, rightY, colW, 42, "F");
  doc.setDrawColor(229, 221, 210);
  doc.rect(col2X, rightY, colW, 42, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(176, 141, 87);
  doc.text("04 — MUST-CAPTURE MOMENTS", col2X + 3.5, rightY + 4.5);

  let my = rightY + 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 40);
  cheatSheetDoc.mustCaptureMoments.slice(0, 3).forEach((m) => {
    const mWrapped = doc.splitTextToSize(`• ${m}`, colW - 7);
    doc.text(mWrapped, col2X + 3.5, my);
    my += mWrapped.length * 3.8 + 1;
  });

  // 06 - TECHNICAL & CREW
  y = Math.max(leftY + 45, rightY + 45);
  if (cheatSheetDoc.technicalNonNegotiable) {
    doc.setFillColor(255, 251, 235);
    doc.rect(left, y, contentWidth, 18, "F");
    doc.setDrawColor(254, 215, 170);
    doc.rect(left, y, contentWidth, 18, "D");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(176, 141, 87);
    doc.text("TECHNICAL NON-NEGOTIABLE", left + 3.5, y + 4.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(26, 26, 26);
    const techWrapped = doc.splitTextToSize(cheatSheetDoc.technicalNonNegotiable, contentWidth - 7);
    doc.text(techWrapped, left + 3.5, y + 9);
  }

  doc.save(filename);
}
