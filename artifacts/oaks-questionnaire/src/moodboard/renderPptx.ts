import pptxgen from "pptxgenjs";
import { containImage, safeExternalLink } from "./geometry.ts";
import type { ExportAssets } from "./renderPdf.ts";
import type { MoodboardScene } from "./types.ts";

/** One editable object per scene element, including text, connectors and original photos. */
export function renderMoodboardPptx(scenes: MoodboardScene[], assets: ExportAssets, title: string): pptxgen {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "OAKS", width: 13.333333, height: 7.5 });
  pptx.layout = "OAKS";
  pptx.author = "OAKS Wedding";
  pptx.subject = "Wedding Visual Moodboard";
  pptx.title = title;
  const color = (hex: string) => hex.replace("#", "");
  const inch = (px: number) => px / 108;
  for (const scene of scenes) {
    const slide = pptx.addSlide();
    slide.background = { color: color(scene.background) };
    for (const element of scene.elements) {
      if (element.type === "text") {
        const href = element.href && safeExternalLink(element.href);
        slide.addText(element.text, {
          x: inch(element.x), y: inch(element.y), w: inch(element.w), h: inch(Math.max(element.h, element.size * 1.25)),
          fontFace: element.font === "serif" ? "Georgia" : "Arial",
          fontSize: element.size * 2 / 3, color: color(element.color), bold: element.bold || false,
          align: element.align || "left", valign: "top", breakLine: false, margin: 0,
          paraSpaceAfter: 0, ...(href ? { hyperlink: { url: href } } : {}),
        });
      } else if (element.type === "line") {
        slide.addShape(pptx.ShapeType.line, {
          x: inch(Math.min(element.x, element.x2)), y: inch(Math.min(element.y, element.y2)),
          w: inch(Math.abs(element.x2 - element.x)), h: inch(Math.abs(element.y2 - element.y)),
          flipV: (element.x2 - element.x) * (element.y2 - element.y) < 0,
          line: { color: color(element.color), width: element.width * 2 / 3, beginArrowType: "none", endArrowType: "none" },
        });
      } else if (element.type === "rect") {
        slide.addShape(element.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
          x: inch(element.x), y: inch(element.y), w: inch(element.w), h: inch(element.h),
          rectRadius: inch(element.radius || 0), fill: { color: color(element.fill) },
          line: { color: color(element.stroke || element.fill), width: element.stroke ? .66 : 0 },
        });
      } else {
        const image = assets.get(element.src);
        if (!image) throw new Error(`Image unavailable: ${element.label}. No incomplete file was downloaded.`);
        const box = containImage(element, image.width, image.height);
        slide.addImage({ data: image.data, x: inch(box.x), y: inch(box.y), w: inch(box.w), h: inch(box.h), altText: element.label });
      }
    }
  }
  return pptx;
}
