import { todayIso } from "./select.mjs";

export const LEECH_ACTIONS = ["master", "requeue"];

export function addDaysIso(iso, days) {
  const base = iso ? new Date(`${iso}T00:00:00`) : new Date();
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return todayIso(next);
}

export function resolveLeechItem(item, action, options = {}) {
  if (action !== "master" && action !== "requeue") {
    throw new Error("INVALID_LEECH_ACTION");
  }
  const today = options.today ?? todayIso();
  if (action === "master") {
    return {
      ...item,
      status: "mastered",
      consecutiveMisses: 0,
      consecutiveHits: Math.max(item.consecutiveHits ?? 0, options.masteredHitThreshold ?? 3),
      leechAt: null,
      lastResult: true,
    };
  }
  return {
    ...item,
    status: "queued",
    consecutiveMisses: 0,
    leechAt: null,
    intervalDays: 1,
    nextReviewOn: addDaysIso(today, 1),
  };
}

export function applyLeechToCarte(carte, item, action) {
  if (action !== "master") {
    return { ...carte, weak_units: [...(carte.weak_units ?? [])], strong_units: [...(carte.strong_units ?? [])] };
  }
  const topic = item.topicTag ?? item.unit;
  const weak = (carte.weak_units ?? []).map((unit) => {
    if (unit.unit !== topic) return { ...unit };
    const total = Math.max(1, unit.total ?? 1);
    const correct = Math.min(total, (unit.correct ?? 0) + 1);
    return { ...unit, correct, rate: correct / total };
  });
  const stillWeak = weak.filter((unit) => (unit.rate ?? 0) < 0.6);
  const recovered = weak.filter((unit) => (unit.rate ?? 0) >= 0.6);
  const problemCount = Math.max(1, carte.problem_count ?? 1);
  const nextCorrect = Math.min(problemCount, (carte.foundation_rate ?? 0) * problemCount + 1);
  return {
    ...carte,
    weak_units: stillWeak,
    strong_units: [...(carte.strong_units ?? []), ...recovered],
    foundation_rate: nextCorrect / problemCount,
  };
}
