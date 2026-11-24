/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { Check, Link as LinkIcon, X } from "lucide-react";
import type {
  FillMode,
  PartnerSlot,
  QuestionnaireAnswers,
  WardrobeSideData,
} from "../types/questionnaire.ts";
import {
  getGroupedWardrobe,
  hasWardrobeSideContent,
  type WardrobeSideKey,
} from "../utils/wardrobe.ts";
import {
  MIN_WARDROBE_LINKS,
  MIN_WARDROBE_PHOTOS,
} from "../config/questionnaireRequirements.ts";
import { VoiceTextarea } from "./VoiceTextarea.tsx";
import { ImageUploader } from "./ImageUploader.tsx";

interface WardrobeQuestionProps {
  wardrobe: QuestionnaireAnswers["wardrobe"];
  legacyWeddingOutfits?: QuestionnaireAnswers["weddingOutfits"];
  onChange: (nextWardrobe: {
    bride: WardrobeSideData;
    groom: WardrobeSideData;
  }) => void;
  onClearLegacy?: () => void;
  partner1?: string;
  partner2?: string;
  splitModeEnabled?: boolean;
  fillMode?: FillMode;
  activePartner?: PartnerSlot;
  /** New drafts: links + photos are required (minimums) and the partner's tab is locked in Separate mode. */
  requireMinimums?: boolean;
}

export const WardrobeQuestion: React.FC<WardrobeQuestionProps> = ({
  wardrobe,
  legacyWeddingOutfits,
  onChange,
  onClearLegacy,
  partner1,
  partner2,
  splitModeEnabled = false,
  fillMode = "together",
  activePartner = "partnerA",
  requireMinimums = false,
}) => {
  const [activeTab, setActiveTab] = useState<WardrobeSideKey>(() =>
    splitModeEnabled && fillMode === "separate" && activePartner === "partnerB"
      ? "groom"
      : "bride"
  );

  useEffect(() => {
    if (splitModeEnabled && fillMode === "separate") {
      setActiveTab(activePartner === "partnerB" ? "groom" : "bride");
    }
  }, [splitModeEnabled, fillMode, activePartner]);

  const brideTabLabel =
    splitModeEnabled && partner1?.trim() ? `${partner1.trim()}'s Wardrobe` : "Bride";
  const groomTabLabel =
    splitModeEnabled && partner2?.trim() ? `${partner2.trim()}'s Wardrobe` : "Groom";
  const bridePossessive =
    splitModeEnabled && partner1?.trim() ? `${partner1.trim()}'s` : "Bride's";
  const groomPossessive =
    splitModeEnabled && partner2?.trim() ? `${partner2.trim()}'s` : "Groom's";

  const [linkDraftBySide, setLinkDraftBySide] = useState<
    Record<WardrobeSideKey, string>
  >({
    bride: "",
    groom: "",
  });

  const grouped = getGroupedWardrobe({
    wardrobe,
    weddingOutfits: legacyWeddingOutfits,
  });

  const currentBride = grouped.bride;
  const currentGroom = grouped.groom;
  const activeSideData = activeTab === "bride" ? currentBride : currentGroom;
  const activeLinkInput = linkDraftBySide[activeTab];

  const updateActiveSide = (
    updater: (current: WardrobeSideData) => WardrobeSideData
  ) => {
    const nextBride =
      activeTab === "bride" ? updater(currentBride) : currentBride;
    const nextGroom =
      activeTab === "groom" ? updater(currentGroom) : currentGroom;
    onChange({
      bride: nextBride,
      groom: nextGroom,
    });
  };

  const handleAddLink = () => {
    const clean = activeLinkInput.trim();
    if (!clean) return;
    updateActiveSide((curr) => ({
      ...curr,
      links: [...curr.links, clean],
    }));
    setLinkDraftBySide((prev) => ({
      ...prev,
      [activeTab]: "",
    }));
  };

  const handleMoveLegacyToSide = (targetSide: WardrobeSideKey) => {
    if (!grouped.legacyShared) return;
    const legacy = grouped.legacyShared;
    const targetCurr = targetSide === "bride" ? currentBride : currentGroom;
    const merged: WardrobeSideData = {
      notes: [targetCurr.notes, legacy.notes].filter((s) => s.trim()).join("\n\n"),
      links: [...targetCurr.links, ...legacy.links],
      photos: [...targetCurr.photos, ...legacy.photos],
    };
    onChange({
      bride: targetSide === "bride" ? merged : currentBride,
      groom: targetSide === "groom" ? merged : currentGroom,
    });
    onClearLegacy?.();
    setActiveTab(targetSide);
  };

  const isSeparate = splitModeEnabled && fillMode === "separate";
  const ownTab: WardrobeSideKey = activePartner === "partnerB" ? "groom" : "bride";
  const lockedOtherTab = requireMinimums && isSeparate && activeTab !== ownTab;
  const otherName =
    (activeTab === "bride" ? partner1 : partner2)?.trim() ||
    (activeTab === "bride" ? "Partner 1" : "Partner 2");
  const otherSideData = activeTab === "bride" ? currentBride : currentGroom;
  const otherSideDone =
    otherSideData.notes.trim().length > 0 &&
    otherSideData.links.length >= MIN_WARDROBE_LINKS &&
    otherSideData.photos.length >= MIN_WARDROBE_PHOTOS;
  const brideHasAny = hasWardrobeSideContent(currentBride);
  const groomHasAny = hasWardrobeSideContent(currentGroom);

  // Gentle non-blocking hint when one side has content and the other side is still empty
  const nonBlockingEmptyHint =
    brideHasAny && !groomHasAny
      ? `${groomPossessive} side is still empty. You can add it now or later.`
      : groomHasAny && !brideHasAny
      ? `${bridePossessive} side is still empty. You can add it now or later.`
      : null;

  return (
    <div className="space-y-4">
      {/* Short helper line directly under the question description */}
      <p className="text-sm text-[#6B655D] leading-relaxed">
        {requireMinimums && isSeparate
          ? "Add your own outfit notes, at least one inspiration link and at least three outfit photos. Your partner fills in their own tab."
          : requireMinimums
          ? "Both of you need outfit notes, at least one inspiration link and at least three outfit photos. Tap a name to switch."
          : "Add ideas for both of you. Tap Bride or Groom to switch. Either of you can fill in the other's side too."}
      </p>

      {/* Legacy draft migration banner (only when opening an unsplit older draft) */}
      {grouped.legacyShared && (
        <div className="p-4 rounded-2xl border border-[#E8DFD3] bg-[#FAF8F5] space-y-2.5">
          <p className="text-xs font-medium text-[#4A453E]">
            Previously saved wardrobe notes from an earlier draft
          </p>
          {grouped.legacyShared.notes && (
            <p className="text-xs text-[#5F5F5F] line-clamp-2">
              {grouped.legacyShared.notes}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[#5F5F5F]">Move to:</span>
            <button
              type="button"
              onClick={() => handleMoveLegacyToSide("bride")}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E8E8E8] bg-white hover:border-[#1A1A1A] text-[#1A1A1A] font-medium cursor-pointer"
            >
              Bride
            </button>
            <button
              type="button"
              onClick={() => handleMoveLegacyToSide("groom")}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E8E8E8] bg-white hover:border-[#1A1A1A] text-[#1A1A1A] font-medium cursor-pointer"
            >
              Groom
            </button>
          </div>
        </div>
      )}

      {/* Sticky Segmented Tab Switcher (Bride | Groom) pinned under top progress bar */}
      <div className="sticky top-[72px] z-20 -mx-1 px-1 py-1.5 bg-white/95 backdrop-blur-xs">
        <div
          role="tablist"
          aria-label="Wedding wardrobe side"
          className="grid grid-cols-2 gap-1 p-1 bg-[#F2EFE9] border border-[#E8E8E8] rounded-2xl"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "bride"}
            onClick={() => setActiveTab("bride")}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "bride"
                ? "bg-white text-[#1A1A1A] font-semibold shadow-2xs"
                : "text-[#5F5F5F] hover:text-[#1A1A1A] font-medium"
            }`}
          >
            <span>{brideTabLabel}</span>
            {brideHasAny && (
              <Check
                className="w-3.5 h-3.5 text-[#B08D57] shrink-0"
                aria-label={`${brideTabLabel} has entries`}
              />
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "groom"}
            onClick={() => setActiveTab("groom")}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "groom"
                ? "bg-white text-[#1A1A1A] font-semibold shadow-2xs"
                : "text-[#5F5F5F] hover:text-[#1A1A1A] font-medium"
            }`}
          >
            <span>{groomTabLabel}</span>
            {groomHasAny && (
              <Check
                className="w-3.5 h-3.5 text-[#B08D57] shrink-0"
                aria-label={`${groomTabLabel} has entries`}
              />
            )}
          </button>
        </div>
      </div>

      {lockedOtherTab && (
        <div
          role="tabpanel"
          data-testid="wardrobe-partner-locked"
          className="p-5 rounded-2xl border border-[#E8DFD3] bg-[#FAF8F5] text-sm text-[#5F5F5F] flex items-center gap-2"
        >
          {otherSideDone ? (
            <>
              <Check className="w-4 h-4 text-[#B08D57] shrink-0" />
              <span>{otherName} has added their wardrobe.</span>
            </>
          ) : (
            <span>{otherName} will fill this in.</span>
          )}
        </div>
      )}

      {/* Active Tab Content: 3 Cards in the exact same order */}
      <div role="tabpanel" className={`space-y-6 ${lockedOtherTab ? "hidden" : ""}`}>
        {/* Card 1: Outfit Details & Styling Notes */}
        <div className="p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl space-y-2">
          <label
            htmlFor={`q13-wardrobe-notes-${activeTab}`}
            className="block text-sm font-semibold text-[#1A1A1A]"
          >
            {activeTab === "bride"
              ? `${bridePossessive} outfit details, colours, designers, or styling notes`
              : `${groomPossessive} outfit details, colours, designers, or styling notes`}
          </label>
          <VoiceTextarea
            id={`q13-wardrobe-notes-${activeTab}`}
            value={activeSideData.notes}
            onChange={(val) =>
              updateActiveSide((curr) => ({
                ...curr,
                notes: val,
              }))
            }
            placeholder={
              activeTab === "bride"
                ? "e.g. Ivory silk saree for the ceremony, custom embroidered lehenga for sangeet, pastel reception gown..."
                : "e.g. Ivory silk sherwani for the ceremony, tailored black bandhgala for reception, pastel kurta for haldi..."
            }
            rows={4}
          />
        </div>

        {/* Card 2: Reference Links (optional) */}
        <div className="space-y-2 p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl">
          <label
            htmlFor={`q13-wardrobe-link-${activeTab}`}
            className="block text-sm font-semibold text-[#1A1A1A]"
          >
            Designer, Pinterest, or wardrobe inspiration links{" "}
            {requireMinimums
              ? `(required · at least ${MIN_WARDROBE_LINKS})`
              : "(optional)"}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id={`q13-wardrobe-link-${activeTab}`}
              type="url"
              value={activeLinkInput}
              onChange={(e) => {
                const nextVal = e.target.value;
                setLinkDraftBySide((prev) => ({
                  ...prev,
                  [activeTab]: nextVal,
                }));
              }}
              placeholder="https://pinterest.com/..."
              className="w-full sm:flex-1 min-w-0 px-4 py-3 text-[16px] sm:text-[18px] bg-white border border-[#E8E8E8] rounded-xl focus:outline-hidden focus:border-[#1A1A1A] min-h-[48px]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && activeLinkInput.trim()) {
                  e.preventDefault();
                  handleAddLink();
                }
              }}
            />
            <button
              type="button"
              onClick={handleAddLink}
              className="w-full sm:w-auto px-5 py-3 bg-[#1A1A1A] text-white rounded-xl text-sm font-medium hover:bg-[#333333] shrink-0 flex items-center justify-center min-h-[48px] transition-colors cursor-pointer whitespace-nowrap"
            >
              + Add link
            </button>
          </div>

          <p
            className={`text-xs sm:text-[13px] leading-relaxed pt-0.5 transition-colors ${
              activeLinkInput.trim()
                ? "text-[#8C7043] font-medium"
                : "text-[#6B655D]"
            }`}
          >
            After pasting a link above, please click{" "}
            <span className="font-semibold text-[#1A1A1A]">+ Add link</span> to
            save it — simply entering it in the box will not add it to your
            response.
          </p>

          {activeSideData.links.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {activeSideData.links.map((link, idx) => (
                <span
                  key={`${link}_${idx}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#E8E8E8] text-xs text-[#1A1A1A] max-w-full min-w-0"
                >
                  <LinkIcon className="w-3.5 h-3.5 text-[#B08D57] shrink-0" />
                  <span className="truncate">{link}</span>
                  <button
                    type="button"
                    onClick={() =>
                      updateActiveSide((curr) => ({
                        ...curr,
                        links: curr.links.filter((_, i) => i !== idx),
                      }))
                    }
                    className="p-1 hover:text-red-600 cursor-pointer shrink-0"
                    aria-label={`Remove link ${idx + 1}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Card 3: Upload Outfit Photos (optional) */}
        <div className="p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl space-y-2">
          <label className="block text-sm font-semibold text-[#1A1A1A]">
            Upload outfit photos, sketches, or styling references{" "}
            {requireMinimums
              ? `(required · at least ${MIN_WARDROBE_PHOTOS} photos · ${Math.min(
                  activeSideData.photos.length,
                  MIN_WARDROBE_PHOTOS
                )} of ${MIN_WARDROBE_PHOTOS} added)`
              : "(optional)"}
          </label>
          <ImageUploader
            key={activeTab}
            images={activeSideData.photos}
            onChange={(imgs) =>
              updateActiveSide((curr) => ({
                ...curr,
                photos: imgs,
              }))
            }
            maxImages={12}
            columns={2}
            uploadCategory={activeTab === "bride" ? "bride_outfit" : "groom_outfit"}
            buttonLabel="Add outfit photos or references"
          />
        </div>
      </div>

      {/* Gentle non-blocking hint when one side still has no entries */}
      {nonBlockingEmptyHint && (
        <p className="text-xs sm:text-sm text-[#8C7043] px-1 pt-1">
          {nonBlockingEmptyHint}
        </p>
      )}
    </div>
  );
};
