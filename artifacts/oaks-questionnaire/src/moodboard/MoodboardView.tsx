import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Presentation, Loader2 } from "lucide-react";
import type { SubmissionRecord } from "../types/questionnaire.ts";
import { resolveMediaUrl } from "../lib/submissions.ts";
import { buildMoodboardDocument } from "./document.ts";
import { buildMoodboardScene } from "./layout.ts";
import type { MoodboardScene, MoodboardSection, SceneImage } from "./types.ts";
import { containImage } from "./geometry.ts";
import "./moodboard.css";

const SECTIONS: { id: MoodboardSection; label: string }[] = [
  { id: "cover", label: "Cover" },
  { id: "decor", label: "Decor" },
  { id: "wardrobe", label: "Wardrobe" },
  { id: "inspiration", label: "Inspo" },
  { id: "family", label: "Family" },
];
const FONT = { serif: "'OAKS Moodboard Serif', Georgia, serif", sans: "'OAKS Moodboard Sans', Arial, sans-serif" };

const SvgImage = ({ el }: { el: SceneImage }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setUrl(null); setDimensions(null); setFailed(false);
    resolveMediaUrl(el.src).then(async u => {
      if (!u) throw new Error("Image unavailable");
      const image = new Image();
      image.src = u;
      await image.decode();
      if (live) {
        setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
        setUrl(u);
      }
    }).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [el.src]);
  if (failed) return (
    <g>
      <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="#E9DFD0" />
      <text x={el.x + el.w / 2} y={el.y + el.h / 2} textAnchor="middle" fontSize={14} fill="#8A5A44" fontFamily={FONT.sans}>Image could not be loaded</text>
    </g>
  );
  if (!url || !dimensions) return <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="#E9DFD0" className="animate-pulse" />;
  const box = containImage(el, dimensions.width, dimensions.height);
  return <image href={url} x={box.x} y={box.y} width={box.w} height={box.h} preserveAspectRatio="xMidYMid meet" onError={() => setFailed(true)}><title>{el.label}</title></image>;
};

export const SceneSvg = ({ scene }: { scene: MoodboardScene }) => (
  <svg viewBox="0 0 1440 810" className="w-full h-auto block" role="img" aria-label="Wedding moodboard page">
    <rect width={1440} height={810} fill={scene.background} />
    {scene.elements.map((el, i) => {
      if (el.type === "rect") return <rect key={i} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.radius ?? 0} fill={el.fill} stroke={el.stroke} />;
      if (el.type === "line") return <line key={i} x1={el.x} y1={el.y} x2={el.x2} y2={el.y2} stroke={el.color} strokeWidth={el.width} />;
      if (el.type === "image") return <SvgImage key={i} el={el} />;
      const anchor = el.align === "center" ? "middle" : el.align === "right" ? "end" : "start";
      const tx = el.align === "center" ? el.x + el.w / 2 : el.align === "right" ? el.x + el.w : el.x;
      const t = (
        <text x={tx} y={el.y + el.size * 0.82} fontSize={el.size} fill={el.color} textAnchor={anchor}
          fontFamily={FONT[el.font ?? "sans"]} fontWeight={400}
          textDecoration={el.href ? "underline" : undefined}>{el.text}</text>
      );
      return el.href && /^https?:\/\//i.test(el.href)
        ? <a key={i} href={el.href} target="_blank" rel="noopener noreferrer">{t}</a>
        : <g key={i}>{t}</g>;
    })}
  </svg>
);

export const MoodboardView = ({ submission }: { submission: SubmissionRecord }) => {
  const doc = useMemo(() => buildMoodboardDocument(submission), [submission]);
  const total = doc.pages.length;
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState<null | "pdf" | "pptx">(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const currentIndex = Math.min(idx, total - 1);
  const page = doc.pages[currentIndex];
  const scene = useMemo(() => page && buildMoodboardScene(page, currentIndex, total), [page, currentIndex, total]);
  useEffect(() => { setIdx(0); setError(null); }, [submission.id]);
  const go = (i: number) => setIdx(Math.max(0, Math.min(total - 1, i)));

  const runExport = async (format: "pdf" | "pptx") => {
    setBusy(format); setError(null); setProgress("Preparing…");
    try {
      const { exportMoodboard } = await import("./export.ts");
      await exportMoodboard(doc, format, setProgress);
      setProgress("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed. Please try again.");
    } finally { setBusy(null); }
  };

  const present = SECTIONS.filter(s => doc.pages.some(p => p.section === s.id));

  return (
    <section className="space-y-6" data-testid="moodboard-view">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E5DDD2] pb-4">
        <div>
          <h2 className="font-cormorant text-3xl font-semibold text-[#1A1A1A]">Wedding Moodboard</h2>
          <p className="text-sm text-[#7A756D] mt-0.5">{total} pages · {doc.imageCount} images · {doc.personCount} people</p>
        </div>
        <div className="flex gap-2">
          {(["pdf", "pptx"] as const).map(f => (
            <button key={f} type="button" disabled={busy !== null} onClick={() => runExport(f)} data-testid={`button-export-${f}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-[#E5DDD2] bg-[#FBF7F0] text-[#2A2420] hover:border-[#B08D57] disabled:opacity-50 cursor-pointer">
              {busy === f ? <Loader2 className="w-4 h-4 animate-spin" /> : f === "pdf" ? <FileDown className="w-4 h-4 text-[#B08D57]" /> : <Presentation className="w-4 h-4 text-[#B08D57]" />}
              {f === "pdf" ? "PDF" : "Editable PPTX"}
            </button>
          ))}
        </div>
      </div>
      {(busy || error) && (
        <p role="status" className={`text-sm ${error ? "text-[#9B3D2E]" : "text-[#7A756D]"}`}>
          {error ? `Export failed: ${error}` : progress}
        </p>
      )}

      <nav className="flex gap-1 overflow-x-auto scrollbar-none">
        {present.map(s => {
          const first = doc.pages.findIndex(p => p.section === s.id);
          const on = page?.section === s.id;
          return (
            <button key={s.id} type="button" onClick={() => go(first)} data-testid={`button-section-${s.id}`}
              className={`px-3.5 py-1.5 rounded-full text-xs tracking-[0.12em] uppercase whitespace-nowrap cursor-pointer transition-colors ${on ? "bg-[#2A2420] text-[#F7F1E7]" : "text-[#7A6E62] hover:bg-[#F2ECE4]"}`}>
              {s.label}
            </button>
          );
        })}
      </nav>
      <p className="text-xs text-[#7A756D]">
        Uses saved responses only. Family links reflect the relationships provided; shared or unknown relationships are not guessed.
        {doc.pages.length === 1 ? " No visual references or family details have been submitted yet." : ""}
      </p>

      {scene && (
        <div className="rounded-2xl bg-[#EFE8DC] p-3 sm:p-6">
          <div className="overflow-x-auto">
            <div className="min-w-[640px] shadow-[0_18px_40px_-24px_rgba(60,40,20,0.45)] rounded-sm overflow-hidden" key={page.id}>
              <SceneSvg scene={scene} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <button type="button" onClick={() => go(idx - 1)} disabled={idx === 0} data-testid="button-prev-page"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-[#2A2420] hover:bg-[#F7F1E7] disabled:opacity-30 cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <span className="text-xs tracking-[0.18em] text-[#7A6E62]">{idx + 1} / {total}</span>
            <button type="button" onClick={() => go(idx + 1)} disabled={idx >= total - 1} data-testid="button-next-page"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-[#2A2420] hover:bg-[#F7F1E7] disabled:opacity-30 cursor-pointer">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <ol className="flex gap-2 overflow-x-auto pb-2">
        {doc.pages.map((p, i) => (
          <li key={p.id}>
            <button type="button" onClick={() => go(i)} data-testid={`button-page-${i + 1}`}
              className={`w-36 h-20 text-left p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${i === idx ? "border-[#B08D57] bg-[#FBF7F0]" : "border-[#E5DDD2] bg-[#F7F1E7]/60 hover:border-[#CDBB9F]"}`}>
              <span className="block text-[10px] text-[#A9875A]">{i + 1}</span>
              <span className="block font-cormorant text-sm leading-tight text-[#2A2420] line-clamp-2">{p.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};
