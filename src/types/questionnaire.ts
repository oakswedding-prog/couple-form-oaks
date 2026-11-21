/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type FamilySide = "bride" | "groom" | "sideA" | "sideB" | "both";

export interface SideFamilyPhoto {
  id: string;
  url: string;
  caption?: string;
  mustCapture?: boolean;
}

export interface FamilySideData {
  photos: SideFamilyPhoto[];
  notes: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  side: FamilySide;
  mustCapture: boolean;
  photoUrl?: string;
}

export interface WardrobeSideData {
  notes: string;
  links: string[];
  photos: string[];
}

export interface DecorEventBoard {
  id: string;
  name: string;
  isLocked?: boolean;
  links: string[];
  images: string[];
  notes: string;
}

export interface QuestionnaireAnswers {
  partner1: string;
  partner2: string;
  weddingDate?: string;
  phone?: string;
  email?: string;
  couplePhotoUrl?: string;
  q1_calls: { aCallsB: string; bCallsA: string };
  q2_workPassion: { partnerA: string; partnerB: string };
  q3_firstMeet: string;
  q4_firstImpression: { partnerA: string; partnerB: string };
  q5_threeWords: [string, string, string];
  q6_activities: { selected: string[]; other: string };
  q7_loveMost: { partnerA: string; partnerB: string };
  q8_funnyStory: string;
  q9_proposal: { choice: "story" | "na" | ""; story: string };
  q10_people: {
    familyMembers: FamilyMember[];
    treePhotoUrl?: string;
    treeNotes: string;
    brideSide?: FamilySideData;
    groomSide?: FamilySideData;
  };
  q11_filmFeel: { selected: string[]; other: string };
  q12_references: {

    links: string[];
    images: string[];
    notes: string;
  };
  wardrobe?: {
    bride: WardrobeSideData;
    groom: WardrobeSideData;
  };
  weddingOutfits?: {
    links: string[];
    images: string[];
    notes: string;
  };
  decorEvents?: DecorEventBoard[];
  decorMoodBoard?: {
    links: string[];
    images: string[];
    notes: string;
  };
  q13_tone: { selected: string[]; other: string };
  q14_moments: { selected: string[]; other: string };
  q15_captureAvoid: { definitelyCapture: string; pleaseAvoid: string };
  q16_nonNegotiables: string;
  q17_emotional: string;
  q18_cameraVersatility: string;
  choosingOaks?: string;
  q19_whatMattersMost?: { selected: string[]; other: string };
  q20_guidanceComfort: string;
  q21_comfortTips: { selected: string[]; notes: string };
  q22_futureFeeling: string;
  primaryContact?: {
    role: "Bride" | "Groom" | "Someone else" | "";
    side?: "Bride's side" | "Groom's side" | "";
    designation?: string;
    gender?: "Man" | "Woman" | "";
    name: string;
    phone: string;
  };
  loveStoryNarrative?: string;
  q23_oneLastThing: { notes: string; images: string[] };
}

export type SubmissionStatus = "new" | "reviewed" | "shared";

export type PhotoRecordStatus = "uploaded" | "pending" | "failed";

export interface PhotoStatusEntry {
  id: string;
  category: string;
  status: PhotoRecordStatus;
  storagePath?: string;
  errorCode?: string;
  updatedAt: string;
}

export type SubmissionDeliveryState =
  | "draft"
  | "submitted"
  | "photos_pending"
  | "needs_attention";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "retrying";

export interface DraftRecord {
  id: string; // resumeToken (unguessable 192-bit doc ID)
  submissionId: string;
  ownerUid: string;
  status: "draft" | "submitted";
  currentStep: number;
  furthestStep: number;
  partner1: string;
  partner2: string;
  weddingDate: string;
  phone: string;
  email: string;
  answers: QuestionnaireAnswers;
  photoStatuses?: Record<string, PhotoStatusEntry>;
  answeredCount?: number;
  mandatoryRemaining?: number;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
}

export interface SubmissionErrorRecord {
  id: string;
  step: string;
  errorCode: string;
  message: string;
  deviceBrowser: string;
  timestamp: string;
  photoCount: number;
  submissionId: string;
  ownerUid?: string | null;
}

export interface OrphanedStorageFolder {
  folderName: string;
  fullPath: string;
  photoPaths: string[];
  estimatedDate?: string;
}

export type ChecklistItemStatus = "got_it" | "missed";

export type ChecklistEventKey = "sangeet" | "wedding" | "reception";

export interface EventSubmissionRecord {
  eventId: string;
  eventName: string;
  isCustom: boolean;
  submittedBy: string;
  submittedByEmail?: string;
  submissionDate: string;
  submissionTime: string;
  submittedAt: string;
  items: Record<string, ChecklistItemStatus>;
  fileDetails: FileDetailEntry[];
  productionManagersSnapshot?: string[];
}

export interface EventChecklistState {
  items: Record<string, ChecklistItemStatus>;
  fileDetails?: FileDetailEntry[];
  submitted?: boolean;
  submission?: EventSubmissionRecord;
  updatedAt?: string;
  updatedBy?: string;
}

export interface CustomProductionEvent {
  id: string;
  name: string;
  isCustom: true;
  items: Record<string, ChecklistItemStatus>;
  fileDetails: FileDetailEntry[];
  submitted: boolean;
  submission?: EventSubmissionRecord;
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy?: string;
}

export type CrewFileRole =
  | "Photographer"
  | "Videographer"
  | "Drone"
  | "Editor"
  | "Custom";

export type FileSizeUnit = "GB" | "TB";

export type CameraStarredStatus = "Starred" | "Not Starred";

export interface FileDetailEntry {
  id: string;
  memberName: string;
  role: CrewFileRole;
  customRole?: string;
  cameraStarredStatus?: CameraStarredStatus;
  fileSize: number;
  sizeUnit: FileSizeUnit;
  fileCount: number;
  driveName?: string;
  updatedAt: string;
}

export interface ProductionChecklistData {
  items: Record<string, ChecklistItemStatus>;
  events?: Partial<Record<ChecklistEventKey, EventChecklistState>>;
  customEvents?: Record<string, CustomProductionEvent>;
  productionManagers?: string[];
  fileDetails?: FileDetailEntry[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface SubmissionRecord {
  id: string;
  sequenceNumber?: number;
  displayId?: string; // e.g. "#001" (may be empty if counter transaction failed)
  submittedAt: string; // ISO string
  updatedAt?: string;
  status?: SubmissionStatus;
  ownerUid?: string;
  finalized?: boolean;
  submissionState?: SubmissionDeliveryState;
  photoStatuses?: Record<string, PhotoStatusEntry>;
  pendingPhotoCount?: number;
  recoveredFromStorage?: boolean;
  recoveredFromDraft?: boolean;
  partner1: string;
  partner2: string;
  weddingDate: string;
  phone: string;
  email: string;
  answers: QuestionnaireAnswers;
  coupleLetter?: string;
  editorialBrief?: string;
  interviewQuestions?: string;
  cheatSheet?: string;
  privateNotes?: string;
  productionChecklist?: ProductionChecklistData;
}

export interface QuestionMeta {
  number: number;
  chapter: number;
  chapterTitle: string;
  title: string;
  helperText: string;
  isVoiceEnabled?: boolean;
}

export interface ChapterMeta {
  chapter: number;
  title: string;
  subtitle: string;
  questionsRange: string;
  startQuestionNumber: number;
}

