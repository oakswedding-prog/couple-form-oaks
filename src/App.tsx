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
  QuestionnaireAnswers,
  FamilyMember,
} from "./types/questionnaire.ts";
import { Header } from "./components/Header.tsx";
import { WelcomeScreen } from "./components/WelcomeScreen.tsx";
import { ChapterCard } from "./components/ChapterCard.tsx";
import { VoiceTextarea } from "./components/VoiceTextarea.tsx";
import { OptionCard } from "./components/OptionCard.tsx";
import { ImageUploader } from "./components/ImageUploader.tsx";
import { useAdminAuth } from "./lib/auth.ts";
import { Analytics } from "@vercel/analytics/react";
import {
  Q11_MAX_SELECTIONS,
  Q11_REQUIRED_SELECTIONS,
  Q15_MAX_SELECTIONS,
  isQuestionMandatory,
  toggleMultiSelectWithMax,
  validateQuestionStep,
} from "./utils/questionnaireValidation.ts";

const FamilyTreeBuilder = React.lazy(() =>
  import("./components/FamilyTreeBuilder.tsx").then((m) => ({ default: m.FamilyTreeBuilder }))
);
const ReviewScreen = React.lazy(() =>
  import("./components/ReviewScreen.tsx").then((m) => ({ default: m.ReviewScreen }))
);
const ThankYouScreen = React.lazy(() =>
  import("./components/ThankYouScreen.tsx").then((m) => ({ default: m.ThankYouScreen }))
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
  },
  q11_filmFeel: { selected: [], other: "" },
  q12_references: { links: [], images: [], notes: "" },
  weddingOutfits: { links: [], images: [], notes: "" },
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
    weddingOutfits: {
      links: Array.isArray(raw.weddingOutfits?.links) ? raw.weddingOutfits.links : [],
      images: Array.isArray(raw.weddingOutfits?.images) ? raw.weddingOutfits.images : [],
      notes: typeof raw.weddingOutfits?.notes === "string" ? raw.weddingOutfits.notes : "",
    },
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

  // Link input state for Q12, Q13, and Q14
  const [newLinkInput, setNewLinkInput] = useState<string>("");
  const [newOutfitLinkInput, setNewOutfitLinkInput] = useState<string>("");
  const [newDecorLinkInput, setNewDecorLinkInput] = useState<string>("");

  // Auto-advance debounce ref and latest answers ref (for timer callbacks)
  const autoAdvanceTimerRef = useRef<any>(null);
  const answersRef = useRef<QuestionnaireAnswers>(answers);
  answersRef.current = answers;


  // Load from localStorage or check autostart on mount
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const isAutostart = urlParams.get("autostart") === "1";

      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.answers) {
          setAnswers(sanitizeAnswers(parsed.answers));
        }
        if (typeof parsed.step === "number" && parsed.step > 0) {
          setSavedStepNotice(parsed.step);
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
      setHasLoadedStorage(true);
    }
  }, []);

  // Auto-save to localStorage
  useEffect(() => {
    if (!hasLoadedStorage) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ answers, step: currentStep })
      );
    } catch {
      // ignore
    }
  }, [answers, currentStep, hasLoadedStorage]);

  // Clean up auto advance timer
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
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

  const handleNext = (bypassValidation = false) => {
    if (!bypassValidation && !validateQuestionStep(currentStep, answersRef.current).isComplete) {
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

  // Reset form
  const handleReset = () => {
    setAnswers(INITIAL_ANSWERS);
    setCurrentStep(0);
    setSavedStepNotice(0);
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
        />
      );
    }
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
      />
    );
  }


  // Review Screen (Step 28)
  if (currentStep === 28) {
    return (
      <React.Suspense fallback={<ScreenSkeleton />}>
        <ReviewScreen
          answers={answers}
          onEditQuestion={(stepNum) => {
            setEditingFromReview(true);
            setCurrentStep(stepNum);
          }}
          onBack={() => setCurrentStep(27)}
          onSubmitted={() => setCurrentStep(29)}
        />
      </React.Suspense>
    );
  }

  // Thank You Screen (Step 29)
  if (currentStep === 29) {
    return (
      <React.Suspense fallback={<ScreenSkeleton />}>
        <ThankYouScreen answers={answers} onReset={handleReset} />
      </React.Suspense>
    );
  }

  // Question Screens (1-27)
  return (
    <div className="min-h-[100dvh] flex flex-col justify-between bg-white safe-bottom">
      {/* Sticky Header with Progress Bar */}
      <Header
        currentStep={currentStep}
        totalSteps={27}
        chapterTitle={currentChapter ? currentChapter.title : undefined}
        onBack={handleBack}
        canGoBack={true}
        editingFromReview={editingFromReview}
        onReturnToReview={() => {
          if (!validateQuestionStep(currentStep, answersRef.current).isComplete) {
            return;
          }
          setCurrentStep(28);
          setEditingFromReview(false);
        }}
      />

      {/* Main One-Question Container */}
      <main className="flex-1 max-w-[640px] w-full mx-auto px-5 py-6 sm:py-10 flex flex-col justify-between animate-in fade-in duration-150 will-change-[opacity,transform]">
        <div className="space-y-6">
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
                title="Who are the most important people you want us to capture please give a family tree?"
                helper="Add VIP family members, snap a photo of a tree sketch, or write it out."
                required
              />
              <React.Suspense fallback={<ScreenSkeleton />}>
                <FamilyTreeBuilder
                  partner1={p1}
                  partner2={p2}
                  members={answers.q10_people.familyMembers}
                  onMembersChange={(m) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q10_people: { ...prev.q10_people, familyMembers: m },
                    }))
                  }
                  treePhotoUrl={answers.q10_people.treePhotoUrl}
                  onTreePhotoChange={(url) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q10_people: { ...prev.q10_people, treePhotoUrl: url },
                    }))
                  }
                  treeNotes={answers.q10_people.treeNotes}
                  onTreeNotesChange={(n) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q10_people: { ...prev.q10_people, treeNotes: n },
                    }))
                  }
                />
              </React.Suspense>
            </div>
          )}

          {/* QUESTION 11 */}
          {currentStep === 11 && (
            <div className="space-y-6">
              <div>
                <QuestionHeader
                  title="How do you want your wedding photographs and films to feel?"
                  helper="Choose 3 styles that resonate with you both. Uncheck one if you'd like to swap."
                  required
                />
                {/* Exact 3 Counter Indicator */}
                {(() => {
                  const selectedCount = answers.q11_filmFeel.selected?.length || 0;
                  return (
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
                  );
                })()}
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
                  const currentSelected = answers.q11_filmFeel.selected || [];
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
                        setAnswers((prev) => ({
                          ...prev,
                          q11_filmFeel: {
                            ...prev.q11_filmFeel,
                            selected: toggleMultiSelectWithMax(
                              prev.q11_filmFeel.selected,
                              opt,
                              Q11_MAX_SELECTIONS
                            ),
                          },
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
                  value={answers.q11_filmFeel?.other ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q11_filmFeel: {
                        ...prev.q11_filmFeel,
                        other: val,
                      },
                    }))
                  }
                  placeholder="e.g. Grainy 35mm film vibes, warm golden hour tones, unposed candid moments..."
                  rows={2}
                />
              </div>
            </div>
          )}


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
            <div className="space-y-6">
              <QuestionHeader
                title="Have you finalised your wedding wardrobe?"
                helper="Share your outfit plans, colour preferences, and styling ideas. Knowing these details helps us plan your photography and films more thoughtfully."
                required
              />

              {/* Wardrobe Notes */}
              <div className="p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl space-y-2">
                <label className="block text-sm font-semibold text-[#1A1A1A]">
                  Outfit details, colours, designers, or styling notes
                </label>
                <VoiceTextarea
                  id="q13-wedding-outfits-notes"
                  value={answers.weddingOutfits?.notes ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      weddingOutfits: {
                        links: prev.weddingOutfits?.links ?? [],
                        images: prev.weddingOutfits?.images ?? [],
                        notes: val,
                      },
                    }))
                  }
                  placeholder="e.g. Ivory silk saree for the ceremony, custom embroidered lehenga for sangeet, classic black tuxedo..."
                  rows={4}
                />
              </div>

              {/* Reference Links */}
              <div className="space-y-2 p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl">
                <label className="block text-sm font-semibold text-[#1A1A1A]">
                  Designer, Pinterest, or wardrobe inspiration links (optional)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={newOutfitLinkInput}
                    onChange={(e) => setNewOutfitLinkInput(e.target.value)}
                    placeholder="https://pinterest.com/..."
                    className="w-full sm:flex-1 min-w-0 px-4 py-3 text-[18px] bg-white border border-[#E8E8E8] rounded-xl focus:outline-hidden focus:border-[#1A1A1A]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newOutfitLinkInput.trim()) {
                        e.preventDefault();
                        setAnswers((prev) => ({
                          ...prev,
                          weddingOutfits: {
                            links: [
                              ...(prev.weddingOutfits?.links ?? []),
                              newOutfitLinkInput.trim(),
                            ],
                            images: prev.weddingOutfits?.images ?? [],
                            notes: prev.weddingOutfits?.notes ?? "",
                          },
                        }));
                        setNewOutfitLinkInput("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newOutfitLinkInput.trim()) {
                        setAnswers((prev) => ({
                          ...prev,
                          weddingOutfits: {
                            links: [
                              ...(prev.weddingOutfits?.links ?? []),
                              newOutfitLinkInput.trim(),
                            ],
                            images: prev.weddingOutfits?.images ?? [],
                            notes: prev.weddingOutfits?.notes ?? "",
                          },
                        }));
                        setNewOutfitLinkInput("");
                      }
                    }}
                    className="w-full sm:w-auto px-5 py-3.5 sm:py-3 bg-[#1A1A1A] text-white rounded-xl text-base sm:text-sm font-medium hover:bg-[#333333] shrink-0 flex items-center justify-center min-h-[48px] sm:min-h-0 transition-colors"
                  >
                    + Add link
                  </button>
                </div>

                <p
                  className={`text-xs sm:text-[13px] leading-relaxed pt-0.5 transition-colors ${
                    newOutfitLinkInput.trim()
                      ? "text-[#8C7043] font-medium"
                      : "text-[#6B655D]"
                  }`}
                >
                  After pasting a link above, please click{" "}
                  <span className="font-semibold text-[#1A1A1A]">+ Add link</span>{" "}
                  to save it — simply entering it in the box will not add it to
                  your response.
                </p>

                {(answers.weddingOutfits?.links?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {answers.weddingOutfits!.links.map((link, idx) => (
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
                              weddingOutfits: {
                                links: (prev.weddingOutfits?.links ?? []).filter(
                                  (_, i) => i !== idx
                                ),
                                images: prev.weddingOutfits?.images ?? [],
                                notes: prev.weddingOutfits?.notes ?? "",
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

              {/* Outfit Photos */}
              <div className="p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl space-y-2">
                <label className="block text-sm font-semibold text-[#1A1A1A]">
                  Upload outfit photos, sketches, or styling references (optional)
                </label>
                <ImageUploader
                  images={answers.weddingOutfits?.images ?? []}
                  onChange={(imgs) =>
                    setAnswers((prev) => ({
                      ...prev,
                      weddingOutfits: {
                        links: prev.weddingOutfits?.links ?? [],
                        images: imgs,
                        notes: prev.weddingOutfits?.notes ?? "",
                      },
                    }))
                  }
                  maxImages={6}
                  buttonLabel="Add outfit photos or references"
                />
              </div>
            </div>
          )}

          {/* QUESTION 14: WEDDING DECOR MOOD BOARD */}
          {currentStep === 14 && (
            <div className="space-y-6">
              <QuestionHeader
                title="Do you have a wedding decor mood board or any visual references for your celebration?"
                helper="Share Pinterest boards, reference images, colour palettes or decor ideas below (add at least one item to continue)."
                required
              />

              {/* Decor Links */}
              <div className="space-y-2 p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl">
                <label className="block text-sm font-semibold text-[#1A1A1A]">
                  Pinterest boards or decor reference links (optional)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={newDecorLinkInput}
                    onChange={(e) => setNewDecorLinkInput(e.target.value)}
                    placeholder="https://pinterest.com/..."
                    className="w-full sm:flex-1 min-w-0 px-4 py-3 text-[18px] bg-white border border-[#E8E8E8] rounded-xl focus:outline-hidden focus:border-[#1A1A1A]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newDecorLinkInput.trim()) {
                        e.preventDefault();
                        setAnswers((prev) => ({
                          ...prev,
                          decorMoodBoard: {
                            links: [
                              ...(prev.decorMoodBoard?.links ?? []),
                              newDecorLinkInput.trim(),
                            ],
                            images: prev.decorMoodBoard?.images ?? [],
                            notes: prev.decorMoodBoard?.notes ?? "",
                          },
                        }));
                        setNewDecorLinkInput("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newDecorLinkInput.trim()) {
                        setAnswers((prev) => ({
                          ...prev,
                          decorMoodBoard: {
                            links: [
                              ...(prev.decorMoodBoard?.links ?? []),
                              newDecorLinkInput.trim(),
                            ],
                            images: prev.decorMoodBoard?.images ?? [],
                            notes: prev.decorMoodBoard?.notes ?? "",
                          },
                        }));
                        setNewDecorLinkInput("");
                      }
                    }}
                    className="w-full sm:w-auto px-5 py-3.5 sm:py-3 bg-[#1A1A1A] text-white rounded-xl text-base sm:text-sm font-medium hover:bg-[#333333] shrink-0 flex items-center justify-center min-h-[48px] sm:min-h-0 transition-colors"
                  >
                    + Add link
                  </button>
                </div>

                <p
                  className={`text-xs sm:text-[13px] leading-relaxed pt-0.5 transition-colors ${
                    newDecorLinkInput.trim()
                      ? "text-[#8C7043] font-medium"
                      : "text-[#6B655D]"
                  }`}
                >
                  After pasting a link above, please click{" "}
                  <span className="font-semibold text-[#1A1A1A]">+ Add link</span>{" "}
                  to save it — simply entering it in the box will not add it to
                  your response.
                </p>

                {(answers.decorMoodBoard?.links?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {answers.decorMoodBoard!.links.map((link, idx) => (
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
                              decorMoodBoard: {
                                links: (prev.decorMoodBoard?.links ?? []).filter(
                                  (_, i) => i !== idx
                                ),
                                images: prev.decorMoodBoard?.images ?? [],
                                notes: prev.decorMoodBoard?.notes ?? "",
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

              {/* Decor Images */}
              <div className="p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl space-y-2">
                <label className="block text-sm font-semibold text-[#1A1A1A]">
                  Upload decor mood board images or colour palettes (optional)
                </label>
                <ImageUploader
                  images={answers.decorMoodBoard?.images ?? []}
                  onChange={(imgs) =>
                    setAnswers((prev) => ({
                      ...prev,
                      decorMoodBoard: {
                        links: prev.decorMoodBoard?.links ?? [],
                        images: imgs,
                        notes: prev.decorMoodBoard?.notes ?? "",
                      },
                    }))
                  }
                  maxImages={6}
                  buttonLabel="Add decor mood photos"
                />
              </div>

              {/* Decor Notes */}
              <div className="p-4 sm:p-5 bg-[#FAFAFA] border border-[#E8E8E8] rounded-2xl space-y-2">
                <label className="block text-sm font-semibold text-[#1A1A1A]">
                  Colour palettes, florals, lighting, or decor notes (optional)
                </label>
                <VoiceTextarea
                  id="q14-decor-mood-board-notes"
                  value={answers.decorMoodBoard?.notes ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      decorMoodBoard: {
                        links: prev.decorMoodBoard?.links ?? [],
                        images: prev.decorMoodBoard?.images ?? [],
                        notes: val,
                      },
                    }))
                  }
                  placeholder="e.g. Warm candlelit reception, muted terracotta and sage florals, open garden mandap..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* QUESTION 15 (previously Q13) */}
          {currentStep === 15 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <QuestionHeader
                  title="What tone are you expecting to set for your wedding day"
                  helper="Select up to 3 tones that capture your wedding day (at least 1 required · uncheck one to choose another)."
                  required
                />
                {(() => {
                  const selectedCount = answers.q13_tone.selected?.length || 0;
                  return (
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                          selectedCount > Q15_MAX_SELECTIONS
                            ? "bg-amber-50 text-amber-800 border-amber-200 font-semibold"
                            : selectedCount === Q15_MAX_SELECTIONS
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold"
                            : selectedCount >= 1
                            ? "bg-[#FAF7F2] text-[#8C7043] border-[#E8DFD3]"
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
                  );
                })()}
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
                  const currentSelected = answers.q13_tone.selected || [];
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
                        setAnswers((prev) => ({
                          ...prev,
                          q13_tone: {
                            ...prev.q13_tone,
                            selected: toggleMultiSelectWithMax(
                              prev.q13_tone.selected,
                              tone,
                              Q15_MAX_SELECTIONS
                            ),
                          },
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
                  value={answers.q13_tone?.other ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q13_tone: {
                        ...prev.q13_tone,
                        other: val,
                      },
                    }))
                  }
                  placeholder="e.g. Cozy and emotional ceremony leading into a lively celebration, candlelit evening..."
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* QUESTION 16 (previously Q14) */}
          {currentStep === 16 && (
            <div className="space-y-6">
              <QuestionHeader
                title="What are the moments you are most looking forward to during your wedding?"
                helper="Select all that apply, or enter anything unique you have planned."
                required
              />
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
                  const isSelected =
                    answers.q14_moments.selected.includes(moment);
                  return (
                    <OptionCard
                      key={moment}
                      label={moment}
                      isSelected={isSelected}
                      isMultiSelect={true}
                      onSelect={() => {
                        const current = answers.q14_moments.selected;
                        const updated = isSelected
                          ? current.filter((x) => x !== moment)
                          : [...current, moment];
                        setAnswers((prev) => ({
                          ...prev,
                          q14_moments: {
                            ...prev.q14_moments,
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
                  id="q16-moments-other"
                  label="Anything else?"
                  value={answers.q14_moments?.other ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q14_moments: {
                        selected: prev.q14_moments?.selected ?? [],
                        other: val,
                      },
                    }))
                  }
                  placeholder="e.g. Flash mob with cousins, private vow reading before sunrise..."
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* QUESTION 17 (previously Q15) */}
          {currentStep === 17 && (
            <div className="space-y-6">
              <QuestionHeader
                title="Is there anything you definitely want us to capture or avoid?"
                helper="Speak or type freely in both boxes."
              />
              <div className="space-y-6">
                <VoiceTextarea
                  id="q17-capture"
                  label="Definitely capture"
                  value={answers.q15_captureAvoid?.definitelyCapture ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q15_captureAvoid: {
                        definitelyCapture: val,
                        pleaseAvoid: prev.q15_captureAvoid?.pleaseAvoid ?? "",
                      },
                    }))
                  }
                  placeholder="e.g. The look on dad's face during the ceremony, candid reactions from college friends..."
                  rows={3}
                />
                <VoiceTextarea
                  id="q17-avoid"
                  label="Please avoid"
                  value={answers.q15_captureAvoid?.pleaseAvoid ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q15_captureAvoid: {
                        definitelyCapture: prev.q15_captureAvoid?.definitelyCapture ?? "",
                        pleaseAvoid: val,
                      },
                    }))
                  }
                  placeholder="e.g. Stiff table-to-table poses, overly cheesy spins, people eating at buffet..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* QUESTION 18 (previously Q16) */}
          {currentStep === 18 && (
            <div className="space-y-6">
              <QuestionHeader
                title="Please mention your non negotiables in your films and photographs?"
                helper="Things that are absolutely sacred to you on this day."
                required
              />
              <VoiceTextarea
                id="q18-non-negotiables"
                value={answers.q16_nonNegotiables ?? ""}
                onChange={(val) =>
                  setAnswers((prev) => ({ ...prev, q16_nonNegotiables: val }))
                }
                placeholder="e.g. Crystal clear audio of our live vows, capturing the sunset portraits on time..."
                rows={5}
              />
            </div>
          )}

          {/* QUESTION 19 (previously Q17) */}
          {currentStep === 19 && (
            <div className="space-y-6">
              <QuestionHeader
                title="Who do you think is going to be more emotional during wedding?"
                helper="Tap an option to continue."
              />
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
                    isSelected={answers.q17_emotional === opt}
                    onSelect={() =>
                      handleSingleChoiceSelect(() =>
                        setAnswers((prev) => ({ ...prev, q17_emotional: opt }))
                      )
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* QUESTION 20 (previously Q18) */}
          {currentStep === 20 && (
            <div className="space-y-6">
              <QuestionHeader
                title="How versatile are you with the camera?"
                helper="Tap an option to continue."
                required
              />
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
                    isSelected={answers.q18_cameraVersatility === opt}
                    onSelect={() =>
                      handleSingleChoiceSelect(() =>
                        setAnswers((prev) => ({
                          ...prev,
                          q18_cameraVersatility: opt,
                        }))
                      )
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* QUESTION 21: WHAT MATTERED MOST WHEN CHOOSING OAKS WEDDING (previously Q19) */}
          {currentStep === 21 && (
            <div className="space-y-6">
              <QuestionHeader
                title="What mattered most to you when choosing OAKS Wedding to capture your wedding?"
                helper="Was it our photography style, storytelling, films, recommendations, or something else that made you choose us?"
                required
              />
              <VoiceTextarea
                id="q21-choosing-oaks"
                value={answers.choosingOaks ?? ""}
                onChange={(val) =>
                  setAnswers((prev) => ({ ...prev, choosingOaks: val }))
                }
                placeholder="e.g. We were drawn to your candid storytelling, the emotion in your films, and how natural every couple looked..."
                rows={5}
              />
            </div>
          )}

          {/* QUESTION 22 (previously Q23) */}
          {currentStep === 22 && (
            <div className="space-y-6">
              <QuestionHeader
                title="How comfortable are you with being guided or directed during portraits and filming?"
                helper="Tap an option to continue."
                required
              />
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
                    isSelected={answers.q20_guidanceComfort === opt}
                    onSelect={() =>
                      handleSingleChoiceSelect(() =>
                        setAnswers((prev) => ({
                          ...prev,
                          q20_guidanceComfort: opt,
                        }))
                      )
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* QUESTION 23 (previously Q24) */}
          {currentStep === 23 && (
            <div className="space-y-6">
              <QuestionHeader
                title="Is there anything that would help you feel more comfortable in front of the camera?"
                helper="Select all that apply, or tell us in your own words."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  "A few practice shots first",
                  "Chatting with the photographer beforehand",
                  "A moment alone as a couple",
                  "Seeing previews as we go",
                  "Not sure yet",
                ].map((tip) => {
                  const isSelected =
                    answers.q21_comfortTips.selected.includes(tip);
                  return (
                    <OptionCard
                      key={tip}
                      label={tip}
                      isSelected={isSelected}
                      isMultiSelect={true}
                      onSelect={() => {
                        const current = answers.q21_comfortTips.selected;
                        const updated = isSelected
                          ? current.filter((x) => x !== tip)
                          : [...current, tip];
                        setAnswers((prev) => ({
                          ...prev,
                          q21_comfortTips: {
                            ...prev.q21_comfortTips,
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
                  id="q23-comfort-notes"
                  label="In your own words"
                  value={answers.q21_comfortTips?.notes ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q21_comfortTips: {
                        selected: prev.q21_comfortTips?.selected ?? [],
                        notes: val,
                      },
                    }))
                  }
                  placeholder="e.g. Having music playing, having a glass of champagne, taking short breathers..."
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* QUESTION 24 (previously Q25) */}
          {currentStep === 24 && (
            <div className="space-y-6">
              <QuestionHeader
                title="What do you hope to feel when you watch your wedding film years from now?"
                helper="Close your eyes and imagine watching it on your tenth anniversary."
              />
              <VoiceTextarea
                id="q24-future-feeling"
                value={answers.q22_futureFeeling ?? ""}
                onChange={(val) =>
                  setAnswers((prev) => ({ ...prev, q22_futureFeeling: val }))
                }
                placeholder="What emotions or memories do you want rushing back when you press play?"
                rows={5}
              />
            </div>
          )}

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
          {currentStep === 27 && (
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

              <VoiceTextarea
                id="q27-one-last-thing-notes"
                value={answers.q23_oneLastThing?.notes ?? ""}
                onChange={(val) =>
                  setAnswers((prev) => ({
                    ...prev,
                    q23_oneLastThing: {
                      images: prev.q23_oneLastThing?.images ?? [],
                      notes: val,
                    },
                  }))
                }
                placeholder="Any special details, surprises planned for each other, or anything we didn't ask..."
                rows={5}
              />

              <div className="pt-2">
                <ImageUploader
                  images={answers.q23_oneLastThing.images}
                  onChange={(imgs) =>
                    setAnswers((prev) => ({
                      ...prev,
                      q23_oneLastThing: {
                        ...prev.q23_oneLastThing,
                        images: imgs,
                      },
                    }))
                  }
                  maxImages={4}
                  label="Optional photos or mood references"
                  buttonLabel="Add photos"
                />
              </div>
            </div>
          )}
        </div>

        {/* Bottom Actions Bar (Continue & Skip) */}
        <div className="pt-8 pb-4 space-y-3">
          {(() => {
            const stepValidation = validateQuestionStep(currentStep, answers);
            const isIncomplete = !stepValidation.isComplete;
            const step11Count = answers.q11_filmFeel.selected?.length || 0;
            const step15Count = answers.q13_tone.selected?.length || 0;

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
      <Analytics />
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
