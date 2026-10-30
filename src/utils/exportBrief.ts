/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from "jspdf";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} from "docx";
import { SubmissionRecord } from "../types/questionnaire.ts";
import { STUDIO_NAME } from "../constants.ts";

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
export async function exportToPdf(submission: SubmissionRecord) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const p1 = submission.partner1 || "Partner 1";
  const p2 = submission.partner2 || "Partner 2";
  const title = `${p1} & ${p2}`;
  const filename = `${submission.displayId}_${p1}_${p2}_OAKS_Brief.pdf`.replace(/[^a-zA-Z0-9_-]/g, "_");

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
  doc.text(submission.displayId, pageWidth - left - 15, y);

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

  // Shoot Day Cheat Sheet 6 Sections
  const ans = submission.answers;
  const threeWords = (ans.q5_threeWords || []).filter(Boolean).join(", ");
  const vipPeople = (ans.q10_people?.familyMembers || [])
    .filter((m) => m.mustCapture)
    .map((m) => `${m.name} (${m.relationship})`)
    .join(", ");
  const allFamily = (ans.q10_people?.familyMembers || [])
    .map((m) => `${m.name} (${m.relationship})`)
    .join(", ");

  const sections = [
    {
      title: "1. THE VIBE",
      content: `Three Words: ${threeWords || "N/A"}\nFilm Feel: ${ans.q11_filmFeel || "N/A"}\nDay Tone: ${ans.q13_tone || "N/A"}\nEmotional: ${ans.q17_emotional || "N/A"}`,
    },
    {
      title: "2. MUST CAPTURE",
      content: `VIP Family: ${vipPeople || "None specified"}\nDefinite Shots: ${ans.q15_captureAvoid?.definitelyCapture || "N/A"}\nKey Moments: ${(ans.q14_moments?.selected || []).join(", ")}`,
    },
    {
      title: "3. DO NOT CAPTURE",
      content: ans.q15_captureAvoid?.pleaseAvoid
        ? `AVOID: ${ans.q15_captureAvoid.pleaseAvoid}`
        : "No specific avoidances noted.",
    },
    {
      title: "4. WORKING WITH THEM",
      content: `Camera Versatility: ${ans.q18_cameraVersatility || "N/A"}\nGuidance: ${ans.q20_guidanceComfort || "N/A"}\nComfort Tips: ${(ans.q21_comfortTips?.selected || []).join(", ")} ${ans.q21_comfortTips?.notes || ""}`,
    },
    {
      title: "5. WHO'S WHO (FAMILY & VIPS)",
      content: allFamily || "None specified",
    },
    {
      title: "6. QUIET NOTES & SURPRISES",
      content: `Non-negotiables: ${ans.q16_nonNegotiables || "None"}\nNotes: ${ans.q23_oneLastThing?.notes || "None"}\n${submission.privateNotes ? `[Internal Team Note]: ${submission.privateNotes}` : ""}`,
    },
  ];

  sections.forEach((sec) => {
    doc.setFillColor(250, 248, 245);
    doc.rect(left, y, contentWidth, 24, "F");
    doc.setDrawColor(229, 221, 210);
    doc.rect(left, y, contentWidth, 24, "D");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(176, 141, 87);
    doc.text(sec.title, left + 4, y + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    const splitText = doc.splitTextToSize(sec.content, contentWidth - 8);
    doc.text(splitText, left + 4, y + 10);

    y += 27;
  });

  // PAGE 2+: FULL ANSWERS
  doc.addPage();
  y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(26, 26, 26);
  doc.text(`Full Questionnaire Answers · ${title}`, left, y);
  y += 8;

  const fullQuestions = [
    { q: "Q1. What do you call each other?", a: `${p1} calls ${p2}: "${ans.q1_calls?.aCallsB || ""}" · ${p2} calls ${p1}: "${ans.q1_calls?.bCallsA || ""}"` },
    { q: "Q2. What do you do for living & passions?", a: `${p1}: ${ans.q2_workPassion?.partnerA || "N/A"}\n${p2}: ${ans.q2_workPassion?.partnerB || "N/A"}` },
    { q: "Q3. How did you first meet?", a: ans.q3_firstMeet || "Not answered" },
    { q: "Q4. First impression of each other?", a: `${p1}: ${ans.q4_firstImpression?.partnerA || "N/A"}\n${p2}: ${ans.q4_firstImpression?.partnerB || "N/A"}` },
    { q: "Q5. Couple in three words?", a: threeWords || "Not answered" },
    { q: "Q6. What do you enjoy doing together?", a: `${(ans.q6_activities?.selected || []).join(", ")} ${ans.q6_activities?.other || ""}` },
    { q: "Q7. What do you love most about each other?", a: `${p1}: ${ans.q7_loveMost?.partnerA || "N/A"}\n${p2}: ${ans.q7_loveMost?.partnerB || "N/A"}` },
    { q: "Q8. Funny story / inside joke?", a: ans.q8_funnyStory || "Not answered" },
    { q: "Q9. How did the proposal happen?", a: ans.q9_proposal?.story || "Not answered" },
    { q: "Q10. Family members & tree", a: `${allFamily || "None"} ${ans.q10_people?.treeNotes ? `\nNotes: ${ans.q10_people.treeNotes}` : ""}` },
    { q: "Q11. Film & photo feel?", a: ans.q11_filmFeel || "Not answered" },
    { q: "Q12. References & Links", a: `Links: ${(ans.q12_references?.links || []).join(", ") || "None"}\nNotes: ${ans.q12_references?.notes || "None"}` },
    { q: "Q13. Wedding day tone?", a: ans.q13_tone || "Not answered" },
    { q: "Q14. Moments looking forward to?", a: `${(ans.q14_moments?.selected || []).join(", ")} ${ans.q14_moments?.other || ""}` },
    { q: "Q15. Definitely capture / avoid?", a: `Capture: ${ans.q15_captureAvoid?.definitelyCapture || "N/A"}\nAvoid: ${ans.q15_captureAvoid?.pleaseAvoid || "N/A"}` },
    { q: "Q16. Non-negotiables?", a: ans.q16_nonNegotiables || "Not answered" },
    { q: "Q17. Who will be more emotional?", a: ans.q17_emotional || "Not answered" },
    { q: "Q18. Camera versatility?", a: ans.q18_cameraVersatility || "Not answered" },
    { q: "Q19. What matters most?", a: `${(ans.q19_whatMattersMost?.selected || []).join(", ")} ${ans.q19_whatMattersMost?.other || ""}` },
    { q: "Q20. Guidance comfort?", a: ans.q20_guidanceComfort || "Not answered" },
    { q: "Q21. Comfort tips?", a: `${(ans.q21_comfortTips?.selected || []).join(", ")} ${ans.q21_comfortTips?.notes || ""}` },
    { q: "Q22. Future film feeling?", a: ans.q22_futureFeeling || "Not answered" },
    { q: "Q23. One last thing?", a: `${ans.q23_oneLastThing?.notes || "Not answered"}` },
  ];

  fullQuestions.forEach((item) => {
    if (y > 265) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(26, 26, 26);
    doc.text(item.q, left, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    const splitA = doc.splitTextToSize(item.a, contentWidth);
    doc.text(splitA, left, y);
    y += splitA.length * 4.2 + 5;
  });

  doc.save(filename);
}

/**
 * Export submission as Word (.docx) document
 */
export async function exportToDocx(submission: SubmissionRecord) {
  const p1 = submission.partner1 || "Partner 1";
  const p2 = submission.partner2 || "Partner 2";
  const ans = submission.answers;
  const filename = `${submission.displayId}_${p1}_${p2}_OAKS_Brief.docx`.replace(/[^a-zA-Z0-9_-]/g, "_");

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
              new TextRun({ text: `${p1} & ${p2} (${submission.displayId})`, bold: true, size: 36 }),
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

          // Cheat Sheet Table
          new Paragraph({
            text: "SHOOT DAY CHEAT SHEET SUMMARY",
            heading: HeadingLevel.HEADING_3,
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "1. The Vibe", bold: true })] }),
                      new Paragraph({ text: `Three Words: ${(ans.q5_threeWords || []).filter(Boolean).join(", ")}` }),
                      new Paragraph({ text: `Film Feel: ${ans.q11_filmFeel || "N/A"}` }),
                      new Paragraph({ text: `Tone: ${ans.q13_tone || "N/A"}` }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "2. Must Capture", bold: true })] }),
                      new Paragraph({
                        text: `VIPs: ${(ans.q10_people?.familyMembers || [])
                          .filter((m) => m.mustCapture)
                          .map((m) => `${m.name} (${m.relationship})`)
                          .join(", ") || "None"}`,
                      }),
                      new Paragraph({ text: `Must Shots: ${ans.q15_captureAvoid?.definitelyCapture || "N/A"}` }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "3. Do NOT Capture", bold: true })] }),
                      new Paragraph({ text: ans.q15_captureAvoid?.pleaseAvoid || "None specified" }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "4. Working with Them", bold: true })] }),
                      new Paragraph({ text: `Camera Versatility: ${ans.q18_cameraVersatility || "N/A"}` }),
                      new Paragraph({ text: `Guidance: ${ans.q20_guidanceComfort || "N/A"}` }),
                      new Paragraph({
                        text: `Tips: ${(ans.q21_comfortTips?.selected || []).join(", ")} ${ans.q21_comfortTips?.notes || ""}`,
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "5. Who's Who (Family)", bold: true })] }),
                      new Paragraph({
                        text: (ans.q10_people?.familyMembers || [])
                          .map((m) => `${m.name} (${m.relationship})`)
                          .join(", ") || "None",
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "6. Notes & Surprises", bold: true })] }),
                      new Paragraph({ text: `Non-negotiables: ${ans.q16_nonNegotiables || "None"}` }),
                      new Paragraph({ text: `Notes: ${ans.q23_oneLastThing?.notes || "None"}` }),
                      new Paragraph({ text: `Private Team Notes: ${submission.privateNotes || "None"}` }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ text: "" }),
          new Paragraph({
            text: "FULL QUESTIONNAIRE RESPONSES",
            heading: HeadingLevel.HEADING_2,
          }),

          // Q1
          new Paragraph({ children: [new TextRun({ text: "1. What do you call each other?", bold: true })] }),
          new Paragraph({ text: `${p1} calls ${p2}: "${ans.q1_calls?.aCallsB || ""}" · ${p2} calls ${p1}: "${ans.q1_calls?.bCallsA || ""}"` }),
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
          new Paragraph({ children: [new TextRun({ text: "10. Family & People", bold: true })] }),
          new Paragraph({
            text: (ans.q10_people?.familyMembers || [])
              .map((m) => `${m.name} (${m.relationship})${m.mustCapture ? " [MUST CAPTURE]" : ""}`)
              .join("; ") || "None",
          }),
          new Paragraph({ text: "" }),

          // Q11
          new Paragraph({ children: [new TextRun({ text: "11. Film & Photo feel", bold: true })] }),
          new Paragraph({ text: ans.q11_filmFeel || "Not answered" }),
          new Paragraph({ text: "" }),

          // Q12
          new Paragraph({ children: [new TextRun({ text: "12. References & Links", bold: true })] }),
          new Paragraph({ text: `Links: ${(ans.q12_references?.links || []).join(", ") || "None"} | Notes: ${ans.q12_references?.notes || "None"}` }),
          new Paragraph({ text: "" }),

          // Q13
          new Paragraph({ children: [new TextRun({ text: "13. Day Tone", bold: true })] }),
          new Paragraph({ text: ans.q13_tone || "Not answered" }),
          new Paragraph({ text: "" }),

          // Q14
          new Paragraph({ children: [new TextRun({ text: "14. Key Moments", bold: true })] }),
          new Paragraph({ text: `${(ans.q14_moments?.selected || []).join(", ")} ${ans.q14_moments?.other || ""}` }),
          new Paragraph({ text: "" }),

          // Q15
          new Paragraph({ children: [new TextRun({ text: "15. Capture vs Avoid", bold: true })] }),
          new Paragraph({ text: `Capture: ${ans.q15_captureAvoid?.definitelyCapture || "N/A"} | Avoid: ${ans.q15_captureAvoid?.pleaseAvoid || "N/A"}` }),
          new Paragraph({ text: "" }),

          // Q16
          new Paragraph({ children: [new TextRun({ text: "16. Non-negotiables", bold: true })] }),
          new Paragraph({ text: ans.q16_nonNegotiables || "Not answered" }),
          new Paragraph({ text: "" }),

          // Q17
          new Paragraph({ children: [new TextRun({ text: "17. Emotional", bold: true })] }),
          new Paragraph({ text: ans.q17_emotional || "Not answered" }),
          new Paragraph({ text: "" }),

          // Q18
          new Paragraph({ children: [new TextRun({ text: "18. Camera Versatility", bold: true })] }),
          new Paragraph({ text: ans.q18_cameraVersatility || "Not answered" }),
          new Paragraph({ text: "" }),

          // Q19
          new Paragraph({ children: [new TextRun({ text: "19. What matters most", bold: true })] }),
          new Paragraph({ text: `${(ans.q19_whatMattersMost?.selected || []).join(", ")} ${ans.q19_whatMattersMost?.other || ""}` }),
          new Paragraph({ text: "" }),

          // Q20
          new Paragraph({ children: [new TextRun({ text: "20. Guidance comfort", bold: true })] }),
          new Paragraph({ text: ans.q20_guidanceComfort || "Not answered" }),
          new Paragraph({ text: "" }),

          // Q21
          new Paragraph({ children: [new TextRun({ text: "21. Comfort tips", bold: true })] }),
          new Paragraph({ text: `${(ans.q21_comfortTips?.selected || []).join(", ")} ${ans.q21_comfortTips?.notes || ""}` }),
          new Paragraph({ text: "" }),

          // Q22
          new Paragraph({ children: [new TextRun({ text: "22. Future film feeling", bold: true })] }),
          new Paragraph({ text: ans.q22_futureFeeling || "Not answered" }),
          new Paragraph({ text: "" }),

          // Q23
          new Paragraph({ children: [new TextRun({ text: "23. One last thing", bold: true })] }),
          new Paragraph({ text: ans.q23_oneLastThing?.notes || "Not answered" }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, filename);
}
