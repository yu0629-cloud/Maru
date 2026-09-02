import { addDaysIso, daysAgo, todayIso } from "../../carte/lib/mastery.mjs";

export const REVIEW_STAGE_INTERVAL_DAYS = {
  1: 3,
  2: 7,
  3: null,
};

export const RECOMMENDED_PRINT_MAX = 6;
export const ARCHIVE_OVERDUE_DAYS = 30;

export function clampReviewStage(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 3) return 3;
  return Math.trunc(n);
}

export function emptyQuestionRecord(id = "") {
  return {
    id: String(id || ""),
    question_text: "",
    unit_name: "",
    review_stage: 0,
    mistake_count: 0,
    last_reviewed_at: null,
    next_review_at: null,
    is_archived: false,
  };
}

export function toQuestionRecord(item = {}) {
  const stage = clampReviewStage(
    item.review_stage ?? item.reviewStage ?? (item.status === "mastered" ? 3 : 0),
  );
  const archived =
    item.is_archived === true ||
    item.isArchived === true ||
    item.status === "retired";
  return {
    id: String(item.id || item.problemId || item.problem_id || ""),
    question_text: String(item.question_text ?? item.questionText ?? item.prompt ?? ""),
    unit_name: String(item.unit_name ?? item.unitName ?? item.topicTag ?? item.unit ?? item.topic ?? ""),
    review_stage: stage,
    mistake_count: Number(item.mistake_count ?? item.mistakeCount ?? item.consecutiveMisses ?? 0) || 0,
    last_reviewed_at: item.last_reviewed_at ?? item.lastReviewedAt ?? null,
    next_review_at: item.next_review_at ?? item.nextReviewAt ?? item.nextReviewOn ?? null,
    is_archived: archived,
  };
}

export function masteryStars(stage) {
  const n = clampReviewStage(stage);
  return `${"★".repeat(n)}${"☆".repeat(Math.max(0, 3 - n))}`;
}

export function isArchivedRecord(item = {}) {
  return item.is_archived === true || item.isArchived === true || item.status === "retired";
}

export function dueOnOf(item = {}) {
  return item.next_review_at ?? item.nextReviewAt ?? item.nextReviewOn ?? null;
}

export function mistakeCountOf(item = {}) {
  return Number(item.mistake_count ?? item.mistakeCount ?? item.consecutiveMisses ?? 0) || 0;
}

export function priorityScore(item, today = todayIso()) {
  const overdue = Math.max(0, daysAgo(dueOnOf(item), today) ?? 0);
  return mistakeCountOf(item) * 1000 + overdue;
}

export function archiveStaleRecords(items, options = {}) {
  const today = options.today ?? todayIso();
  const limit = options.days ?? ARCHIVE_OVERDUE_DAYS;
  return (items ?? []).map((item) => {
    if (!item || isArchivedRecord(item) || item.status === "mastered") return item;
    const overdue = daysAgo(dueOnOf(item), today);
    if (overdue == null || overdue < limit) return item;
    return {
      ...item,
      isArchived: true,
      is_archived: true,
      status: "retired",
    };
  });
}

export function selectRecommendedReviews(items, options = {}) {
  const min = options.min ?? 0;
  const max = options.max ?? RECOMMENDED_PRINT_MAX;
  const today = options.today ?? todayIso();
  const due = archiveStaleRecords(items ?? [], { today })
    .filter((item) => !isArchivedRecord(item) && item.status !== "mastered" && item.status !== "leech")
    .filter((item) => {
      const dueOn = dueOnOf(item);
      return !dueOn || dueOn <= today;
    })
    .sort((a, b) => {
      const score = priorityScore(b, today) - priorityScore(a, today);
      if (score !== 0) return score;
      return String(dueOnOf(a) ?? "").localeCompare(String(dueOnOf(b) ?? ""));
    });
  const picked = due.slice(0, max);
  return {
    daily: picked,
    selected: picked,
    truncated: due.length > max,
    belowMin: picked.length < min,
    available: due.length,
  };
}

export function markRecordMastered(item, now = new Date()) {
  const at = now.toISOString();
  return {
    ...item,
    reviewStage: 3,
    review_stage: 3,
    isArchived: false,
    is_archived: false,
    lastReviewedAt: at,
    last_reviewed_at: at,
    nextReviewAt: null,
    next_review_at: null,
    nextReviewOn: todayIso(now),
    status: "mastered",
    completed: true,
    lastResult: true,
  };
}

export function archiveRecord(item) {
  return {
    ...item,
    isArchived: true,
    is_archived: true,
    status: "retired",
  };
}

export function applyReviewResult(item, isCorrect, options = {}) {
  const leechAt = options.leechMissThreshold ?? 3;
  const now = options.now instanceof Date ? options.now : new Date();
  const today = todayIso(now);
  const at = now.toISOString();
  const stage = clampReviewStage(item?.reviewStage ?? item?.review_stage ?? (item?.status === "mastered" ? 3 : 0));
  const mistakes = mistakeCountOf(item);

  if (isCorrect) {
    const nextStage = Math.min(3, stage + 1);
    const interval = REVIEW_STAGE_INTERVAL_DAYS[nextStage];
    const nextAt = interval == null ? null : addDaysIso(today, interval);
    const hits = (item.consecutiveHits ?? 0) + 1;
    const mastered = nextStage >= 3;
    return {
      ...item,
      reviewStage: nextStage,
      review_stage: nextStage,
      mistakeCount: mistakes,
      mistake_count: mistakes,
      lastReviewedAt: at,
      last_reviewed_at: at,
      nextReviewAt: nextAt,
      next_review_at: nextAt,
      nextReviewOn: nextAt ?? today,
      isArchived: false,
      is_archived: false,
      consecutiveHits: hits,
      consecutiveMisses: 0,
      intervalDays: interval ?? item.intervalDays ?? 1,
      easeFactor: Math.min(3, (item.easeFactor ?? 2.5) + 0.1),
      status: mastered ? "mastered" : "active",
      lastResult: true,
      completed: true,
    };
  }

  const consecutive = (item.consecutiveMisses ?? 0) + 1;
  const leech = consecutive >= leechAt;
  const nextAt = addDaysIso(today, 1);
  return {
    ...item,
    reviewStage: 0,
    review_stage: 0,
    mistakeCount: mistakes + 1,
    mistake_count: mistakes + 1,
    lastReviewedAt: at,
    last_reviewed_at: at,
    nextReviewAt: nextAt,
    next_review_at: nextAt,
    nextReviewOn: nextAt,
    isArchived: false,
    is_archived: false,
    consecutiveHits: 0,
    consecutiveMisses: consecutive,
    intervalDays: 1,
    easeFactor: Math.max(1.3, (item.easeFactor ?? 2.5) - 0.2),
    status: leech ? "leech" : "active",
    lastResult: false,
    completed: true,
    leechAt: leech ? at : item.leechAt ?? null,
  };
}

export function recordFromScanProblem(problem, extra = {}) {
  const id = String(problem?.id || problem?.problemId || extra.id || "");
  return {
    id,
    problemId: id,
    status: "queued",
    nextReviewOn: extra.nextReviewOn ?? addDaysIso(todayIso(), 1),
    intervalDays: 1,
    easeFactor: 2.5,
    consecutiveMisses: 0,
    consecutiveHits: 0,
    label: String(problem?.problem_label || problem?.label || extra.label || "問"),
    topicTag: String(problem?.topic_tag || problem?.unit || extra.unit_name || ""),
    questionText: String(problem?.question_text || problem?.questionText || ""),
    prompt: problem?.prompt,
    correctAnswer: problem?.correct_answer || problem?.correctAnswer || "",
    parentCoachingTip: problem?.parent_coaching_tip || problem?.parentCoachingTip || "",
    subject: problem?.subject,
    problemType: problem?.problem_type || problem?.problemType,
    isCorrect: problem?.is_correct === true,
    createdAt: extra.createdAt ?? problem?.created_at ?? problem?.createdAt,
    reviewStage: 0,
    review_stage: 0,
    mistakeCount: 0,
    mistake_count: 0,
    isArchived: false,
    is_archived: false,
    imageSrc: "",
    ...extra,
  };
}

export function applyScanGradesToItems(items, problems, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const list = [...(items ?? [])];
  const byId = new Map(list.map((row) => [String(row.problemId || row.id), row]));
  for (const problem of problems ?? []) {
    const id = String(problem?.id || problem?.problemId || "");
    if (!id) continue;
    const current = byId.get(id) ?? recordFromScanProblem(problem, { createdAt: options.createdAt });
    const next = applyReviewResult(current, problem.is_correct === true, { now, leechMissThreshold: options.leechMissThreshold });
    byId.set(id, next);
  }
  const seen = new Set();
  const out = [];
  for (const row of list) {
    const key = String(row.problemId || row.id);
    const next = byId.get(key) ?? row;
    out.push(next);
    seen.add(key);
  }
  for (const [key, row] of byId) {
    if (!seen.has(key)) out.push(row);
  }
  return archiveStaleRecords(out, { today: todayIso(now) });
}
