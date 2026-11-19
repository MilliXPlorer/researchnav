import type { SdgResource } from "./api";

export const sustainableDevelopmentGoals: SdgResource[] = [
  [1, "No Poverty", "No Poverty", "#E5243B"],
  [2, "Zero Hunger", "Zero Hunger", "#DDA63A"],
  [3, "Good Health and Well-being", "Good Health", "#4C9F38"],
  [4, "Quality Education", "Quality Education", "#C5192D"],
  [5, "Gender Equality", "Gender Equality", "#FF3A21"],
  [6, "Clean Water and Sanitation", "Clean Water", "#26BDE2"],
  [7, "Affordable and Clean Energy", "Clean Energy", "#FCC30B"],
  [8, "Decent Work and Economic Growth", "Decent Work", "#A21942"],
  [9, "Industry, Innovation and Infrastructure", "Innovation", "#FD6925"],
  [10, "Reduced Inequalities", "Reduced Inequalities", "#DD1367"],
  [11, "Sustainable Cities and Communities", "Sustainable Cities", "#FD9D24"],
  [
    12,
    "Responsible Consumption and Production",
    "Responsible Consumption",
    "#BF8B2E",
  ],
  [13, "Climate Action", "Climate Action", "#3F7E44"],
  [14, "Life Below Water", "Life Below Water", "#0A97D9"],
  [15, "Life on Land", "Life on Land", "#56C02B"],
  [
    16,
    "Peace, Justice and Strong Institutions",
    "Peace and Justice",
    "#00689D",
  ],
  [17, "Partnerships for the Goals", "Partnerships", "#19486A"],
].map(([id, title, short_title, color_hex]) => ({
  id: Number(id),
  code: `SDG ${id}`,
  title: String(title),
  short_title: String(short_title),
  color_hex: String(color_hex),
}));

export function sdgsForIds(ids: number[]): SdgResource[] {
  const selected = new Set(ids);
  return sustainableDevelopmentGoals.filter((sdg) => selected.has(sdg.id));
}
