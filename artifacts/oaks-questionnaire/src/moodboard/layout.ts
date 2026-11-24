import type { MoodboardPage, MoodboardScene, SceneElement, SceneText } from "./types.ts";

export const W = 1440;
export const H = 810;
const M = 88; // generous outer margin
export const C = {
  bg: "#F7F1E7",
  paper: "#FBF7F0",
  well: "#EFE6D8",
  ink: "#2A2420",
  soft: "#7A6E62",
  gold: "#A9875A",
  rule: "#DCCFBC",
};

const LH = 1.2;
// Conservative width estimates for the bundled fonts; wide glyphs need more than a character count.
const glyphWidth = (char: string) => /[MW@%]/.test(char) ? 1.05 : /[ilI.,'|! :;]/.test(char) ? .36 : /[A-Z]/.test(char) ? .82 : .65;

/** Word wrap with hard breaks for unbroken strings. Never truncates. */
export function wrapText(text: string, maxW: number, size: number, font: "serif" | "sans" = "sans"): string[] {
  const out: string[] = [];
  const fits = (s: string) => [...s].reduce((n, c) => n + glyphWidth(c) * size, 0) <= maxW;
  for (const para of String(text).split(/\n/)) {
    let line = "";
    for (const raw of para.split(/\s+/).filter(Boolean)) {
      const parts: string[] = [];
      let part = "";
      for (const c of raw) {
        if (part && !fits(part + c)) { parts.push(part); part = ""; }
        part += c;
      }
      if (part) parts.push(part);
      for (const word of parts) {
        if (!line) line = word;
        else if (fits(line + " " + word)) line += " " + word;
        else { out.push(line); line = word; }
      }
    }
    out.push(line);
  }
  return out.length ? out : [""];
}

type TextOpts = Omit<SceneText, "type" | "text" | "x" | "y" | "w" | "h">;
/** Push one text element per wrapped line; returns the bottom y. */
function text(els: SceneElement[], value: string, x: number, y: number, w: number, o: TextOpts): number {
  const font = o.font ?? "sans";
  const lh = o.size * LH;
  wrapText(value, w, o.size, font).forEach((line, i) => {
    els.push({ type: "text", text: line, x, y: y + i * lh, w, h: lh, font, ...o });
  });
  return y + wrapText(value, w, o.size, font).length * lh;
}
const lineCount = (v: string, w: number, size: number, font: "serif" | "sans" = "sans") => wrapText(v, w, size, font).length;

function header(els: SceneElement[], page: MoodboardPage): number {
  let y = text(els, page.title, M, 56, W - M * 2, { size: 40, color: C.ink, font: "serif" });
  if (page.subtitle) y = text(els, page.subtitle.toUpperCase(), M, y + 6, W - M * 2, { size: 13, color: C.gold });
  return y + 24;
}

function footer(els: SceneElement[], index: number, total: number) {
  els.push({ type: "line", x: M, y: H - 52, x2: W - M, y2: H - 52, color: C.rule, width: 1 });
  els.push({ type: "text", text: "OAKS WEDDING", x: M, y: H - 40, w: 300, h: 14 * LH, size: 12, color: C.soft });
  els.push({ type: "text", text: `${index + 1} / ${total}`, x: W - M - 200, y: H - 40, w: 200, h: 14 * LH, size: 12, color: C.soft, align: "right" });
}

function imageCell(els: SceneElement[], x: number, y: number, w: number, h: number, src: string, label: string, radius = 4) {
  els.push({ type: "rect", x, y, w, h, fill: C.well, radius });
  els.push({ type: "image", x: x + 8, y: y + 8, w: w - 16, h: h - 16, src, label });
}

/** Landscape collage slots for 1–6 images. */
function collage(n: number, x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number }[] {
  const g = 18;
  const grid = (cols: number, rows: number, yy = y, hh = h, xx = x, ww = w) => {
    const cw = (ww - g * (cols - 1)) / cols, rh = (hh - g * (rows - 1)) / rows;
    const s = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) s.push({ x: xx + c * (cw + g), y: yy + r * (rh + g), w: cw, h: rh });
    return s;
  };
  if (n <= 1) return grid(1, 1);
  if (n === 2) return grid(2, 1);
  if (n === 3) {
    const lw = w * 0.58;
    return [{ x, y, w: lw, h }, ...grid(1, 2, y, h, x + lw + g, w - lw - g)];
  }
  if (n === 4) return grid(2, 2);
  if (n === 5) {
    const th = (h - g) * 0.55;
    return [...grid(2, 1, y, th), ...grid(3, 1, y + th + g, h - th - g)];
  }
  return grid(3, 2);
}

const safeHref = (u: string) => (/^https?:\/\//i.test(u.trim()) ? u.trim() : undefined);
const CONNECTED = new Set(["Parents", "Grandparents", "Siblings"]);

export function buildMoodboardScene(page: MoodboardPage, index: number, total: number): MoodboardScene {
  const els: SceneElement[] = [];
  let background = C.bg;

  if (page.kind === "cover") {
    background = C.paper;
    els.push({ type: "rect", x: 40, y: 40, w: W - 80, h: H - 80, fill: C.paper, stroke: C.rule, radius: 0 });
    els.push({ type: "text", text: "OAKS WEDDING", x: M, y: 150, w: W - M * 2, h: 16 * LH, size: 14, color: C.gold, align: "center" });
    const tl = lineCount(page.title, 1100, 80, "serif");
    let y = 405 - (tl * 80 * LH) / 2 - 20;
    y = text(els, page.title, 170, y, 1100, { size: 80, color: C.ink, font: "serif", align: "center" });
    els.push({ type: "line", x: W / 2 - 60, y: y + 22, x2: W / 2 + 60, y2: y + 22, color: C.gold, width: 1 });
    y = text(els, page.subtitle.toUpperCase(), 170, y + 44, 1100, { size: 16, color: C.soft, align: "center" });
    for (const l of page.lines) y = text(els, l, 170, y + 14, 1100, { size: 24, color: C.ink, font: "serif", align: "center" });
  } else if (page.kind === "divider") {
    els.push({ type: "line", x: M, y: 300, x2: M + 80, y2: 300, color: C.gold, width: 1.5 });
    const y = text(els, page.title, M, 330, W - M * 2 - 200, { size: 84, color: C.ink, font: "serif" });
    text(els, page.subtitle.toUpperCase(), M, y + 16, 800, { size: 15, color: C.gold });
    footer(els, index, total);
  } else if (page.kind === "gallery") {
    const top = header(els, page);
    collage(page.images.length, M, top, W - M * 2, H - 80 - top).forEach((s, i) => {
      const img = page.images[i];
      if (img) {
        const showCaption = page.section === "family" && img.label !== "Family reference";
        const captionHeight = showCaption ? lineCount(img.label, s.w, 14) * 14 * LH + 6 : 0;
        imageCell(els, s.x, s.y, s.w, s.h - captionHeight, img.src, img.label);
        if (showCaption) text(els, img.label, s.x, s.y + s.h - captionHeight + 5, s.w, { size: 14, color: C.soft, align: "center" });
      }
    });
    footer(els, index, total);
  } else if (page.kind === "details") {
    let y = header(els, page) + 10;
    const w = W - M * 2 - 160;
    if (page.links.length) {
      page.links.forEach((l, i) => {
        els.push({ type: "text", text: String(i + 1).padStart(2, "0"), x: M, y, w: 60, h: 18 * LH, size: 15, color: C.gold });
        y = text(els, page.linkLabels?.[i] || l, M + 70, y, w, { size: 20, color: safeHref(l) ? "#6B5232" : C.ink, href: safeHref(l) });
        els.push({ type: "line", x: M + 70, y: y + 14, x2: M + 70 + w, y2: y + 14, color: C.rule, width: 1 });
        y += 30;
      });
    }
    for (const l of page.lines) y = text(els, l, M, y, w, { size: 22, color: C.ink, font: "serif" }) + 16;
    footer(els, index, total);
  } else if (page.kind === "family") {
    const top = header(els, page);
    const bottom = H - 80;
    const sx = M, sw = 280, sh = 150;
    const sy = top + (bottom - top - sh) / 2;
    const ax = sx + sw;
    const gx = ax + 110, gw = W - M - gx;
    const n = page.people.length;
    const cols = n <= 3 ? n || 1 : 3, rows = n > 3 ? 2 : 1, g = 22;
    const cw = (gw - g * (cols - 1)) / cols, ch = (bottom - top - g * (rows - 1)) / rows;
    const connect = Boolean(page.subject) && page.side !== "shared" && CONNECTED.has(page.group || "");
    const cells = page.people.map((p, i) => {
      const x = gx + (i % cols) * (cw + g), y = top + Math.floor(i / cols) * (ch + g);
      return { p, x, y };
    });
    if (connect && cells.length) {
      // Subject -> each relative only; rails run in gutters, never between relatives.
      const bx = ax + 55, my = sy + sh / 2, lc = C.gold;
      els.push({ type: "line", x: ax, y: my, x2: bx, y2: my, color: lc, width: 1.2 });
      const rails = [...new Set(cells.map(c => c.y))].map(cy => cy - 11);
      els.push({ type: "line", x: bx, y: Math.min(my, ...rails), x2: bx, y2: Math.max(my, ...rails), color: lc, width: 1.2 });
      for (const ry of rails) {
        const row = cells.filter(c => c.y - 11 === ry);
        const lastX = Math.max(...row.map(c => c.x + cw / 2));
        els.push({ type: "line", x: bx, y: ry, x2: lastX, y2: ry, color: lc, width: 1.2 });
        for (const c of row) els.push({ type: "line", x: c.x + cw / 2, y: ry, x2: c.x + cw / 2, y2: c.y, color: lc, width: 1.2 });
      }
    }
    if (page.subject) {
      els.push({ type: "rect", x: sx, y: sy, w: sw, h: sh, fill: C.paper, stroke: C.gold, radius: 10 });
      const sl = lineCount(page.subject, sw - 40, 30, "serif");
      const ty = sy + (sh - sl * 30 * LH - 22) / 2;
      const ey = text(els, page.subject, sx + 20, ty, sw - 40, { size: 30, color: C.ink, font: "serif", align: "center" });
      text(els, page.side === "groom" ? "GROOM" : page.side === "bride" ? "BRIDE" : "", sx + 20, ey + 6, sw - 40, { size: 12, color: C.gold, align: "center" });
    } else {
      text(els, "Shared / unassigned", sx, sy + 50, sw, { size: 26, color: C.soft, font: "serif" });
    }
    for (const { p, x, y } of cells) {
      const tw = cw - 24;
      const nameH = lineCount(p.name || "Name not provided", tw, 20, "serif") * 20 * LH;
      const relH = lineCount(p.relationship || "Relationship not specified", tw, 13) * 13 * LH;
      const tagH = p.mustCapture ? 18 : 0;
      const textH = nameH + relH + tagH + 22;
      const ph = Math.max(60, ch - textH);
      els.push({ type: "rect", x, y, w: cw, h: ch, fill: C.paper, stroke: C.rule, radius: 12 });
      if (p.photoUrl) els.push({ type: "image", x: x + 12, y: y + 12, w: cw - 24, h: ph - 18, src: p.photoUrl, label: p.name });
      else {
        els.push({ type: "rect", x: x + 12, y: y + 12, w: cw - 24, h: ph - 18, fill: C.well, radius: 10 });
        els.push({ type: "text", text: "No portrait", x: x + 12, y: y + ph / 2 - 8, w: cw - 24, h: 16, size: 12, color: C.soft, align: "center" });
      }
      let ty = y + ph;
      ty = text(els, p.name || "Name not provided", x + 12, ty, tw, { size: 20, color: C.ink, font: "serif", align: "center" });
      ty = text(els, (p.relationship || "Relationship not specified").toUpperCase(), x + 12, ty + 2, tw, { size: 13, color: C.soft, align: "center" });
      if (p.mustCapture) text(els, "MUST CAPTURE", x + 12, ty + 2, tw, { size: 11, color: C.gold, align: "center", bold: true });
    }
    footer(els, index, total);
  }
  return { width: 1440, height: 810, background, elements: els };
}
