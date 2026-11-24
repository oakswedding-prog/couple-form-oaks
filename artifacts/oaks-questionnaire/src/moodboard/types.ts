import type { FamilyMember } from "../types/questionnaire.ts";

export type MoodboardSection = "cover" | "decor" | "wardrobe" | "inspiration" | "family";
export interface MoodboardImage { id: string; src: string; label: string }
export interface MoodboardPerson extends FamilyMember {
  group: "Parents" | "Grandparents" | "Siblings" | "Family & friends" | "Relationship not specified";
}
export interface MoodboardPage {
  id: string;
  kind: "cover" | "divider" | "gallery" | "details" | "family";
  section: MoodboardSection;
  title: string;
  subtitle: string;
  images: MoodboardImage[];
  lines: string[];
  links: string[];
  /** Display fragments for unusually long links; hyperlinks still point to the full submitted URL. */
  linkLabels?: string[];
  people: MoodboardPerson[];
  subject?: string;
  side?: "bride" | "groom" | "shared";
  group?: string;
}
export interface MoodboardDocument {
  title: string;
  filename: string;
  pages: MoodboardPage[];
  imageCount: number;
  personCount: number;
}

/** Shared 1440×810 scene for the live SVG preview, vector PDF and editable PPTX. */
export interface SceneBox { x: number; y: number; w: number; h: number }
export interface SceneText extends SceneBox {
  type: "text"; text: string; size: number; color: string;
  font?: "serif" | "sans"; align?: "left" | "center" | "right";
  bold?: boolean; href?: string;
}
export interface SceneImage extends SceneBox {
  type: "image"; src: string; label: string;
}
export interface SceneRect extends SceneBox { type: "rect"; fill: string; stroke?: string; radius?: number }
export interface SceneLine { type: "line"; x: number; y: number; x2: number; y2: number; color: string; width: number }
export type SceneElement = SceneText | SceneImage | SceneRect | SceneLine;
export interface MoodboardScene { width: 1440; height: 810; background: string; elements: SceneElement[] }
