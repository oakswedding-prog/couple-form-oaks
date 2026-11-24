/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { ArrowRight, Link as LinkIcon, Plus, X } from "lucide-react";
import {
  STUDIO_NAME,
  STUDIO_LOGO_URL,
  SUBMIT_ENDPOINT,
  ACCENT_COLOR,
  STORAGE_KEY,
} from "./constants.ts";
import {
  AutoSaveStatus,
  DraftRecord,
  FieldEditMeta,
  FillMode,
  PartnerProgressMap,
  PartnerSlot,
  QuestionnaireAnswers,
  FamilyMember,
} from "./types/questionnaire.ts";
import { Header } from "./components/Header.tsx";
import { WelcomeScreen } from "./components/WelcomeScreen.tsx";
import { ChapterCard } from "./components/ChapterCard.tsx";
import { VoiceTextarea } from "./components/VoiceTextarea.tsx";
import { OptionCard } from "./components/OptionCard.tsx";
import { ImageUploader } from "./components/ImageUploader.tsx";
import { ReviewScreen } from "./components/ReviewScreen.tsx";
import { ThankYouScreen } from "./components/ThankYouScreen.tsx";
import { useAdminAuth } from "./lib/auth.ts";
import { sanitizeWardrobe } from "./utils/wardrobe.ts";
import {
  createDefaultDecorEvents,
  sanitizeDecorEvents,
} from "./utils/decorEvents.ts";
import {
  Q11_MAX_SELECTIONS,
  Q11_REQUIRED_SELECTIONS,
  Q15_MAX_SELECTIONS,
  isQuestionMandatory,
  toggleMultiSelectWithMax,
} from "./utils/questionnaireValidation.ts";
import {
  computePersistedStep,
  ensureCoupleAnonymousAuth,
  getActiveCoupleSession,
  getOrCreateCoupleSession,
  isValidResumeToken,
  resetActiveCoupleSession,
} from "./lib/coupleSession.ts";
import {
  getDraftExpiryMillis,
  loadOnlineDraftWithStatus,
  saveOnlineDraft,
  saveOnlineDraftFieldPatch,
  subscribeOnlineDraft,
} from "./lib/drafts.ts";
import { isSplitModeEnabled, isPerPersonQuestion } from "./config/splitMode.ts";
import {
  buildPartnerProgressSnapshot,
  decorEventsToMap,
  decorMapToEvents,
  detectSharedFieldConflict,
  getEffectiveFillMode,
  getFirstUnansweredStepForPartner,
  getOtherPartnerSlot,
  getOverlayFieldKeyForStep,
  getPartnerAnsweredCount,
  getPartnerDisplayName,
  getPartnerOverlayValue,
  isOverlayValueEmpty,
  isSameForBothForStep,
  mergeDecorEventMaps,
  setPartnerOverlayValue,
  setSameForBothForStep,
  syncDecorMapAndArray,
  validateQuestionStepForContext,
} from "./utils/splitModeHelpers.ts";
import {
  LockedLinkScreen,
  PartnerIdentityGate,
  SameForBothToggle,
  SharedFieldConflictBanner,
} from "./components/SplitModeUI.tsx";
import {
  installSiteUpdateGuard,
  registerBeforeReloadFlusher,
} from "./lib/versionGuard.ts";
import { preloadHeicConverter } from "./utils/imageCompressor.ts";
import {
  findMissingPhotoSlots,
  MissingPhotoSlot,
  resetDraftUploadFolder,
  resumePendingUploadsFromIndexedDb,
  subscribePhotoUploadComplete,
} from "./lib/photoUploadManager.ts";
import {
  clearPendingPostSubmitState,
  loadPendingPostSubmitState,
} from "./lib/photoIndexedDb.ts";
import {
  resumePostSubmitPhotoSync,
  watchPendingPhotosAfterSubmit,
} from "./lib/submissions.ts";
import { logSubmissionError } from "./lib/errorLogger.ts";

const FamilyTreeBuilder = React.lazy(() =>
  import("./components/FamilyTreeBuilder.tsx").then((m) => ({ default: m.FamilyTreeBuilder }))
);
const WardrobeQuestion = React.lazy(() =>
  import("./components/WardrobeQuestion.tsx").then((m) => ({ default: m.WardrobeQuestion }))
);
const DecorQuestion = React.lazy(() =>
  import("./components/DecorQuestion.tsx").then((m) => ({ default: m.DecorQuestion }))
);
const AdminLogin = React.lazy(() =>
  import("./pages/AdminLogin.tsx").then((m) => ({ default: m.AdminLogin }))
);
const AdminDashboard = React.lazy(() =>
  import("./pages/AdminDashboard.tsx").then((m) => ({ default: m.AdminDashboard }))
);
const AdminCoupleDetail = React.lazy(() =>
  import("./pages/AdminCoupleDetail.tsx").then((m) => ({ default: m.AdminCoupleDetail }))
);
const AdminWeddingChecklist = React.lazy(() =>
  import("./pages/AdminWeddingChecklist.tsx").then((m) => ({ default: m.AdminWeddingChecklist }))
);

const ScreenSkeleton: React.FC = () => (
  <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3 p-8 animate-in fade-in duration-150">
    <div className="w-8 h-8 border-2 border-[#B08D57] border-t-transparent rounded-full animate-spin" />
    <span className="text-xs text-[#7A756D] font-medium tracking-wide">Loading...</span>
  </div>
);

const INITIAL_ANSWERS: QuestionnaireAnswers = {
  partner1: "",
  partner2: "",
  weddingDate: "",
  phone: "",
  email: "",
  couplePhotoUrl: undefined,
  q1_calls: { aCallsB: "", bCallsA: "" },
  q2_workPassion: { partnerA: "", partnerB: "" },
  q3_firstMeet: "",
  q4_firstImpression: { partnerA: "", partnerB: "" },
  q5_threeWords: ["", "", ""],
  q6_activities: { selected: [], other: "" },
  q7_loveMost: { partnerA: "", partnerB: "" },
  q8_funnyStory: "",
  q9_proposal: { choice: "", story: "" },
  q10_people: {
    familyMembers: [],
    treePhotoUrl: undefined,
    treeNotes: "",
    brideSide: { photos: [], notes: "" },
    groomSide: { photos: [], notes: "" },
  },
  q11_filmFeel: { selected: [], other: "" },
  q12_references: { links: [], images: [], notes: "" },
  wardrobe: {
    bride: { notes: "", links: [], photos: [] },
    groom: { notes: "", links: [], photos: [] },
  },
  weddingOutfits: { links: [], images: [], notes: "" },
  decorEvents: createDefaultDecorEvents(),
  decorMoodBoard: { links: [], images: [], notes: "" },
  q13_tone: { selected: [], other: "" },
  q14_moments: { selected: [], other: "" },
  q15_captureAvoid: { definitelyCapture: "", pleaseAvoid: "" },
  q16_nonNegotiables: "",
  q17_emotional: "",
  q18_cameraVersatility: "",
  choosingOaks: "",
  q19_whatMattersMost: { selected: [], other: "" },
  q20_guidanceComfort: "",
  q21_comfortTips: { selected: [], notes: "" },
  q22_futureFeeling: "",
  primaryContact: {
    role: "",
    side: "",
    designation: "",
    gender: "",
    name: "",
    phone: "",
  },
  loveStoryNarrative: "",
  q23_oneLastThing: { notes: "", images: [] },
};

function sanitizeAnswers(raw: any): QuestionnaireAnswers {
  if (!raw || typeof raw !== "object") return { ...INITIAL_ANSWERS };
  return {
    partner1: typeof raw.partner1 === "string" ? raw.partner1 : "",
    partner2: typeof raw.partner2 === "string" ? raw.partner2 : "",
    weddingDate: typeof raw.weddingDate === "string" ? raw.weddingDate : "",
    phone: typeof raw.phone === "string" ? raw.phone : "",
    email: typeof raw.email === "string" ? raw.email : "",
    couplePhotoUrl: typeof raw.couplePhotoUrl === "string" ? raw.couplePhotoUrl : undefined,
    q1_calls: {
      aCallsB: typeof raw.q1_calls === "object" && raw.q1_calls ? (raw.q1_calls.aCallsB ?? "") : "",
      bCallsA: typeof raw.q1_calls === "object" && raw.q1_calls ? (raw.q1_calls.bCallsA ?? "") : "",
    },
    q2_workPassion: {
      partnerA: typeof raw.q2_workPassion === "object" && raw.q2_workPassion ? (raw.q2_workPassion.partnerA ?? "") : (typeof raw.q2_workPassion === "string" ? raw.q2_workPassion : ""),
      partnerB: typeof raw.q2_workPassion === "object" && raw.q2_workPassion ? (raw.q2_workPassion.partnerB ?? "") : "",
    },
    q3_firstMeet: typeof raw.q3_firstMeet === "string" ? raw.q3_firstMeet : "",
    q4_firstImpression: {
      partnerA: typeof raw.q4_firstImpression === "object" && raw.q4_firstImpression ? (raw.q4_firstImpression.partnerA ?? "") : (typeof raw.q4_firstImpression === "string" ? raw.q4_firstImpression : ""),
      partnerB: typeof raw.q4_firstImpression === "object" && raw.q4_firstImpression ? (raw.q4_firstImpression.partnerB ?? "") : "",
    },
    q5_threeWords: Array.isArray(raw.q5_threeWords) && raw.q5_threeWords.length === 3
      ? [raw.q5_threeWords[0] ?? "", raw.q5_threeWords[1] ?? "", raw.q5_threeWords[2] ?? ""]
      : ["", "", ""],
    q6_activities: {
      selected: Array.isArray(raw.q6_activities?.selected) ? raw.q6_activities.selected : [],
      other: typeof raw.q6_activities?.other === "string" ? raw.q6_activities.other : "",
    },
    q7_loveMost: {
      partnerA: typeof raw.q7_loveMost === "object" && raw.q7_loveMost ? (raw.q7_loveMost.partnerA ?? "") : (typeof raw.q7_loveMost === "string" ? raw.q7_loveMost : ""),
      partnerB: typeof raw.q7_loveMost === "object" && raw.q7_loveMost ? (raw.q7_loveMost.partnerB ?? "") : "",
    },
    q8_funnyStory: typeof raw.q8_funnyStory === "string" ? raw.q8_funnyStory : "",
    q9_proposal: {
      choice: raw.q9_proposal?.choice ?? "",
      story: raw.q9_proposal?.story ?? "",
    },
    q10_people: {
      familyMembers: Array.isArray(raw.q10_people?.familyMembers) ? raw.q10_people.familyMembers : [],
      treePhotoUrl: raw.q10_people?.treePhotoUrl,
      treeNotes: typeof raw.q10_people?.treeNotes === "string" ? raw.q10_people.treeNotes : "",
      brideSide: {
        photos: Array.isArray(raw.q10_people?.brideSide?.photos)
          ? raw.q10_people.brideSide.photos
          : [],
        notes: typeof raw.q10_people?.brideSide?.notes === "string"
          ? raw.q10_people.brideSide.notes
          : "",
      },
      groomSide: {
        photos: Array.isArray(raw.q10_people?.groomSide?.photos)
          ? raw.q10_people.groomSide.photos
          : [],
        notes: typeof raw.q10_people?.groomSide?.notes === "string"
          ? raw.q10_people.groomSide.notes
          : "",
      },
    },
    q11_filmFeel: {
      selected: Array.isArray(raw.q11_filmFeel?.selected)
        ? raw.q11_filmFeel.selected
        : (Array.isArray(raw.q11_filmFeel)
          ? raw.q11_filmFeel
          : (typeof raw.q11_filmFeel === "string" && raw.q11_filmFeel
            ? [raw.q11_filmFeel]
            : [])),
      other: typeof raw.q11_filmFeel?.other === "string" ? raw.q11_filmFeel.other : "",
    },
    q12_references: {

      links: Array.isArray(raw.q12_references?.links) ? raw.q12_references.links : [],
      images: Array.isArray(raw.q12_references?.images) ? raw.q12_references.images : [],
      notes: typeof raw.q12_references?.notes === "string" ? raw.q12_references.notes : "",
    },
    wardrobe: sanitizeWardrobe(raw.wardrobe),
    weddingOutfits: {
      links: Array.isArray(raw.weddingOutfits?.links) ? raw.weddingOutfits.links : [],
      images: Array.isArray(raw.weddingOutfits?.images) ? raw.weddingOutfits.images : [],
      notes: typeof raw.weddingOutfits?.notes === "string" ? raw.weddingOutfits.notes : "",
    },
    decorEvents: sanitizeDecorEvents(raw.decorEvents, raw.decorMoodBoard),
    decorMoodBoard: {
      links: Array.isArray(raw.decorMoodBoard?.links) ? raw.decorMoodBoard.links : [],
      images: Array.isArray(raw.decorMoodBoard?.images) ? raw.decorMoodBoard.images : [],
      notes: typeof raw.decorMoodBoard?.notes === "string" ? raw.decorMoodBoard.notes : "",
    },
    q13_tone: {
      selected: Array.isArray(raw.q13_tone?.selected)
        ? raw.q13_tone.selected
        : (Array.isArray(raw.q13_tone)
          ? raw.q13_tone
          : (typeof raw.q13_tone === "string" && raw.q13_tone
            ? [raw.q13_tone]
            : [])),
      other: typeof raw.q13_tone?.other === "string" ? raw.q13_tone.other : "",
    },
    q14_moments: {
      selected: Array.isArray(raw.q14_moments?.selected) ? raw.q14_moments.selected : [],
      other: typeof raw.q14_moments?.other === "string" ? raw.q14_moments.other : "",
    },
    q15_captureAvoid: {
      definitelyCapture: typeof raw.q15_captureAvoid === "object" && raw.q15_captureAvoid ? (raw.q15_captureAvoid.definitelyCapture ?? "") : "",
      pleaseAvoid: typeof raw.q15_captureAvoid === "object" && raw.q15_captureAvoid ? (raw.q15_captureAvoid.pleaseAvoid ?? "") : "",
    },
    q16_nonNegotiables: typeof raw.q16_nonNegotiables === "string" ? raw.q16_nonNegotiables : "",
    q17_emotional: typeof raw.q17_emotional === "string" ? raw.q17_emotional : "",
    q18_cameraVersatility: typeof raw.q18_cameraVersatility === "string" ? raw.q18_cameraVersatility : "",
    choosingOaks: typeof raw.choosingOaks === "string" ? raw.choosingOaks : "",
    q19_whatMattersMost: {
      selected: Array.isArray(raw.q19_whatMattersMost?.selected) ? raw.q19_whatMattersMost.selected : [],
      other: typeof raw.q19_whatMattersMost?.other === "string" ? raw.q19_whatMattersMost.other : "",
    },
    q20_guidanceComfort: typeof raw.q20_guidanceComfort === "string" ? raw.q20_guidanceComfort : "",
    q21_comfortTips: {
      selected: Array.isArray(raw.q21_comfortTips?.selected) ? raw.q21_comfortTips.selected : [],
      notes: typeof raw.q21_comfortTips?.notes === "string" ? raw.q21_comfortTips.notes : "",
    },
    q22_futureFeeling: typeof raw.q22_futureFeeling === "string" ? raw.q22_futureFeeling : "",
    primaryContact: {
      role:
        raw.primaryContact?.role === "Bride" ||
        raw.primaryContact?.role === "Groom" ||
        raw.primaryContact?.role === "Someone else"
          ? raw.primaryContact.role
          : "",
      side:
        raw.primaryContact?.side === "Bride's side" ||
        raw.primaryContact?.side === "Groom's side"
          ? raw.primaryContact.side
          : "",
      designation:
        typeof raw.primaryContact?.designation === "string"
          ? raw.primaryContact.designation
          : "",
      gender:
        raw.primaryContact?.gender === "Man" ||
        raw.primaryContact?.gender === "Woman"
          ? raw.primaryContact.gender
          : "",
      name: typeof raw.primaryContact?.name === "string" ? raw.primaryContact.name : "",
      phone: typeof raw.primaryContact?.phone === "string" ? raw.primaryContact.phone : "",
    },
    loveStoryNarrative: typeof raw.loveStoryNarrative === "string" ? raw.loveStoryNarrative : "",
    q23_oneLastThing: {
      notes: typeof raw.q23_oneLastThing?.notes === "string" ? raw.q23_oneLastThing.notes : "",
      images: Array.isArray(raw.q23_oneLastThing?.images) ? raw.q23_oneLastThing.images : [],
    },
    ...(raw.fillMode === "separate" || raw.fillMode === "together"
      ? { fillMode: raw.fillMode }
      : {}),
    ...(raw.partnerAnswers && typeof raw.partnerAnswers === "object"
      ? { partnerAnswers: raw.partnerAnswers }
      : {}),
    ...(raw.decorEventsMap && typeof raw.decorEventsMap === "object"
      ? { decorEventsMap: raw.decorEventsMap }
      : {}),
    ...(raw.fieldMeta && typeof raw.fieldMeta === "object"
      ? { fieldMeta: raw.fieldMeta }
      : {}),
  };
}

// Chapters definition
const CHAPTERS = [
  {
    chapter: 1,
    title: "Your Story",
    subtitle: "How two worlds came together and what makes you smile.",
    startQ: 1,
    endQ: 9,
    range: "Questions 1–9",
  },
  {
    chapter: 2,
    title: "Your People",
    subtitle: "The family and friends who mean the world to you both.",
    startQ: 10,
    endQ: 10,
    range: "Question 10",
  },
  {
    chapter: 3,
    title: "The Look and Feel",
    subtitle: "Visual atmosphere, aesthetic tone, and creative inspiration.",
    startQ: 11,
    endQ: 15,
    range: "Questions 11–15",
  },
  {
    chapter: 4,
    title: "Your Day",
    subtitle: "The unmissable moments, traditions, and emotions.",
    startQ: 16,
    endQ: 19,
    range: "Questions 16–19",
  },
  {
    chapter: 5,
    title: "Working Together",
    subtitle: "Making you feel relaxed, confident, and completely yourself.",
    startQ: 20,
    endQ: 25,
    range: "Questions 20–25",
  },
  {
    chapter: 6,
    title: "One Last Thing",
    subtitle: "Any quiet details, surprises, or notes we should keep close.",
    startQ: 26,
    endQ: 27,
    range: "Questions 26–27",
  },
];

export default function App() {
  const [answers, setAnswers] = useState<QuestionnaireAnswers>(INITIAL_ANSWERS);
  const [currentStep, setCurrentStep] = useState<number>(0); // 0 = welcome, 1-27 = questions, 28 = review, 29 = thank you
  const [activeChapterCard, setActiveChapterCard] = useState<number | null>(null);
  const [editingFromReview, setEditingFromReview] = useState<boolean>(false);
  const [hasLoadedStorage, setHasLoadedStorage] = useState<boolean>(false);
  const [savedStepNotice, setSavedStepNotice] = useState<number>(0);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const [resumeToken, setResumeToken] = useState<string | null>(
    () => getActiveCoupleSession()?.resumeToken ?? null
  );
  const [isRestoringResumeLink, setIsRestoringResumeLink] = useState<boolean>(false);
  const [resumeBanner, setResumeBanner] = useState<string | null>(null);
  const [siteUpdatingNotice, setSiteUpdatingNotice] = useState<boolean>(false);
  const [pendingPhotosAfterSend, setPendingPhotosAfterSend] = useState<number>(0);
  const [missingPhotoSlots, setMissingPhotoSlots] = useState<MissingPhotoSlot[]>([]);

  // Phase 0 Link Lock state (always active) + Feature-Flagged Split Mode state (OFF by default)
  const splitModeEnabled = isSplitModeEnabled();
  const [isLinkLocked, setIsLinkLocked] = useState<boolean>(false);
  const [fillMode, setFillMode] = useState<FillMode>("together");
  const [activePartner, setActivePartner] = useState<PartnerSlot>("partnerA");
  const [togetherActiveTab, setTogetherActiveTab] = useState<PartnerSlot>("partnerA");
  const [needsPartnerGate, setNeedsPartnerGate] = useState<boolean>(false);
  const [invitedAlready, setInvitedAlready] = useState<boolean>(false);
  const [partnerProgress, setPartnerProgress] = useState<PartnerProgressMap>({
    partnerA: { done: false, answeredCount: 0 },
    partnerB: { done: false, answeredCount: 0 },
  });
  const [sharedConflict, setSharedConflict] = useState<{
    step: number;
    fieldKey: string;
    otherPartnerName: string;
    theirValue: unknown;
    myValue: unknown;
  } | null>(null);

  // Client-side URL Routing
  const [currentPath, setCurrentPath] = useState<string>(
    typeof window !== "undefined" ? window.location.pathname : "/"
  );

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, "", path);
    setCurrentPath(window.location.pathname);
    window.scrollTo(0, 0);
  };

  // Admin Auth state
  const { user, isAdmin, isLoading: authLoading, signOut } = useAdminAuth();

  // Preload the active admin route chunk concurrently while auth settles
  useEffect(() => {
    if (!currentPath.startsWith("/admin")) return;
    if (currentPath.startsWith("/admin/couple/")) {
      void import("./pages/AdminCoupleDetail.tsx");
    } else if (currentPath.startsWith("/admin/checklist")) {
      void import("./pages/AdminWeddingChecklist.tsx");
    } else {
      void import("./pages/AdminDashboard.tsx");
    }
    void import("./pages/AdminLogin.tsx");
  }, [currentPath]);

  // Link input state for Q12
  const [newLinkInput, setNewLinkInput] = useState<string>("");

  // Refs for latest state inside debounced/flush callbacks
  const autoAdvanceTimerRef = useRef<any>(null);
  const draftDebounceTimerRef = useRef<any>(null);
  const draftRetryTimerRef = useRef<any>(null);
  const answersRef = useRef<QuestionnaireAnswers>(answers);
  answersRef.current = answers;
  const currentStepRef = useRef<number>(currentStep);
  currentStepRef.current = currentStep;
  const savedStepNoticeRef = useRef<number>(savedStepNotice);
  savedStepNoticeRef.current = savedStepNotice;
  const lastSavedDigestRef = useRef<string>("");
  const draftOwnerUidRef = useRef<string | undefined>(undefined);
  const participantUidsRef = useRef<string[] | undefined>(undefined);
  const draftExpiryMsRef = useRef<number | undefined>(undefined);
  const fillModeRef = useRef<FillMode>(fillMode);
  fillModeRef.current = fillMode;
  const activePartnerRef = useRef<PartnerSlot>(activePartner);
  activePartnerRef.current = activePartner;
  const partnerProgressRef = useRef<PartnerProgressMap>(partnerProgress);
  partnerProgressRef.current = partnerProgress;
  const localFieldMetaRef = useRef<Record<string, FieldEditMeta>>({});

  // Silent anonymous login & HEIC converter preload for couples (non-admin routes)
  useEffect(() => {
    if (currentPath.startsWith("/admin")) return;
    void ensureCoupleAnonymousAuth();

    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const idleId = w.requestIdleCallback(() => void preloadHeicConverter(), {
        timeout: 2500,
      });
      return () => w.cancelIdleCallback?.(idleId);
    }
    const timer = window.setTimeout(() => void preloadHeicConverter(), 800);
    return () => window.clearTimeout(timer);
  }, [currentPath]);

  // Flush draft helper (local + Firestore) used by debounced auto-save, visibility hide, and site-update guard
  const flushOnlineDraftNow = async (): Promise<boolean> => {
    const latestAnswers = answersRef.current;
    const latestStep = currentStepRef.current;
    if (latestStep === 29) return true; // Already submitted

    const hasNames =
      latestAnswers.partner1.trim().length > 0 &&
      latestAnswers.partner2.trim().length > 0;
    if (!hasNames && latestStep === 0) return true;

    const session = getOrCreateCoupleSession();
    if (session.resumeToken !== resumeToken) {
      setResumeToken(session.resumeToken);
    }

    const persistedStep = computePersistedStep(latestStep, savedStepNoticeRef.current);

    // Local browser backup (immediate)
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ answers: latestAnswers, step: persistedStep })
      );
    } catch {
      // localStorage blocked or full — online draft below still protects the couple
    }

    const digest = JSON.stringify({
      a: latestAnswers,
      s: persistedStep,
      id: session.submissionId,
    });
    if (digest === lastSavedDigestRef.current) {
      return true;
    }

    setAutoSaveStatus("saving");
    try {
      const nextProgress = splitModeEnabled
        ? buildPartnerProgressSnapshot(
            latestAnswers,
            partnerProgressRef.current
          )
        : undefined;
      if (nextProgress) {
        setPartnerProgress(nextProgress);
      }

      await saveOnlineDraft({
        resumeToken: session.resumeToken,
        submissionId: session.submissionId,
        answers: splitModeEnabled
          ? { ...latestAnswers, fillMode: fillModeRef.current }
          : latestAnswers,
        currentStep: persistedStep,
        furthestStep: Math.max(persistedStep, savedStepNoticeRef.current),
        createdAt: session.createdAt,
        ...(splitModeEnabled
          ? {
              fillMode: fillModeRef.current,
              partnerProgress: nextProgress,
              fieldMeta: localFieldMetaRef.current,
            }
          : {}),
        existingOwnerUid: draftOwnerUidRef.current,
        participantUids: participantUidsRef.current,
        linkExpiresAtMs: draftExpiryMsRef.current,
      });
      lastSavedDigestRef.current = digest;
      setAutoSaveStatus("saved");
      return true;
    } catch (err) {
      setAutoSaveStatus("retrying");
      void logSubmissionError({
        step: "draft_save",
        error: err,
        submissionId: session.submissionId,
      });
      return false;
    }
  };

  // Site update guard: detect new deploys, flush draft safely, then reload with resume token
  useEffect(() => {
    registerBeforeReloadFlusher(async () => {
      await flushOnlineDraftNow();
    });
    const uninstall = installSiteUpdateGuard(() => {
      setSiteUpdatingNotice(true);
    });
    return () => {
      uninstall();
      registerBeforeReloadFlusher(null);
    };
  }, []);

  // Load from ?resume=<token>, pending post-submit photo sync, OR localStorage on mount (BEFORE enabling auto-save)
  useEffect(() => {
    let cancelled = false;

    async function hydrateInitialState() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const resumeParam = urlParams.get("resume");
        const isAutostart = urlParams.get("autostart") === "1";

        if (isValidResumeToken(resumeParam)) {
          setIsRestoringResumeLink(true);
          const loadResult = await loadOnlineDraftWithStatus(resumeParam);
          if (cancelled) return;

          if (loadResult.status === "inactive") {
            // Link is locked, revoked, expired (> 7 days), or invalid — show ZERO answers!
            try {
              window.history.replaceState({}, "", window.location.pathname || "/");
            } catch {
              // ignore
            }
            setIsLinkLocked(true);
            setIsRestoringResumeLink(false);
            setHasLoadedStorage(true);
            return;
          }

          const restored = loadResult.draft;
          if (!cancelled && restored) {
            const cleanAnswers = sanitizeAnswers(restored.answers);
            draftOwnerUidRef.current = restored.ownerUid;
            participantUidsRef.current = restored.participantUids;
            draftExpiryMsRef.current = getDraftExpiryMillis(restored);
            if (restored.partnerProgress) {
              setPartnerProgress(restored.partnerProgress);
            }
            if (restored.fieldMeta) {
              localFieldMetaRef.current = { ...restored.fieldMeta };
            }

            const restoredMode = getEffectiveFillMode({
              fillMode: restored.fillMode || cleanAnswers.fillMode,
            });
            if (splitModeEnabled) {
              setFillMode(restoredMode);
            }

            // Resume any unfinished photo blobs still in IndexedDB on this device
            // and identify any missing slots that need to be re-added on a new device.
            const { resumedCount, missingSlots } = await resumePendingUploadsFromIndexedDb(
              restored.submissionId,
              cleanAnswers,
              restored.photoStatuses
            );
            if (cancelled) return;

            let targetStep =
              restored.status === "submitted"
                ? 29
                : typeof restored.currentStep === "number" && restored.currentStep >= 1
                ? Math.min(28, restored.currentStep)
                : 1;

            let bannerText = "Welcome back — your saved answers have been restored.";

            if (restored.status === "submitted") {
              if (missingSlots.length > 0) {
                // Reopen directly on the first missing photo slot so the couple can re-add ONLY those photos
                targetStep = missingSlots[0].stepNumber;
                bannerText =
                  "Your answers are already saved. Re-add the missing photo(s) listed below, then tap Send to attach them.";
              } else if (resumedCount > 0) {
                // Blobs were recovered from IndexedDB — stay on Thank You screen and finish syncing to Firestore
                targetStep = 29;
                setPendingPhotosAfterSend(resumedCount);
                watchPendingPhotosAfterSubmit(restored.submissionId, cleanAnswers);
              }
            } else if (resumedCount > 0) {
              bannerText = `Welcome back — your saved answers have been restored and ${resumedCount} photo upload${resumedCount === 1 ? "" : "s"} resumed automatically.`;
            }

            setAnswers(cleanAnswers);
            setResumeToken(restored.id);
            setSavedStepNotice(targetStep);
            setCurrentStep(targetStep);
            setMissingPhotoSlots(missingSlots);
            setAutoSaveStatus("saved");
            setResumeBanner(bannerText);

            if (splitModeEnabled && restoredMode === "separate" && restored.status !== "submitted") {
              setNeedsPartnerGate(true);
            }

            try {
              localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ answers: cleanAnswers, step: targetStep })
              );
            } catch {
              // ignore
            }
            // Remove ?resume=<token> from visible URL bar to prevent accidental leaks/referrers
            try {
              window.history.replaceState({}, "", window.location.pathname || "/");
            } catch {
              // ignore
            }
            setIsRestoringResumeLink(false);
            setHasLoadedStorage(true);
            return;
          }
          if (!cancelled) {
            setIsRestoringResumeLink(false);
          }
        }

        // Check if the couple refreshed the Thank You page while photos were still uploading!
        const pendingPostSubmit = loadPendingPostSubmitState();
        if (pendingPostSubmit && !window.location.pathname.startsWith("/admin")) {
          const cleanAnswers = sanitizeAnswers(pendingPostSubmit.answers);
          const { resumedCount, missingCount } = await resumePostSubmitPhotoSync(
            pendingPostSubmit
          );
          if (cancelled) return;
          const missingSlots = findMissingPhotoSlots(cleanAnswers);
          setAnswers(cleanAnswers);
          if (pendingPostSubmit.resumeToken) {
            setResumeToken(pendingPostSubmit.resumeToken);
          }
          setPendingPhotosAfterSend(resumedCount);
          setMissingPhotoSlots(missingCount > 0 ? missingSlots : []);
          setCurrentStep(29);
          setHasLoadedStorage(true);
          return;
        }

        // Fallback: load local browser backup & resume any queued IndexedDB photo uploads
        let restoredAnswersForIdb: QuestionnaireAnswers | null = null;
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.answers) {
            const cleanLocal = sanitizeAnswers(parsed.answers);
            restoredAnswersForIdb = cleanLocal;
            setAnswers(cleanLocal);
          }
          if (typeof parsed.step === "number" && parsed.step > 0) {
            setSavedStepNotice(parsed.step);
          }
        }

        const existingSession = getActiveCoupleSession();
        if (existingSession) {
          setResumeToken(existingSession.resumeToken);
          if (restoredAnswersForIdb && !window.location.pathname.startsWith("/admin")) {
            const { resumedCount, missingSlots } = await resumePendingUploadsFromIndexedDb(
              existingSession.submissionId,
              restoredAnswersForIdb
            );
            if (!cancelled) {
              if (missingSlots.length > 0) {
                setMissingPhotoSlots(missingSlots);
              }
              if (resumedCount > 0) {
                setResumeBanner(
                  `Resumed ${resumedCount} photo upload${resumedCount === 1 ? "" : "s"} automatically.`
                );
              }
            }
          }
        }

        if (isAutostart) {
          setAnswers((prev) => ({
            ...prev,
            partner1: prev.partner1 || "Aarav",
            partner2: prev.partner2 || "Meera",
          }));
          setCurrentStep(1);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setHasLoadedStorage(true);
        }
      }
    }

    void hydrateInitialState();
    return () => {
      cancelled = true;
    };
  }, []);

  // Create stable submission ID + resume token the moment couple enters both names
  useEffect(() => {
    if (!hasLoadedStorage || currentPath.startsWith("/admin")) return;
    if (answers.partner1.trim() && answers.partner2.trim()) {
      const session = getOrCreateCoupleSession();
      if (session.resumeToken !== resumeToken) {
        setResumeToken(session.resumeToken);
      }
    }
  }, [answers.partner1, answers.partner2, hasLoadedStorage, currentPath, resumeToken]);

  // Keep localStorage synced WITHOUT overwriting saved step > 0 with Step 0,
  // and debounce online Firestore draft auto-save (1.4s) with automatic retry on failure.
  useEffect(() => {
    if (!hasLoadedStorage || currentPath.startsWith("/admin") || currentStep === 29) {
      return;
    }

    const persistedStep = computePersistedStep(currentStep, savedStepNotice);
    if (currentStep > 0 && currentStep > savedStepNotice) {
      setSavedStepNotice(currentStep);
    }

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ answers, step: persistedStep })
      );
    } catch {
      // ignore localStorage quota/privacy blocks
    }

    const hasNames =
      answers.partner1.trim().length > 0 && answers.partner2.trim().length > 0;
    if (!hasNames && currentStep === 0) return;

    if (draftDebounceTimerRef.current) clearTimeout(draftDebounceTimerRef.current);
    if (draftRetryTimerRef.current) clearTimeout(draftRetryTimerRef.current);

    draftDebounceTimerRef.current = setTimeout(async () => {
      const ok = await flushOnlineDraftNow();
      if (!ok) {
        draftRetryTimerRef.current = setTimeout(() => {
          void flushOnlineDraftNow();
        }, 4500);
      }
    }, 1400);

    return () => {
      if (draftDebounceTimerRef.current) clearTimeout(draftDebounceTimerRef.current);
      if (draftRetryTimerRef.current) clearTimeout(draftRetryTimerRef.current);
    };
  }, [answers, currentStep, hasLoadedStorage, currentPath]);

  // Flush online draft immediately if the couple switches apps or minimizes WhatsApp/Safari
  useEffect(() => {
    if (currentPath.startsWith("/admin")) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && hasLoadedStorage) {
        void flushOnlineDraftNow();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [hasLoadedStorage, currentPath]);

  // Whenever any background photo upload confirms in Firebase Storage while filling the form,
  // clear matching missing-photo slots and save the newly confirmed Storage path to the online draft.
  useEffect(() => {
    if (!hasLoadedStorage || currentPath.startsWith("/admin")) return;
    return subscribePhotoUploadComplete((completedEntry) => {
      setMissingPhotoSlots((prev) =>
        prev.filter(
          (slot) =>
            slot.id !== completedEntry.localToken &&
            slot.category !== completedEntry.category
        )
      );
      if (currentStepRef.current < 29) {
        lastSavedDigestRef.current = "";
        void flushOnlineDraftNow();
      }
    });
  }, [hasLoadedStorage, currentPath]);

  // Real-time collaborative draft sync (ONLY active when ENABLE_SPLIT_MODE is ON and fillMode === "separate")
  useEffect(() => {
    if (
      !splitModeEnabled ||
      fillMode !== "separate" ||
      !resumeToken ||
      !hasLoadedStorage ||
      currentPath.startsWith("/admin") ||
      currentStep === 29
    ) {
      return;
    }

    return subscribeOnlineDraft(
      resumeToken,
      (remoteDraft: DraftRecord) => {
        draftOwnerUidRef.current = remoteDraft.ownerUid;
        participantUidsRef.current = remoteDraft.participantUids;
        draftExpiryMsRef.current = getDraftExpiryMillis(remoteDraft);
        if (remoteDraft.partnerProgress) {
          setPartnerProgress(remoteDraft.partnerProgress);
        }

        const remoteAnswers = sanitizeAnswers(remoteDraft.answers);
        const me = activePartnerRef.current;
        const other = getOtherPartnerSlot(me);

        // Detect simultaneous shared-field edit conflict on the currently visible step
        const stepSharedFieldMap: Record<number, keyof QuestionnaireAnswers> = {
          3: "q3_firstMeet",
          5: "q5_threeWords",
          6: "q6_activities",
          8: "q8_funnyStory",
          9: "q9_proposal",
          12: "q12_references",
          25: "primaryContact",
          26: "loveStoryNarrative",
        };
        const currentSharedKey = stepSharedFieldMap[currentStepRef.current];
        if (currentSharedKey && remoteDraft.fieldMeta?.[currentSharedKey]) {
          const localMeta = localFieldMetaRef.current[currentSharedKey];
          const isFieldLocallyDirty = Boolean(
            localMeta &&
              Date.now() - Date.parse(localMeta.updatedAt) <= 5000
          );
          const theirVal = remoteAnswers[currentSharedKey];
          const myVal = answersRef.current[currentSharedKey];
          const conflict = detectSharedFieldConflict({
            fieldKey: String(currentSharedKey),
            activePartner: me,
            localValue: myVal,
            remoteValue: theirVal,
            remoteMeta: remoteDraft.fieldMeta[currentSharedKey],
            partnerNames: {
              partner1: answersRef.current.partner1,
              partner2: answersRef.current.partner2,
            },
            isFieldLocallyDirty,
          });
          if (conflict) {
            setSharedConflict({
              step: currentStepRef.current,
              fieldKey: String(currentSharedKey),
              otherPartnerName: conflict.otherPartnerName,
              theirValue: theirVal,
              myValue: myVal,
            });
          }
        }

        // Merge remote partner's answers & per-event Q14 decor map without overwriting active partner's local edits
        setAnswers((prev) => {
          const next = { ...prev };
          if (remoteAnswers.partnerAnswers?.[other]) {
            next.partnerAnswers = {
              ...(prev.partnerAnswers || {}),
              [other]: remoteAnswers.partnerAnswers[other],
              sameForBoth: {
                ...(remoteAnswers.partnerAnswers.sameForBoth || {}),
                ...(prev.partnerAnswers?.sameForBoth || {}),
              },
            };
          }

          // Merge Q10 & Q13 other partner's side safely
          if (other === "partnerA" && remoteAnswers.q10_people?.brideSide) {
            next.q10_people = {
              ...prev.q10_people,
              brideSide: remoteAnswers.q10_people.brideSide,
            };
          } else if (other === "partnerB" && remoteAnswers.q10_people?.groomSide) {
            next.q10_people = {
              ...prev.q10_people,
              groomSide: remoteAnswers.q10_people.groomSide,
            };
          }

          if (other === "partnerA" && remoteAnswers.wardrobe?.bride) {
            next.wardrobe = {
              bride: remoteAnswers.wardrobe.bride,
              groom: prev.wardrobe?.groom || { notes: "", links: [], photos: [] },
            };
          } else if (other === "partnerB" && remoteAnswers.wardrobe?.groom) {
            next.wardrobe = {
              bride: prev.wardrobe?.bride || { notes: "", links: [], photos: [] },
              groom: remoteAnswers.wardrobe.groom,
            };
          }

          // Merge Q14 decor events per eventId
          if (remoteAnswers.decorEventsMap || prev.decorEventsMap) {
            const localMap = prev.decorEventsMap || decorEventsToMap(prev.decorEvents);
            const remoteMap =
              remoteAnswers.decorEventsMap || decorEventsToMap(remoteAnswers.decorEvents);
            const mergedMap = mergeDecorEventMaps(localMap, remoteMap);
            next.decorEventsMap = mergedMap;
            next.decorEvents = decorMapToEvents(mergedMap);
          }

          return next;
        });
      },
      (reason) => {
        if (reason === "locked" || reason === "revoked" || reason === "expired") {
          setIsLinkLocked(true);
        }
      }
    );
  }, [splitModeEnabled, fillMode, resumeToken, hasLoadedStorage, currentPath, currentStep]);

  // Clean up timers
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
      if (draftDebounceTimerRef.current) clearTimeout(draftDebounceTimerRef.current);
      if (draftRetryTimerRef.current) clearTimeout(draftRetryTimerRef.current);
    };
  }, []);

  const p1 = answers.partner1 || "Partner 1";
  const p2 = answers.partner2 || "Partner 2";

  // Check if a question transition triggers a chapter card
  const navigateToStep = (targetStep: number, isForward = true) => {
    if (editingFromReview) {
      // If editing from review, stay on targetStep or return to review
      if (targetStep > 27 || targetStep === 28) {
        setCurrentStep(28);
        setEditingFromReview(false);
        return;
      }
    }

    if (isForward && !editingFromReview) {
      const matchedChapter = CHAPTERS.find((c) => c.startQ === targetStep);
      if (matchedChapter) {
        setActiveChapterCard(matchedChapter.chapter);
        return;
      }
    }

    setCurrentStep(targetStep);
  };

  const activeFillMode: FillMode = splitModeEnabled ? fillMode : "together";

  const handleNext = (bypassValidation = false) => {
    if (
      !bypassValidation &&
      !validateQuestionStepForContext(
        currentStep,
        answersRef.current,
        activeFillMode,
        activePartnerRef.current
      ).isComplete
    ) {
      return;
    }
    if (editingFromReview) {
      setCurrentStep(28);
      setEditingFromReview(false);
      return;
    }
    navigateToStep(currentStep + 1, true);
  };

  const handleSkip = () => {
    if (isQuestionMandatory(currentStep)) {
      return;
    }
    if (editingFromReview) {
      setCurrentStep(28);
      setEditingFromReview(false);
      return;
    }
    navigateToStep(currentStep + 1, true);
  };

  const handleBack = () => {
    if (editingFromReview) {
      setCurrentStep(28);
      setEditingFromReview(false);
      return;
    }
    if (currentStep > 0) {
      navigateToStep(currentStep - 1, false);
    }
  };

  const handleSingleChoiceSelect = (
    updater: () => void,
    customNext?: () => void
  ) => {
    updater();
    if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
    autoAdvanceTimerRef.current = setTimeout(() => {
      if (customNext) {
        customNext();
      } else {
        handleNext(true);
      }
    }, 180);
  };

  const handleChapterProceed = () => {
    const chapterNum = activeChapterCard;
    setActiveChapterCard(null);
    if (chapterNum) {
      const chapter = CHAPTERS.find((c) => c.chapter === chapterNum);
      if (chapter) {
        setCurrentStep(chapter.startQ);
      }
    }
  };

  // Welcome screen handlers
  const handleBegin = () => {
    navigateToStep(1, true);
  };

  const handleResume = () => {
    if (savedStepNotice >= 28) {
      setCurrentStep(28);
    } else if (savedStepNotice >= 1) {
      setCurrentStep(savedStepNotice);
    } else {
      setCurrentStep(1);
    }
  };

  // Mark active partner's part done in Separate mode; returns whether both are now done
  const handleMarkMyPartDone = async (
    slot: PartnerSlot
  ): Promise<{ bothDone: boolean; nextProgress: PartnerProgressMap }> => {
    const existingWithDone: PartnerProgressMap = {
      partnerA: { ...(partnerProgressRef.current?.partnerA || { done: false, answeredCount: 0 }) },
      partnerB: { ...(partnerProgressRef.current?.partnerB || { done: false, answeredCount: 0 }) },
    };
    existingWithDone[slot] = {
      ...existingWithDone[slot],
      done: true,
      doneAt: new Date().toISOString(),
    };
    const nextProgress = buildPartnerProgressSnapshot(
      answersRef.current,
      existingWithDone
    );
    setPartnerProgress(nextProgress);
    const session = getOrCreateCoupleSession();
    try {
      await saveOnlineDraftFieldPatch({
        resumeToken: session.resumeToken,
        submissionId: session.submissionId,
        patch: {
          fillMode: "separate",
        },
        answersForSummary: answersRef.current,
        partnerProgress: nextProgress,
        existingOwnerUid: draftOwnerUidRef.current,
        participantUids: participantUidsRef.current,
      });
    } catch {
      await flushOnlineDraftNow();
    }
    const otherSlot = getOtherPartnerSlot(slot);
    const bothDone = Boolean(nextProgress[slot]?.done && nextProgress[otherSlot]?.done);
    return { bothDone, nextProgress };
  };

  // Helper for per-person overlay questions (Q11, Q15–Q24, Q27):
  // - When splitModeEnabled is false: reads/writes top-level answers 100% identically to today
  // - In Separate mode: reads/writes activePartner's overlay slot (and syncs top-level fallback when empty)
  // - In Together mode: when "Same answer for both of us" is checked, reads/writes top-level;
  //   when unchecked, reads/writes togetherActiveTab's overlay slot.
  const getStepOverlayTargetSlot = (step: number): PartnerSlot | null => {
    if (!splitModeEnabled || !getOverlayFieldKeyForStep(step)) return null;
    if (fillMode === "separate") return activePartner;
    if (!isSameForBothForStep(answers, step)) return togetherActiveTab;
    return null;
  };

  const readOverlayField = <K extends keyof QuestionnaireAnswers>(
    step: number,
    key: K
  ): QuestionnaireAnswers[K] => {
    const targetSlot = getStepOverlayTargetSlot(step);
    if (!targetSlot) return answers[key];
    return getPartnerOverlayValue(answers, targetSlot, key as any) as QuestionnaireAnswers[K];
  };

  const writeOverlayField = <K extends keyof QuestionnaireAnswers>(
    step: number,
    key: K,
    updater: (prevVal: QuestionnaireAnswers[K]) => QuestionnaireAnswers[K]
  ) => {
    const targetSlot = getStepOverlayTargetSlot(step);
    setAnswers((prev) => {
      if (!targetSlot) {
        return { ...prev, [key]: updater(prev[key]) };
      }
      const currentSlotVal = getPartnerOverlayValue(
        prev,
        targetSlot,
        key as any
      ) as QuestionnaireAnswers[K];
      const nextSlotVal = updater(currentSlotVal);
      return setPartnerOverlayValue(prev, targetSlot, key as any, nextSlotVal as any);
    });
  };

  const recordSharedFieldEdit = (fieldKey: string) => {
    if (!splitModeEnabled || fillMode !== "separate") return;
    localFieldMetaRef.current[fieldKey] = {
      updatedBy: activePartnerRef.current,
      updatedAt: new Date().toISOString(),
    };
  };

  const prevSharedFieldDigestRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!splitModeEnabled || fillMode !== "separate" || !hasLoadedStorage) return;
    const stepSharedFieldMap: Record<number, keyof QuestionnaireAnswers> = {
      3: "q3_firstMeet",
      5: "q5_threeWords",
      6: "q6_activities",
      8: "q8_funnyStory",
      9: "q9_proposal",
      12: "q12_references",
      25: "primaryContact",
      26: "loveStoryNarrative",
    };
    const key = stepSharedFieldMap[currentStep];
    if (!key) return;
    const digest = JSON.stringify(answers[key]);
    const prevDigest = prevSharedFieldDigestRef.current[String(key)];
    if (prevDigest !== undefined && prevDigest !== digest) {
      recordSharedFieldEdit(String(key));
    }
    prevSharedFieldDigestRef.current[String(key)] = digest;
  }, [splitModeEnabled, fillMode, hasLoadedStorage, currentStep, answers]);

  const renderPerPersonControls = (step: number) => {
    if (!splitModeEnabled || !isPerPersonQuestion(step) || !getOverlayFieldKeyForStep(step)) {
      return null;
    }
    const fieldKey = getOverlayFieldKeyForStep(step)!;

    if (fillMode === "separate") {
      const otherSlot = getOtherPartnerSlot(activePartner);
      const otherName = getPartnerDisplayName(answers, otherSlot);
      const myName = getPartnerDisplayName(answers, activePartner);
      const otherVal = answers.partnerAnswers?.[otherSlot]?.[fieldKey];
      const otherAnswered = !isOverlayValueEmpty(fieldKey, otherVal);
      return (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-[#FAF8F5] border border-[#EFECE6] text-xs text-[#5F5F5F]">
          <span>
            Answering for <strong className="text-[#1A1A1A]">{myName}</strong>
          </span>
          <span className={otherAnswered ? "text-emerald-800 font-medium" : "text-[#7A756D]"}>
            {otherAnswered ? `${otherName} answered` : `${otherName} hasn't answered yet`}
          </span>
        </div>
      );
    }

    const sameForBoth = isSameForBothForStep(answers, step);
    return (
      <div className="space-y-3">
        <SameForBothToggle
          checked={sameForBoth}
          onChange={(checked) =>
            setAnswers((prev) => setSameForBothForStep(prev, step, checked))
          }
          partner1={p1}
          partner2={p2}
        />
        {!sameForBoth && (
          <div
            role="tablist"
            aria-label="Choose partner to answer for"
            className="grid grid-cols-2 gap-1 p-1 bg-[#F2EFE9] border border-[#E8E8E8] rounded-2xl"
          >
            <button
              type="button"
              role="tab"
              aria-selected={togetherActiveTab === "partnerA"}
              onClick={() => setTogetherActiveTab("partnerA")}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs sm:text-sm transition-all cursor-pointer truncate ${
                togetherActiveTab === "partnerA"
                  ? "bg-white text-[#1A1A1A] font-semibold shadow-2xs"
                  : "text-[#5F5F5F] hover:text-[#1A1A1A] font-medium"
              }`}
            >
              {p1}&apos;s answer
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={togetherActiveTab === "partnerB"}
              onClick={() => setTogetherActiveTab("partnerB")}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs sm:text-sm transition-all cursor-pointer truncate ${
                togetherActiveTab === "partnerB"
                  ? "bg-white text-[#1A1A1A] font-semibold shadow-2xs"
                  : "text-[#5F5F5F] hover:text-[#1A1A1A] font-medium"
              }`}
            >
              {p2}&apos;s answer
            </button>
          </div>
        )}
      </div>
    );
  };

  // Reset form
  const handleReset = () => {
    const activeSessionId = getActiveCoupleSession()?.submissionId;
    setAnswers(INITIAL_ANSWERS);
    setCurrentStep(0);
    setSavedStepNotice(0);
    setAutoSaveStatus("idle");
    setResumeToken(null);
    setPendingPhotosAfterSend(0);
    setMissingPhotoSlots([]);
    setResumeBanner(null);
    setIsLinkLocked(false);
    setFillMode("together");
    setActivePartner("partnerA");
    setNeedsPartnerGate(false);
    setPartnerProgress({
      partnerA: { done: false, answeredCount: 0 },
      partnerB: { done: false, answeredCount: 0 },
    });
    setSharedConflict(null);
    draftOwnerUidRef.current = undefined;
    participantUidsRef.current = undefined;
    draftExpiryMsRef.current = undefined;
    lastSavedDigestRef.current = "";
    clearPendingPostSubmitState();
    resetActiveCoupleSession();
    resetDraftUploadFolder(activeSessionId);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  // 1. Route Check: Couple Detail View (/admin/couple/:id)
  if (currentPath.startsWith("/admin/couple/")) {
    const coupleId = currentPath.replace("/admin/couple/", "").split("/")[0].split("?")[0];
    if (authLoading) {
      return (
        <div className="min-h-[100dvh] bg-[#FAF8F5] flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#B08D57] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#7A756D]">Verifying team access...</p>
        </div>
      );
    }
    if (!user || !isAdmin) {
      return (
        <React.Suspense fallback={<ScreenSkeleton />}>
          <AdminLogin onBackToForm={() => navigateTo("/")} />
        </React.Suspense>
      );
    }
    return (
      <React.Suspense fallback={<ScreenSkeleton />}>
        <AdminCoupleDetail
          submissionId={coupleId}
          onBack={() => navigateTo("/admin")}
        />
      </React.Suspense>
    );
  }

  // 2. Route Check: Admin Wedding Checklist (/admin/checklist)
  if (currentPath === "/admin/checklist" || currentPath === "/admin/checklist/") {
    if (authLoading) {
      return (
        <div className="min-h-[100dvh] bg-[#FAF8F5] flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#B08D57] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#7A756D]">Verifying team access...</p>
        </div>
      );
    }
    if (!user || !isAdmin) {
      return (
        <React.Suspense fallback={<ScreenSkeleton />}>
          <AdminLogin onBackToForm={() => navigateTo("/")} />
        </React.Suspense>
      );
    }
    return (
      <React.Suspense fallback={<ScreenSkeleton />}>
        <AdminWeddingChecklist
          onBack={() => navigateTo("/admin")}
          onSignOut={signOut}
          userEmail={user.email || undefined}
          userName={user.displayName || undefined}
        />
      </React.Suspense>
    );
  }

  // 3. Route Check: Admin Dashboard (/admin)
  if (currentPath === "/admin" || currentPath === "/admin/") {
    if (authLoading) {
      return (
        <div className="min-h-[100dvh] bg-[#FAF8F5] flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#B08D57] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#7A756D]">Verifying team access...</p>
        </div>
      );
    }
    if (!user || !isAdmin) {
      return (
        <React.Suspense fallback={<ScreenSkeleton />}>
          <AdminLogin onBackToForm={() => navigateTo("/")} />
        </React.Suspense>
      );
    }
    return (
      <React.Suspense fallback={<ScreenSkeleton />}>
        <AdminDashboard
          onSelectCouple={(id) => navigateTo(`/admin/couple/${id}`)}
          onOpenChecklist={() => navigateTo("/admin/checklist")}
          onSignOut={signOut}
        />
      </React.Suspense>
    );
  }

  // Phase 0: Locked, revoked, or expired resume link shows ONLY the neutral message & zero answers
  if (isLinkLocked) {
    return <LockedLinkScreen />;
  }

  // Separate mode invite link identity picker ("Who's opening this?")
  if (splitModeEnabled && needsPartnerGate && !isRestoringResumeLink) {
    return (
      <PartnerIdentityGate
        partner1={answers.partner1}
        partner2={answers.partner2}
        onSelectPartner={(slot) => {
          setActivePartner(slot);
          setNeedsPartnerGate(false);
          const nextUnanswered = getFirstUnansweredStepForPartner(answers, slot);
          setCurrentStep(nextUnanswered);
        }}
      />
    );
  }

  // Active chapter title for header
  const currentChapter = CHAPTERS.find(
    (c) => currentStep >= c.startQ && currentStep <= c.endQ
  );

  // If chapter card active, render it
  if (activeChapterCard !== null) {
    const chapter = CHAPTERS.find((c) => c.chapter === activeChapterCard);
    if (chapter) {
      return (
        <ChapterCard
          chapterNumber={
            chapter.chapter === 6 ? "One Last Thing" : chapter.chapter
          }
          title={chapter.title}
          subtitle={chapter.subtitle}
          questionRange={chapter.range}
          onProceed={handleChapterProceed}
          splitModeEnabled={splitModeEnabled}
          fillMode={fillMode}
          resumeToken={resumeToken}
          partner1={answers.partner1}
          partner2={answers.partner2}
          activePartner={activePartner}
          invitedAlready={invitedAlready}
          onPartnerInvited={() => setInvitedAlready(true)}
        />
      );
    }
  }

  if (isRestoringResumeLink) {
    return (
      <div className="min-h-[100dvh] bg-[#FAF8F5] flex flex-col items-center justify-center space-y-3 p-6">
        <div className="w-8 h-8 border-2 border-[#B08D57] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#5F5F5F]">Restoring your saved answers…</p>
      </div>
    );
  }

  // Welcome Screen (Step 0)
  if (currentStep === 0) {
    return (
      <WelcomeScreen
        partner1={answers.partner1}
        partner2={answers.partner2}
        weddingDate={answers.weddingDate || ""}
        phone={answers.phone || ""}
        email={answers.email || ""}
        onPartner1Change={(v) =>
          setAnswers((prev) => ({ ...prev, partner1: v }))
        }
        onPartner2Change={(v) =>
          setAnswers((prev) => ({ ...prev, partner2: v }))
        }
        onWeddingDateChange={(v) =>
          setAnswers((prev) => ({ ...prev, weddingDate: v }))
        }
        onPhoneChange={(v) =>
          setAnswers((prev) => ({ ...prev, phone: v }))
        }
        onEmailChange={(v) =>
          setAnswers((prev) => ({ ...prev, email: v }))
        }
        onOpenAdmin={() => navigateTo("/admin")}
        onBegin={handleBegin}
        hasSavedProgress={savedStepNotice > 0}
        savedStep={savedStepNotice}
        onResume={handleResume}
        splitModeEnabled={splitModeEnabled}
        fillMode={fillMode}
        activePartner={activePartner}
        onFillModeChange={(mode) => {
          setFillMode(mode);
          setAnswers((prev) => ({ ...prev, fillMode: mode }));
        }}
        onActivePartnerChange={setActivePartner}
      />
    );
  }


  // Review Screen (Step 28 — bundled directly, never lazy-loaded)
  if (currentStep === 28) {
    return (
      <ReviewScreen
        answers={answers}
        resumeToken={resumeToken}
        onEditQuestion={(stepNum) => {
          setEditingFromReview(true);
          setCurrentStep(stepNum);
        }}
        onBack={() => setCurrentStep(27)}
        onSubmitted={(result) => {
          const remaining = result.pendingPhotoCount + result.failedPhotoCount;
          setPendingPhotosAfterSend(remaining);
          if (remaining === 0) {
            setResumeToken(null);
            setMissingPhotoSlots([]);
          }
          setCurrentStep(29);
        }}
        splitModeEnabled={splitModeEnabled}
        fillMode={fillMode}
        activePartner={activePartner}
        partnerProgress={partnerProgress}
        participantUids={participantUidsRef.current}
        invitedAlready={invitedAlready}
        onPartnerInvited={() => setInvitedAlready(true)}
        onMarkMyPartDone={handleMarkMyPartDone}
      />
    );
  }

  // Thank You Screen (Step 29 — bundled directly, never lazy-loaded)
  if (currentStep === 29) {
    return (
      <ThankYouScreen
        answers={answers}
        initialPendingPhotos={pendingPhotosAfterSend}
        missingPhotoSlots={missingPhotoSlots}
        onReaddMissingPhoto={(stepNumber) => {
          setEditingFromReview(true);
          setCurrentStep(stepNumber);
        }}
        onReset={handleReset}
      />
    );
  }

  // Question Screens (1-27)
  return (
    <div className="min-h-[100dvh] flex flex-col justify-between bg-white safe-bottom">
      {/* Sticky Header with Progress Bar, Real Auto-Save Status & Resume Link */}
      <Header
        currentStep={currentStep}
        totalSteps={27}
        chapterTitle={currentChapter ? currentChapter.title : undefined}
        onBack={handleBack}
        canGoBack={true}
        editingFromReview={editingFromReview}
        onReturnToReview={() => {
          if (
            !validateQuestionStepForContext(
              currentStep,
              answersRef.current,
              activeFillMode,
              activePartnerRef.current
            ).isComplete
          ) {
            return;
          }
          setCurrentStep(28);
          setEditingFromReview(false);
        }}
        autoSaveStatus={autoSaveStatus}
        resumeToken={resumeToken}
        partner1={answers.partner1}
        partner2={answers.partner2}
        email={answers.email}
        splitModeEnabled={splitModeEnabled}
        fillMode={fillMode}
        activePartner={activePartner}
        partnerACount={
          splitModeEnabled && fillMode === "separate"
            ? getPartnerAnsweredCount(answers, "partnerA")
            : undefined
        }
        partnerBCount={
          splitModeEnabled && fillMode === "separate"
            ? getPartnerAnsweredCount(answers, "partnerB")
            : undefined
        }
        invitedAlready={invitedAlready}
        onChangeFillMode={(mode) => {
          setFillMode(mode);
          setAnswers((prev) => ({ ...prev, fillMode: mode }));
        }}
        onChangeActivePartner={setActivePartner}
        onPartnerInvited={() => setInvitedAlready(true)}
      />

      {siteUpdatingNotice && (
        <div className="bg-[#FAF7F2] border-b border-[#E8DFD3] px-4 py-2 text-center text-xs text-[#5C492A]">
          Updating to the latest version — your answers are saved…
        </div>
      )}

      {resumeBanner && (
        <div className="bg-[#ECFDF5] border-b border-[#A7F3D0] px-4 py-2 text-center text-xs text-[#065F46] flex items-center justify-center gap-3">
          <span>{resumeBanner}</span>
          <button
            type="button"
            onClick={() => setResumeBanner(null)}
            className="underline font-medium cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Missing Photos Checklist (only appears if previously selected photos couldn't be restored from IndexedDB, e.g. different phone or cleared browser data) */}
      {missingPhotoSlots.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="max-w-[640px] mx-auto space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-amber-950">
                {missingPhotoSlots.length === 1
                  ? "1 photo needs to be re-added (its original file wasn't stored on this device):"
                  : `${missingPhotoSlots.length} photos need to be re-added (their original files weren't stored on this device):`}
              </p>
              <button
                type="button"
                onClick={() => setMissingPhotoSlots([])}
                className="text-[11px] text-amber-800 hover:text-amber-950 underline cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {missingPhotoSlots.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setCurrentStep(slot.stepNumber)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    currentStep === slot.stepNumber
                      ? "bg-[#1A1A1A] text-white border-[#1A1A1A]"
                      : "bg-white text-amber-950 border-amber-300 hover:border-[#1A1A1A]"
                  }`}
                >
                  <span>{slot.label}</span>
                  <span className="opacity-75">→ Q{slot.stepNumber}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main One-Question Container (widened on Step 10 for side-by-side Bride & Groom cards) */}
      <main
        className={`flex-1 w-full mx-auto px-5 py-6 sm:py-10 flex flex-col justify-between animate-in fade-in duration-150 will-change-[opacity,transform] ${
          currentStep === 10 ? "max-w-[980px]" : "max-w-[640px]"
        }`}
      >
        <div className="space-y-6">
          {splitModeEnabled &&
            sharedConflict &&
            sharedConflict.step === currentStep && (
              <SharedFieldConflictBanner
                otherPartnerName={sharedConflict.otherPartnerName}
                onKeepTheirs={() => {
                  const key = sharedConflict.fieldKey as keyof QuestionnaireAnswers;
                  setAnswers((prev) => ({ ...prev, [key]: sharedConflict.theirValue }));
                  setSharedConflict(null);
                }}
                onUseMine={() => {
                  recordSharedFieldEdit(sharedConflict.fieldKey);
                  setSharedConflict(null);
                  lastSavedDigestRef.current = "";
                  void flushOnlineDraftNow();
                }}
              />
            )}

          {/* QUESTION 1 */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <QuestionHeader
                title="What do you call each other?"
                helper="Nicknames, pet names, or whatever makes you both smile."
                required
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="q1-calls-a2b" className="block text-base font-medium text-[#1A1A1A] cursor-pointer">
                    {p1} calls {p2} <span className="text-[#B08D57]">*</span>
                  </label>
                  <input
                    id="q1-calls-a2b"
                    name="q1-calls-a2b"
                    type="text"
                    value={answers.q1_calls?.aCallsB ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAnswers((prev) => ({
                        ...prev,
                        q1_calls: {
                          aCallsB: val,
                          bCallsA: prev.q1_calls?.bCallsA ?? "",
                        },
                      }));
                    }}
                    placeholder="e.g. Honey, Meeru"
                    autoComplete="off"
                    className="w-full px-5 py-4 text-[18px] bg-white border border-[#E8E8E8] rounded-2xl focus:outline-hidden focus:border-[#1A1A1A] min-h-[58px]"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="q1-calls-b2a" className="block text-base font-medium text-[#1A1A1A] cursor-pointer">
                    {p2} calls {p1} <span className="text-[#B08D57]">*</span>
                  </label>
                  <input
                    id="q1-calls-b2a"
                    name="q1-calls-b2a"
                    type="text"
                    value={answers.q1_calls?.bCallsA ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAnswers((prev) => ({
                        ...prev,
                        q1_calls: {
                          aCallsB: prev.q1_calls?.aCallsB ?? "",
                          bCallsA: val,
                        },
                      }));
                    }}
                    placeholder="e.g. Captain, Aaru"
                    autoComplete="off"
                    className="w-full px-5 py-4 text-[18px] bg-white border border-[#E8E8E8] rounded-2xl focus:outline-hidden focus:border-[#1A1A1A] min-h-[58px]"
                  />
                </div>
              </div>

              {/* Optional Couple Photo Upload */}
              <div className="p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl space-y-2">
                <div className="space-y-0.5">
                  <label className="block text-sm font-semibold text-[#1A1A1A]">
                    Upload a photo of the two of you (optional)
                  </label>
                  <p className="text-xs text-[#5F5F5F]">
                    Share a favourite photo together so our team can put faces to your story right away.
                  </p>
                </div>
                <ImageUploader
                  images={answers.couplePhotoUrl ? [answers.couplePhotoUrl] : []}
                  onChange={(imgs) =>
                    setAnswers((prev) => ({
                      ...prev,
                      couplePhotoUrl: imgs[0] || undefined,
                    }))
                  }
                  maxImages={1}
                  uploadCategory="couple_photo"
                  buttonLabel="Add a couple photo"
                />
              </div>
            </div>
          )}

          {/* QUESTION 2 */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <QuestionHeader
                title="What do you both do for living and what are you truly passionate about doing?"
                helper="Type, speak, or both. One box for each of you."
                required
              />
              <div className="space-y-6">
                <VoiceTextarea
                  id="q2-work-partner1"
                  label={`${p1}'s work & passions *`}
                  value={answers.q2_workPassion?.partnerA ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q2_workPassion: {
                        partnerA: val,
                        partnerB: prev.q2_workPassion?.partnerB ?? "",
                      },
                    }))
                  }
                  placeholder={`What does ${p1} do, and what lights them up outside of work?`}
                  rows={3}
                />
                <VoiceTextarea
                  id="q2-work-partner2"
                  label={`${p2}'s work & passions *`}
                  value={answers.q2_workPassion?.partnerB ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q2_workPassion: {
                        partnerA: prev.q2_workPassion?.partnerA ?? "",
                        partnerB: val,
                      },
                    }))
                  }
                  placeholder={`What does ${p2} do, and what lights them up outside of work?`}
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* QUESTION 3 */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <QuestionHeader
                title="How did you first meet?"
                helper="Tell the unedited story — who saw whom first, where, and when."
                required
              />
              <VoiceTextarea
                id="q3-first-meet"
                value={answers.q3_firstMeet ?? ""}
                onChange={(val) =>
                  setAnswers((prev) => ({ ...prev, q3_firstMeet: val }))
                }
                placeholder="Where were you? What was the setting, the conversation, or the spark?"
                rows={5}
              />
            </div>
          )}

          {/* QUESTION 4 */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <QuestionHeader
                title="What was your first impression of each other?"
                helper="What ran through each of your minds that very first day?"
              />
              <div className="space-y-6">
                <VoiceTextarea
                  id="q4-impression-partner1"
                  label={`${p1}'s first impression of ${p2}`}
                  value={answers.q4_firstImpression?.partnerA ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q4_firstImpression: {
                        partnerA: val,
                        partnerB: prev.q4_firstImpression?.partnerB ?? "",
                      },
                    }))
                  }
                  placeholder={`What was the very first thought ${p1} had?`}
                  rows={3}
                />
                <VoiceTextarea
                  id="q4-impression-partner2"
                  label={`${p2}'s first impression of ${p1}`}
                  value={answers.q4_firstImpression?.partnerB ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q4_firstImpression: {
                        partnerA: prev.q4_firstImpression?.partnerA ?? "",
                        partnerB: val,
                      },
                    }))
                  }
                  placeholder={`What was the very first thought ${p2} had?`}
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* QUESTION 5 */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <QuestionHeader
                title="How would you describe yourselves as a couple in three words?"
                helper="Three single words that capture your collective vibe."
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="space-y-1.5">
                    <label className="block text-xs font-medium text-[#5F5F5F] uppercase tracking-wider">
                      Word {idx + 1}
                    </label>
                    <input
                      type="text"
                      value={answers.q5_threeWords[idx]}
                      onChange={(e) => {
                        const newWords: [string, string, string] = [
                          ...answers.q5_threeWords,
                        ];
                        newWords[idx] = e.target.value.trim();
                        setAnswers((prev) => ({
                          ...prev,
                          q5_threeWords: newWords,
                        }));
                      }}
                      placeholder={
                        idx === 0
                          ? "e.g. Playful"
                          : idx === 1
                          ? "Warm"
                          : "Grounded"
                      }
                      className="w-full px-4 py-3.5 text-[18px] text-[#1A1A1A] bg-white border border-[#E8E8E8] rounded-2xl focus:outline-hidden focus:border-[#1A1A1A] min-h-[58px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* QUESTION 6 */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <QuestionHeader
                title="What do you enjoy doing together?"
                helper="Select all that apply, or type anything else you love."
                required
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  "Travelling",
                  "Food and cafes",
                  "Movies and series",
                  "Music and concerts",
                  "Cooking together",
                  "Fitness and sports",
                  "Nature walks",
                  "Shopping",
                  "Gaming",
                  "Staying in and relaxing",
                ].map((act) => {
                  const isSelected =
                    answers.q6_activities.selected.includes(act);
                  return (
                    <OptionCard
                      key={act}
                      label={act}
                      isSelected={isSelected}
                      isMultiSelect={true}
                      onSelect={() => {
                        const current = answers.q6_activities.selected;
                        const updated = isSelected
                          ? current.filter((x) => x !== act)
                          : [...current, act];
                        setAnswers((prev) => ({
                          ...prev,
                          q6_activities: {
                            ...prev.q6_activities,
                            selected: updated,
                          },
                        }));
                      }}
                    />
                  );
                })}
              </div>
              <div className="pt-2">
                <VoiceTextarea
                  id="q6-activities-other"
                  label="Anything else?"
                  value={answers.q6_activities?.other ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q6_activities: {
                        selected: prev.q6_activities?.selected ?? [],
                        other: val,
                      },
                    }))
                  }
                  placeholder="e.g. Weekend farmers markets, photography road trips, board games..."
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* QUESTION 7 */}
          {currentStep === 7 && (
            <div className="space-y-6">
              <QuestionHeader
                title="What do you love most about each other?"
                helper="Speak from the heart — the little quirks, kindnesses, or strengths."
                required
              />
              <div className="space-y-6">
                <VoiceTextarea
                  id="q7-love-partner1"
                  label={`What ${p1} loves most about ${p2} *`}
                  value={answers.q7_loveMost?.partnerA ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q7_loveMost: {
                        partnerA: val,
                        partnerB: prev.q7_loveMost?.partnerB ?? "",
                      },
                    }))
                  }
                  placeholder={`What makes ${p2} truly special to you?`}
                  rows={3}
                />
                <VoiceTextarea
                  id="q7-love-partner2"
                  label={`What ${p2} loves most about ${p1} *`}
                  value={answers.q7_loveMost?.partnerB ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q7_loveMost: {
                        partnerA: prev.q7_loveMost?.partnerA ?? "",
                        partnerB: val,
                      },
                    }))
                  }
                  placeholder={`What makes ${p1} truly special to you?`}
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* QUESTION 8 */}
          {currentStep === 8 && (
            <div className="space-y-6">
              <QuestionHeader
                title="Is there a funny story, inside joke, or special moment that defines your relationship?"
                helper="Something that makes the two of you burst into laughter every time."
              />
              <VoiceTextarea
                id="q8-funny-story"
                value={answers.q8_funnyStory ?? ""}
                onChange={(val) =>
                  setAnswers((prev) => ({ ...prev, q8_funnyStory: val }))
                }
                placeholder="That time you got lost, a miscommunication that turned hilarious, or an unforgettable night..."
                rows={5}
              />
            </div>
          )}

          {/* QUESTION 9 */}
          {currentStep === 9 && (
            <div className="space-y-6">
              <QuestionHeader
                title="How did the proposal happen? (If applicable.)"
                helper="Tap an option to continue."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <OptionCard
                  label="Tell the story"
                  description="We had a proposal and would love to share"
                  isSelected={answers.q9_proposal.choice === "story"}
                  onSelect={() =>
                    setAnswers((prev) => ({
                      ...prev,
                      q9_proposal: { ...prev.q9_proposal, choice: "story" },
                    }))
                  }
                />
                <OptionCard
                  label="Not applicable"
                  description="We decided together without a formal proposal"
                  isSelected={answers.q9_proposal.choice === "na"}
                  onSelect={() =>
                    handleSingleChoiceSelect(() =>
                      setAnswers((prev) => ({
                        ...prev,
                        q9_proposal: { choice: "na", story: "" },
                      }))
                    )
                  }
                />
              </div>

              {answers.q9_proposal.choice === "story" && (
                <div className="pt-2 animate-in fade-in duration-300">
                  <VoiceTextarea
                    id="q9-proposal-story"
                    label="The Proposal Story"
                    value={answers.q9_proposal?.story ?? ""}
                    onChange={(val) =>
                      setAnswers((prev) => ({
                        ...prev,
                        q9_proposal: { ...prev.q9_proposal, story: val },
                      }))
                    }
                    placeholder="Where were you? Was it a complete surprise? How did it unfold?"
                    rows={4}
                  />
                </div>
              )}
            </div>
          )}

          {/* QUESTION 10 */}
          {currentStep === 10 && (
            <div className="space-y-6">
              <QuestionHeader
                title="Who are the most important people you want us to capture?"
                helper="Add important people, upload family tree photos, or write notes separately for the Bride's Side and Groom's Side."
                required
              />
              <React.Suspense fallback={<ScreenSkeleton />}>
                <FamilyTreeBuilder
                  partner1={p1}
                  partner2={p2}
                  value={answers.q10_people}
                  splitModeEnabled={splitModeEnabled}
                  fillMode={fillMode}
                  activePartner={activePartner}
                  onChange={(nextQ10) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q10_people: nextQ10,
                    }))
                  }
                />
              </React.Suspense>
            </div>
          )}

          {/* QUESTION 11 */}
          {currentStep === 11 && (() => {
            const q11Val = readOverlayField(11, "q11_filmFeel") || { selected: [], other: "" };
            const selectedCount = q11Val.selected?.length || 0;
            return (
              <div className="space-y-6">
                <div>
                  <QuestionHeader
                    title="How do you want your wedding photographs and films to feel?"
                    helper="Choose 3 styles that resonate with you both. Uncheck one if you'd like to swap."
                    required
                  />
                  {renderPerPersonControls(11)}
                  {/* Exact 3 Counter Indicator */}
                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                        selectedCount === Q11_REQUIRED_SELECTIONS
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold"
                          : selectedCount > Q11_MAX_SELECTIONS
                          ? "bg-amber-50 text-amber-800 border-amber-200 font-semibold"
                          : "bg-[#FAF7F2] text-[#8C7043] border-[#E8DFD3]"
                      }`}
                    >
                      {selectedCount === Q11_REQUIRED_SELECTIONS ? (
                        <span>
                          ✓ 3 of 3 styles selected · Uncheck one to choose another
                        </span>
                      ) : selectedCount > Q11_MAX_SELECTIONS ? (
                        <span>
                          Select only {Q11_MAX_SELECTIONS} styles — please uncheck{" "}
                          {selectedCount - Q11_MAX_SELECTIONS}
                        </span>
                      ) : (
                        <span>
                          Choose {Q11_REQUIRED_SELECTIONS} styles ·{" "}
                          {Q11_REQUIRED_SELECTIONS - selectedCount} more needed ({selectedCount} of{" "}
                          {Q11_REQUIRED_SELECTIONS} selected)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    "Natural and candid",
                    "Emotional and intimate",
                    "Elegant and editorial",
                    "Fun and energetic",
                    "Timeless and classic",
                    "Cinematic and dramatic",
                    "Warm and nostalgic",
                    "A mix of everything",
                  ].map((opt) => {
                    const currentSelected = q11Val.selected || [];
                    const isSelected = currentSelected.includes(opt);
                    const isCapReached =
                      !isSelected && currentSelected.length >= Q11_MAX_SELECTIONS;
                    return (
                      <OptionCard
                        key={opt}
                        label={opt}
                        isSelected={isSelected}
                        isMultiSelect={true}
                        disabled={isCapReached}
                        onSelect={() => {
                          writeOverlayField(11, "q11_filmFeel", (prevQ11) => ({
                            ...(prevQ11 || { selected: [], other: "" }),
                            selected: toggleMultiSelectWithMax(
                              prevQ11?.selected || [],
                              opt,
                              Q11_MAX_SELECTIONS
                            ),
                          }));
                        }}
                      />
                    );
                  })}
                </div>

                <div className="pt-2">
                  <VoiceTextarea
                    id="q11-other"
                    label="Anything else in your own words? (Optional)"
                    value={q11Val.other ?? ""}
                    onChange={(val) =>
                      writeOverlayField(11, "q11_filmFeel", (prevQ11) => ({
                        ...(prevQ11 || { selected: [], other: "" }),
                        other: val,
                      }))
                    }
                    placeholder="e.g. Grainy 35mm film vibes, warm golden hour tones, unposed candid moments..."
                    rows={2}
                  />
                </div>
              </div>
            );
          })()}


          {/* QUESTION 12 */}
          {currentStep === 12 && (
            <div className="space-y-6">
              <QuestionHeader
                title="Are there any photographers, films, or Pinterest references you love?"
                helper="Paste links, upload screenshots, or note names — share at least one reference below to continue."
                required
              />

              {/* Way A: Paste Links */}
              <div className="space-y-2 p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl">
                <label className="block text-sm font-semibold text-[#1A1A1A]">
                  Pinterest, Instagram, or video links
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={newLinkInput}
                    onChange={(e) => setNewLinkInput(e.target.value)}
                    placeholder="https://pinterest.com/..."
                    className="w-full sm:flex-1 min-w-0 px-4 py-3 text-[18px] bg-white border border-[#E8E8E8] rounded-xl focus:outline-hidden focus:border-[#1A1A1A]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newLinkInput.trim()) {
                        e.preventDefault();
                        setAnswers((prev) => ({
                          ...prev,
                          q12_references: {
                            ...prev.q12_references,
                            links: [
                              ...prev.q12_references.links,
                              newLinkInput.trim(),
                            ],
                          },
                        }));
                        setNewLinkInput("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newLinkInput.trim()) {
                        setAnswers((prev) => ({
                          ...prev,
                          q12_references: {
                            ...prev.q12_references,
                            links: [
                              ...prev.q12_references.links,
                              newLinkInput.trim(),
                            ],
                          },
                        }));
                        setNewLinkInput("");
                      }
                    }}
                    className="w-full sm:w-auto px-5 py-3.5 sm:py-3 bg-[#1A1A1A] text-white rounded-xl text-base sm:text-sm font-medium hover:bg-[#333333] shrink-0 flex items-center justify-center min-h-[48px] sm:min-h-0 transition-colors"
                  >
                    + Add link
                  </button>
                </div>

                <p
                  className={`text-xs sm:text-[13px] leading-relaxed pt-0.5 transition-colors ${
                    newLinkInput.trim()
                      ? "text-[#8C7043] font-medium"
                      : "text-[#6B655D]"
                  }`}
                >
                  After pasting a link above, please click{" "}
                  <span className="font-semibold text-[#1A1A1A]">+ Add link</span>{" "}
                  to save it — simply entering it in the box will not add it to
                  your response.
                </p>

                {answers.q12_references.links.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {answers.q12_references.links.map((link, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#E8E8E8] text-xs text-[#1A1A1A] max-w-full truncate"
                      >
                        <LinkIcon className="w-3.5 h-3.5 text-[#B08D57] shrink-0" />
                        <span className="truncate">{link}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setAnswers((prev) => ({
                              ...prev,
                              q12_references: {
                                ...prev.q12_references,
                                links: prev.q12_references.links.filter(
                                  (_, i) => i !== idx
                                ),
                              },
                            }))
                          }
                          className="hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Way B: Add Images */}
              <div className="p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl space-y-2">
                <label className="block text-sm font-semibold text-[#1A1A1A]">
                  Upload reference screenshots or mood photos
                </label>
                <ImageUploader
                  images={answers.q12_references.images}
                  onChange={(imgs) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q12_references: {
                        ...prev.q12_references,
                        images: imgs,
                      },
                    }))
                  }
                  maxImages={6}
                  uploadCategory="reference"
                  buttonLabel="Add reference photos or screenshots"
                />
              </div>

              {/* Way C: Write/Voice Notes */}
              <div className="p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl space-y-2">
                <label className="block text-sm font-semibold text-[#1A1A1A]">
                  Favorite photographers, directors, or film scenes
                </label>
                <VoiceTextarea
                  value={answers.q12_references.notes}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q12_references: {
                        ...prev.q12_references,
                        notes: val,
                      },
                    }))
                  }
                  placeholder="e.g. Wes Anderson symmetry, Wong Kar-wai romantic tones, candid film grain..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* QUESTION 13: WEDDING OUTFITS */}
          {currentStep === 13 && (
            <div className="space-y-4">
              <QuestionHeader
                title="Have you finalised your wedding wardrobe?"
                helper="Share your outfit plans, colour preferences, and styling ideas. Knowing these details helps us plan your photography and films more thoughtfully."
                required
              />

              <React.Suspense fallback={<ScreenSkeleton />}>
                <WardrobeQuestion
                  wardrobe={answers.wardrobe}
                  legacyWeddingOutfits={answers.weddingOutfits}
                  partner1={p1}
                  partner2={p2}
                  splitModeEnabled={splitModeEnabled}
                  fillMode={fillMode}
                  activePartner={activePartner}
                  onChange={(nextWardrobe) =>
                    setAnswers((prev) => ({
                      ...prev,
                      wardrobe: nextWardrobe,
                    }))
                  }
                  onClearLegacy={() =>
                    setAnswers((prev) => ({
                      ...prev,
                      weddingOutfits: { links: [], images: [], notes: "" },
                    }))
                  }
                />
              </React.Suspense>
            </div>
          )}

          {/* QUESTION 14: WEDDING DECOR MOOD BOARD (BY EVENT) */}
          {currentStep === 14 && (
            <div className="space-y-6">
              <QuestionHeader
                title="Do you have a wedding decor mood board or any visual references for your celebration?"
                helper="Share Pinterest boards, reference images, colour palettes or decor ideas below (add at least one item to continue)."
                required
              />

              <React.Suspense fallback={<ScreenSkeleton />}>
                <DecorQuestion
                  decorEvents={answers.decorEvents}
                  legacyDecorMoodBoard={answers.decorMoodBoard}
                  onChange={(nextEvents) =>
                    setAnswers((prev) => {
                      if (!splitModeEnabled) {
                        return { ...prev, decorEvents: nextEvents };
                      }
                      const rawMap = decorEventsToMap(nextEvents);
                      const nowIso = new Date().toISOString();
                      const stampedMap: typeof rawMap = {};
                      for (const [evId, entry] of Object.entries(rawMap)) {
                        stampedMap[evId] = {
                          ...entry,
                          updatedAt: nowIso,
                          updatedBy: activePartner,
                        };
                      }
                      return {
                        ...prev,
                        decorEvents: nextEvents,
                        decorEventsMap: stampedMap,
                      };
                    })
                  }
                  onClearLegacy={() =>
                    setAnswers((prev) => ({
                      ...prev,
                      decorMoodBoard: { links: [], images: [], notes: "" },
                    }))
                  }
                />
              </React.Suspense>
            </div>
          )}

          {/* QUESTION 15 (previously Q13) */}
          {currentStep === 15 && (() => {
            const q15Val = readOverlayField(15, "q13_tone") || { selected: [], other: "" };
            const selectedCount = q15Val.selected?.length || 0;
            return (
              <div className="space-y-6">
                <div className="space-y-3">
                  <QuestionHeader
                    title="What tone are you expecting to set for your wedding day"
                    helper="Select up to 3 tones that capture your wedding day (at least 1 required · uncheck one to choose another)."
                    required
                  />
                  {renderPerPersonControls(15)}
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                        selectedCount > Q15_MAX_SELECTIONS
                          ? "bg-amber-50 text-amber-800 border-amber-200 font-semibold"
                          : selectedCount === Q15_MAX_SELECTIONS
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold"
                          : "bg-[#FAF7F2] text-[#8C7043] border-[#E8DFD3]"
                      }`}
                    >
                      {selectedCount > Q15_MAX_SELECTIONS ? (
                        <span>
                          Select at most {Q15_MAX_SELECTIONS} tones — please uncheck{" "}
                          {selectedCount - Q15_MAX_SELECTIONS}
                        </span>
                      ) : selectedCount === Q15_MAX_SELECTIONS ? (
                        <span>
                          ✓ 3 of 3 tones selected · Uncheck one to choose another
                        </span>
                      ) : selectedCount >= 1 ? (
                        <span>
                          ✓ {selectedCount} of {Q15_MAX_SELECTIONS} tones selected · ready to continue
                        </span>
                      ) : (
                        <span>
                          Choose 1 to {Q15_MAX_SELECTIONS} tones (0 of {Q15_MAX_SELECTIONS} selected)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    "Romantic & Intimate",
                    "Fun & Vibrant",
                    "Fashion-Forward & Editorial",
                    "Organic & Natural",
                    "Traditional & Grand",
                    "Timeless & Elegant",
                    "Relaxed & Festive",
                    "A mix of tones",
                  ].map((tone) => {
                    const currentSelected = q15Val.selected || [];
                    const isSelected = currentSelected.includes(tone);
                    const isCapReached =
                      !isSelected && currentSelected.length >= Q15_MAX_SELECTIONS;
                    return (
                      <OptionCard
                        key={tone}
                        label={tone}
                        isSelected={isSelected}
                        isMultiSelect={true}
                        disabled={isCapReached}
                        onSelect={() => {
                          writeOverlayField(15, "q13_tone", (prevTone) => ({
                            ...(prevTone || { selected: [], other: "" }),
                            selected: toggleMultiSelectWithMax(
                              prevTone?.selected || [],
                              tone,
                              Q15_MAX_SELECTIONS
                            ),
                          }));
                        }}
                      />
                    );
                  })}
                </div>

                <div className="pt-2">
                  <VoiceTextarea
                    id="q15-tone-other"
                    label="Anything specific about the tone or vibe in your own words? (Optional)"
                    value={q15Val.other ?? ""}
                    onChange={(val) =>
                      writeOverlayField(15, "q13_tone", (prevTone) => ({
                        ...(prevTone || { selected: [], other: "" }),
                        other: val,
                      }))
                    }
                    placeholder="e.g. Cozy and emotional ceremony leading into a lively celebration, candlelit evening..."
                    rows={2}
                  />
                </div>
              </div>
            );
          })()}

          {/* QUESTION 16 (previously Q14) */}
          {currentStep === 16 && (() => {
            const q16Val = readOverlayField(16, "q14_moments") || { selected: [], other: "" };
            return (
              <div className="space-y-6">
                <QuestionHeader
                  title="What are the moments you are most looking forward to during your wedding?"
                  helper="Select all that apply, or enter anything unique you have planned."
                  required
                />
                {renderPerPersonControls(16)}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    "Getting ready",
                    "First look or first glance",
                    "Ceremony and vows",
                    "Family blessings",
                    "Couple portraits",
                    "Grand entry",
                    "The celebration and dancing",
                    "Quiet moments together",
                    "Speeches and toasts",
                    "Send-off",
                  ].map((moment) => {
                    const isSelected = (q16Val.selected || []).includes(moment);
                    return (
                      <OptionCard
                        key={moment}
                        label={moment}
                        isSelected={isSelected}
                        isMultiSelect={true}
                        onSelect={() => {
                          writeOverlayField(16, "q14_moments", (prevM) => {
                            const current = prevM?.selected || [];
                            const updated = current.includes(moment)
                              ? current.filter((x) => x !== moment)
                              : [...current, moment];
                            return { selected: updated, other: prevM?.other ?? "" };
                          });
                        }}
                      />
                    );
                  })}
                </div>
                <div className="pt-2">
                  <VoiceTextarea
                    id="q16-moments-other"
                    label="Anything else?"
                    value={q16Val.other ?? ""}
                    onChange={(val) =>
                      writeOverlayField(16, "q14_moments", (prevM) => ({
                        selected: prevM?.selected ?? [],
                        other: val,
                      }))
                    }
                    placeholder="e.g. Flash mob with cousins, private vow reading before sunrise..."
                    rows={2}
                  />
                </div>
              </div>
            );
          })()}

          {/* QUESTION 17 (previously Q15) */}
          {currentStep === 17 && (() => {
            const q17Val = readOverlayField(17, "q15_captureAvoid") || {
              definitelyCapture: "",
              pleaseAvoid: "",
            };
            return (
              <div className="space-y-6">
                <QuestionHeader
                  title="Is there anything you definitely want us to capture or avoid?"
                  helper="Speak or type freely in both boxes."
                />
                {renderPerPersonControls(17)}
                <div className="space-y-6">
                  <VoiceTextarea
                    id="q17-capture"
                    label="Definitely capture"
                    value={q17Val.definitelyCapture ?? ""}
                    onChange={(val) =>
                      writeOverlayField(17, "q15_captureAvoid", (prevCA) => ({
                        definitelyCapture: val,
                        pleaseAvoid: prevCA?.pleaseAvoid ?? "",
                      }))
                    }
                    placeholder="e.g. The look on dad's face during the ceremony, candid reactions from college friends..."
                    rows={3}
                  />
                  <VoiceTextarea
                    id="q17-avoid"
                    label="Please avoid"
                    value={q17Val.pleaseAvoid ?? ""}
                    onChange={(val) =>
                      writeOverlayField(17, "q15_captureAvoid", (prevCA) => ({
                        definitelyCapture: prevCA?.definitelyCapture ?? "",
                        pleaseAvoid: val,
                      }))
                    }
                    placeholder="e.g. Stiff table-to-table poses, overly cheesy spins, people eating at buffet..."
                    rows={3}
                  />
                </div>
              </div>
            );
          })()}

          {/* QUESTION 18 (previously Q16) */}
          {currentStep === 18 && (() => {
            const q18Val = readOverlayField(18, "q16_nonNegotiables") ?? "";
            return (
              <div className="space-y-6">
                <QuestionHeader
                  title="Please mention your non negotiables in your films and photographs?"
                  helper="Things that are absolutely sacred to you on this day."
                  required
                />
                {renderPerPersonControls(18)}
                <VoiceTextarea
                  id="q18-non-negotiables"
                  value={q18Val}
                  onChange={(val) =>
                    writeOverlayField(18, "q16_nonNegotiables", () => val)
                  }
                  placeholder="e.g. Crystal clear audio of our live vows, capturing the sunset portraits on time..."
                  rows={5}
                />
              </div>
            );
          })()}

          {/* QUESTION 19 (previously Q17) */}
          {currentStep === 19 && (() => {
            const q19Val = readOverlayField(19, "q17_emotional") ?? "";
            const isTogetherSplit =
              splitModeEnabled && fillMode === "together" && !isSameForBothForStep(answers, 19);
            return (
              <div className="space-y-6">
                <QuestionHeader
                  title="Who do you think is going to be more emotional during wedding?"
                  helper="Tap an option to continue."
                />
                {renderPerPersonControls(19)}
                <div className="space-y-3">
                  {[
                    p1,
                    p2,
                    "Both of us equally",
                    "Our parents",
                    "Honestly, no idea!",
                  ].map((opt) => (
                    <OptionCard
                      key={opt}
                      label={opt}
                      isSelected={q19Val === opt}
                      onSelect={() => {
                        if (isTogetherSplit) {
                          writeOverlayField(19, "q17_emotional", () => opt);
                        } else {
                          handleSingleChoiceSelect(() =>
                            writeOverlayField(19, "q17_emotional", () => opt)
                          );
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* QUESTION 20 (previously Q18) */}
          {currentStep === 20 && (() => {
            const q20Val = readOverlayField(20, "q18_cameraVersatility") ?? "";
            const isTogetherSplit =
              splitModeEnabled && fillMode === "together" && !isSameForBothForStep(answers, 20);
            return (
              <div className="space-y-6">
                <QuestionHeader
                  title="How versatile are you with the camera?"
                  helper="Tap an option to continue."
                  required
                />
                {renderPerPersonControls(20)}
                <div className="space-y-3">
                  {[
                    "Total natural, I love the camera",
                    "Pretty comfortable",
                    "A little shy, but willing",
                    "Very camera-shy",
                  ].map((opt) => (
                    <OptionCard
                      key={opt}
                      label={opt}
                      isSelected={q20Val === opt}
                      onSelect={() => {
                        if (isTogetherSplit) {
                          writeOverlayField(20, "q18_cameraVersatility", () => opt);
                        } else {
                          handleSingleChoiceSelect(() =>
                            writeOverlayField(20, "q18_cameraVersatility", () => opt)
                          );
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* QUESTION 21: WHAT MATTERED MOST WHEN CHOOSING OAKS WEDDING (previously Q19) */}
          {currentStep === 21 && (() => {
            const q21Val = readOverlayField(21, "choosingOaks") ?? "";
            return (
              <div className="space-y-6">
                <QuestionHeader
                  title="What mattered most to you when choosing OAKS Wedding to capture your wedding?"
                  helper="Was it our photography style, storytelling, films, recommendations, or something else that made you choose us?"
                  required
                />
                {renderPerPersonControls(21)}
                <VoiceTextarea
                  id="q21-choosing-oaks"
                  value={q21Val}
                  onChange={(val) =>
                    writeOverlayField(21, "choosingOaks", () => val)
                  }
                  placeholder="e.g. We were drawn to your candid storytelling, the emotion in your films, and how natural every couple looked..."
                  rows={5}
                />
              </div>
            );
          })()}

          {/* QUESTION 22 (previously Q23) */}
          {currentStep === 22 && (() => {
            const q22Val = readOverlayField(22, "q20_guidanceComfort") ?? "";
            const isTogetherSplit =
              splitModeEnabled && fillMode === "together" && !isSameForBothForStep(answers, 22);
            return (
              <div className="space-y-6">
                <QuestionHeader
                  title="How comfortable are you with being guided or directed during portraits and filming?"
                  helper="Tap an option to continue."
                  required
                />
                {renderPerPersonControls(22)}
                <div className="space-y-3">
                  {[
                    "I love being guided",
                    "Happy with gentle guidance",
                    "Mostly candid, a few directions please",
                    "Please keep it candid, minimal direction",
                  ].map((opt) => (
                    <OptionCard
                      key={opt}
                      label={opt}
                      isSelected={q22Val === opt}
                      onSelect={() => {
                        if (isTogetherSplit) {
                          writeOverlayField(22, "q20_guidanceComfort", () => opt);
                        } else {
                          handleSingleChoiceSelect(() =>
                            writeOverlayField(22, "q20_guidanceComfort", () => opt)
                          );
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* QUESTION 23 (previously Q24) */}
          {currentStep === 23 && (() => {
            const q23Val = readOverlayField(23, "q21_comfortTips") || {
              selected: [],
              notes: "",
            };
            return (
              <div className="space-y-6">
                <QuestionHeader
                  title="Is there anything that would help you feel more comfortable in front of the camera?"
                  helper="Select all that apply, or tell us in your own words."
                />
                {renderPerPersonControls(23)}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    "A few practice shots first",
                    "Chatting with the photographer beforehand",
                    "A moment alone as a couple",
                    "Seeing previews as we go",
                    "Not sure yet",
                  ].map((tip) => {
                    const isSelected = (q23Val.selected || []).includes(tip);
                    return (
                      <OptionCard
                        key={tip}
                        label={tip}
                        isSelected={isSelected}
                        isMultiSelect={true}
                        onSelect={() => {
                          writeOverlayField(23, "q21_comfortTips", (prevTips) => {
                            const current = prevTips?.selected || [];
                            const updated = current.includes(tip)
                              ? current.filter((x) => x !== tip)
                              : [...current, tip];
                            return { selected: updated, notes: prevTips?.notes ?? "" };
                          });
                        }}
                      />
                    );
                  })}
                </div>

                <div className="pt-2">
                  <VoiceTextarea
                    id="q23-comfort-notes"
                    label="In your own words"
                    value={q23Val.notes ?? ""}
                    onChange={(val) =>
                      writeOverlayField(23, "q21_comfortTips", (prevTips) => ({
                        selected: prevTips?.selected ?? [],
                        notes: val,
                      }))
                    }
                    placeholder="e.g. Having music playing, having a glass of champagne, taking short breathers..."
                    rows={2}
                  />
                </div>
              </div>
            );
          })()}

          {/* QUESTION 24 (previously Q25) */}
          {currentStep === 24 && (() => {
            const q24Val = readOverlayField(24, "q22_futureFeeling") ?? "";
            return (
              <div className="space-y-6">
                <QuestionHeader
                  title="What do you hope to feel when you watch your wedding film years from now?"
                  helper="Close your eyes and imagine watching it on your tenth anniversary."
                />
                {renderPerPersonControls(24)}
                <VoiceTextarea
                  id="q24-future-feeling"
                  value={q24Val}
                  onChange={(val) =>
                    writeOverlayField(24, "q22_futureFeeling", () => val)
                  }
                  placeholder="What emotions or memories do you want rushing back when you press play?"
                  rows={5}
                />
              </div>
            );
          })()}

          {/* QUESTION 25 (previously Q26): YOUR PRIMARY POINT OF CONTACT */}
          {currentStep === 25 && (
            <div className="space-y-6">
              <div>
                <span className="text-xs uppercase tracking-widest font-semibold text-[#B08D57] block mb-1">
                  Your Primary Point of Contact
                </span>
                <QuestionHeader
                  title="Who should be our primary point of contact for wedding-related communication and coordination?"
                  helper="Select one option below. Name and phone / WhatsApp are required."
                  required
                />
              </div>

              {/* Initial Options: Bride / Groom / Someone else */}
              <div className="space-y-3">
                {(["Bride", "Groom", "Someone else"] as const).map((roleOption) => {
                  const isSelected = answers.primaryContact?.role === roleOption;
                  return (
                    <OptionCard
                      key={roleOption}
                      label={roleOption}
                      isSelected={isSelected}
                      onSelect={() => {
                        setAnswers((prev) => ({
                          ...prev,
                          primaryContact: {
                            role: roleOption,
                            side: roleOption === "Someone else" ? (prev.primaryContact?.side ?? "") : "",
                            designation:
                              roleOption === "Someone else"
                                ? (prev.primaryContact?.designation ?? "")
                                : "",
                            gender: "",
                            name: prev.primaryContact?.name ?? "",
                            phone: prev.primaryContact?.phone ?? "",
                          },
                        }));
                      }}
                    />
                  );
                })}
              </div>

              {/* Conditional options for "Someone else" */}
              {answers.primaryContact?.role === "Someone else" && (
                <div className="space-y-6 pt-2 animate-in fade-in duration-150">
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-[#1A1A1A]">
                      Whose side? <span className="text-[#B08D57]">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(["Bride's side", "Groom's side"] as const).map((sideOption) => (
                        <OptionCard
                          key={sideOption}
                          label={sideOption}
                          isSelected={answers.primaryContact?.side === sideOption}
                          onSelect={() =>
                            setAnswers((prev) => ({
                              ...prev,
                              primaryContact: {
                                role: "Someone else",
                                side: sideOption,
                                designation: prev.primaryContact?.designation ?? "",
                                gender: prev.primaryContact?.gender ?? "",
                                name: prev.primaryContact?.name ?? "",
                                phone: prev.primaryContact?.phone ?? "",
                              },
                            }))
                          }
                        />
                      ))}
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl space-y-3">
                    <div className="space-y-1">
                      <label
                        htmlFor="q25-contact-designation"
                        className="block text-sm font-semibold text-[#1A1A1A]"
                      >
                        Role designation <span className="text-[#B08D57]">*</span>
                      </label>
                      <p className="text-xs text-[#5F5F5F]">
                        Add who they are to you (for example, Auntie, Cousin, Brother, or Father).
                      </p>
                    </div>

                    <input
                      id="q25-contact-designation"
                      type="text"
                      required
                      value={answers.primaryContact?.designation ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAnswers((prev) => ({
                          ...prev,
                          primaryContact: {
                            role: "Someone else",
                            side: prev.primaryContact?.side ?? "",
                            designation: val,
                            gender: "",
                            name: prev.primaryContact?.name ?? "",
                            phone: prev.primaryContact?.phone ?? "",
                          },
                        }));
                      }}
                      placeholder="e.g. Auntie, Cousin, Brother, Father"
                      className="w-full px-4 py-3 text-[18px] bg-white border border-[#E8E8E8] rounded-xl focus:outline-hidden focus:border-[#1A1A1A]"
                    />

                    <div className="flex flex-wrap gap-2 pt-0.5">
                      {["Auntie", "Cousin", "Brother", "Father"].map((preset) => {
                        const isPresetActive =
                          answers.primaryContact?.designation?.trim().toLowerCase() ===
                          preset.toLowerCase();
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setAnswers((prev) => ({
                                ...prev,
                                primaryContact: {
                                  role: "Someone else",
                                  side: prev.primaryContact?.side ?? "",
                                  designation: preset,
                                  gender: "",
                                  name: prev.primaryContact?.name ?? "",
                                  phone: prev.primaryContact?.phone ?? "",
                                },
                              }))
                            }
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              isPresetActive
                                ? "bg-[#1A1A1A] text-white border-[#1A1A1A]"
                                : "bg-white text-[#5F5F5F] border-[#E8E8E8] hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
                            }`}
                          >
                            {preset}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Conditional mandatory contact fields (shown only after an initial option is selected) */}
              {Boolean(answers.primaryContact?.role) && (
                <div className="p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl space-y-4 animate-in fade-in duration-150">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="q25-contact-name"
                      className="block text-sm font-semibold text-[#1A1A1A]"
                    >
                      {answers.primaryContact?.role === "Bride"
                        ? "Bride's name"
                        : answers.primaryContact?.role === "Groom"
                        ? "Groom's name"
                        : answers.primaryContact?.designation?.trim()
                        ? `${answers.primaryContact.designation.trim()}'s name`
                        : "Contact person's name"}{" "}
                      <span className="text-[#B08D57]">*</span>
                    </label>
                    <input
                      id="q25-contact-name"
                      type="text"
                      required
                      value={answers.primaryContact?.name ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          primaryContact: {
                            role: prev.primaryContact?.role ?? "",
                            side: prev.primaryContact?.side ?? "",
                            designation: prev.primaryContact?.designation ?? "",
                            gender: prev.primaryContact?.gender ?? "",
                            name: e.target.value,
                            phone: prev.primaryContact?.phone ?? "",
                          },
                        }))
                      }
                      placeholder={
                        answers.primaryContact?.role === "Bride"
                          ? "Enter her full name"
                          : answers.primaryContact?.role === "Groom"
                          ? "Enter his full name"
                          : "Enter contact person's full name"
                      }
                      className="w-full px-4 py-3 text-[18px] bg-white border border-[#E8E8E8] rounded-xl focus:outline-hidden focus:border-[#1A1A1A]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="q25-contact-phone"
                      className="block text-sm font-semibold text-[#1A1A1A]"
                    >
                      Phone number / WhatsApp <span className="text-[#B08D57]">*</span>
                    </label>
                    <input
                      id="q25-contact-phone"
                      type="tel"
                      required
                      value={answers.primaryContact?.phone ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          primaryContact: {
                            role: prev.primaryContact?.role ?? "",
                            side: prev.primaryContact?.side ?? "",
                            designation: prev.primaryContact?.designation ?? "",
                            gender: prev.primaryContact?.gender ?? "",
                            name: prev.primaryContact?.name ?? "",
                            phone: e.target.value,
                          },
                        }))
                      }
                      placeholder="e.g. +91 98765 43210"
                      className="w-full px-4 py-3 text-[18px] bg-white border border-[#E8E8E8] rounded-xl focus:outline-hidden focus:border-[#1A1A1A]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* QUESTION 26 (previously Q27): YOUR STORY & JOURNEY */}
          {currentStep === 26 && (
            <div className="space-y-6">
              <div>
                <span className="text-xs uppercase tracking-widest font-semibold text-[#B08D57] block mb-1">
                  Your Story
                </span>
                <QuestionHeader
                  title="Last but not least, we'd love to hear your story. How did your journey begin, and what would you love us to know about the two of you?"
                  helper="Feel free to share anything that makes your relationship special."
                  required
                />
              </div>

              <VoiceTextarea
                id="q26-love-story-narrative"
                value={answers.loveStoryNarrative ?? ""}
                onChange={(val) =>
                  setAnswers((prev) => ({ ...prev, loveStoryNarrative: val }))
                }
                placeholder="Share how your journey began, milestones along the way, or what makes your bond yours..."
                rows={6}
              />
            </div>
          )}

          {/* QUESTION 27 (previously Q28): IS THERE ANYTHING ELSE YOU'D LIKE TO LET US KNOW? */}
          {currentStep === 27 && (() => {
            const q27Val = readOverlayField(27, "q23_oneLastThing") || {
              notes: "",
              images: [],
            };
            return (
              <div className="space-y-6">
                <div>
                  <span className="text-xs uppercase tracking-widest font-semibold text-[#B08D57] block mb-1">
                    One Last Thing
                  </span>
                  <QuestionHeader
                    title="Is there anything else you'd like to let us know?"
                    helper="Surprises, family dynamics, specific song requests, or any parting thoughts."
                  />
                </div>
                {renderPerPersonControls(27)}

                <VoiceTextarea
                  id="q27-one-last-thing-notes"
                  value={q27Val.notes ?? ""}
                  onChange={(val) =>
                    writeOverlayField(27, "q23_oneLastThing", (prevLast) => ({
                      images: prevLast?.images ?? [],
                      notes: val,
                    }))
                  }
                  placeholder="Any special details, surprises planned for each other, or anything we didn't ask..."
                  rows={5}
                />

                <div className="pt-2">
                  <ImageUploader
                    images={q27Val.images || []}
                    onChange={(imgs) =>
                      writeOverlayField(27, "q23_oneLastThing", (prevLast) => ({
                        notes: prevLast?.notes ?? "",
                        images: imgs,
                      }))
                    }
                    maxImages={4}
                    uploadCategory="last_thing"
                    label="Optional photos or mood references"
                    buttonLabel="Add photos"
                  />
                </div>
              </div>
            );
          })()}
        </div>

        {/* Bottom Actions Bar (Continue & Skip) */}
        <div className="pt-8 pb-4 space-y-3">
          {(() => {
            const stepValidation = validateQuestionStepForContext(
              currentStep,
              answers,
              activeFillMode,
              activePartner
            );
            const isIncomplete = !stepValidation.isComplete;
            const step11Val = readOverlayField(11, "q11_filmFeel");
            const step15Val = readOverlayField(15, "q13_tone");
            const step11Count = step11Val?.selected?.length || 0;
            const step15Count = step15Val?.selected?.length || 0;

            return (
              <>
                <button
                  type="button"
                  onClick={() => handleNext(false)}
                  disabled={isIncomplete}
                  className={`w-full min-h-[58px] py-4 px-6 rounded-2xl font-medium text-[19px] transition-all flex items-center justify-center gap-3 shadow-sm ${
                    isIncomplete
                      ? "bg-[#E8E8E8] text-[#7A756D] cursor-not-allowed border-transparent"
                      : "bg-[#1A1A1A] hover:bg-[#333333] active:scale-[0.99] text-white cursor-pointer"
                  }`}
                >
                  <span>
                    {isIncomplete
                      ? stepValidation.missingMessage || "Complete required fields to continue"
                      : editingFromReview
                      ? "Save & Return to Review"
                      : currentStep === 11
                      ? `Continue (${step11Count}/${Q11_REQUIRED_SELECTIONS} selected)`
                      : currentStep === 15
                      ? `Continue (${step15Count}/${Q15_MAX_SELECTIONS} selected)`
                      : currentStep === 27
                      ? "Review your answers"
                      : "Continue"}
                  </span>
                  <ArrowRight
                    className={`w-5 h-5 ${
                      isIncomplete ? "text-[#7A756D]" : "text-[#B08D57]"
                    }`}
                  />
                </button>

                {!stepValidation.isMandatory && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={handleSkip}
                      className="py-2 px-4 text-sm font-medium text-[#5F5F5F] hover:text-[#1A1A1A] transition-colors"
                    >
                      Skip for now
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </main>
    </div>
  );
}

const QuestionHeader: React.FC<{
  title: string;
  helper?: string;
  required?: boolean;
}> = ({ title, helper, required = false }) => (
  <div className="space-y-2">
    {required && (
      <span className="block text-[11px] uppercase tracking-[0.18em] font-semibold text-[#B08D57]">
        Required
      </span>
    )}
    <h2 className="font-lora text-[26px] sm:text-[32px] text-[#1A1A1A] font-normal leading-snug">
      {title}
    </h2>
    {helper && <p className="text-base sm:text-lg text-[#5F5F5F]">{helper}</p>}
  </div>
);
