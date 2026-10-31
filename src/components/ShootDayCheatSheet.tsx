/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { SubmissionRecord } from "../types/questionnaire.ts";
import { STUDIO_NAME } from "../constants.ts";

interface ShootDayCheatSheetProps {
  submission: SubmissionRecord;
  onPrint?: () => void;
}

export const ShootDayCheatSheet: React.FC<ShootDayCheatSheetProps> = ({
  submission,
}) => {
  const { answers } = submission;
  const p1 = submission.partner1 || "Partner 1";
  const p2 = submission.partner2 || "Partner 2";

  // Calls each other
  const aCallsB = answers.q1_calls?.aCallsB;
  const bCallsA = answers.q1_calls?.bCallsA;
  const callsText =
    aCallsB || bCallsA
      ? `${p1} calls ${p2} "${aCallsB || p2}" · ${p2} calls ${p1} "${bCallsA || p1}"`
      : "";

  // The 3 words
  const words = (answers.q5_threeWords || []).filter(Boolean);

  // Must Capture family members
  const familyMembers = answers.q10_people?.familyMembers || [];
  const mustCaptureMembers = familyMembers.filter((m) => m.mustCapture);
  const otherMembers = familyMembers.filter((m) => !m.mustCapture);

  // Key moments
  const moments = answers.q14_moments?.selected || [];
  const otherMoments = answers.q14_moments?.other;

  // Format date nicely
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "Date not specified";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="cheat-sheet-root bg-white text-[#111111] font-sans border border-[#E5DDD2] rounded-2xl p-6 sm:p-8 shadow-xs max-w-4xl mx-auto print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none">
      {/* Cheat Sheet Top Header */}
      <div className="border-b-2 border-[#1A1A1A] pb-4 mb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] tracking-[0.25em] uppercase font-bold text-[#8C7043] print:text-black">
              {STUDIO_NAME} · SHOOT DAY CHEAT SHEET
            </span>
            <span className="text-[10px] tracking-widest font-mono text-[#5F5F5F] font-semibold">
              {submission.displayId}
            </span>
          </div>
          <h1 className="font-cormorant text-3xl sm:text-4xl font-semibold text-[#1A1A1A] leading-tight">
            {p1} &amp; {p2}
          </h1>
          {callsText && (
            <p className="text-xs text-[#4A453E] italic mt-0.5">{callsText}</p>
          )}
        </div>

        <div className="text-left sm:text-right text-xs text-[#2A2A2A] space-y-0.5 print:text-right">
          <div className="font-semibold text-sm text-[#1A1A1A]">
            {formatDate(submission.weddingDate)}
          </div>
          {submission.phone && <div>📞 {submission.phone}</div>}
          {submission.email && <div>✉️ {submission.email}</div>}
        </div>
      </div>

      {/* 6 Sections Grid - Compact and high readability */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2 print:gap-3 text-xs leading-relaxed">
        {/* SECTION 1: THE VIBE */}
        <div className="border border-[#E8DFD3] rounded-xl p-3.5 bg-[#FAF8F5]/60 print:bg-white print:border-gray-400">
          <div className="flex items-center gap-1.5 font-cormorant font-bold text-sm tracking-wider uppercase text-[#1A1A1A] border-b border-[#E8DFD3] pb-1.5 mb-2 print:border-gray-300">
            <span className="w-2 h-2 rounded-full bg-[#B08D57] print:bg-black inline-block" />
            1. The Vibe
          </div>
          <div className="space-y-1.5">
            {words.length > 0 && (
              <div>
                <span className="font-semibold text-[#1A1A1A]">In 3 words:</span>{" "}
                <span className="italic font-serif text-[13px] text-[#2A2A2A]">
                  "{words.join(" · ")}"
                </span>
              </div>
            )}
            {(() => {
              const filmFeelText = Array.isArray((answers.q11_filmFeel as any)?.selected)
                ? [
                    ...((answers.q11_filmFeel as any).selected || []),
                    (answers.q11_filmFeel as any).other,
                  ]
                    .filter(Boolean)
                    .join(", ")
                : typeof answers.q11_filmFeel === "string"
                ? answers.q11_filmFeel
                : "";
              if (!filmFeelText) return null;
              return (
                <div>
                  <span className="font-semibold text-[#1A1A1A]">Film Feel:</span>{" "}
                  <span className="text-[#3A3A3A]">{filmFeelText}</span>
                </div>
              );
            })()}

            {(() => {
              const toneText = Array.isArray((answers.q13_tone as any)?.selected)
                ? [
                    ...((answers.q13_tone as any).selected || []),
                    (answers.q13_tone as any).other,
                  ]
                    .filter(Boolean)
                    .join(", ")
                : typeof answers.q13_tone === "string"
                ? answers.q13_tone
                : "";
              if (!toneText) return null;
              return (
                <div>
                  <span className="font-semibold text-[#1A1A1A]">Day's Tone:</span>{" "}
                  <span className="text-[#3A3A3A]">{toneText}</span>
                </div>
              );
            })()}
            {answers.q17_emotional && (
              <div>
                <span className="font-semibold text-[#1A1A1A]">Who will cry first:</span>{" "}
                <span className="text-[#3A3A3A]">{answers.q17_emotional}</span>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: MUST CAPTURE */}
        <div className="border border-[#E8DFD3] rounded-xl p-3.5 bg-[#FAF8F5]/60 print:bg-white print:border-gray-400">
          <div className="flex items-center gap-1.5 font-cormorant font-bold text-sm tracking-wider uppercase text-[#1A1A1A] border-b border-[#E8DFD3] pb-1.5 mb-2 print:border-gray-300">
            <span className="w-2 h-2 rounded-full bg-[#B08D57] print:bg-black inline-block" />
            2. Must Capture (Priority)
          </div>
          <div className="space-y-1.5">
            {mustCaptureMembers.length > 0 ? (
              <div>
                <span className="font-semibold text-[#1A1A1A]">VIP People:</span>{" "}
                <div className="flex flex-wrap gap-1 mt-1">
                  {mustCaptureMembers.map((m) => (
                    <span
                      key={m.id}
                      className="inline-block bg-[#1A1A1A] text-white px-2 py-0.5 rounded text-[11px] font-medium print:bg-black"
                    >
                      ★ {m.name} ({m.relationship})
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-gray-500 italic">No VIP family members flagged as must-capture</div>
            )}

            {answers.q15_captureAvoid?.definitelyCapture && (
              <div className="pt-1">
                <span className="font-semibold text-[#1A1A1A]">Must Have Shots:</span>{" "}
                <span className="text-[#3A3A3A]">{answers.q15_captureAvoid.definitelyCapture}</span>
              </div>
            )}

            {(moments.length > 0 || otherMoments) && (
              <div>
                <span className="font-semibold text-[#1A1A1A]">Key Moments:</span>{" "}
                <span className="text-[#3A3A3A]">
                  {[...moments, otherMoments].filter(Boolean).join(", ")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: DO NOT CAPTURE */}
        <div className="border border-[#E8DFD3] rounded-xl p-3.5 bg-[#FAF8F5]/60 print:bg-white print:border-gray-400">
          <div className="flex items-center gap-1.5 font-cormorant font-bold text-sm tracking-wider uppercase text-[#1A1A1A] border-b border-[#E8DFD3] pb-1.5 mb-2 print:border-gray-300">
            <span className="w-2 h-2 rounded-full bg-red-600 print:bg-black inline-block" />
            3. Do NOT Capture / Please Avoid
          </div>
          <div>
            {answers.q15_captureAvoid?.pleaseAvoid ? (
              <p className="text-[#1A1A1A] font-medium bg-red-50/70 p-2 rounded border border-red-200/60 print:bg-white print:border-black">
                ⚠️ {answers.q15_captureAvoid.pleaseAvoid}
              </p>
            ) : (
              <p className="text-gray-500 italic">No specific avoidances noted.</p>
            )}
          </div>
        </div>

        {/* SECTION 4: WORKING WITH THEM */}
        <div className="border border-[#E8DFD3] rounded-xl p-3.5 bg-[#FAF8F5]/60 print:bg-white print:border-gray-400">
          <div className="flex items-center gap-1.5 font-cormorant font-bold text-sm tracking-wider uppercase text-[#1A1A1A] border-b border-[#E8DFD3] pb-1.5 mb-2 print:border-gray-300">
            <span className="w-2 h-2 rounded-full bg-[#B08D57] print:bg-black inline-block" />
            4. Working with Them
          </div>
          <div className="space-y-1.5">
            {answers.q18_cameraVersatility && (
              <div>
                <span className="font-semibold text-[#1A1A1A]">Camera Versatility:</span>{" "}
                <span className="text-[#3A3A3A]">{answers.q18_cameraVersatility}</span>
              </div>
            )}
            {answers.q20_guidanceComfort && (
              <div>
                <span className="font-semibold text-[#1A1A1A]">Guidance Preference:</span>{" "}
                <span className="text-[#3A3A3A]">{answers.q20_guidanceComfort}</span>
              </div>
            )}
            {(answers.q21_comfortTips?.selected?.length > 0 ||
              answers.q21_comfortTips?.notes) && (
              <div>
                <span className="font-semibold text-[#1A1A1A]">To Feel Relaxed:</span>{" "}
                <span className="text-[#3A3A3A]">
                  {[
                    ...(answers.q21_comfortTips.selected || []),
                    answers.q21_comfortTips?.notes,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 5: WHO'S WHO (FAMILY & VIPs) */}
        <div className="border border-[#E8DFD3] rounded-xl p-3.5 bg-[#FAF8F5]/60 print:bg-white print:border-gray-400">
          <div className="flex items-center gap-1.5 font-cormorant font-bold text-sm tracking-wider uppercase text-[#1A1A1A] border-b border-[#E8DFD3] pb-1.5 mb-2 print:border-gray-300">
            <span className="w-2 h-2 rounded-full bg-[#B08D57] print:bg-black inline-block" />
            5. Who's Who (Key Family)
          </div>
          <div className="space-y-1">
            {familyMembers.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {familyMembers.slice(0, 10).map((m) => (
                  <div key={m.id} className="text-[11px] truncate">
                    <span className="font-medium text-[#1A1A1A]">{m.name}</span>
                    <span className="text-[#5F5F5F] ml-1">({m.relationship})</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic">No family members specified</p>
            )}
            {answers.q10_people?.treeNotes && (
              <p className="text-[11px] text-[#4A453E] italic pt-1 border-t border-[#E8DFD3]/60 print:border-gray-200">
                Notes: {answers.q10_people.treeNotes}
              </p>
            )}
          </div>
        </div>

        {/* SECTION 6: QUIET NOTES & SURPRISES */}
        <div className="border border-[#E8DFD3] rounded-xl p-3.5 bg-[#FAF8F5]/60 print:bg-white print:border-gray-400">
          <div className="flex items-center gap-1.5 font-cormorant font-bold text-sm tracking-wider uppercase text-[#1A1A1A] border-b border-[#E8DFD3] pb-1.5 mb-2 print:border-gray-300">
            <span className="w-2 h-2 rounded-full bg-[#B08D57] print:bg-black inline-block" />
            6. Quiet Notes &amp; Surprises
          </div>
          <div className="space-y-1.5">
            {answers.q16_nonNegotiables && (
              <div>
                <span className="font-semibold text-[#1A1A1A]">Non-negotiables:</span>{" "}
                <span className="text-[#3A3A3A]">{answers.q16_nonNegotiables}</span>
              </div>
            )}
            {answers.q23_oneLastThing?.notes && (
              <div>
                <span className="font-semibold text-[#1A1A1A]">Couple's Notes:</span>{" "}
                <span className="text-[#3A3A3A]">{answers.q23_oneLastThing.notes}</span>
              </div>
            )}
            {submission.privateNotes && (
              <div className="bg-[#FFF8E7] p-1.5 rounded border border-[#FFE082] print:bg-gray-100 print:border-gray-300">
                <span className="font-bold text-[#8C7043] print:text-black">
                  🔒 Studio Internal Note:
                </span>{" "}
                <span className="text-[#1A1A1A] font-medium">{submission.privateNotes}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer bar */}
      <div className="mt-4 pt-3 border-t border-[#E8DFD3] flex items-center justify-between text-[10px] text-[#7A756D] print:border-gray-300">
        <span>Confidential · OAKS Wedding Photography &amp; Films</span>
        <span>Generated for shoot day reference</span>
      </div>
    </div>
  );
};
