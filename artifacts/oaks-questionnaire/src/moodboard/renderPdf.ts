import { jsPDF } from "jspdf";
import { containImage, safeExternalLink } from "./geometry.ts";
import type { MoodboardScene } from "./types.ts";

export interface ExportImage { data: string; width: number; height: number; format: "JPEG" | "PNG" }
export type ExportAssets = Map<string, ExportImage>;
export interface ExportFonts { serif: string; sans: string }

/** All typography, lines and labels remain vector objects, not a screen capture. */
export function renderMoodboardPdf(scenes: MoodboardScene[], assets: ExportAssets, fonts: ExportFonts): jsPDF {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [1440, 810], putOnlyUsedFonts: true, compress: true });
  for (const font of ["serif", "sans"] as const) {
    pdf.addFileToVFS(`${font}.ttf`, fonts[font]);
    pdf.addFont(`${font}.ttf`, font, "normal");
  }
  scenes.forEach((scene, i) => {
    if (i) pdf.addPage([1440, 810], "landscape");
    pdf.setFillColor(scene.background);
    pdf.rect(0, 0, 1440, 810, "F");
    scene.elements.forEach(element => {
      if (element.type === "rect") {
        pdf.setFillColor(element.fill);
        if (element.stroke) { pdf.setDrawColor(element.stroke); pdf.setLineWidth(1); }
        pdf.roundedRect(element.x, element.y, element.w, element.h, element.radius || 0, element.radius || 0, element.stroke ? "FD" : "F");
      } else if (element.type === "line") {
        pdf.setDrawColor(element.color);
        pdf.setLineWidth(element.width);
        pdf.line(element.x, element.y, element.x2, element.y2);
      } else if (element.type === "text") {
        pdf.setFont(element.font || "sans", "normal");
        pdf.setFontSize(element.size);
        pdf.setTextColor(element.color);
        const x = element.x + (element.align === "center" ? element.w / 2 : element.align === "right" ? element.w : 0);
        pdf.text(element.text, x, element.y + element.size * .82, { align: element.align || "left", lineHeightFactor: 1.2 });
        const href = element.href && safeExternalLink(element.href);
        if (href) pdf.link(element.x, element.y, element.w, element.h, { url: href });
      } else {
        const image = assets.get(element.src);
        if (!image) throw new Error(`Image unavailable: ${element.label}. No incomplete file was downloaded.`);
        const box = containImage(element, image.width, image.height);
        pdf.addImage(image.data, image.format, box.x, box.y, box.w, box.h, undefined, "NONE");
      }
    });
  });
  return pdf;
}
