/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Image as ImageIcon,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { getCachedResolvedMediaUrl, resolveMediaUrl } from "../lib/submissions.ts";

function isDirectRenderableUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("blob:")
  );
}

export interface LightboxImage {
  url: string;
  title: string;
  subtitle?: string;
}

interface LightboxModalProps {
  images: LightboxImage[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/**
 * Full-screen lightbox viewer with Next/Previous navigation, keyboard support,
 * image counter, and responsive touch/click controls.
 */
export const LightboxModal: React.FC<LightboxModalProps> = ({
  images,
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
}) => {
  const [resolvedMap, setResolvedMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && images.length > 1) {
        onNavigate((currentIndex - 1 + images.length) % images.length);
      } else if (e.key === "ArrowRight" && images.length > 1) {
        onNavigate((currentIndex + 1) % images.length);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentIndex, images.length, onClose, onNavigate]);

  // Resolve any unhydrated Firebase Storage paths visible in the lightbox
  useEffect(() => {
    if (!isOpen || images.length === 0) return;
    let cancelled = false;

    const pending = images.filter(
      (img) =>
        img.url &&
        !isDirectRenderableUrl(img.url) &&
        !getCachedResolvedMediaUrl(img.url) &&
        !resolvedMap[img.url]
    );

    if (pending.length === 0) return;

    Promise.all(
      pending.map(async (img) => {
        const url = await resolveMediaUrl(img.url);
        return [img.url, url] as const;
      })
    ).then((pairs) => {
      if (cancelled) return;
      setResolvedMap((prev) => {
        const next = { ...prev };
        for (const [k, v] of pairs) {
          if (v) next[k] = v;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, images]);

  if (!isOpen || images.length === 0) return null;

  const current = images[currentIndex] || images[0];
  const getDisplayUrl = (rawUrl: string) =>
    getCachedResolvedMediaUrl(rawUrl) || resolvedMap[rawUrl] || (isDirectRenderableUrl(rawUrl) ? rawUrl : "");
  const currentUrl = getDisplayUrl(current.url);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xs flex flex-col justify-between p-4 sm:p-6 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      {/* Top Bar: Title & Close */}
      <div
        className="flex items-center justify-between text-white z-10 max-w-6xl w-full mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs bg-white/10 px-2.5 py-1 rounded-full border border-white/20 text-[#D4AF37] font-semibold">
            {currentIndex + 1} / {images.length}
          </span>
          <div>
            <h4 className="text-sm sm:text-base font-semibold text-white truncate max-w-xs sm:max-w-md">
              {current.title}
            </h4>
            {current.subtitle && (
              <p className="text-xs text-white/70">{current.subtitle}</p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors cursor-pointer"
          title="Close lightbox (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Image Container */}
      <div
        className="relative flex-1 flex items-center justify-center my-auto p-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Previous Button */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={() =>
              onNavigate((currentIndex - 1 + images.length) % images.length)
            }
            className="absolute left-2 sm:left-4 p-2.5 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 transition-all cursor-pointer z-10"
            title="Previous image (Left arrow)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {currentUrl ? (
          <img
            src={currentUrl}
            alt={current.title}
            decoding="async"
            className="max-h-[82vh] max-w-[90vw] object-contain rounded-xl shadow-2xl transition-all"
          />
        ) : (
          <div className="w-64 h-64 rounded-xl bg-white/10 animate-pulse flex items-center justify-center text-white/70 text-xs">
            Loading photo...
          </div>
        )}

        {/* Next Button */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={() => onNavigate((currentIndex + 1) % images.length)}
            className="absolute right-2 sm:right-4 p-2.5 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 transition-all cursor-pointer z-10"
            title="Next image (Right arrow)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip (if multiple images) */}
      {images.length > 1 && (
        <div
          className="flex items-center justify-center gap-2 overflow-x-auto py-2 z-10 max-w-2xl mx-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, idx) => {
            const thumbUrl = getDisplayUrl(img.url);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onNavigate(idx)}
                className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                  idx === currentIndex
                    ? "border-[#D4AF37] scale-105 opacity-100 ring-2 ring-[#D4AF37]/50"
                    : "border-white/20 opacity-60 hover:opacity-90"
                }`}
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={img.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-white/10 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface SafeImageThumbnailProps {
  src: string;
  alt: string;
  onClick: () => void;
  className?: string;
}

/**
 * Image thumbnail with Storage path resolution, loading shimmer, lazy decoding,
 * and graceful fallback if image fails to load.
 */
export const SafeImageThumbnail: React.FC<SafeImageThumbnailProps> = ({
  src,
  alt,
  onClick,
  className = "w-28 h-28",
}) => {
  const initialResolved =
    getCachedResolvedMediaUrl(src) ?? (isDirectRenderableUrl(src) ? src : "");
  const [resolvedSrc, setResolvedSrc] = useState<string>(initialResolved);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setHasError(false);
    setIsLoading(true);

    const immediate =
      getCachedResolvedMediaUrl(src) ?? (isDirectRenderableUrl(src) ? src : "");
    if (immediate) {
      setResolvedSrc(immediate);
      return;
    }

    setResolvedSrc("");
    if (!src) {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    resolveMediaUrl(src).then((url) => {
      if (cancelled) return;
      if (url) {
        setResolvedSrc(url);
      } else {
        setHasError(true);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (hasError) {
    return (
      <div
        className={`${className} rounded-xl border border-[#E8DFD3] bg-[#FAF8F5] flex flex-col items-center justify-center p-2 text-center text-[#7A756D]`}
      >
        <AlertCircle className="w-4 h-4 text-amber-600 mb-1" />
        <span className="text-[10px] leading-tight">Image unavailable</span>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`group relative ${className} rounded-xl overflow-hidden border border-[#E8DFD3] bg-[#FAF7F2] cursor-pointer shadow-2xs hover:shadow-md transition-all`}
    >
      {(!resolvedSrc || isLoading) && (
        <div className="absolute inset-0 bg-[#F2ECE1] animate-pulse" />
      )}
      {resolvedSrc && (
        <img
          src={resolvedSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          className={`w-full h-full object-cover transition-transform duration-200 group-hover:scale-105 ${
            isLoading ? "opacity-0" : "opacity-100"
          }`}
        />
      )}
      {/* Zoom overlay on hover */}
      <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
        <ZoomIn className="w-5 h-5 drop-shadow-md" />
      </div>
    </div>
  );
};

interface ThumbnailGalleryProps {
  images: string[];
  titlePrefix: string;
  onOpenImage: (index: number) => void;
  emptyLabel?: string;
  categoryLabel?: string;
}

/**
 * Tidy gallery of thumbnails with count chip and empty state.
 */
export const ThumbnailGallery: React.FC<ThumbnailGalleryProps> = ({
  images,
  titlePrefix,
  onOpenImage,
  emptyLabel = "No images uploaded",
  categoryLabel,
}) => {
  if (!images || images.length === 0) {
    return (
      <div className="p-3.5 rounded-xl border border-[#E8DFD3] bg-[#FAF8F5] text-xs text-[#7A756D] italic">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#4A453E] flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-[#8C7043]" />
          <span>{categoryLabel || titlePrefix}</span>
        </span>
        <span className="text-[11px] font-semibold text-[#8C7043] bg-[#FAF7F2] px-2 py-0.5 rounded-full border border-[#E8DFD3]">
          {images.length} {images.length === 1 ? "image" : "images"}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {images.map((imgUrl, idx) => (
          <SafeImageThumbnail
            key={idx}
            src={imgUrl}
            alt={`${titlePrefix} ${idx + 1}`}
            onClick={() => onOpenImage(idx)}
            className="w-full aspect-square"
          />
        ))}
      </div>
    </div>
  );
};

interface ReferenceLinksListProps {
  links: string[];
}

/**
 * Clickable link chips opening in a new tab.
 */
export const ReferenceLinksList: React.FC<ReferenceLinksListProps> = ({ links }) => {
  if (!links || links.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold text-[#4A453E] block">
        Reference Links ({links.length}):
      </span>
      <div className="flex flex-wrap gap-2">
        {links.map((link, idx) => {
          let label = link;
          try {
            const urlObj = new URL(link);
            label = `${urlObj.hostname}${urlObj.pathname.length > 1 ? urlObj.pathname : ""}`;
          } catch {
            // keep raw link
          }
          return (
            <a
              key={idx}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-[#FAF7F2] border border-[#E8DFD3] text-[#8C7043] hover:text-[#1A1A1A] hover:bg-[#F2ECE1] hover:border-[#B08D57] transition-all cursor-pointer font-medium max-w-xs sm:max-w-md truncate"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0 text-[#8C7043]" />
              <span className="truncate">{label}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
};
