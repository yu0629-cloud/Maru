import { normalizeSubject } from "../../scans/lib/subject.mjs";

export function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const REVIEW_STAGE_DAYS = {
  1: 7,
  2: 14,
  3: 30,
};

export const RECENT_MISS_MAX_DAYS = 7;
export const SETTLING_RATE_MIN = 0.5;
export const SETTLING_RATE_MAX = 0.8;

export function addDaysIso(iso, days) {
  const base = iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`) : new Date();
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + Number(days || 0));
  return todayIso(next);
}

export function daysUntil(iso, today = todayIso()) {
  if (!iso) return null;
  const a = Date.parse(`${String(iso).slice(0, 10)}T00:00:00`);
  const b = Date.parse(`${today}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

export function daysAgo(iso, today = todayIso()) {
  const until = daysUntil(iso, today);
  return until == null ? null : -until;
}

export function topicKey(subject, topic) {
  const code = normalizeSubject(subject) ?? "other";
  const name = String(topic ?? "").trim() || "その他";
  return `${code}::${name}`;
}

export function emptyMastery() {
  return {
    isMastered: false,
    masteredAt: null,
    reviewStage: 0,
    nextReviewDate: null,
  };
}

export function isMasteryRecord(value) {
  return Boolean(value) && typeof value === "object";
}

export function normalizeMastery(value) {
  const raw = isMasteryRecord(value) ? value : {};
  const stage = Math.max(0, Math.min(3, Number(raw.reviewStage) || 0));
  const isMastered = raw.isMastered === true;
  return {
    isMastered,
    masteredAt: typeof raw.masteredAt === "string" ? raw.masteredAt : null,
    reviewStage: isMastered ? Math.max(1, stage) : 0,
    nextReviewDate: typeof raw.nextReviewDate === "string" ? raw.nextReviewDate : null,
  };
}

export function intervalDaysForStage(stage) {
  const n = Math.max(0, Number(stage) || 0);
  if (n >= 3) return REVIEW_STAGE_DAYS[3];
  if (n === 2) return REVIEW_STAGE_DAYS[2];
  if (n === 1) return REVIEW_STAGE_DAYS[1];
  return null;
}

export function nextReviewDateForStage(stage, fromIso = todayIso()) {
  const days = intervalDaysForStage(stage);
  if (!days) return null;
  return addDaysIso(fromIso, days);
}

export function markTopicMastered(record, now = new Date()) {
  const current = normalizeMastery(record);
  const stage = Math.min(3, Math.max(1, (current.isMastered ? current.reviewStage : 0) + 1));
  const at = now.toISOString();
  return {
    isMastered: true,
    masteredAt: at,
    reviewStage: stage,
    nextReviewDate: nextReviewDateForStage(stage, todayIso(now)),
  };
}

export function unmarkTopicMastered() {
  return emptyMastery();
}

export function advanceMasteryOnCorrect(record, now = new Date()) {
  const current = normalizeMastery(record);
  if (!current.isMastered) return current;
  const stage = Math.min(3, Math.max(1, current.reviewStage + 1));
  return {
    isMastered: true,
    masteredAt: current.masteredAt ?? now.toISOString(),
    reviewStage: stage,
    nextReviewDate: nextReviewDateForStage(stage, todayIso(now)),
  };
}

export function applyTopicMastery(split, masteryByKey = {}) {
  const buckets = { strong: [], weak: [], settling: [], mastered: [] };
  const all = [...(split?.weak ?? []), ...(split?.settling ?? []), ...(split?.strong ?? []), ...(split?.mastered ?? [])];
  const seen = new Set();
  for (const group of all) {
    if (!group || seen.has(group.key)) continue;
    seen.add(group.key);
    const mastered = masteryByKey[group.key]?.isMastered === true;
    if (mastered) {
      buckets.mastered.push({ ...group, isMastered: true });
      continue;
    }
    if (group.rate >= 0.8) buckets.strong.push({ ...group, isMastered: false });
    else if (group.rate < 0.7) buckets.weak.push({ ...group, isMastered: false });
    else buckets.settling.push({ ...group, isMastered: false });
  }
  return buckets;
}

function topicKeyOf(item) {
  return topicKey(item?.subject, item?.topicTag ?? item?.topic ?? item?.unit ?? item?.topic_tag);
}

function isExplicitIncorrect(item) {
  if (item?.isCorrect === true || item?.is_correct === true || item?.lastResult === true) return false;
  return item?.isCorrect === false || item?.is_correct === false || item?.lastResult === false;
}

function isReviewExcluded(item) {
  return item?.status === "leech" || item?.status === "retired";
}

function isOverdueMastery(item, masteryByKey, today) {
  const record = masteryByKey[topicKeyOf(item)];
  if (!record?.isMastered) return false;
  const due = record.nextReviewDate ?? item?.nextReviewOn;
  return Boolean(due) && due <= today;
}

function recentMiss(item, today) {
  if (!isExplicitIncorrect(item)) return false;
  const stamp = item.createdAt ?? item.created_at ?? item.completedAt ?? null;
  const ago = daysAgo(stamp, today);
  if (ago == null) return true;
  return ago >= 0 && ago <= RECENT_MISS_MAX_DAYS;
}

function topicRatesFromItems(items) {
  const map = new Map();
  for (const item of items ?? []) {
    const key = topicKeyOf(item);
    let group = map.get(key);
    if (!group) {
      group = { total: 0, correct: 0 };
      map.set(key, group);
    }
    group.total += 1;
    if (item?.isCorrect === true || item?.is_correct === true || item?.lastResult === true) group.correct += 1;
  }
  const rates = new Map();
  for (const [key, group] of map) {
    rates.set(key, group.total > 0 ? group.correct / group.total : 0);
  }
  return rates;
}

function isSettlingTopic(item, rates) {
  const rate = rates.get(topicKeyOf(item));
  if (rate == null) return false;
  return rate >= SETTLING_RATE_MIN && rate < SETTLING_RATE_MAX;
}

function pickSpread(candidates, limit, usedIds, usedTopics, maxPerTopic) {
  const picked = [];
  const pool = candidates.filter((item) => !usedIds.has(item.id));
  while (picked.length < limit && pool.length > 0) {
    let chosenIndex = -1;
    for (let i = 0; i < pool.length; i += 1) {
      const key = topicKeyOf(pool[i]);
      if ((usedTopics.get(key) ?? 0) < maxPerTopic) {
        chosenIndex = i;
        break;
      }
    }
    if (chosenIndex < 0) chosenIndex = 0;
    const item = pool.splice(chosenIndex, 1)[0];
    if (!item || usedIds.has(item.id)) continue;
    picked.push(item);
    usedIds.add(item.id);
    const key = topicKeyOf(item);
    usedTopics.set(key, (usedTopics.get(key) ?? 0) + 1);
  }
  return picked;
}

function dateSort(items) {
  return [...items].sort((a, b) => {
    const aOn = a.nextReviewOn ?? "";
    const bOn = b.nextReviewOn ?? "";
    if (aOn !== bOn) return aOn.localeCompare(bOn);
    return (b.consecutiveMisses ?? 0) - (a.consecutiveMisses ?? 0);
  });
}

/**
 * 間違えた問題が5問以上あるとき、直近ミス / 定着中 / 忘却曲線のおさらいをバランスよく選ぶ。
 * それ未満、または明示的な不正解が足りないときは日付順。
 */
export function selectBalancedReviews(items, options = {}) {
  const min = options.min ?? 3;
  const max = options.max ?? 5;
  const today = options.today ?? todayIso();
  const masteryByKey = options.masteryByKey ?? {};
  const eligible = (items ?? []).filter((item) => !isReviewExcluded(item));
  const incorrect = eligible.filter(isExplicitIncorrect);
  const due = eligible.filter((item) => {
    if (item.status === "mastered") return isOverdueMastery(item, masteryByKey, today);
    const on = item.nextReviewOn;
    return !on || on <= today;
  });

  if (incorrect.length < 5) {
    const picked = dateSort(due.filter((item) => item.status !== "mastered")).slice(0, max);
    return {
      daily: picked,
      truncated: due.length > max,
      belowMin: picked.length < min,
      available: due.filter((item) => item.status !== "mastered").length,
    };
  }

  const rates = topicRatesFromItems(eligible);
  const usedIds = new Set();
  const usedTopics = new Map();
  const maxPerTopic = Math.max(1, Math.ceil(max / 3));
  const curveCount = Math.min(2, Math.max(1, Math.round(max * 0.1) || 1));
  const recentCount = Math.floor(max * 0.5);
  const settlingCount = Math.max(0, max - recentCount - curveCount);

  const recentPool = dateSort(
    due.filter((item) => !masteryByKey[topicKeyOf(item)]?.isMastered && recentMiss(item, today)),
  );
  const settlingPool = dateSort(
    due.filter(
      (item) =>
        !masteryByKey[topicKeyOf(item)]?.isMastered &&
        isSettlingTopic(item, rates) &&
        isExplicitIncorrect(item),
    ),
  );
  const curvePool = dateSort(due.filter((item) => isOverdueMastery(item, masteryByKey, today)));

  const recent = pickSpread(recentPool, recentCount, usedIds, usedTopics, maxPerTopic);
  const settling = pickSpread(settlingPool, settlingCount, usedIds, usedTopics, maxPerTopic);
  const curve = pickSpread(curvePool, curveCount, usedIds, usedTopics, maxPerTopic);

  let picked = [...recent, ...settling, ...curve];
  if (picked.length < max) {
    const filler = dateSort(
      due.filter((item) => {
        if (usedIds.has(item.id)) return false;
        if (item.status === "mastered") return isOverdueMastery(item, masteryByKey, today);
        return !masteryByKey[topicKeyOf(item)]?.isMastered;
      }),
    );
    picked = [...picked, ...pickSpread(filler, max - picked.length, usedIds, usedTopics, maxPerTopic)];
  }

  return {
    daily: picked.slice(0, max),
    truncated: eligible.length > max,
    belowMin: picked.length < min,
    available: due.length,
  };
}
