/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { Check, Link as LinkIcon, Pencil, Plus, X } from "lucide-react";
import type { DecorEventBoard, FillMode, PartnerSlot, QuestionnaireAnswers } from "../types/questionnaire.ts";
import {
  MAX_DECOR_EVENTS,
  SUGGESTED_DECOR_EVENTS,
  addDecorEventToList,
  hasDecorEventContent,
  isDuplicateDecorEventName,
  mergeSplitDecorEvent,
  splitDecorEventBySide,
  removeDecorEventFromList,
  renameDecorEventInList,
  sanitizeDecorEvents,
} from "../utils/decorEvents.ts";
import {
  MIN_DECOR_IMAGES,
  MIN_DECOR_LINKS,
} from "../config/questionnaireRequirements.ts";
import { ImageUploader } from "./ImageUploader.tsx";
import { VoiceTextarea } from "./VoiceTextarea.tsx";

interface DecorQuestionProps {
  decorEvents: QuestionnaireAnswers["decorEvents"];
  legacyDecorMoodBoard?: QuestionnaireAnswers["decorMoodBoard"];
  onChange: (nextEvents: DecorEventBoard[]) => void;
  onClearLegacy?: () => void;
  partner1?: string;
  partner2?: string;
  fillMode?: FillMode;
  activePartner?: PartnerSlot;
  /** New drafts: Wedding event needs links + images; events can be split by side. */
  requireMinimums?: boolean;
}

export const DecorQuestion: React.FC<DecorQuestionProps> = ({
  decorEvents,
  legacyDecorMoodBoard,
  onChange,
  onClearLegacy,
  partner1,
  partner2,
  fillMode = "together",
  activePartner = "partnerA",
  requireMinimums = false,
}) => {
  const events = sanitizeDecorEvents(decorEvents, legacyDecorMoodBoard);
  const [activeEventId, setActiveEventId] = useState<string>(
    () => events[0]?.id || "wedding"
  );
  const [linkDraftByEvent, setLinkDraftByEvent] = useState<Record<string, string>>({});

  // Inline rename state for active editable event
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  // Confirm remove state (replaces window.confirm cleanly)
  const [confirmRemoveEventId, setConfirmRemoveEventId] = useState<string | null>(null);

  // Add event bottom sheet state
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [customEventDraft, setCustomEventDraft] = useState("");
  const [addEventError, setAddEventError] = useState<string | null>(null);

  const tabButtonRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const resolvedActiveEvent =
    events.find((ev) => ev.id === activeEventId) || events[0];
  const currentActiveId = resolvedActiveEvent?.id || "wedding";

  // Keep activeEventId aligned if events list changed externally
  useEffect(() => {
    if (resolvedActiveEvent && resolvedActiveEvent.id !== activeEventId) {
      setActiveEventId(resolvedActiveEvent.id);
    }
  }, [activeEventId, resolvedActiveEvent]);

  // Close add sheet on Escape key
  useEffect(() => {
    if (!isAddSheetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsAddSheetOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAddSheetOpen]);

  const scrollTabIntoView = (eventId: string) => {
    window.requestAnimationFrame(() => {
      tabButtonRefs.current[eventId]?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    });
  };

  const commitEvents = (nextEvents: DecorEventBoard[]) => {
    onChange(nextEvents);
    if (legacyDecorMoodBoard && (
      legacyDecorMoodBoard.links?.length ||
      legacyDecorMoodBoard.images?.length ||
      legacyDecorMoodBoard.notes?.trim()
    )) {
      onClearLegacy?.();
    }
  };

  const updateActiveEvent = (
    updater: (current: DecorEventBoard) => DecorEventBoard
  ) => {
    const nextEvents = events.map((ev) =>
      ev.id === currentActiveId ? updater(ev) : ev
    );
    commitEvents(nextEvents);
  };

  const handleSelectEvent = (eventId: string) => {
    setActiveEventId(eventId);
    setConfirmRemoveEventId(null);
    if (editingEventId && editingEventId !== eventId) {
      setEditingEventId(null);
      setRenameError(null);
    }
    scrollTabIntoView(eventId);
  };

  const startInlineRename = (ev: DecorEventBoard) => {
    if (ev.isLocked || ev.id === "wedding") return;
    setEditingEventId(ev.id);
    setRenameDraft(ev.name);
    setRenameError(null);
    setConfirmRemoveEventId(null);
  };

  const cancelInlineRename = () => {
    setEditingEventId(null);
    setRenameDraft("");
    setRenameError(null);
  };

  const saveInlineRename = () => {
    if (!editingEventId) return;
    const result = renameDecorEventInList(events, editingEventId, renameDraft);
    if (result.error) {
      setRenameError(result.error);
      return;
    }
    commitEvents(result.nextEvents);
    setEditingEventId(null);
    setRenameDraft("");
    setRenameError(null);
  };

  const handleConfirmRemove = (eventId: string) => {
    const removedIdx = events.findIndex((ev) => ev.id === eventId);
    const nextEvents = removeDecorEventFromList(events, eventId);
    commitEvents(nextEvents);
    setConfirmRemoveEventId(null);
    setEditingEventId(null);
    setRenameError(null);

    if (currentActiveId === eventId) {
      const fallback =
        nextEvents[Math.max(0, removedIdx - 1)] || nextEvents[0];
      if (fallback) {
        setActiveEventId(fallback.id);
      }
    }
  };

  const openAddSheet = () => {
    setCustomEventDraft("");
    setAddEventError(null);
    setIsAddSheetOpen(true);
  };

  const handleAddEventName = (rawName: string) => {
    const result = addDecorEventToList(events, rawName);
    if (result.error || !result.addedEvent) {
      setAddEventError(result.error || "Unable to add event.");
      return;
    }
    commitEvents(result.nextEvents);
    setActiveEventId(result.addedEvent.id);
    setIsAddSheetOpen(false);
    setCustomEventDraft("");
    setAddEventError(null);
    setConfirmRemoveEventId(null);
    setEditingEventId(null);
    scrollTabIntoView(result.addedEvent.id);
  };

  const activeLinkInput = linkDraftByEvent[currentActiveId] ?? "";

  const handleAddLink = () => {
    const clean = activeLinkInput.trim();
    if (!clean) return;
    updateActiveEvent((curr) => ({
      ...curr,
      links: [...curr.links, clean],
    }));
    setLinkDraftByEvent((prev) => ({
      ...prev,
      [currentActiveId]: "",
    }));
  };

  const isSeparate = fillMode === "separate";
  const nameA = partner1?.trim() || "Partner 1";
  const nameB = partner2?.trim() || "Partner 2";
  const activeIsWedding = Boolean(
    resolvedActiveEvent &&
      (resolvedActiveEvent.id === "wedding" || resolvedActiveEvent.isLocked)
  );
  const activeSplit = resolvedActiveEvent?.splitGroupId
    ? resolvedActiveEvent
    : undefined;
  const readOnlySplit = Boolean(
    requireMinimums &&
      isSeparate &&
      activeSplit &&
      activeSplit.splitSide &&
      activeSplit.splitSide !== activePartner
  );
  const otherSideName = activeSplit?.splitSide === "partnerA" ? nameA : nameB;

  const baseNameOf = (ev: DecorEventBoard) =>
    ev.name.replace(/^.*?'s\s+/, "") || ev.name;

  const handleToggleSplit = (split: boolean) => {
    if (!resolvedActiveEvent) return;
    if (split && !activeSplit) {
      const next = splitDecorEventBySide(
        events,
        resolvedActiveEvent.id,
        { partnerA: nameA, partnerB: nameB },
        activePartner
      );
      commitEvents(next);
      const mine = next.find(
        (ev) =>
          ev.splitGroupId === resolvedActiveEvent.id &&
          ev.splitSide === activePartner
      );
      if (mine) setActiveEventId(mine.id);
    } else if (!split && activeSplit?.splitGroupId) {
      const groupId = activeSplit.splitGroupId;
      const next = mergeSplitDecorEvent(events, groupId, baseNameOf(activeSplit));
      commitEvents(next);
      setActiveEventId(groupId);
    }
  };

  const wedLinks = resolvedActiveEvent?.links.length ?? 0;
  const wedImages = resolvedActiveEvent?.images.length ?? 0;

  const availableSuggestions = SUGGESTED_DECOR_EVENTS.filter(
    (suggestion) => !isDuplicateDecorEventName(suggestion, events)
  );
  const atEventLimit = events.length >= MAX_DECOR_EVENTS;
  const confirmTargetEvent = confirmRemoveEventId
    ? events.find((ev) => ev.id === confirmRemoveEventId)
    : undefined;

  return (
    <div className="space-y-4">
      {/* Sticky horizontally scrollable Event Pill Switcher */}
      <div className="sticky top-[72px] z-20 -mx-1 px-1 py-1.5 bg-white/95 backdrop-blur-xs">
        <div
          role="tablist"
          aria-label="Wedding celebration events"
          className="flex items-center gap-1.5 p-1 bg-[#F2EFE9] border border-[#E8E8E8] rounded-2xl overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-w-full"
        >
          {events.map((ev) => {
            const isActive = ev.id === currentActiveId;
            const isLocked = Boolean(ev.isLocked || ev.id === "wedding");
            const isEditing = editingEventId === ev.id;
            const hasContent = hasDecorEventContent(ev);

            if (isEditing) {
              return (
                <div
                  key={ev.id}
                  ref={(el) => {
                    tabButtonRefs.current[ev.id] = el;
                  }}
                  className="min-h-[44px] px-2 py-1 rounded-xl bg-white shadow-2xs flex items-center gap-1 shrink-0 border border-[#B08D57]/50"
                >
                  <input
                    type="text"
                    value={renameDraft}
                    onChange={(e) => {
                      setRenameDraft(e.target.value);
                      if (renameError) setRenameError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveInlineRename();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelInlineRename();
                      }
                    }}
                    aria-label="Event name"
                    autoFocus
                    maxLength={40}
                    className="w-36 sm:w-44 px-2 py-1 text-sm font-medium text-[#1A1A1A] bg-[#FAF8F5] rounded-lg border border-[#E8E8E8] focus:outline-hidden focus:border-[#B08D57]"
                  />
                  <button
                    type="button"
                    onClick={saveInlineRename}
                    aria-label="Save event name"
                    className="min-w-[32px] min-h-[32px] rounded-lg bg-[#1A1A1A] text-white flex items-center justify-center hover:bg-[#333333] cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={cancelInlineRename}
                    aria-label="Cancel renaming"
                    className="min-w-[32px] min-h-[32px] rounded-lg text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#F2EFE9] flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={ev.id}
                ref={(el) => {
                  tabButtonRefs.current[ev.id] = el;
                }}
                className={`min-h-[44px] rounded-xl flex items-center shrink-0 transition-all ${
                  isActive
                    ? "bg-white text-[#1A1A1A] shadow-2xs"
                    : "text-[#5F5F5F] hover:text-[#1A1A1A]"
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleSelectEvent(ev.id)}
                  className={`min-h-[44px] py-2 text-sm whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                    isActive ? "font-semibold" : "font-medium"
                  } ${isActive && !isLocked ? "pl-3.5 pr-1.5" : "px-3.5"}`}
                >
                  <span>{ev.name}</span>
                  {hasContent && (
                    <Check
                      className="w-3.5 h-3.5 text-[#B08D57] shrink-0"
                      aria-label={`${ev.name} has references`}
                    />
                  )}
                </button>

                {isActive && !isLocked && (
                  <div className="flex items-center pr-1.5 gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startInlineRename(ev);
                      }}
                      aria-label={`Rename ${ev.name}`}
                      title={`Rename ${ev.name}`}
                      className="min-w-[28px] min-h-[32px] rounded-lg text-[#6B655D] hover:text-[#1A1A1A] hover:bg-[#F2EFE9] flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingEventId(null);
                        setRenameError(null);
                        setConfirmRemoveEventId(
                          confirmRemoveEventId === ev.id ? null : ev.id
                        );
                      }}
                      aria-label={`Remove ${ev.name}`}
                      title={`Remove ${ev.name}`}
                      className="min-w-[28px] min-h-[32px] rounded-lg text-[#6B655D] hover:text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* "+ Add event" Pill at the end of the row */}
          <button
            type="button"
            onClick={openAddSheet}
            className="min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-medium text-[#8C7043] hover:text-[#1A1A1A] hover:bg-white/70 whitespace-nowrap shrink-0 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Add event</span>
          </button>
        </div>
      </div>

      {/* Inline Rename Validation Error */}
      {renameError && (
        <p className="text-xs text-red-600 px-1" role="alert">
          {renameError}
        </p>
      )}

      {/* Confirmation Step for Removing an Editable Event */}
      {confirmTargetEvent && (
        <div
          role="alertdialog"
          aria-label={`Confirm removing ${confirmTargetEvent.name}`}
          className="p-4 rounded-2xl border border-[#E8DFD3] bg-[#FAF8F5] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-[#1A1A1A]">
              Remove &ldquo;{confirmTargetEvent.name}&rdquo;?
            </p>
            <p className="text-xs text-[#5F5F5F]">
              Remove this event and its references?
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmRemoveEventId(null)}
              className="min-h-[44px] flex-1 sm:flex-none px-4 py-2 rounded-xl border border-[#E8E8E8] bg-white text-sm font-medium text-[#1A1A1A] hover:border-[#1A1A1A] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleConfirmRemove(confirmTargetEvent.id)}
              className="min-h-[44px] flex-1 sm:flex-none px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 cursor-pointer"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Short Helper Line Under the Switcher */}
      <p className="text-sm text-[#6B655D] leading-relaxed">
        Add ideas for each function separately. Tap an event to switch, or add
        another event with +.
      </p>

      {requireMinimums && activeIsWedding && (
        <p className="text-xs font-medium text-[#8C7043]" data-testid="decor-wedding-progress">
          The Wedding event is required: at least {MIN_DECOR_LINKS} link and{" "}
          {MIN_DECOR_IMAGES} images ({Math.min(wedLinks, MIN_DECOR_LINKS)} of{" "}
          {MIN_DECOR_LINKS} link · {Math.min(wedImages, MIN_DECOR_IMAGES)} of{" "}
          {MIN_DECOR_IMAGES} images). Other events are optional.
        </p>
      )}

      {requireMinimums && resolvedActiveEvent && !activeIsWedding && !readOnlySplit && (
        <div
          role="group"
          aria-label="Shared or separate event"
          data-testid="decor-split-toggle"
          className="grid grid-cols-2 gap-1 p-1 bg-[#F2EFE9] border border-[#E8E8E8] rounded-2xl"
        >
          <button
            type="button"
            aria-pressed={!activeSplit}
            onClick={() => handleToggleSplit(false)}
            className={`min-h-[40px] px-3 rounded-xl text-sm cursor-pointer ${
              !activeSplit ? "bg-white font-semibold shadow-2xs" : "text-[#5F5F5F]"
            }`}
          >
            One shared event
          </button>
          <button
            type="button"
            aria-pressed={Boolean(activeSplit)}
            onClick={() => handleToggleSplit(true)}
            className={`min-h-[40px] px-3 rounded-xl text-sm cursor-pointer ${
              activeSplit ? "bg-white font-semibold shadow-2xs" : "text-[#5F5F5F]"
            }`}
          >
            Separate for each side
          </button>
        </div>
      )}

      {readOnlySplit && (
        <div
          data-testid="decor-partner-locked"
          className="p-5 rounded-2xl border border-[#E8DFD3] bg-[#FAF8F5] text-sm text-[#5F5F5F]"
        >
          {hasDecorEventContent(resolvedActiveEvent!)
            ? `\u2713 ${otherSideName} has added ideas here.`
            : `${otherSideName} will fill this in.`}{" "}
          Tap your own tab to add yours.
        </div>
      )}

      {/* Active Event Tab Panel: 3 Cards in exact order */}
      {resolvedActiveEvent && !readOnlySplit && (
        <div role="tabpanel" className="space-y-6">
          {/* Card 1: Decor Links */}
          <div className="space-y-2 p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl">
            <label
              htmlFor={`q14-decor-link-${resolvedActiveEvent.id}`}
              className="block text-sm font-semibold text-[#1A1A1A]"
            >
              Pinterest boards or decor reference links for{" "}
              {resolvedActiveEvent.name}{" "}
              {requireMinimums && activeIsWedding
                ? `(required · at least ${MIN_DECOR_LINKS})`
                : "(optional)"}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id={`q14-decor-link-${resolvedActiveEvent.id}`}
                type="url"
                value={activeLinkInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setLinkDraftByEvent((prev) => ({
                    ...prev,
                    [currentActiveId]: val,
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
              <span className="font-semibold text-[#1A1A1A]">+ Add link</span>{" "}
              to save it — simply entering it in the box will not add it to your
              response.
            </p>

            {resolvedActiveEvent.links.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {resolvedActiveEvent.links.map((link, idx) => (
                  <span
                    key={`${link}_${idx}`}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#E8E8E8] text-xs text-[#1A1A1A] max-w-full min-w-0"
                  >
                    <LinkIcon className="w-3.5 h-3.5 text-[#B08D57] shrink-0" />
                    <span className="truncate">{link}</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveEvent((curr) => ({
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

          {/* Card 2: Decor Mood Board Images */}
          <div className="p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl space-y-2">
            <label className="block text-sm font-semibold text-[#1A1A1A]">
              Upload decor mood board images or colour palettes for{" "}
              {resolvedActiveEvent.name}{" "}
              {requireMinimums && activeIsWedding
                ? `(required · at least ${MIN_DECOR_IMAGES})`
                : "(optional)"}
            </label>
            <ImageUploader
              key={resolvedActiveEvent.id}
              images={resolvedActiveEvent.images}
              onChange={(imgs) =>
                updateActiveEvent((curr) => ({
                  ...curr,
                  images: imgs,
                }))
              }
              maxImages={12}
              columns={2}
              uploadCategory={`decor_${resolvedActiveEvent.id}`}
              buttonLabel="Add decor mood photos"
            />
          </div>

          {/* Card 3: Decor Colour & Lighting Notes */}
          <div className="p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl space-y-2">
            <label
              htmlFor={`q14-decor-notes-${resolvedActiveEvent.id}`}
              className="block text-sm font-semibold text-[#1A1A1A]"
            >
              Colour palettes, florals, lighting, or decor notes for{" "}
              {resolvedActiveEvent.name} (optional)
            </label>
            <VoiceTextarea
              key={resolvedActiveEvent.id}
              id={`q14-decor-notes-${resolvedActiveEvent.id}`}
              value={resolvedActiveEvent.notes}
              onChange={(val) =>
                updateActiveEvent((curr) => ({
                  ...curr,
                  notes: val,
                }))
              }
              placeholder="e.g. Warm candlelit reception, muted terracotta and sage florals, open garden mandap..."
              rows={3}
            />
          </div>
        </div>
      )}

      {/* "+ Add event" Bottom Sheet (full-width on mobile) */}
      {isAddSheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-decor-event-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs"
          onClick={() => setIsAddSheetOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-[#E8E8E8] px-5 pt-3 pb-7 sm:p-6 shadow-xl space-y-5 max-h-[85dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Drag Handle */}
            <div
              aria-hidden="true"
              className="w-10 h-1.5 bg-[#DFD8CD] rounded-full mx-auto sm:hidden"
            />

            <div className="flex items-center justify-between gap-3">
              <h3
                id="add-decor-event-title"
                className="font-lora text-xl text-[#1A1A1A]"
              >
                Add an event
              </h3>
              <button
                type="button"
                onClick={() => setIsAddSheetOpen(false)}
                aria-label="Close"
                className="min-w-[44px] min-h-[44px] rounded-xl text-[#5F5F5F] hover:text-[#1A1A1A] hover:bg-[#FAF8F5] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {atEventLimit ? (
              <div className="p-4 rounded-2xl border border-[#E8DFD3] bg-[#FAF8F5] space-y-1.5">
                <p className="text-sm font-medium text-[#1A1A1A]">
                  Maximum of {MAX_DECOR_EVENTS} events reached
                </p>
                <p className="text-xs text-[#5F5F5F] leading-relaxed">
                  You can keep up to {MAX_DECOR_EVENTS} events here. To add a
                  different function, remove an unused event first.
                </p>
              </div>
            ) : (
              <>
                {availableSuggestions.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-medium text-[#6B655D]">
                      Quick suggestions
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {availableSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => handleAddEventName(suggestion)}
                          className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E8E8E8] bg-[#FAF8F5] hover:bg-[#F2EFE9] hover:border-[#B08D57] text-sm font-medium text-[#1A1A1A] transition-colors cursor-pointer"
                        >
                          + {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2.5 pt-1 border-t border-[#F0ECE4]">
                  <label
                    htmlFor="custom-decor-event-input"
                    className="block text-xs font-medium text-[#6B655D] pt-2"
                  >
                    Type your own event name
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="custom-decor-event-input"
                      type="text"
                      value={customEventDraft}
                      onChange={(e) => {
                        setCustomEventDraft(e.target.value);
                        if (addEventError) setAddEventError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customEventDraft.trim()) {
                          e.preventDefault();
                          handleAddEventName(customEventDraft);
                        }
                      }}
                      placeholder="Type your own event name"
                      maxLength={40}
                      className="w-full sm:flex-1 min-w-0 px-4 py-3 text-[16px] bg-white border border-[#E8E8E8] rounded-xl focus:outline-hidden focus:border-[#1A1A1A] min-h-[48px]"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddEventName(customEventDraft)}
                      disabled={!customEventDraft.trim()}
                      className="w-full sm:w-auto min-h-[44px] px-5 py-3 rounded-xl bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#333333] disabled:opacity-40 disabled:cursor-not-allowed shrink-0 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Add event
                    </button>
                  </div>
                  {addEventError && (
                    <p className="text-xs text-red-600" role="alert">
                      {addEventError}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
