import { resolveMediaUrl } from "../lib/submissions.ts";
import { auth } from "../lib/firebase.ts";
import { buildMoodboardScene } from "./layout.ts";
import type { MoodboardDocument } from "./types.ts";
import type { ExportAssets, ExportFonts, ExportImage } from "./renderPdf.ts";

function base64(bytes: ArrayBuffer): string {
  let result = "";
  for (const byte of new Uint8Array(bytes)) result += String.fromCharCode(byte);
  return btoa(result);
}

async function fetchFont(name: string): Promise<string> {
  const response = await fetch(`${import.meta.env.BASE_URL}fonts/${name}.ttf`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("The PDF font could not be loaded. Please check your connection and retry.");
  return base64(await response.arrayBuffer());
}

function isFirebaseStorageSource(src: string): boolean {
  if (src.startsWith("gs://") || src.startsWith("submissions/")) return true;
  try {
    const host = new URL(src).hostname;
    return host === "firebasestorage.googleapis.com" || host === "storage.googleapis.com";
  } catch {
    return false;
  }
}

async function loadImageBlob(src: string, idToken?: string): Promise<Blob> {
  if (isFirebaseStorageSource(src)) {
    if (!idToken) throw new Error("Your studio sign-in expired. Sign in again and retry the export.");
    const response = await fetch(`${import.meta.env.BASE_URL}api/moodboard-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ source: src }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { error?: unknown } | null;
      throw new Error(
        typeof error?.error === "string"
          ? error.error
          : "The original image could not be downloaded."
      );
    }
    return response.blob();
  }

  const url = await resolveMediaUrl(src);
  if (!url) throw new Error("Image is unavailable");
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), mode: "cors" });
  if (!response.ok) throw new Error("Image is unavailable");
  return response.blob();
}

async function loadOriginalImage(src: string, idToken?: string): Promise<ExportImage> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const blob = await Promise.race([
    loadImageBlob(src, idToken),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Image resolution timed out")), 65000);
    }),
  ]).finally(() => clearTimeout(timer));
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    // Keep original PNG/JPEG bytes and original dimensions: no thumbnail, resizing or lossy recompression.
    if (blob.type === "image/jpeg" || blob.type === "image/png") {
      return { data: `data:${blob.type};base64,${base64(await blob.arrayBuffer())}`, width: image.naturalWidth, height: image.naturalHeight, format: blob.type === "image/png" ? "PNG" : "JPEG" };
    }
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot prepare this image.");
    ctx.drawImage(image, 0, 0);
    return { data: canvas.toDataURL("image/png"), width: image.naturalWidth, height: image.naturalHeight, format: "PNG" };
  } finally { URL.revokeObjectURL(objectUrl); }
}

export async function exportMoodboard(doc: MoodboardDocument, format: "pdf" | "pptx", onProgress?: (message: string) => void): Promise<void> {
  const scenes = doc.pages.map((page, i) => buildMoodboardScene(page, i, doc.pages.length));
  const sources = [...new Set(scenes.flatMap(scene => scene.elements.flatMap(e => e.type === "image" ? [e.src] : [])))];
  const containsStorageImages = sources.some(isFirebaseStorageSource);
  const idToken = containsStorageImages
    ? await auth.currentUser?.getIdToken()
    : undefined;
  if (containsStorageImages && !idToken) {
    throw new Error("Your studio sign-in expired. Sign in again and retry the export.");
  }
  const assets: ExportAssets = new Map();
  let done = 0;
  const failed: string[] = [];
  let firstFailure: string | undefined;
  // Bounded parallelism avoids a burst of hundreds of Firebase downloads.
  const queue = [...sources];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    let src: string | undefined;
    while ((src = queue.shift())) {
      try {
        assets.set(src, await loadOriginalImage(src, idToken));
      } catch (error) {
        failed.push(src);
        firstFailure ||= error instanceof Error ? error.message : "Unknown image error";
      }
      done++;
      onProgress?.(`Preparing original images · ${done} of ${sources.length}`);
    }
  }));
  if (failed.length) {
    const cause = firstFailure ? ` ${firstFailure}` : "";
    throw new Error(`${failed.length} of ${sources.length} images could not be loaded. No incomplete file was downloaded.${cause}`);
  }
  onProgress?.(`Creating ${doc.pages.length}-page ${format.toUpperCase()}…`);
  if (format === "pdf") {
    const [serif, sans, { renderMoodboardPdf }] = await Promise.all([
      fetchFont("OAKS-Serif"), fetchFont("OAKS-Sans"), import("./renderPdf.ts"),
    ]);
    const fonts: ExportFonts = { serif, sans };
    const pdf = renderMoodboardPdf(scenes, assets, fonts);
    pdf.setProperties({ title: doc.title, subject: "Wedding Visual Moodboard", author: "OAKS Wedding" });
    pdf.save(`${doc.filename}.pdf`);
  } else {
    const { renderMoodboardPptx } = await import("./renderPptx.ts");
    const pptx = renderMoodboardPptx(scenes, assets, doc.title);
    await pptx.writeFile({ fileName: `${doc.filename}.pptx`, compression: true });
  }
}
