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
  const min = options.min ?? 3;
  const max = options.max ?? 5;
  const today = options.today ?? todayIso();
  const eligible = items
    .filter((item) => item.status !== "leech" && item.status !== "mastered" && item.status !== "retired")
    .filter((item) => isDue(item.nextReviewOn, today))
    .sort((a, b) => {
      if (a.nextReviewOn !== b.nextReviewOn) return a.nextReviewOn.localeCompare(b.nextReviewOn);
      return b.consecutiveMisses - a.consecutiveMisses;
    });
  const picked = eligible.slice(0, max);
  return {
    daily: picked,
    truncated: eligible.length > max,
    belowMin: picked.length < min,
    available: eligible.length,
  };
}

export function isolateLeeches(items) {
  return items
    .filter((item) => item.status === "leech")
    .sort((a, b) => String(b.leechAt ?? "").localeCompare(String(a.leechAt ?? "")));
}

export function applyReviewResult(item, isCorrect, options = {}) {
  const leechAt = options.leechMissThreshold ?? 3;
  if (isCorrect) {
    const hits = (item.consecutiveHits ?? 0) + 1;
    const interval = Math.max(1, Math.round((item.intervalDays ?? 1) * (item.easeFactor ?? 2.5)));
    const mastered = interval >= (options.masteredIntervalDays ?? 30) && hits >= (options.masteredHitThreshold ?? 3);
    return {
      ...item,
      consecutiveHits: hits,
      consecutiveMisses: 0,
      intervalDays: interval,
      easeFactor: Math.min(3, (item.easeFactor ?? 2.5) + 0.1),
      status: mastered ? "mastered" : "active",
      lastResult: true,
      completed: true,
    };
  }
  const misses = (item.consecutiveMisses ?? 0) + 1;
  const leech = misses >= leechAt;
  return {
    ...item,
    consecutiveHits: 0,
    consecutiveMisses: misses,
    intervalDays: 1,
    easeFactor: Math.max(1.3, (item.easeFactor ?? 2.5) - 0.2),
    status: leech ? "leech" : "active",
    lastResult: false,
    completed: true,
    leechAt: leech ? new Date().toISOString() : item.leechAt ?? null,
  };
}
