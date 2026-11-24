import { resolveMediaUrl } from "../lib/submissions.ts";
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

async function loadOriginalImage(src: string): Promise<ExportImage> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let url: string;
  try {
    url = await Promise.race([
      resolveMediaUrl(src),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Image resolution timed out")), 20000); }),
    ]);
  } finally { clearTimeout(timer); }
  if (!url) throw new Error("Image is unavailable");
  const response = await fetch(url, { signal: AbortSignal.timeout(25000), mode: "cors" });
  if (!response.ok) throw new Error("Image is unavailable");
  const blob = await response.blob();
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
  const assets: ExportAssets = new Map();
  let done = 0;
  const failed: string[] = [];
  // Bounded parallelism avoids a burst of hundreds of Firebase downloads.
  const queue = [...sources];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    let src: string | undefined;
    while ((src = queue.shift())) {
      try { assets.set(src, await loadOriginalImage(src)); } catch { failed.push(src); }
      done++;
      onProgress?.(`Preparing original images · ${done} of ${sources.length}`);
    }
  }));
  if (failed.length) throw new Error(`${failed.length} of ${sources.length} images could not be loaded. No incomplete file was downloaded. Check the image placeholders and your connection, then retry.`);
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
