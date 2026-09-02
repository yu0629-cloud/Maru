import { selectBalancedReviews } from "../../carte/lib/mastery.mjs";
export { applyReviewResult } from "./question-record.mjs";

export function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isDue(nextReviewOn, today = todayIso()) {
  return nextReviewOn <= today;
}

export function selectDailyReviews(items, options = {}) {
  return selectBalancedReviews(items, options);
}

export function isolateLeeches(items) {
  return items
    .filter((item) => item.status === "leech")
    .sort((a, b) => String(b.leechAt ?? "").localeCompare(String(a.leechAt ?? "")));
}
