/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from "react";
import {
  Camera,
  Check,
  CloudCheck,
  ImagePlus,
  Loader2,
  Plus,
  RotateCcw,
  Star,
  User,
  X,
} from "lucide-react";
import type {
  FamilyMember,
  FamilySideData,
  QuestionnaireAnswers,
  SideFamilyPhoto,
} from "../types/questionnaire.ts";
import {
  isSupportedPhotoFile,
  TOO_LARGE_PHOTO_ERROR,
  validatePhotoFileBeforeCompression,
} from "../utils/imageCompressor.ts";
import {
  getPhotoPreviewSrc,
  removeBackgroundPhotoEntry,
  retryBackgroundPhotoUpload,
  startBackgroundPhotoUpload,
  usePhotoUploadStatus,
} from "../lib/photoUploadManager.ts";
import { getGroupedQ10People } from "../utils/familyPeople.ts";
import { VoiceTextarea } from "./VoiceTextarea.tsx";

interface FamilyTreeBuilderProps {
  partner1: string;
  partner2: string;
  value: QuestionnaireAnswers["q10_people"];
  onChange: (next: QuestionnaireAnswers["q10_people"]) => void;
}

const RELATIONSHIP_OPTIONS = [
  "Mother",
  "Father",
  "Sibling",
  "Grandparent",
  "Uncle or Aunt",
  "Cousin",
  "Close friend",
  "Other",
] as const;

const MAX_PHOTOS_PER_SIDE = 12;

type SideTabKey = "vip" | "tree" | "notes";

export const FamilyTreeBuilder: React.FC<FamilyTreeBuilderProps> = ({
  value,
  onChange,
}) => {
  const grouped = getGroupedQ10People(value);

  const updateSideData = (
    side: "bride" | "groom",
    updater: (current: FamilySideData) => FamilySideData
  ) => {
    const currentSide: FamilySideData =
      side === "bride"
        ? {
            photos: grouped.bride.photos,
            notes: grouped.bride.notes,
          }
        : {
            photos: grouped.groom.photos,
            notes: grouped.groom.notes,
          };

    const updated = updater(currentSide);
    onChange({
      ...value,
      ...(side === "bride" ? { brideSide: updated } : { groomSide: updated }),
    });
  };

  const handleAddMember = (member: FamilyMember) => {
    onChange({
      ...value,
      familyMembers: [...(value.familyMembers || []), member],
    });
  };

  const handleUpdateMember = (id: string, patch: Partial<FamilyMember>) => {
    onChange({
      ...value,
      familyMembers: (value.familyMembers || []).map((m) =>
        m.id === id ? { ...m, ...patch } : m
      ),
    });
  };

  const handleRemoveMember = (id: string) => {
    onChange({
      ...value,
      familyMembers: (value.familyMembers || []).filter((m) => m.id !== id),
    });
  };

  const handleMoveLegacyPhotoToSide = (side: "bride" | "groom") => {
    if (!grouped.legacyTreePhotoUrl) return;
    const migratedPhoto: SideFamilyPhoto = {
      id: `migrated_tree_${Date.now()}`,
      url: grouped.legacyTreePhotoUrl,
      caption: "Family tree sketch",
      mustCapture: false,
    };
    const currentSide: FamilySideData =
      side === "bride"
        ? { photos: grouped.bride.photos, notes: grouped.bride.notes }
        : { photos: grouped.groom.photos, notes: grouped.groom.notes };

    onChange({
      ...value,
      treePhotoUrl: undefined,
      ...(side === "bride"
        ? {
            brideSide: {
              ...currentSide,
              photos: [...currentSide.photos, migratedPhoto],
            },
          }
        : {
            groomSide: {
              ...currentSide,
              photos: [...currentSide.photos, migratedPhoto],
            },
          }),
    });
  };

  const handleAssignSharedMember = (memberId: string, side: "bride" | "groom") => {
    onChange({
      ...value,
      familyMembers: (value.familyMembers || []).map((m) =>
        m.id === memberId ? { ...m, side } : m
      ),
    });
  };

  return (
    <div className="w-full space-y-5">
      {/* Clean unboxed readiness bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E8E8E8] text-xs text-[#5F5F5F]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 font-medium text-[#1A1A1A]">
            {grouped.hasBrideEntry ? (
              <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-[#B08D57]" aria-hidden="true" />
            )}
            <span>
              Bride&apos;s Side:{" "}
              <span className={grouped.hasBrideEntry ? "text-emerald-800 font-semibold" : "text-[#8C7043]"}>
                {grouped.hasBrideEntry ? "Added" : "Required"}
              </span>
            </span>
          </span>
          <span aria-hidden="true" className="text-[#CCCCCC]">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-[#1A1A1A]">
            {grouped.hasGroomEntry ? (
              <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-[#B08D57]" aria-hidden="true" />
            )}
            <span>
              Groom&apos;s Side:{" "}
              <span className={grouped.hasGroomEntry ? "text-emerald-800 font-semibold" : "text-[#8C7043]"}>
                {grouped.hasGroomEntry ? "Added" : "Required"}
              </span>
            </span>
          </span>
        </div>
        <span className="tabular-nums text-[#7A756D]">
          {grouped.totalMembers} VIP {grouped.totalMembers === 1 ? "person" : "people"} ·{" "}
          {grouped.bride.photos.length + grouped.groom.photos.length} tree photos
        </span>
      </div>

      {/* Legacy fallback notice only when older draft data exists */}
      {(grouped.legacyTreePhotoUrl ||
        grouped.sharedMembers.length > 0 ||
        grouped.legacyTreeNotes) && (
        <div className="p-4 rounded-2xl border border-[#E8DFD3] bg-[#FAF8F5] space-y-3">
          <p className="text-xs font-medium text-[#4A453E]">
            Previously saved items from an earlier draft
          </p>

          {grouped.legacyTreePhotoUrl && (
            <div className="flex flex-wrap items-center gap-3">
              <img
                src={grouped.legacyTreePhotoUrl}
                alt="Saved family tree"
                className="w-16 h-12 object-cover rounded-lg border border-[#E8E8E8]"
              />
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[#5F5F5F]">Move tree photo to:</span>
                <button
                  type="button"
                  onClick={() => handleMoveLegacyPhotoToSide("bride")}
                  className="px-3 py-1.5 rounded-lg border border-[#E8E8E8] bg-white hover:border-[#1A1A1A] text-[#1A1A1A] font-medium whitespace-nowrap cursor-pointer"
                >
                  Bride&apos;s Side
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveLegacyPhotoToSide("groom")}
                  className="px-3 py-1.5 rounded-lg border border-[#E8E8E8] bg-white hover:border-[#1A1A1A] text-[#1A1A1A] font-medium whitespace-nowrap cursor-pointer"
                >
                  Groom&apos;s Side
                </button>
              </div>
            </div>
          )}

          {grouped.sharedMembers.length > 0 && (
            <div className="space-y-1.5">
              {grouped.sharedMembers.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs bg-white px-3 py-2 rounded-xl border border-[#E8E8E8]"
                >
                  <span className="font-medium text-[#1A1A1A]">
                    {m.name} ({m.relationship})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAssignSharedMember(m.id, "bride")}
                      className="px-2.5 py-1 rounded-lg border border-[#E8E8E8] hover:border-[#1A1A1A] text-[#1A1A1A] cursor-pointer whitespace-nowrap"
                    >
                      Move to Bride
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAssignSharedMember(m.id, "groom")}
                      className="px-2.5 py-1 rounded-lg border border-[#E8E8E8] hover:border-[#1A1A1A] text-[#1A1A1A] cursor-pointer whitespace-nowrap"
                    >
                      Move to Groom
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {grouped.legacyTreeNotes && (
            <p className="text-xs text-[#5F5F5F] leading-relaxed">
              Saved note: {grouped.legacyTreeNotes}
            </p>
          )}
        </div>
      )}

      {/* Side-by-side on desktop (lg:grid-cols-2), stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <FamilySideSection
          side="bride"
          title="Bride's Side"
          subtitle="Add important family & friends, upload a family tree, or write notes for the bride's side."
          photos={grouped.bride.photos}
          members={grouped.bride.members}
          notes={grouped.bride.notes}
          isComplete={grouped.hasBrideEntry}
          onPhotosChange={(photos) =>
            updateSideData("bride", (curr) => ({ ...curr, photos }))
          }
          onNotesChange={(notes) =>
            updateSideData("bride", (curr) => ({ ...curr, notes }))
          }
          onAddMember={handleAddMember}
          onUpdateMember={handleUpdateMember}
          onRemoveMember={handleRemoveMember}
        />

        <FamilySideSection
          side="groom"
          title="Groom's Side"
          subtitle="Add important family & friends, upload a family tree, or write notes for the groom's side."
          photos={grouped.groom.photos}
          members={grouped.groom.members}
          notes={grouped.groom.notes}
          isComplete={grouped.hasGroomEntry}
          onPhotosChange={(photos) =>
            updateSideData("groom", (curr) => ({ ...curr, photos }))
          }
          onNotesChange={(notes) =>
            updateSideData("groom", (curr) => ({ ...curr, notes }))
          }
          onAddMember={handleAddMember}
          onUpdateMember={handleUpdateMember}
          onRemoveMember={handleRemoveMember}
        />
      </div>
    </div>
  );
};

const VipPhotoAvatar: React.FC<{
  photoUrl: string | undefined;
  name: string;
}> = ({ photoUrl, name }) => {
  const uploadEntry = usePhotoUploadStatus(photoUrl);
  const previewSrc = getPhotoPreviewSrc(photoUrl);
  const isRenderable =
    Boolean(previewSrc) &&
    (previewSrc!.startsWith("blob:") ||
      previewSrc!.startsWith("http://") ||
      previewSrc!.startsWith("https://") ||
      previewSrc!.startsWith("data:image/"));

  if (!photoUrl) {
    return (
      <div className="w-11 h-11 rounded-full bg-[#FAF8F5] border border-[#E8E8E8] flex items-center justify-center text-[#5F5F5F] shrink-0">
        <User className="w-4 h-4" />
      </div>
    );
  }

  return (
    <div className="relative w-11 h-11 rounded-full shrink-0">
      {isRenderable ? (
        <img
          src={previewSrc}
          alt={name}
          referrerPolicy="no-referrer"
          className="w-11 h-11 rounded-full object-cover border border-[#E8E8E8]"
        />
      ) : (
        <div className="w-11 h-11 rounded-full bg-[#FAF8F5] border border-[#E8E8E8] flex items-center justify-center text-[#B08D57]">
          <CloudCheck className="w-4 h-4" />
        </div>
      )}

      {uploadEntry?.status === "uploading" && (
        <span
          title={`Uploading ${uploadEntry.progress}%`}
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center border border-white"
        >
          <Loader2 className="w-3 h-3 animate-spin text-[#E5C687]" />
        </span>
      )}

      {uploadEntry?.status === "error" && (
        <button
          type="button"
          onClick={() => {
            void retryBackgroundPhotoUpload(photoUrl).catch(() => {});
          }}
          title="Retry photo upload"
          aria-label={`Retry photo upload for ${name}`}
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center border border-white cursor-pointer"
        >
          <RotateCcw className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
};

const TreePhotoCard: React.FC<{
  photo: SideFamilyPhoto;
  index: number;
  title: string;
  onToggleMustCapture: (id: string) => void;
  onRemove: (id: string) => void;
  onCaptionChange: (id: string, caption: string) => void;
}> = ({
  photo,
  index,
  title,
  onToggleMustCapture,
  onRemove,
  onCaptionChange,
}) => {
  const uploadEntry = usePhotoUploadStatus(photo.url);
  const previewSrc = getPhotoPreviewSrc(photo.url);
  const isRenderable =
    Boolean(previewSrc) &&
    (previewSrc!.startsWith("blob:") ||
      previewSrc!.startsWith("http://") ||
      previewSrc!.startsWith("https://") ||
      previewSrc!.startsWith("data:image/"));

  return (
    <div className="bg-white border border-[#E8E8E8] rounded-xl overflow-hidden flex flex-col">
      <div className="relative aspect-4/3 bg-[#F5F2ED]">
        {isRenderable ? (
          <img
            src={previewSrc}
            alt={photo.caption?.trim() || `${title} tree photo ${index + 1}`}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-[#6B655D] px-2 text-center">
            <CloudCheck className="w-5 h-5 text-[#B08D57]" />
            <span className="text-[11px] font-medium">
              Saved photo {index + 1}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => onToggleMustCapture(photo.id)}
          title={
            photo.mustCapture ? "Marked as Must Capture" : "Mark as Must Capture"
          }
          aria-label={
            photo.mustCapture
              ? `Unmark must capture for photo ${index + 1}`
              : `Mark photo ${index + 1} as must capture`
          }
          className={`absolute top-2 left-2 min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
            photo.mustCapture
              ? "bg-[#1A1A1A] text-white"
              : "bg-white/90 text-[#4A453E] hover:bg-white border border-[#E8E8E8]"
          }`}
        >
          <Star
            className={`w-3 h-3 ${
              photo.mustCapture
                ? "fill-[#B08D57] text-[#B08D57]"
                : "text-[#8C7043]"
            }`}
          />
          <span>{photo.mustCapture ? "Must capture" : "Star"}</span>
        </button>

        <button
          type="button"
          onClick={() => onRemove(photo.id)}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-[#1A1A1A]/85 text-white hover:bg-[#1A1A1A] flex items-center justify-center transition-colors cursor-pointer"
          aria-label={`Remove ${title} photo ${index + 1}`}
        >
          <X className="w-4 h-4" />
        </button>

        {uploadEntry?.status === "uploading" && (
          <div className="absolute inset-x-0 bottom-0 bg-[#1A1A1A]/75 text-white px-2.5 py-1.5 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-medium tabular-nums">
              <span className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin text-[#E5C687]" />
                <span>Uploading</span>
              </span>
              <span>{uploadEntry.progress}%</span>
            </div>
            <div className="w-full h-1 bg-white/25 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#B08D57] transition-all duration-200"
                style={{ width: `${Math.max(8, uploadEntry.progress)}%` }}
              />
            </div>
          </div>
        )}

        {uploadEntry?.status === "error" && (
          <div className="absolute inset-x-0 bottom-0 bg-red-950/85 text-white px-2.5 py-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium truncate">
              {uploadEntry.error || "Upload failed"}
            </span>
            <button
              type="button"
              onClick={() => {
                void retryBackgroundPhotoUpload(photo.url).catch(() => {});
              }}
              className="px-2.5 py-1 rounded-md bg-white text-[#1A1A1A] text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        )}
      </div>

      <div className="p-2.5 border-t border-[#E8E8E8]">
        <input
          type="text"
          value={photo.caption || ""}
          onChange={(e) => onCaptionChange(photo.id, e.target.value)}
          placeholder="Optional label (e.g. Maternal family tree)"
          aria-label={`Name or caption for ${title} photo ${index + 1}`}
          className="w-full px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#7A756D]/70 bg-[#FAF8F5] border border-[#E8E8E8] rounded-lg focus:outline-hidden focus:border-[#1A1A1A] min-h-[40px]"
        />
      </div>
    </div>
  );
};

interface FamilySideSectionProps {
  side: "bride" | "groom";
  title: string;
  subtitle: string;
  photos: SideFamilyPhoto[];
  members: FamilyMember[];
  notes: string;
  isComplete: boolean;
  onPhotosChange: (photos: SideFamilyPhoto[]) => void;
  onNotesChange: (notes: string) => void;
  onAddMember: (member: FamilyMember) => void;
  onUpdateMember: (id: string, patch: Partial<FamilyMember>) => void;
  onRemoveMember: (id: string) => void;
}

const FamilySideSection: React.FC<FamilySideSectionProps> = ({
  side,
  title,
  subtitle,
  photos,
  members,
  notes,
  isComplete,
  onPhotosChange,
  onNotesChange,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
}) => {
  const [activeTab, setActiveTab] = useState<SideTabKey>("vip");
  const [isAddFormOpen, setIsAddFormOpen] = useState(true);

  // Add Important Person form state
  const [vipName, setVipName] = useState("");
  const [vipRelationship, setVipRelationship] = useState<string>("Mother");
  const [vipMustCapture, setVipMustCapture] = useState(false);
  const [vipPhotoUrl, setVipPhotoUrl] = useState<string | undefined>(undefined);
  const [vipPhotoProcessing, setVipPhotoProcessing] = useState(false);
  const [vipPhotoError, setVipPhotoError] = useState<string | null>(null);
  const [vipDragOver, setVipDragOver] = useState(false);
  const vipFileInputRef = useRef<HTMLInputElement | null>(null);

  // Saved-person photo replacement state
  const replacePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [replacingMemberId, setReplacingMemberId] = useState<string | null>(null);

  // Upload Tree state
  const treeFileInputRef = useRef<HTMLInputElement | null>(null);
  const [treeProcessing, setTreeProcessing] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeDragOver, setTreeDragOver] = useState(false);
  const latestPhotosRef = useRef(photos);
  latestPhotosRef.current = photos;

  const vipUploadEntry = usePhotoUploadStatus(vipPhotoUrl);

  const resetVipForm = () => {
    setVipName("");
    setVipRelationship("Mother");
    setVipMustCapture(false);
    setVipPhotoUrl(undefined);
    setVipPhotoError(null);
    if (vipFileInputRef.current) vipFileInputRef.current.value = "";
  };

  const processVipPhotoFile = async (fileList: FileList | File[]) => {
    const file = Array.from(fileList).find((f) => isSupportedPhotoFile(f) || f.size > 0);
    if (!file) return;

    setVipPhotoError(null);
    const check = validatePhotoFileBeforeCompression(file);
    if (!check.ok) {
      setVipPhotoError(check.message);
      return;
    }

    setVipPhotoProcessing(true);
    try {
      const storagePath = await startBackgroundPhotoUpload(file, `${side}_vip`);
      setVipPhotoUrl(storagePath);
    } catch (err) {
      setVipPhotoError(
        err instanceof Error ? err.message : TOO_LARGE_PHOTO_ERROR
      );
    } finally {
      setVipPhotoProcessing(false);
    }
  };

  const handleVipPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void processVipPhotoFile(e.target.files);
    }
    if (vipFileInputRef.current) vipFileInputRef.current.value = "";
  };

  const handleSaveVip = () => {
    if (!vipName.trim() || vipPhotoProcessing) return;
    onAddMember({
      id: `${side}_vip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: vipName.trim(),
      relationship: vipRelationship,
      side,
      mustCapture: vipMustCapture,
      ...(vipPhotoUrl ? { photoUrl: vipPhotoUrl } : {}),
    });
    resetVipForm();
  };

  const handleCancelVip = () => {
    if (vipPhotoUrl) {
      removeBackgroundPhotoEntry(vipPhotoUrl);
    }
    resetVipForm();
    setIsAddFormOpen(false);
  };

  const handleTriggerReplaceMemberPhoto = (memberId: string) => {
    setReplacingMemberId(memberId);
    replacePhotoInputRef.current?.click();
  };

  const handleMemberPhotoReplaceSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const targetId = replacingMemberId;
    const file = e.target.files
      ? Array.from(e.target.files).find((f) => isSupportedPhotoFile(f) || f.size > 0)
      : undefined;
    if (replacePhotoInputRef.current) replacePhotoInputRef.current.value = "";
    setReplacingMemberId(null);
    if (!targetId || !file) return;

    setVipPhotoError(null);
    const check = validatePhotoFileBeforeCompression(file);
    if (!check.ok) {
      setVipPhotoError(check.message);
      return;
    }

    try {
      const storagePath = await startBackgroundPhotoUpload(file, `${side}_vip`);
      onUpdateMember(targetId, { photoUrl: storagePath });
    } catch (err) {
      setVipPhotoError(
        err instanceof Error ? err.message : TOO_LARGE_PHOTO_ERROR
      );
    }
  };

  const processTreeFiles = async (fileList: FileList | File[]) => {
    const candidateFiles = Array.from(fileList).filter(
      (f) => isSupportedPhotoFile(f) || f.size > 0
    );
    if (candidateFiles.length === 0) return;

    setTreeError(null);
    const remainingSlots = Math.max(0, MAX_PHOTOS_PER_SIDE - latestPhotosRef.current.length);
    if (remainingSlots === 0) return;

    const validSizedFiles: File[] = [];
    let firstError: string | null = null;
    for (const file of candidateFiles) {
      const check = validatePhotoFileBeforeCompression(file);
      if (!check.ok) {
        if (!firstError) firstError = check.message;
        continue;
      }
      validSizedFiles.push(file);
    }

    const filesToProcess = validSizedFiles.slice(0, remainingSlots);
    if (filesToProcess.length === 0) {
      if (firstError) setTreeError(firstError);
      return;
    }

    setTreeProcessing(true);
    try {
      const results = await Promise.allSettled(
        filesToProcess.map((file) =>
          startBackgroundPhotoUpload(file, `${side}_family`)
        )
      );

      const baseTime = Date.now();
      const newItems: SideFamilyPhoto[] = [];
      let idxCounter = 0;
      for (const res of results) {
        if (res.status === "fulfilled") {
          newItems.push({
            id: `${side}_photo_${baseTime}_${idxCounter++}_${Math.random().toString(36).slice(2, 6)}`,
            url: res.value,
            caption: "",
            mustCapture: false,
          });
        } else if (!firstError) {
          firstError =
            res.reason instanceof Error ? res.reason.message : TOO_LARGE_PHOTO_ERROR;
        }
      }

      if (newItems.length > 0) {
        onPhotosChange([...latestPhotosRef.current, ...newItems]);
      }
      if (firstError) {
        setTreeError(firstError);
      }
    } finally {
      setTreeProcessing(false);
    }
  };

  const handleTreeFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void processTreeFiles(e.target.files);
    }
    if (treeFileInputRef.current) treeFileInputRef.current.value = "";
  };

  // Focus-scoped paste so pasting targets only this side's active tab
  const handleCardPaste = (e: React.ClipboardEvent<HTMLElement>) => {
    if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
      const hasImages = Array.from(e.clipboardData.files).some((f) =>
        isSupportedPhotoFile(f)
      );
      if (!hasImages) return;

      if (activeTab === "vip" && isAddFormOpen) {
        e.preventDefault();
        void processVipPhotoFile(e.clipboardData.files);
      } else if (activeTab === "tree") {
        e.preventDefault();
        void processTreeFiles(e.clipboardData.files);
      }
    }
  };

  const handleCaptionChange = (photoId: string, caption: string) => {
    onPhotosChange(
      photos.map((p) => (p.id === photoId ? { ...p, caption } : p))
    );
  };

  const handleTogglePhotoMustCapture = (photoId: string) => {
    onPhotosChange(
      photos.map((p) =>
        p.id === photoId ? { ...p, mustCapture: !p.mustCapture } : p
      )
    );
  };

  const handleRemovePhoto = (photoId: string) => {
    const target = photos.find((p) => p.id === photoId);
    if (target?.url) {
      removeBackgroundPhotoEntry(target.url);
    }
    onPhotosChange(photos.filter((p) => p.id !== photoId));
  };

  const sideCountSummary = [
    members.length > 0 ? `${members.length} VIP` : null,
    photos.length > 0 ? `${photos.length} ${photos.length === 1 ? "tree photo" : "tree photos"}` : null,
    notes.trim() ? "notes added" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      onPaste={handleCardPaste}
      aria-label={title}
      className="bg-[#FAF8F5] border border-[#E8E8E8] rounded-2xl p-4 sm:p-6 space-y-4"
    >
      {/* Card Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-cormorant text-2xl font-semibold text-[#1A1A1A] leading-tight">
            {title} <span className="text-[#B08D57]">*</span>
          </h3>
          <span className="text-xs font-medium text-[#7A756D] tabular-nums whitespace-nowrap shrink-0">
            {isComplete ? sideCountSummary || "Ready" : "Add at least 1"}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-[#5F5F5F] leading-relaxed">
          {subtitle}
        </p>
      </div>

      {/* Single Segmented Tab Switcher (always visible at top of side panel) */}
      <div
        role="tablist"
        aria-label={`${title} input method`}
        className="grid grid-cols-3 gap-1 p-1 bg-[#F2EFE9] border border-[#E8E8E8] rounded-2xl"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "vip"}
          onClick={() => setActiveTab("vip")}
          className={`min-h-[42px] px-2 py-2 rounded-xl text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap truncate ${
            activeTab === "vip"
              ? "bg-white text-[#1A1A1A] font-semibold shadow-2xs"
              : "text-[#5F5F5F] hover:text-[#1A1A1A] font-medium"
          }`}
        >
          VIP List ({members.length})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "tree"}
          onClick={() => setActiveTab("tree")}
          className={`min-h-[42px] px-2 py-2 rounded-xl text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap truncate ${
            activeTab === "tree"
              ? "bg-white text-[#1A1A1A] font-semibold shadow-2xs"
              : "text-[#5F5F5F] hover:text-[#1A1A1A] font-medium"
          }`}
        >
          Upload Tree{photos.length > 0 ? ` (${photos.length})` : ""}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "notes"}
          onClick={() => setActiveTab("notes")}
          className={`min-h-[42px] px-2 py-2 rounded-xl text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap truncate ${
            activeTab === "notes"
              ? "bg-white text-[#1A1A1A] font-semibold shadow-2xs"
              : "text-[#5F5F5F] hover:text-[#1A1A1A] font-medium"
          }`}
        >
          Write it out
        </button>
      </div>

      {/* Hidden input for replacing an existing VIP member's photo */}
      <input
        ref={replacePhotoInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        onChange={handleMemberPhotoReplaceSelect}
        className="hidden"
      />

      {/* TAB 1: VIP LIST (Default) */}
      {activeTab === "vip" && (
        <div role="tabpanel" className="space-y-4">
          {isAddFormOpen ? (
            <div className="bg-white border border-[#E8E8E8] rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-cormorant text-xl font-semibold text-[#1A1A1A]">
                  Add Important Person
                </h4>
                <button
                  type="button"
                  onClick={handleCancelVip}
                  className="p-1.5 text-[#7A756D] hover:text-[#1A1A1A] rounded-lg cursor-pointer"
                  aria-label="Close Add Important Person form"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Name field */}
              <div className="space-y-1.5">
                <label
                  htmlFor={`vip-name-${side}`}
                  className="block text-xs font-medium text-[#5F5F5F]"
                >
                  Name
                </label>
                <input
                  id={`vip-name-${side}`}
                  type="text"
                  value={vipName}
                  onChange={(e) => setVipName(e.target.value)}
                  placeholder="e.g. Grandma Rose, Ananya, Uncle..."
                  className="w-full px-3.5 py-2.5 text-sm sm:text-base text-[#1A1A1A] placeholder:text-[#7A756D]/70 bg-[#FAF8F5] border border-[#E8E8E8] rounded-xl focus:outline-hidden focus:border-[#1A1A1A] min-h-[46px]"
                />
              </div>

              {/* Relationship chips (single select) */}
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-[#5F5F5F]">
                  Relationship
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {RELATIONSHIP_OPTIONS.map((rel) => (
                    <button
                      key={rel}
                      type="button"
                      onClick={() => setVipRelationship(rel)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer min-h-[36px] ${
                        vipRelationship === rel
                          ? "bg-[#1A1A1A] text-white"
                          : "bg-[#FAF8F5] text-[#1A1A1A] border border-[#E8E8E8] hover:border-[#1A1A1A]/40"
                      }`}
                    >
                      {rel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Must Capture Checkbox Row */}
              <label className="flex items-center justify-between gap-2 px-3.5 py-3 bg-[#FAF8F5] border border-[#E8E8E8] rounded-xl cursor-pointer min-h-[46px]">
                <span className="flex items-center gap-2 text-xs sm:text-sm font-medium text-[#1A1A1A]">
                  <Star className="w-4 h-4 text-[#B08D57] shrink-0" />
                  <span>Must capture, no matter what</span>
                </span>
                <input
                  type="checkbox"
                  checked={vipMustCapture}
                  onChange={(e) => setVipMustCapture(e.target.checked)}
                  className="w-4 h-4 accent-[#1A1A1A] cursor-pointer"
                />
              </label>

              {/* Optional Reference Photo Upload */}
              <div className="space-y-2">
                <span className="block text-xs sm:text-sm text-[#5F5F5F]">
                  Optional reference photo (helps us recognise them in the crowd)
                </span>

                {vipPhotoError && (
                  <div
                    role="alert"
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900"
                  >
                    <span>{vipPhotoError}</span>
                    <button
                      type="button"
                      onClick={() => setVipPhotoError(null)}
                      aria-label="Dismiss photo message"
                      className="p-0.5 text-amber-800 hover:text-amber-950 shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <input
                  ref={vipFileInputRef}
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={handleVipPhotoSelect}
                  className="hidden"
                  id={`vip-photo-input-${side}`}
                />

                {vipPhotoUrl ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-[#E8E8E8] bg-[#FAF8F5]">
                    {(() => {
                      const vipPreview = getPhotoPreviewSrc(vipPhotoUrl);
                      const canShowImg =
                        Boolean(vipPreview) &&
                        (vipPreview!.startsWith("blob:") ||
                          vipPreview!.startsWith("http") ||
                          vipPreview!.startsWith("data:image/"));
                      return canShowImg ? (
                        <img
                          src={vipPreview}
                          alt={vipName.trim() || "VIP preview"}
                          className="w-16 h-16 rounded-xl object-cover border border-[#E8E8E8] shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-white border border-[#E8E8E8] flex items-center justify-center text-[#B08D57] shrink-0">
                          <CloudCheck className="w-5 h-5" />
                        </div>
                      );
                    })()}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="text-xs font-medium text-[#1A1A1A] truncate">
                        {vipUploadEntry?.status === "uploading"
                          ? `Uploading photo (${vipUploadEntry.progress}%)`
                          : vipUploadEntry?.status === "error"
                          ? vipUploadEntry.error || "Upload paused"
                          : "Reference photo ready"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {vipUploadEntry?.status === "error" && (
                          <button
                            type="button"
                            onClick={() => {
                              void retryBackgroundPhotoUpload(vipPhotoUrl).catch(() => {});
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[#1A1A1A] text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => vipFileInputRef.current?.click()}
                          className="px-2.5 py-1.5 rounded-lg border border-[#E8E8E8] bg-white hover:border-[#1A1A1A]/40 text-xs font-medium text-[#1A1A1A] cursor-pointer"
                        >
                          Replace photo
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            removeBackgroundPhotoEntry(vipPhotoUrl);
                            setVipPhotoUrl(undefined);
                            if (vipFileInputRef.current) vipFileInputRef.current.value = "";
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-[#E8E8E8] bg-white hover:border-red-300 text-xs font-medium text-[#5F5F5F] hover:text-red-700 cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setVipDragOver(true);
                    }}
                    onDragLeave={() => setVipDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setVipDragOver(false);
                      if (e.dataTransfer.files) {
                        void processVipPhotoFile(e.dataTransfer.files);
                      }
                    }}
                    className={`border-2 border-dashed rounded-2xl p-3.5 text-center transition-colors ${
                      vipDragOver
                        ? "border-[#1A1A1A] bg-[#FAF8F5]"
                        : "border-[#E0DBD2] hover:border-[#B08D57] bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      disabled={vipPhotoProcessing}
                      onClick={() => vipFileInputRef.current?.click()}
                      className="w-full min-h-[48px] flex items-center justify-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE1] text-[#1A1A1A] text-sm font-medium transition-colors cursor-pointer"
                    >
                      {vipPhotoProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-[#B08D57]" />
                          <span>Preparing photo...</span>
                        </>
                      ) : (
                        <>
                          <ImagePlus className="w-4 h-4 text-[#B08D57] shrink-0" />
                          <span>Add a photo of this person</span>
                        </>
                      )}
                    </button>
                    <span className="block text-[11px] text-[#7A756D] mt-1.5">
                      Gallery, camera, drag-and-drop or paste · up to 15 MB (JPEG, PNG, WebP, HEIC)
                    </span>
                  </div>
                )}
              </div>

              {/* Cancel & Save Person Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleCancelVip}
                  className="min-h-[46px] py-2.5 px-4 rounded-xl border border-[#E8E8E8] bg-white hover:bg-[#FAF8F5] text-sm font-medium text-[#4A453E] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!vipName.trim() || vipPhotoProcessing}
                  onClick={handleSaveVip}
                  className="min-h-[46px] py-2.5 px-4 rounded-xl bg-[#1A1A1A] hover:bg-[#333333] disabled:bg-[#9E9E9E] disabled:cursor-not-allowed text-white text-sm font-medium transition-colors cursor-pointer"
                >
                  Save Person
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddFormOpen(true)}
              className="w-full min-h-[48px] px-4 py-3 rounded-2xl border border-dashed border-[#D5CEC2] bg-white hover:border-[#B08D57] text-sm font-medium text-[#1A1A1A] flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#B08D57]" />
              <span>Add Important Person</span>
            </button>
          )}

          {/* Added People List */}
          {members.length > 0 && (
            <div className="space-y-2.5 pt-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5F5F5F] tabular-nums">
                {side === "bride" ? "Bride's Side" : "Groom's Side"} ({members.length})
              </div>
              <div className="space-y-2">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 p-3 bg-white border border-[#E8E8E8] rounded-2xl"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <VipPhotoAvatar photoUrl={m.photoUrl} name={m.name} />

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-[#1A1A1A] truncate">
                            {m.name}
                          </span>
                          {m.mustCapture && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FAF7F2] border border-[#E8DFD3] text-[10px] font-semibold uppercase tracking-wider text-[#8C7043] shrink-0">
                              <Star className="w-2.5 h-2.5 fill-[#B08D57] text-[#B08D57]" />
                              <span>Must Capture</span>
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#5F5F5F]">
                          {m.relationship}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => handleTriggerReplaceMemberPhoto(m.id)}
                            className="inline-flex items-center gap-1 text-[#8C7043] hover:text-[#1A1A1A] font-medium cursor-pointer"
                          >
                            <Camera className="w-3 h-3" />
                            <span>{m.photoUrl ? "Change photo" : "Add photo"}</span>
                          </button>
                          {m.photoUrl && (
                            <>
                              <span aria-hidden="true" className="text-[#CCCCCC]">
                                ·
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (m.photoUrl) {
                                    removeBackgroundPhotoEntry(m.photoUrl);
                                  }
                                  onUpdateMember(m.id, { photoUrl: undefined });
                                }}
                                className="text-[#7A756D] hover:text-red-700 cursor-pointer"
                              >
                                Remove photo
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (m.photoUrl) {
                          removeBackgroundPhotoEntry(m.photoUrl);
                        }
                        onRemoveMember(m.id);
                      }}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[#7A756D] hover:text-[#1A1A1A] rounded-xl hover:bg-[#FAF8F5] cursor-pointer shrink-0"
                      aria-label={`Remove ${m.name}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: UPLOAD TREE */}
      {activeTab === "tree" && (
        <div role="tabpanel" className="space-y-4">
          {treeError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-xs sm:text-sm text-amber-900"
            >
              <span>{treeError}</span>
              <button
                type="button"
                onClick={() => setTreeError(null)}
                aria-label="Dismiss photo message"
                className="p-1 text-amber-800 hover:text-amber-950 shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {photos.length < MAX_PHOTOS_PER_SIDE && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setTreeDragOver(true);
              }}
              onDragLeave={() => setTreeDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setTreeDragOver(false);
                if (e.dataTransfer.files) {
                  void processTreeFiles(e.dataTransfer.files);
                }
              }}
              className={`border-2 border-dashed rounded-2xl p-4 text-center transition-colors ${
                treeDragOver
                  ? "border-[#1A1A1A] bg-white"
                  : "border-[#DED8CE] hover:border-[#B08D57] bg-white"
              }`}
            >
              <input
                ref={treeFileInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                onChange={handleTreeFileSelect}
                className="hidden"
                id={`q10-tree-upload-${side}`}
              />
              <button
                type="button"
                disabled={treeProcessing}
                onClick={() => treeFileInputRef.current?.click()}
                className="w-full min-h-[52px] flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE1] text-[#1A1A1A] text-sm sm:text-base font-medium transition-colors cursor-pointer"
              >
                {treeProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#B08D57]" />
                    <span>Preparing photos...</span>
                  </>
                ) : (
                  <>
                    <ImagePlus className="w-4 h-4 text-[#B08D57] shrink-0" />
                    <span>
                      {photos.length > 0
                        ? `Add more ${title.toLowerCase()} tree photos`
                        : "Upload family tree or group photos"}
                    </span>
                  </>
                )}
              </button>
              <span className="block text-[11px] text-[#7A756D] mt-1.5">
                Select multiple photos · up to 15 MB each (JPEG, PNG, WebP, HEIC · max {MAX_PHOTOS_PER_SIDE})
              </span>
            </div>
          )}

          {photos.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {photos.map((photo, idx) => (
                <TreePhotoCard
                  key={photo.id}
                  photo={photo}
                  index={idx}
                  title={title}
                  onToggleMustCapture={handleTogglePhotoMustCapture}
                  onRemove={handleRemovePhoto}
                  onCaptionChange={handleCaptionChange}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: WRITE IT OUT */}
      {activeTab === "notes" && (
        <div role="tabpanel" className="bg-white border border-[#E8E8E8] rounded-2xl p-4 space-y-2">
          <span className="block text-xs font-medium text-[#5F5F5F]">
            Describe {title.toLowerCase()} family &amp; VIPs in words (names, seating, mobility)
          </span>
          <VoiceTextarea
            value={notes}
            onChange={onNotesChange}
            placeholder="e.g. Maternal grandmother in front row, cousins flying in from London..."
            rows={5}
            isVoiceEnabled={true}
          />
        </div>
      )}
    </section>
  );
};
