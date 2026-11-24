/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useId } from "react";
import { ImagePlus, X, Loader2, RotateCcw, CloudCheck } from "lucide-react";
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

interface ImageUploaderProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  label?: string;
  buttonLabel?: string;
  columns?: 2 | 3;
  uploadCategory?: string;
}

interface ThumbnailTileProps {
  imgValue: string;
  index: number;
  onRemove: (index: number) => void;
}

const ThumbnailTile: React.FC<ThumbnailTileProps> = ({
  imgValue,
  index,
  onRemove,
}) => {
  const uploadEntry = usePhotoUploadStatus(imgValue);
  const previewSrc = getPhotoPreviewSrc(imgValue);
  const isRenderableSrc =
    Boolean(previewSrc) &&
    (previewSrc!.startsWith("blob:") ||
      previewSrc!.startsWith("http://") ||
      previewSrc!.startsWith("https://") ||
      previewSrc!.startsWith("data:image/"));

  return (
    <div className="group relative aspect-4/3 rounded-xl overflow-hidden border border-[#E8E8E8] bg-[#FAFAFA] shadow-2xs">
      {isRenderableSrc ? (
        <img
          src={previewSrc}
          alt={`Uploaded reference ${index + 1}`}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[#FAF8F5] text-[#6B655D] px-2 text-center">
          <CloudCheck className="w-5 h-5 text-[#B08D57]" />
          <span className="text-[11px] font-medium">Saved photo {index + 1}</span>
        </div>
      )}

      {/* Upload progress overlay */}
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

      {/* Upload error & retry overlay */}
      {uploadEntry?.status === "error" && (
        <div className="absolute inset-0 bg-[#1A1A1A]/70 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
          <span className="text-[11px] font-medium text-white leading-tight">
            {uploadEntry.error || "Upload failed"}
          </span>
          <button
            type="button"
            onClick={() => {
              void retryBackgroundPhotoUpload(imgValue).catch(() => {});
            }}
            className="min-h-[34px] px-3 py-1 rounded-lg bg-white text-[#1A1A1A] text-xs font-semibold inline-flex items-center gap-1 hover:bg-[#FAF8F5] cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => onRemove(index)}
        className="absolute top-1.5 right-1.5 min-w-[36px] min-h-[36px] w-9 h-9 rounded-full bg-[#1A1A1A]/85 text-white hover:bg-[#1A1A1A] flex items-center justify-center transition-all shadow-xs cursor-pointer"
        aria-label={`Remove photo ${index + 1}`}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  images,
  onChange,
  maxImages = 6,
  label,
  buttonLabel = "Add images",
  columns = 3,
  uploadCategory = "photo",
}) => {
  const inputId = useId();
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const latestImagesRef = useRef(images);
  latestImagesRef.current = images;

  const processFiles = async (fileList: FileList | File[]) => {
    const candidateFiles = Array.from(fileList).filter((f) =>
      isSupportedPhotoFile(f) || f.size > 0
    );
    if (candidateFiles.length === 0) return;

    setErrorMessage(null);
    const remainingSlots = Math.max(0, maxImages - latestImagesRef.current.length);
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
      if (firstError) setErrorMessage(firstError);
      return;
    }

    setIsProcessing(true);
    try {
      const results = await Promise.allSettled(
        filesToProcess.map((file) =>
          startBackgroundPhotoUpload(file, uploadCategory)
        )
      );

      const newStoragePaths: string[] = [];
      for (const res of results) {
        if (res.status === "fulfilled") {
          newStoragePaths.push(res.value);
        } else if (!firstError) {
          const msg =
            res.reason instanceof Error ? res.reason.message : TOO_LARGE_PHOTO_ERROR;
          firstError = msg;
        }
      }

      if (newStoragePaths.length > 0) {
        onChange([...latestImagesRef.current, ...newStoragePaths]);
      }
      if (firstError) {
        setErrorMessage(firstError);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void processFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemove = (index: number) => {
    const target = images[index];
    if (target) {
      removeBackgroundPhotoEntry(target);
    }
    onChange(images.filter((_, i) => i !== index));
  };

  // Support paste events
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        const hasImage = Array.from(e.clipboardData.files).some((f) =>
          isSupportedPhotoFile(f)
        );
        if (hasImage) {
          void processFiles(e.clipboardData.files);
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [images.length, maxImages, uploadCategory]);

  return (
    <div className="w-full space-y-3">
      {label && (
        <span className="block text-sm font-medium text-[#5F5F5F]">{label}</span>
      )}

      {/* Friendly non-blocking error banner (e.g. >15 MB) */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-xs sm:text-sm text-amber-900"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            aria-label="Dismiss photo message"
            className="p-1 text-amber-800 hover:text-amber-950 shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Thumbnails grid */}
      {images.length > 0 && (
        <div
          className={`grid gap-3 ${
            columns === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
          }`}
        >
          {images.map((imgVal, idx) => (
            <ThumbnailTile
              key={`${imgVal}_${idx}`}
              imgValue={imgVal}
              index={idx}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {/* Add Button & Drop Target */}
      {images.length < maxImages && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files) {
              void processFiles(e.dataTransfer.files);
            }
          }}
          className={`border-2 border-dashed rounded-2xl p-4 sm:p-5 text-center transition-colors ${
            dragOver
              ? "border-[#1A1A1A] bg-[#FAFAFA]"
              : "border-[#E8E8E8] hover:border-[#1A1A1A]/30 bg-white"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            id={inputId}
          />

          <button
            type="button"
            disabled={isProcessing}
            onClick={() => fileInputRef.current?.click()}
            className="w-full min-h-[52px] flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-[#FAFAFA] hover:bg-[#E8E8E8]/70 text-[#1A1A1A] text-sm sm:text-base font-medium transition-colors cursor-pointer"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-[#B08D57]" />
                <span>Preparing photo...</span>
              </>
            ) : (
              <>
                <ImagePlus className="w-5 h-5 text-[#B08D57] shrink-0" />
                <span>{buttonLabel}</span>
              </>
            )}
          </button>
          <span className="block text-xs text-[#5F5F5F] mt-2">
            Gallery, camera, drag-and-drop or paste · up to 15 MB (JPEG, PNG, WebP, HEIC)
          </span>
        </div>
      )}
    </div>
  );
};
