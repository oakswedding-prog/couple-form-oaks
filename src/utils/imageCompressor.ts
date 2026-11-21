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

const SUPPORTED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
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

export interface PreparedPhotoResult {
  blob: Blob;
  previewUrl: string;
  contentType: "image/jpeg";
  extension: "jpg";
}

async function convertHeicBlobToJpeg(file: Blob): Promise<Blob> {
  const heic2anyModule = await import("heic2any");
  const heic2any = heic2anyModule.default || (heic2anyModule as any);
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });
  return Array.isArray(converted) ? converted[0] : converted;
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

/**
 * Validates file size (<= 15 MB), converts iPhone HEIC/HEIF to JPEG if needed,
 * and resizes longest side to ~2400px JPEG before Firebase Storage upload.
 */
export async function preparePhotoForUpload(
  file: File
): Promise<PreparedPhotoResult> {
  const validation = validatePhotoFileBeforeCompression(file);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  let workingBlob: Blob = file;
  let drawable: Awaited<ReturnType<typeof loadDrawableImage>> | null = null;

  try {
    drawable = await loadDrawableImage(workingBlob);
  } catch (decodeErr) {
    if (isHeicPhotoFile(file)) {
      workingBlob = await convertHeicBlobToJpeg(file);
      drawable = await loadDrawableImage(workingBlob);
    } else {
      throw decodeErr;
    }
  }

  try {
    let width = drawable.width;
    let height = drawable.height;

    if (width > MAX_PHOTO_LONGEST_SIDE || height > MAX_PHOTO_LONGEST_SIDE) {
      if (width > height) {
        height = Math.max(1, Math.round((height * MAX_PHOTO_LONGEST_SIDE) / width));
        width = MAX_PHOTO_LONGEST_SIDE;
      } else {
        width = Math.max(1, Math.round((width * MAX_PHOTO_LONGEST_SIDE) / height));
        height = MAX_PHOTO_LONGEST_SIDE;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      const previewUrl = URL.createObjectURL(workingBlob);
      return {
        blob: workingBlob,
        previewUrl,
        contentType: "image/jpeg",
        extension: "jpg",
      };
    }

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    drawable.draw(ctx, width, height);

    const compressedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Could not encode compressed image"));
        },
        "image/jpeg",
        PHOTO_JPEG_QUALITY
      );
    });

    const previewUrl = URL.createObjectURL(compressedBlob);
    return {
      blob: compressedBlob,
      previewUrl,
      contentType: "image/jpeg",
      extension: "jpg",
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
