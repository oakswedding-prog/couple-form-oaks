/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ArrowLeft, Send, Edit3, Loader2, AlertCircle, CloudCheck, RotateCcw, User } from "lucide-react";
import { QuestionnaireAnswers } from "../types/questionnaire.ts";
import { STUDIO_NAME, ACCENT_COLOR, STORAGE_KEY } from "../constants.ts";
import { createSubmission } from "../lib/submissions.ts";
import { getMissingMandatoryQuestions } from "../utils/questionnaireValidation.ts";
import { getGroupedQ10People } from "../utils/familyPeople.ts";
import { getGroupedWardrobe } from "../utils/wardrobe.ts";
import { getGroupedDecorEvents } from "../utils/decorEvents.ts";
import {
  getPhotoPreviewSrc,
  retryBackgroundPhotoUpload,
  usePhotoUploadStatus,
} from "../lib/photoUploadManager.ts";

interface ReviewScreenProps {
  answers: QuestionnaireAnswers;
  onEditQuestion: (stepNumber: number) => void;
  onBack: () => void;
  onSubmitted: () => void;
}


export const ReviewScreen: React.FC<ReviewScreenProps> = ({
  answers,
  onEditQuestion,
  onBack,
  onSubmitted,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const p1 = answers.partner1 || "Partner 1";
  const p2 = answers.partner2 || "Partner 2";
  const missingMandatorySteps = getMissingMandatoryQuestions(answers);
  const hasMissingMandatory = missingMandatorySteps.length > 0;

  const handleSend = async () => {
    if (hasMissingMandatory) {
      setErrorMessage(
        "Please complete the highlighted required questions above before sending your story."
      );
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await createSubmission(answers);

      // Successfully saved to Firestore! Clear draft from localStorage
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }

      // Celebratory luxury confetti (dynamically imported)
      try {
        const confetti = (await import("canvas-confetti")).default;
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#B08D57", "#D4AF37", "#1A1A1A", "#8C7043", "#F5F2ED"],
        });
      } catch {
        // ignore
      }

      setIsSubmitting(false);
      onSubmitted();
    } catch (err: any) {
      console.error("Submission failed:", err);
      setIsSubmitting(false);
      setErrorMessage(
        "We could not send your answers just yet. Your words are completely safe. Please try tapping Send again."
      );
    }
  };


  return (
    <div className="max-w-[680px] mx-auto px-5 py-8 sm:py-12 safe-bottom">
      {/* Top bar with back */}
      <div className="flex items-center justify-between pb-6 border-b border-[#E8E8E8]">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-2 -ml-2 rounded-xl text-[#1A1A1A] hover:bg-[#FAFAFA] font-medium"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <span className="text-xs uppercase tracking-widest font-semibold text-[#5F5F5F]">
          Review &amp; Confirm
        </span>
      </div>

      {/* Header */}
      <div className="pt-8 pb-6 space-y-2 text-center sm:text-left">
        <h1 className="font-lora text-[30px] sm:text-[38px] text-[#1A1A1A] font-normal leading-tight">
          Review your answers
        </h1>
        <p className="text-base sm:text-lg text-[#5F5F5F]">
          {p1} &amp; {p2}, take a moment to look over your story. You can edit
          any answer with a single tap.
        </p>
      </div>

      {/* Chapter 1: Your Story */}
      <section className="mt-8 space-y-4">
        <ChapterHeader title="Chapter 1: Your Story" />
        <ReviewItem
          num={1}
          question="What do you call each other?"
          answer={
            <div className="space-y-2">
              <p>
                {`${p1} calls ${p2}: "${answers.q1_calls.aCallsB || "—"}" • ${p2} calls ${p1}: "${answers.q1_calls.bCallsA || "—"}"`}
              </p>
              {answers.couplePhotoUrl && (
                <div className="flex items-center gap-2.5">
                  <ReviewAvatar
                    src={answers.couplePhotoUrl}
                    alt={`${p1} & ${p2}`}
                    sizeClass="w-12 h-12 rounded-lg"
                  />
                  <span className="text-sm text-[#B08D57] font-medium">
                    ✓ Couple photo attached
                  </span>
                </div>
              )}
            </div>
          }
          onEdit={() => onEditQuestion(1)}
        />
        <ReviewItem
          num={2}
          question="What do you both do for living and what are you truly passionate about doing?"
          answer={`${p1}: ${answers.q2_workPassion.partnerA || "—"}\n${p2}: ${answers.q2_workPassion.partnerB || "—"}`}
          onEdit={() => onEditQuestion(2)}
        />
        <ReviewItem
          num={3}
          question="How did you first meet?"
          answer={answers.q3_firstMeet || "Skipped"}
          onEdit={() => onEditQuestion(3)}
        />
        <ReviewItem
          num={4}
          question="What was your first impression of each other?"
          answer={`${p1}: ${answers.q4_firstImpression.partnerA || "—"}\n${p2}: ${answers.q4_firstImpression.partnerB || "—"}`}
          onEdit={() => onEditQuestion(4)}
        />
        <ReviewItem
          num={5}
          question="How would you describe yourselves as a couple in three words?"
          answer={answers.q5_threeWords.filter(Boolean).join(" • ") || "Skipped"}
          onEdit={() => onEditQuestion(5)}
        />
        <ReviewItem
          num={6}
          question="What do you enjoy doing together?"
          answer={
            [
              ...(answers.q6_activities.selected || []),
              answers.q6_activities.other
                ? `Other: ${answers.q6_activities.other}`
                : null,
            ]
              .filter(Boolean)
              .join(", ") || "Skipped"
          }
          onEdit={() => onEditQuestion(6)}
        />
        <ReviewItem
          num={7}
          question="What do you love most about each other?"
          answer={`${p1}: ${answers.q7_loveMost.partnerA || "—"}\n${p2}: ${answers.q7_loveMost.partnerB || "—"}`}
          onEdit={() => onEditQuestion(7)}
        />
        <ReviewItem
          num={8}
          question="Is there a funny story, inside joke, or special moment that defines your relationship?"
          answer={answers.q8_funnyStory || "Skipped"}
          onEdit={() => onEditQuestion(8)}
        />
        <ReviewItem
          num={9}
          question="How did the proposal happen? (If applicable.)"
          answer={
            answers.q9_proposal.choice === "na"
              ? "Not applicable"
              : answers.q9_proposal.story || "Skipped"
          }
          onEdit={() => onEditQuestion(9)}
        />
      </section>

      {/* Chapter 2: Your People */}
      <section className="mt-10 space-y-4">
        <ChapterHeader title="Chapter 2: Your People" />
        <ReviewItem
          num={10}
          question="Who are the most important people you want us to capture?"
          answer={(() => {
            const grouped = getGroupedQ10People(answers.q10_people);
            const hasAny =
              grouped.hasBrideEntry ||
              grouped.hasGroomEntry ||
              grouped.sharedMembers.length > 0 ||
              Boolean(grouped.legacyTreePhotoUrl) ||
              Boolean(grouped.legacyTreeNotes);

            if (!hasAny) {
              return <span className="text-[#5F5F5F]">Skipped</span>;
            }

            const renderSideSummary = (
              label: string,
              sideData: typeof grouped.bride
            ) => {
              const hasSide =
                sideData.photos.length > 0 ||
                sideData.members.length > 0 ||
                Boolean(sideData.notes.trim());
              if (!hasSide) {
                return (
                  <div className="p-3 rounded-xl border border-[#E8E8E8] bg-[#FAF8F5]">
                    <div className="text-xs font-semibold text-[#8C7043] mb-1">
                      {label}
                    </div>
                    <p className="text-xs text-[#7A756D]">No entries added yet</p>
                  </div>
                );
              }
              return (
                <div className="p-3.5 rounded-xl border border-[#E8E8E8] bg-[#FAF8F5] space-y-2.5">
                  <div className="text-xs font-semibold text-[#1A1A1A]">
                    {label}
                    {sideData.photos.length > 0 && (
                      <span className="font-normal text-[#7A756D] ml-1.5">
                        · {sideData.photos.length}{" "}
                        {sideData.photos.length === 1 ? "photo" : "photos"}
                      </span>
                    )}
                  </div>

                  {sideData.photos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {sideData.photos.map((photo, idx) => (
                        <div key={photo.id} className="space-y-1">
                          <ReviewThumb
                            src={photo.url}
                            alt={photo.caption || `${label} photo ${idx + 1}`}
                          />
                          {photo.caption && (
                            <p className="text-[11px] text-[#4A453E] truncate">
                              {photo.caption}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {sideData.members.length > 0 && (
                    <ul className="space-y-1.5 text-xs sm:text-sm text-[#5F5F5F]">
                      {sideData.members.map((m) => (
                        <li key={m.id} className="flex items-center gap-2">
                          {m.photoUrl && (
                            <ReviewAvatar
                              src={m.photoUrl}
                              alt={m.name}
                              sizeClass="w-6 h-6 rounded-full"
                            />
                          )}
                          <span>
                            {m.name} ({m.relationship})
                            {m.mustCapture && " — Must capture"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {sideData.notes.trim() && (
                    <p className="text-xs text-[#5F5F5F]">
                      Notes: {sideData.notes}
                    </p>
                  )}
                </div>
              );
            };

            return (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {renderSideSummary("Bride's Side", grouped.bride)}
                  {renderSideSummary("Groom's Side", grouped.groom)}
                </div>

                {grouped.sharedMembers.length > 0 && (
                  <p className="text-xs text-[#5F5F5F]">
                    Mutual / Both:{" "}
                    {grouped.sharedMembers
                      .map((m) => `${m.name} (${m.relationship})`)
                      .join(", ")}
                  </p>
                )}
                {grouped.legacyTreePhotoUrl && (
                  <p className="text-xs text-[#B08D57] font-medium">
                    Family tree photo reference attached
                  </p>
                )}
                {grouped.legacyTreeNotes && (
                  <p className="text-xs text-[#5F5F5F]">
                    Notes: {grouped.legacyTreeNotes}
                  </p>
                )}
              </div>
            );
          })()}
          onEdit={() => onEditQuestion(10)}
        />
      </section>

      {/* Chapter 3: The Look and Feel */}
      <section className="mt-10 space-y-4">
        <ChapterHeader title="Chapter 3: The Look and Feel" />
        <ReviewItem
          num={11}
          question="How do you want your wedding photographs and films to feel?"
          answer={
            Array.isArray(answers.q11_filmFeel?.selected) &&
            answers.q11_filmFeel.selected.length > 0 ? (
              <div className="space-y-1">
                <div className="font-medium text-[#1A1A1A]">
                  {answers.q11_filmFeel.selected.join(" · ")}
                </div>
                {answers.q11_filmFeel.other && (
                  <div className="text-xs text-[#5F5F5F]">
                    Note: {answers.q11_filmFeel.other}
                  </div>
                )}
              </div>
            ) : typeof answers.q11_filmFeel === "string" && answers.q11_filmFeel ? (
              answers.q11_filmFeel
            ) : (
              "Skipped"
            )
          }
          onEdit={() => onEditQuestion(11)}
        />

        <ReviewItem
          num={12}
          question="Are there any photographers, films, or Pinterest references you love?"
          answer={
            <div>
              {answers.q12_references.links?.length > 0 && (
                <div className="text-sm text-[#1A1A1A] mb-1">
                  Links: {answers.q12_references.links.join(", ")}
                </div>
              )}
              {answers.q12_references.images?.length > 0 && (
                <div className="space-y-1.5 mb-1.5">
                  <div className="text-sm text-[#B08D57] font-medium">
                    ✓ {answers.q12_references.images.length} reference photos attached
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {answers.q12_references.images.slice(0, 6).map((img, i) => (
                      <ReviewThumb
                        key={`${img}_${i}`}
                        src={img}
                        alt={`Visual reference ${i + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}
              {answers.q12_references.notes && (
                <div className="text-sm text-[#5F5F5F]">
                  {answers.q12_references.notes}
                </div>
              )}
              {!answers.q12_references.links?.length &&
                !answers.q12_references.images?.length &&
                !answers.q12_references.notes && <span>Skipped</span>}
            </div>
          }
          onEdit={() => onEditQuestion(12)}
        />
        <ReviewItem
          num={13}
          question="Have you finalised your wedding wardrobe? Share your outfit plans, colour preferences, and styling ideas. Knowing these details helps us plan your photography and films more thoughtfully."
          answer={(() => {
            const groupedWardrobe = getGroupedWardrobe(answers);
            const hasAny =
              groupedWardrobe.hasBrideContent ||
              groupedWardrobe.hasGroomContent ||
              Boolean(groupedWardrobe.legacyShared);

            if (!hasAny) {
              return <span>Skipped</span>;
            }

            const renderSide = (
              label: string,
              side: typeof groupedWardrobe.bride
            ) => {
              const hasSide =
                Boolean(side.notes.trim()) ||
                side.links.length > 0 ||
                side.photos.length > 0;
              if (!hasSide) {
                return (
                  <div className="p-3 rounded-xl border border-[#E8E8E8] bg-[#FAF8F5]">
                    <div className="text-xs font-semibold text-[#8C7043] mb-0.5">
                      {label}
                    </div>
                    <p className="text-xs text-[#7A756D]">Not added yet</p>
                  </div>
                );
              }
              return (
                <div className="p-3 rounded-xl border border-[#E8E8E8] bg-[#FAF8F5] space-y-1.5">
                  <div className="text-xs font-semibold text-[#1A1A1A]">
                    {label}
                  </div>
                  {side.notes.trim() && (
                    <p className="text-sm text-[#5F5F5F] whitespace-pre-wrap">
                      {side.notes}
                    </p>
                  )}
                  {side.links.length > 0 && (
                    <div className="text-xs text-[#1A1A1A] break-all">
                      Links: {side.links.join(", ")}
                    </div>
                  )}
                  {side.photos.length > 0 && (
                    <div className="space-y-1.5 pt-0.5">
                      <div className="text-xs text-[#B08D57] font-medium">
                        ✓ {side.photos.length}{" "}
                        {side.photos.length === 1 ? "photo" : "photos"} attached
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {side.photos.map((imgUrl, idx) => (
                          <ReviewThumb
                            key={`${imgUrl}_${idx}`}
                            src={imgUrl}
                            alt={`${label} reference ${idx + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            };

            if (groupedWardrobe.legacyShared) {
              return renderSide("Outfit Details", groupedWardrobe.legacyShared);
            }

            return (
              <div className="space-y-2.5">
                {renderSide("Bride's wardrobe", groupedWardrobe.bride)}
                {renderSide("Groom's wardrobe", groupedWardrobe.groom)}
              </div>
            );
          })()}
          onEdit={() => onEditQuestion(13)}
        />
        <ReviewItem
          num={14}
          question="Do you have a wedding decor mood board or any visual references for your celebration?"
          answer={(() => {
            const groupedDecor = getGroupedDecorEvents(answers);
            if (!groupedDecor.hasAnyContent) {
              return <span>Skipped</span>;
            }
            return (
              <div className="space-y-3">
                {groupedDecor.populatedEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-xl bg-white border border-[#EFECE6] space-y-1.5"
                  >
                    <p className="text-xs font-semibold text-[#8C7043]">
                      {ev.name}
                    </p>
                    {ev.links.length > 0 && (
                      <div className="text-sm text-[#1A1A1A] break-all">
                        Links: {ev.links.join(", ")}
                      </div>
                    )}
                    {ev.images.length > 0 && (
                      <div className="space-y-1.5 pt-0.5">
                        <div className="text-xs text-[#B08D57] font-medium">
                          ✓ {ev.images.length}{" "}
                          {ev.images.length === 1 ? "image" : "images"} attached
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {ev.images.slice(0, 6).map((img, i) => (
                            <ReviewThumb
                              key={`${img}_${i}`}
                              src={img}
                              alt={`${ev.name} decor reference ${i + 1}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {ev.notes && (
                      <div className="text-sm text-[#5F5F5F] whitespace-pre-wrap">
                        {ev.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
          onEdit={() => onEditQuestion(14)}
        />
        <ReviewItem
          num={15}
          question="What tone are you expecting to set for your wedding day"
          answer={
            Array.isArray(answers.q13_tone?.selected) &&
            answers.q13_tone.selected.length > 0 ? (
              <div className="space-y-1">
                <div className="font-medium text-[#1A1A1A]">
                  {answers.q13_tone.selected.join(" · ")}
                </div>
                {answers.q13_tone.other && (
                  <div className="text-xs text-[#5F5F5F]">
                    Note: {answers.q13_tone.other}
                  </div>
                )}
              </div>
            ) : typeof answers.q13_tone === "string" && answers.q13_tone ? (
              answers.q13_tone
            ) : (
              "Skipped"
            )
          }
          onEdit={() => onEditQuestion(15)}
        />
      </section>

      {/* Chapter 4: Your Day */}
      <section className="mt-10 space-y-4">
        <ChapterHeader title="Chapter 4: Your Day" />
        <ReviewItem
          num={16}
          question="What are the moments you are most looking forward to during your wedding?"
          answer={
            [
              ...(answers.q14_moments.selected || []),
              answers.q14_moments.other
                ? `Other: ${answers.q14_moments.other}`
                : null,
            ]
              .filter(Boolean)
              .join(", ") || "Skipped"
          }
          onEdit={() => onEditQuestion(16)}
        />
        <ReviewItem
          num={17}
          question="Is there anything you definitely want us to capture or avoid?"
          answer={`Definitely capture: ${answers.q15_captureAvoid.definitelyCapture || "—"}\nPlease avoid: ${answers.q15_captureAvoid.pleaseAvoid || "—"}`}
          onEdit={() => onEditQuestion(17)}
        />
        <ReviewItem
          num={18}
          question="Please mention your non negotiables in your films and photographs?"
          answer={answers.q16_nonNegotiables || "Skipped"}
          onEdit={() => onEditQuestion(18)}
        />
        <ReviewItem
          num={19}
          question="Who do you think is going to be more emotional during wedding?"
          answer={answers.q17_emotional || "Skipped"}
          onEdit={() => onEditQuestion(19)}
        />
      </section>

      {/* Chapter 5: Working Together */}
      <section className="mt-10 space-y-4">
        <ChapterHeader title="Chapter 5: Working Together" />
        <ReviewItem
          num={20}
          question="How versatile are you with the camera?"
          answer={answers.q18_cameraVersatility || "Skipped"}
          onEdit={() => onEditQuestion(20)}
        />
        <ReviewItem
          num={21}
          question="What mattered most to you when choosing OAKS Wedding to capture your wedding?"
          answer={answers.choosingOaks || "Skipped"}
          onEdit={() => onEditQuestion(21)}
        />
        <ReviewItem
          num={22}
          question="How comfortable are you with being guided or directed during portraits and filming?"
          answer={answers.q20_guidanceComfort || "Skipped"}
          onEdit={() => onEditQuestion(22)}
        />
        <ReviewItem
          num={23}
          question="Is there anything that would help you feel more comfortable in front of the camera?"
          answer={
            [
              ...(answers.q21_comfortTips.selected || []),
              answers.q21_comfortTips.notes
                ? `Notes: ${answers.q21_comfortTips.notes}`
                : null,
            ]
              .filter(Boolean)
              .join(", ") || "Skipped"
          }
          onEdit={() => onEditQuestion(23)}
        />
        <ReviewItem
          num={24}
          question="What do you hope to feel when you watch your wedding film years from now?"
          answer={answers.q22_futureFeeling || "Skipped"}
          onEdit={() => onEditQuestion(24)}
        />
        <ReviewItem
          num={25}
          question="Who should be our primary point of contact for wedding-related communication and coordination?"
          answer={
            answers.primaryContact?.role ? (
              <div className="space-y-1 text-sm">
                <div className="font-medium text-[#1A1A1A]">
                  {answers.primaryContact.role}
                  {answers.primaryContact.role === "Someone else" &&
                  (answers.primaryContact.side ||
                    answers.primaryContact.designation ||
                    answers.primaryContact.gender)
                    ? ` (${[
                        answers.primaryContact.side,
                        answers.primaryContact.designation || answers.primaryContact.gender,
                      ]
                        .filter(Boolean)
                        .join(" · ")})`
                    : ""}
                </div>
                {(answers.primaryContact.name || answers.primaryContact.phone) && (
                  <div className="text-[#5F5F5F]">
                    {answers.primaryContact.name || "—"}
                    {answers.primaryContact.phone ? ` · ${answers.primaryContact.phone}` : ""}
                  </div>
                )}
              </div>
            ) : (
              "Not provided"
            )
          }
          onEdit={() => onEditQuestion(25)}
        />
      </section>

      {/* One Last Thing */}
      <section className="mt-10 space-y-4">
        <ChapterHeader title="One Last Thing" />
        <ReviewItem
          num={26}
          question="Last but not least, we'd love to hear your story. How did your journey begin, and what would you love us to know about the two of you?"
          answer={answers.loveStoryNarrative || "Skipped"}
          onEdit={() => onEditQuestion(26)}
        />
        <ReviewItem
          num={27}
          question="Is there anything else you'd like to let us know?"
          answer={
            <div>
              <p>{answers.q23_oneLastThing.notes || "Skipped"}</p>
              {answers.q23_oneLastThing.images?.length > 0 && (
                <div className="space-y-1.5 mt-1.5">
                  <p className="text-sm text-[#B08D57] font-medium">
                    ✓ {answers.q23_oneLastThing.images.length} photos attached
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {answers.q23_oneLastThing.images.slice(0, 6).map((img, i) => (
                      <ReviewThumb
                        key={`${img}_${i}`}
                        src={img}
                        alt={`Additional photo ${i + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          }
          onEdit={() => onEditQuestion(27)}
        />
      </section>

      {/* Missing mandatory questions banner */}
      {hasMissingMandatory && (
        <div className="mt-8 p-4 sm:p-5 rounded-2xl bg-[#FAF7F2] border border-[#E8DFD3] space-y-3">
          <div className="flex items-start gap-2.5 text-[#8C7043]">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-[#B08D57]" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#1A1A1A]">
                {missingMandatorySteps.length === 1
                  ? "1 required question still needs your answer"
                  : `${missingMandatorySteps.length} required questions still need your answers`}
              </p>
              <p className="text-xs sm:text-sm text-[#5F5F5F]">
                Tap a question below to complete it before sending your story.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pl-7">
            {missingMandatorySteps.map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => onEditQuestion(step)}
                className="px-3 py-1.5 rounded-lg bg-white border border-[#E8DFD3] hover:border-[#1A1A1A] text-xs font-medium text-[#1A1A1A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Question {step}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error alert if sending fails */}
      {errorMessage && (
        <div className="mt-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
          <div className="text-sm">{errorMessage}</div>
        </div>
      )}

      {/* Bottom Send Action */}
      <div className="sticky bottom-4 z-20 pt-8 pb-4 bg-white/95 backdrop-blur-xs">
        <button
          type="button"
          disabled={isSubmitting || hasMissingMandatory}
          onClick={handleSend}
          className={`w-full min-h-[58px] py-4 px-6 rounded-2xl font-medium text-[19px] shadow-lg transition-all flex items-center justify-center gap-3 ${
            isSubmitting || hasMissingMandatory
              ? "bg-[#E8E8E8] text-[#7A756D] cursor-not-allowed"
              : "bg-[#1A1A1A] hover:bg-[#333333] active:scale-[0.99] text-white cursor-pointer"
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-[#B08D57]" />
              <span>Sending your story to {STUDIO_NAME}...</span>
            </>
          ) : hasMissingMandatory ? (
            <span>Complete required questions to send</span>
          ) : (
            <>
              <Send className="w-5 h-5 text-[#B08D57]" />
              <span>Send to {STUDIO_NAME}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

const ChapterHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="pt-4 pb-2 border-b border-[#E8E8E8] flex items-center gap-3">
    <div
      className="w-2.5 h-2.5 rounded-full"
      style={{ backgroundColor: ACCENT_COLOR }}
    />
    <h2 className="text-xs sm:text-sm uppercase tracking-widest font-semibold text-[#1A1A1A]">
      {title}
    </h2>
  </div>
);

interface ReviewItemProps {
  num: number;
  question: string;
  answer: React.ReactNode;
  onEdit: () => void;
}

const ReviewItem: React.FC<ReviewItemProps> = ({
  num,
  question,
  answer,
  onEdit,
}) => {
  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-[#FAFAFA] border border-[#E8E8E8] flex flex-col sm:flex-row sm:items-start justify-between gap-3 group transition-colors hover:border-[#1A1A1A]/30">
      <div className="flex-1 space-y-1.5">
        <span className="text-xs uppercase tracking-wider font-semibold text-[#5F5F5F]">
          Question {num}
        </span>
        <h3 className="font-lora text-[17px] sm:text-[19px] text-[#1A1A1A] font-normal leading-snug">
          {question}
        </h3>
        <div className="text-[16px] text-[#5F5F5F] leading-relaxed whitespace-pre-line pt-1">
          {answer}
        </div>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="self-end sm:self-start shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E8E8E8] hover:border-[#1A1A1A] text-xs sm:text-sm font-medium text-[#1A1A1A] transition-colors shadow-2xs"
        aria-label={`Edit question ${num}`}
      >
        <Edit3 className="w-3.5 h-3.5 text-[#B08D57]" />
        <span>Edit</span>
      </button>
    </div>
  );
};

function isRenderablePhotoSrc(src: string | undefined | null): src is string {
  return Boolean(
    src &&
      (src.startsWith("blob:") ||
        src.startsWith("http://") ||
        src.startsWith("https://") ||
        src.startsWith("data:image/"))
  );
}

const ReviewThumb: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const uploadEntry = usePhotoUploadStatus(src);
  const previewSrc = getPhotoPreviewSrc(src);

  return (
    <div className="relative w-full aspect-4/3 rounded-lg overflow-hidden border border-[#E8E8E8] bg-[#FAF8F5]">
      {isRenderablePhotoSrc(previewSrc) ? (
        <img src={previewSrc} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-[#7A756D] px-1">
          <CloudCheck className="w-4 h-4 text-[#B08D57]" />
          <span className="text-[10px] font-medium">Saved</span>
        </div>
      )}

      {uploadEntry?.status === "uploading" && (
        <div className="absolute inset-x-0 bottom-0 bg-[#1A1A1A]/75 text-white px-1.5 py-0.5 flex items-center justify-between text-[10px] tabular-nums">
          <Loader2 className="w-2.5 h-2.5 animate-spin text-[#E5C687]" />
          <span>{uploadEntry.progress}%</span>
        </div>
      )}

      {uploadEntry?.status === "error" && (
        <button
          type="button"
          onClick={() => {
            void retryBackgroundPhotoUpload(src).catch(() => {});
          }}
          className="absolute inset-0 bg-[#1A1A1A]/70 text-white flex flex-col items-center justify-center gap-1 text-[10px] font-semibold cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
};

const ReviewAvatar: React.FC<{
  src: string;
  alt: string;
  sizeClass?: string;
}> = ({ src, alt, sizeClass = "w-8 h-8 rounded-full" }) => {
  const previewSrc = getPhotoPreviewSrc(src);

  if (isRenderablePhotoSrc(previewSrc)) {
    return (
      <img
        src={previewSrc}
        alt={alt}
        className={`${sizeClass} object-cover border border-[#E8E8E8] shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} bg-[#FAF8F5] border border-[#E8E8E8] flex items-center justify-center text-[#B08D57] shrink-0`}
      title="Saved photo"
    >
      <User className="w-3.5 h-3.5" />
    </div>
  );
};
