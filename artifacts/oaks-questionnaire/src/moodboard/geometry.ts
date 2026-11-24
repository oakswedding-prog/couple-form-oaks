import type { SceneBox } from "./types.ts";

/** Shared by both exports; never stretch or crop the reference image. */
export function containImage(box: SceneBox, width: number, height: number): SceneBox {
  const scale = Math.min(box.w / width, box.h / height);
  const w = width * scale;
  const h = height * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

export function safeExternalLink(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch { return undefined; }
}
