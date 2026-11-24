/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const MAX_PHOTO_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB per photo before compression
export const MAX_PHOTO_LONGEST_SIDE = 2400; // Resize longest side to ~2400px
export const PHOTO_JPEG_QUALITY = 0.84;

export const TOO_LARGE_PHOTO_ERROR =
  "This photo is too large. Please choose a smaller one";
export const UNSUPPORTED_PHOTO_FORMAT_ERROR =
  "Please select a JPEG, PNG, WebP, or iPhone HEIC photo.";
export const HEIC_CONVERSION_ERROR =
  "We couldn't convert this iPhone HEIC photo on your device. Please try again or choose a JPEG/PNG version.";

const SUPPORTED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
]);

const STORAGE_ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function getFileExtension(fileName: string | undefined): string {
  if (!fileName) return "";
  const idx = fileName.lastIndexOf(".");
  if (idx < 0) return "";
  return fileName.slice(idx + 1).trim().toLowerCase();
}

export function isHeicPhotoFile(file: Pick<File, "type" | "name">): boolean {
  const type = (file.type || "").toLowerCase();
  const ext = getFileExtension(file.name);
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    type === "image/heic-sequence" ||
    type === "image/heif-sequence" ||
    ext === "heic" ||
    ext === "heif"
  );
}

export function isSupportedPhotoFile(
  file: Pick<File, "type" | "name">
): boolean {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/")) {
    return true;
  }
  const ext = getFileExtension(file.name);
  return SUPPORTED_EXTENSIONS.has(ext);
}

export function validatePhotoFileBeforeCompression(
  file: Pick<File, "size" | "type" | "name">
): { ok: true } | { ok: false; message: string } {
  if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
    return { ok: false, message: TOO_LARGE_PHOTO_ERROR };
  }
  if (!isSupportedPhotoFile(file)) {
    return { ok: false, message: UNSUPPORTED_PHOTO_FORMAT_ERROR };
  }
  return { ok: true };
}

export type AllowedUploadMimeType = "image/jpeg" | "image/png" | "image/webp";
export type AllowedUploadExtension = "jpg" | "png" | "webp";

export interface PreparedPhotoResult {
  blob: Blob;
  previewUrl: string;
  contentType: AllowedUploadMimeType;
  extension: AllowedUploadExtension;
}

type Heic2AnyFn = (opts: {
  blob: Blob;
  toType: string;
  quality?: number;
}) => Promise<Blob | Blob[]>;

let cachedHeicConverter: Heic2AnyFn | null = null;
let heicPreloadPromise: Promise<Heic2AnyFn | null> | null = null;

/**
 * Preloads and caches the HEIC converter module at app startup so iPhone HEIC
 * conversion stays reliable even on weak mobile connections or after deploys.
 */
export function preloadHeicConverter(): Promise<Heic2AnyFn | null> {
  if (cachedHeicConverter) return Promise.resolve(cachedHeicConverter);
  if (heicPreloadPromise) return heicPreloadPromise;

  heicPreloadPromise = import("heic2any")
    .then((mod) => {
      const fn = (mod.default || mod) as Heic2AnyFn;
      if (typeof fn === "function") {
        cachedHeicConverter = fn;
        return fn;
      }
      return null;
    })
    .catch(() => {
      heicPreloadPromise = null;
      return null;
    });

  return heicPreloadPromise;
}

export function isHeicConverterCached(): boolean {
  return cachedHeicConverter !== null;
}

async function convertHeicBlobToJpeg(file: Blob): Promise<Blob> {
  const converter = cachedHeicConverter || (await preloadHeicConverter());
  if (!converter) {
    throw new Error(HEIC_CONVERSION_ERROR);
  }
  try {
    const converted = await converter({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });
    const out = Array.isArray(converted) ? converted[0] : converted;
    if (!out || out.size === 0) {
      throw new Error(HEIC_CONVERSION_ERROR);
    }
    return out;
  } catch {
    throw new Error(HEIC_CONVERSION_ERROR);
  }
}

async function loadDrawableImage(
  blob: Blob
): Promise<{
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => bitmap.close?.(),
      };
    } catch {
      // Fall back to HTMLImageElement
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const imageEl = new Image();
      imageEl.onload = () => resolve(imageEl);
      imageEl.onerror = () => reject(new Error("Could not decode image"));
      imageEl.src = objectUrl;
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

function getTrueAllowedMimeAndExt(
  blob: Blob
): { contentType: AllowedUploadMimeType; extension: AllowedUploadExtension } | null {
  const type = (blob.type || "").toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (type === "image/png") {
    return { contentType: "image/png", extension: "png" };
  }
  if (type === "image/webp") {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}

async function renderToJpegBlob(
  drawable: {
    width: number;
    height: number;
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  },
  maxSide: number
): Promise<Blob | null> {
  let width = drawable.width;
  let height = drawable.height;

  if (width > maxSide || height > maxSide) {
    if (width > height) {
      height = Math.max(1, Math.round((height * maxSide) / width));
      width = maxSide;
    } else {
      width = Math.max(1, Math.round((width * maxSide) / height));
      height = maxSide;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  drawable.draw(ctx, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (b) => resolve(b),
      "image/jpeg",
      PHOTO_JPEG_QUALITY
    );
  });

  // Release canvas memory promptly on iOS Safari / WebView
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

/**
 * Pure helper to determine whether a fallback passthrough blob is truly safe to upload
 * WITHOUT ever mislabeling an unconverted HEIC or unknown file as JPEG.
 */
export function resolveSafeFallbackBlob(
  blob: Blob,
  wasOriginallyHeic: boolean
): { blob: Blob; contentType: AllowedUploadMimeType; extension: AllowedUploadExtension } {
  const trueFormat = getTrueAllowedMimeAndExt(blob);
  if (!trueFormat || !STORAGE_ALLOWED_CONTENT_TYPES.has(trueFormat.contentType)) {
    throw new Error(
      wasOriginallyHeic
        ? HEIC_CONVERSION_ERROR
        : "Could not prepare this image on your device. Please try a JPEG, PNG, or WebP photo."
    );
  }
  if (blob.size > MAX_PHOTO_UPLOAD_BYTES) {
    throw new Error(TOO_LARGE_PHOTO_ERROR);
  }
  return {
    blob,
    contentType: trueFormat.contentType,
    extension: trueFormat.extension,
  };
}

/**
 * Validates file size (<= 15 MB), converts iPhone HEIC/HEIF to JPEG on device,
 * and resizes longest side to ~2400px JPEG before Firebase Storage upload.
 * Never mislabels an unconverted original file as JPEG.
 */
export async function preparePhotoForUpload(
  file: File
): Promise<PreparedPhotoResult> {
  const validation = validatePhotoFileBeforeCompression(file);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const isHeic = isHeicPhotoFile(file);
  let workingBlob: Blob = file;
  let drawable: Awaited<ReturnType<typeof loadDrawableImage>> | null = null;

  if (isHeic) {
    // Try native decode first (Safari can decode HEIC natively); if that fails, convert with cached heic2any
    try {
      drawable = await loadDrawableImage(workingBlob);
    } catch {
      workingBlob = await convertHeicBlobToJpeg(file);
      drawable = await loadDrawableImage(workingBlob);
    }
  } else {
    drawable = await loadDrawableImage(workingBlob);
  }

  try {
    // Try standard 2400px, then graceful step-downs (1600px, 1200px) for low-memory mobile WebViews
    const candidateMaxSides = [MAX_PHOTO_LONGEST_SIDE, 1600, 1200];
    let compressedBlob: Blob | null = null;
    for (const maxSide of candidateMaxSides) {
      compressedBlob = await renderToJpegBlob(drawable, maxSide);
      if (compressedBlob && compressedBlob.size > 0 && compressedBlob.size <= MAX_PHOTO_UPLOAD_BYTES) {
        break;
      }
    }

    if (compressedBlob && compressedBlob.size > 0 && compressedBlob.size <= MAX_PHOTO_UPLOAD_BYTES) {
      const previewUrl = URL.createObjectURL(compressedBlob);
      return {
        blob: compressedBlob,
        previewUrl,
        contentType: "image/jpeg",
        extension: "jpg",
      };
    }

    // Canvas failed on a severely memory-constrained device:
    // ONLY allow passthrough if workingBlob is ALREADY verified JPEG/PNG/WebP and <= 15 MB,
    // preserving its true MIME type and extension (NEVER falsely labeling as image/jpeg).
    const safeFallback = resolveSafeFallbackBlob(workingBlob, isHeic);
    const previewUrl = URL.createObjectURL(safeFallback.blob);
    return {
      blob: safeFallback.blob,
      previewUrl,
      contentType: safeFallback.contentType,
      extension: safeFallback.extension,
    };
  } finally {
    drawable?.cleanup();
  }
}

/**
 * Legacy-compatible helper returning a compressed JPEG data URL.
 */
export async function compressImage(file: File): Promise<string> {
  const prepared = await preparePhotoForUpload(file);
  try {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Could not read compressed image"));
      reader.readAsDataURL(prepared.blob);
    });
  } finally {
    URL.revokeObjectURL(prepared.previewUrl);
  }
}
