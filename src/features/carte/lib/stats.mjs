import { SUBJECT_BADGES, normalizeSubject } from "../../scans/lib/subject.mjs";
import { applyTopicMastery } from "./mastery.mjs";

export const STRONG_RATE = 0.8;
export const WEAK_RATE = 0.7;

export const EMPTY_SCAN_MESSAGE =
  "まだスキャンデータがありません。プリントを撮影するとここに分析が表示されます";

const SUBJECT_TAB_ORDER = [
  "math",
  "japanese",
  "spelling_phonics",
  "reading",
  "writing_grammar",
  "science",
  "social_studies",
  "world_languages",
  "other",
];

/** 「1」「16」「問3」「①」など、問題番号の残骸を単元名とみなさない */
const PLACEHOLDER_TOPIC =
  /^(?:問|No\.?|#)?[\s(（]*[0-9０-９①-⑳㉑-㉟❶-❿]{1,3}[)）]?[.．、号番]?$/i;

export function isPlaceholderTopic(value) {
  const normalized = String(value ?? "")
    .trim()
    .normalize("NFKC");
  if (!normalized) return true;
  if (PLACEHOLDER_TOPIC.test(normalized)) return true;
  return /^[0-9]+$/.test(normalized);
}

export function fallbackTopic(subject) {
  return (normalizeSubject(subject) ?? "other") === "math" ? "基本計算" : "その他";
}

export function topicOf(problem) {
  const value = String(problem?.topic ?? problem?.unit ?? problem?.topic_tag ?? "").trim();
  const fallback = fallbackTopic(problem?.subject);
  if (!value || isPlaceholderTopic(value)) return fallback;
  return value;
}

export function subjectOf(problem) {
  return normalizeSubject(problem?.subject) ?? "other";
}

export function tabsForProblems(problems) {
  const seen = new Set();
  for (const problem of problems ?? []) {
    seen.add(subjectOf(problem));
  }
  const tabs = [{ id: "all", label: "すべて" }];
  for (const id of SUBJECT_TAB_ORDER) {
    if (seen.has(id)) tabs.push({ id, label: SUBJECT_BADGES[id] });
  }
  return tabs;
}

export function filterProblemsByTab(problems, tab = "all") {
  const rows = problems ?? [];
  if (!tab || tab === "all") return rows;
  const code = normalizeSubject(tab) ?? tab;
  return rows.filter((problem) => subjectOf(problem) === code);
}

export function summarizeProblems(problems) {
  const rows = problems ?? [];
  const total = rows.length;
  const correct = rows.filter((problem) => problem.is_correct).length;
  return {
    total,
    correct,
    rate: total > 0 ? correct / total : 0,
  };
}

export function groupSubjects(problems) {
  const map = new Map();
  for (const problem of problems ?? []) {
    const subject = subjectOf(problem);
    let group = map.get(subject);
    if (!group) {
      group = { subject, total: 0, correct: 0 };
      map.set(subject, group);
    }
    group.total += 1;
    if (problem.is_correct) group.correct += 1;
  }
  return SUBJECT_TAB_ORDER.filter((id) => map.has(id)).map((id) => {
    const group = map.get(id);
    return {
      ...group,
      rate: group.total > 0 ? group.correct / group.total : 0,
    };
  });
}

export function chartModeForSubjectCount(count) {
  const n = Number(count) || 0;
  if (n < 2) return "none";
  if (n === 2) return "bar";
  return "radar";
}

export function groupTopics(problems) {
  const map = new Map();
  for (const problem of problems ?? []) {
    const subject = subjectOf(problem);
    const topic = topicOf(problem);
    const key = `${subject}::${topic}`;
    let group = map.get(key);
    if (!group) {
      group = { key, subject, topic, total: 0, correct: 0, mistakes: [] };
      map.set(key, group);
    }
    group.total += 1;
    if (problem.is_correct) group.correct += 1;
    else group.mistakes.push(problem);
  }
  return [...map.values()].map((group) => ({
    ...group,
    rate: group.total > 0 ? group.correct / group.total : 0,
  }));
}

export function splitTopics(groups) {
  const list = groups ?? [];
  return {
    strong: list.filter((group) => group.rate >= STRONG_RATE).sort((a, b) => b.rate - a.rate || b.total - a.total),
    weak: list.filter((group) => group.rate < WEAK_RATE).sort((a, b) => a.rate - b.rate || b.total - a.total),
    settling: list
      .filter((group) => group.rate >= WEAK_RATE && group.rate < STRONG_RATE)
      .sort((a, b) => a.rate - b.rate || b.total - a.total),
    mastered: [],
  };
}

export function buildCarteMastery(problems, tab = "all", masteryByKey = {}) {
  const filtered = filterProblemsByTab(problems, tab);
  const split = splitTopics(groupTopics(filtered));
  return {
    summary: summarizeProblems(filtered),
    ...applyTopicMastery(split, masteryByKey),
  };
}

export function carelessRate(problems) {
  const wrong = (problems ?? []).filter((problem) => !problem.is_correct);
  if (wrong.length === 0) return 0;
  return wrong.filter((problem) => problem.mistake_type === "careless").length / wrong.length;
}

export function recentRatesFromProblems(problems, limit = 8) {
  const byScan = new Map();
  const order = [];
  for (const problem of problems ?? []) {
    const scanId = problem.scan_id;
    if (!scanId) continue;
    if (!byScan.has(scanId)) {
      byScan.set(scanId, { total: 0, correct: 0 });
      order.push(scanId);
    }
    const group = byScan.get(scanId);
    group.total += 1;
    if (problem.is_correct) group.correct += 1;
  }
  return order.slice(0, limit).reverse().map((id) => {
    const group = byScan.get(id);
    return group.total > 0 ? group.correct / group.total : 0;
  });
}
