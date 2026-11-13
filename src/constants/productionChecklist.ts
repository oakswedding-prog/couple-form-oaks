/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ChecklistItemDef {
  id: string;
  label: string;
}

export interface ChecklistSectionDef {
  id: string;
  title: string;
  items: ChecklistItemDef[];
}

export const WEDDING_PRODUCTION_CHECKLIST: ChecklistSectionDef[] = [
  {
    id: "tech_riders",
    title: "Tech riders",
    items: [
      { id: "tech_camera_time_reset", label: "Camera time reset" },
      { id: "tech_confirm_shooting_profile", label: "Confirm shooting profile" },
      { id: "tech_audio_on_track", label: "Audio recording devices on track" },
    ],
  },
  {
    id: "venue_details",
    title: "Venue & Details",
    items: [
      { id: "venue_establishing_shots", label: "Complete venue establishing shots." },
      { id: "venue_mandap_stage_wide", label: "Mandap / stage wide shots." },
      { id: "venue_floral_details", label: "Floral decorations and details." },
      { id: "venue_seating_ambience", label: "Seating arrangements and guest ambience." },
    ],
  },
  {
    id: "mandatory_family_portraits",
    title: "Mandatory Family Portraits",
    items: [
      { id: "portrait_bride_parents", label: "Bride with parents." },
      { id: "portrait_groom_parents", label: "Groom with parents." },
      { id: "portrait_couple_both_parents", label: "Bride and groom with both sets of parents." },
      { id: "portrait_bride_siblings", label: "Bride with siblings." },
      { id: "portrait_groom_siblings", label: "Groom with siblings." },
      { id: "portrait_couple_grandparents", label: "Couple with grandparents." },
      { id: "portrait_couple_immediate_family", label: "Couple with immediate family." },
      { id: "portrait_couple_extended_family", label: "Couple with extended family." },
      { id: "portrait_couple_friends", label: "Couple with friends." },
      { id: "portrait_complete_family_both_sides", label: "Complete family photograph from both sides." },
    ],
  },
];

export const TOTAL_CHECKLIST_ITEMS = WEDDING_PRODUCTION_CHECKLIST.reduce(
  (sum, section) => sum + section.items.length,
  0
);
