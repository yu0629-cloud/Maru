/**
 * カルテの教科・単元集計
 *   node scripts/test-carte.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function pass(name) {
  console.log(`ok - ${name}`);
}

const {
  buildCarteMastery,
  carelessRate,
  chartModeForSubjectCount,
  EMPTY_SCAN_MESSAGE,
  STRONG_RATE,
  WEAK_RATE,
  filterProblemsByTab,
  groupSubjects,
  groupTopics,
  isPlaceholderTopic,
  tabsForProblems,
  topicOf,
} = await import(pathToFileURL(join(root, "src/features/carte/lib/stats.mjs")).href);

const {
  advanceMasteryOnCorrect,
  markTopicMastered,
  nextReviewDateForStage,
  selectBalancedReviews,
  topicKey,
  unmarkTopicMastered,
} = await import(pathToFileURL(join(root, "src/features/carte/lib/mastery.mjs")).href);

const { pointsAttr, radarRingPoints, radarVertex } = await import(
  pathToFileURL(join(root, "src/features/carte/lib/chart.mjs")).href
);

assert.equal(STRONG_RATE, 0.8);
assert.equal(WEAK_RATE, 0.7);
assert.equal(
  EMPTY_SCAN_MESSAGE,
  "まだスキャンデータがありません。プリントを撮影するとここに分析が表示されます",
);
assert.deepEqual(
  tabsForProblems([]).map((tab) => tab.id),
  ["all"],
);
pass("空データでは教科タブを増やさない");

const problems = [
  { id: "1", subject: "math", topic: "くり上がりのある足し算", is_correct: false },
  { id: "2", subject: "math", topic: "くり上がりのある足し算", is_correct: false },
  { id: "3", subject: "math", topic: "くり上がりのある足し算", is_correct: true },
  { id: "4", subject: "math", topic: "かけ算の九九", is_correct: true },
  { id: "5", subject: "math", topic: "かけ算の九九", is_correct: true },
  { id: "6", subject: "math", topic: "かけ算の九九", is_correct: true },
  { id: "7", subject: "math", topic: "かけ算の九九", is_correct: true },
  { id: "8", subject: "math", topic: "かけ算の九九", is_correct: true },
  { id: "9", subject: "japanese", topic: "漢字の書き取り", is_correct: false },
  { id: "10", subject: "japanese", topic: "漢字の書き取り", is_correct: true },
  { id: "11", subject: "english", topic: "アルファベット", is_correct: true },
];

assert.deepEqual(
  tabsForProblems(problems).map((tab) => tab.id),
  ["all", "math", "japanese", "world_languages"],
);
assert.deepEqual(
  tabsForProblems(problems.filter((row) => row.subject === "math")).map((tab) => tab.id),
  ["all", "math"],
);
pass("教科タブはスキャン実績がある教科だけ");

const all = buildCarteMastery(problems, "all");
assert.equal(all.summary.total, 11);
assert.equal(all.weak.some((group) => group.topic === "くり上がりのある足し算"), true);
assert.equal(all.strong.some((group) => group.topic === "かけ算の九九"), true);
assert.equal(all.weak.find((group) => group.topic === "くり上がりのある足し算")?.mistakes.length, 2);
pass("単元を正答率で得意・苦手に分ける");

const math = buildCarteMastery(problems, "math");
assert.equal(math.summary.total, 8);
assert.equal(math.weak.some((group) => group.topic === "漢字の書き取り"), false);
const japanese = buildCarteMastery(problems, "japanese");
assert.equal(japanese.summary.total, 2);
const english = filterProblemsByTab(problems, "english");
assert.equal(english.length, 1);
assert.equal(english[0].topic, "アルファベット");
assert.equal(filterProblemsByTab(problems, "world_languages").length, 1);
assert.equal(filterProblemsByTab(problems, "other").length, 0);
assert.equal(carelessRate([]), 0);
assert.equal(topicOf({ subject: "math", topic: "" }), "基本計算");
assert.equal(topicOf({ subject: "japanese", topic: null }), "その他");
assert.equal(topicOf({ subject: "math", topic: "かけ算の九九" }), "かけ算の九九");
assert.equal(isPlaceholderTopic("1"), true);
assert.equal(isPlaceholderTopic("16"), true);
assert.equal(isPlaceholderTopic("問3"), true);
assert.equal(isPlaceholderTopic("①"), true);
assert.equal(isPlaceholderTopic("たし算"), false);
assert.equal(isPlaceholderTopic("くり上がりのある足し算"), false);
assert.equal(topicOf({ subject: "math", topic: "1" }), "基本計算");
assert.equal(topicOf({ subject: "math", topic: "16" }), "基本計算");
assert.equal(topicOf({ subject: "math", topic: "問2" }), "基本計算");
assert.equal(topicOf({ subject: "math", topic: "たし算" }), "たし算");
assert.equal(topicOf({ subject: "japanese", topic: "3" }), "その他");
pass("教科タブで問題を絞り込む");

const remnant = [
  { id: "n1", subject: "math", topic: "1", is_correct: true },
  { id: "n2", subject: "math", topic: "2", is_correct: true },
  { id: "n3", subject: "math", topic: "16", is_correct: true },
  { id: "n4", subject: "math", topic: "たし算", is_correct: true },
  { id: "n5", subject: "math", topic: "たし算", is_correct: false },
];
const remnantGroups = groupTopics(remnant);
assert.equal(remnantGroups.some((group) => group.topic === "1" || group.topic === "2" || group.topic === "16"), false);
assert.equal(remnantGroups.find((group) => group.topic === "基本計算")?.total, 3);
assert.equal(remnantGroups.find((group) => group.topic === "たし算")?.total, 2);
const remnantMastery = buildCarteMastery(remnant, "math");
assert.equal(remnantMastery.strong.some((group) => group.topic === "基本計算"), true);
assert.equal(remnantMastery.weak.some((group) => group.topic === "たし算"), true);
pass("数字のみの topic は基本計算へ統合し、意味のある単元名は残す");

const clearedAt = new Date("2026-08-28T09:00:00");
assert.equal(nextReviewDateForStage(1, "2026-08-28"), "2026-09-04");
assert.equal(nextReviewDateForStage(2, "2026-08-28"), "2026-09-11");
assert.equal(nextReviewDateForStage(3, "2026-08-28"), "2026-09-27");
assert.equal(nextReviewDateForStage(4, "2026-08-28"), "2026-09-27");
const stage1 = markTopicMastered(null, clearedAt);
assert.equal(stage1.isMastered, true);
assert.equal(stage1.reviewStage, 1);
assert.equal(stage1.nextReviewDate, "2026-09-04");
const stage2 = markTopicMastered(stage1, clearedAt);
assert.equal(stage2.reviewStage, 2);
assert.equal(stage2.nextReviewDate, "2026-09-11");
const stage3 = markTopicMastered(stage2, clearedAt);
assert.equal(stage3.reviewStage, 3);
assert.equal(stage3.nextReviewDate, "2026-09-27");
const stageStay = markTopicMastered(stage3, clearedAt);
assert.equal(stageStay.reviewStage, 3);
assert.equal(stageStay.nextReviewDate, "2026-09-27");
const reset = unmarkTopicMastered();
assert.equal(reset.isMastered, false);
assert.equal(reset.reviewStage, 0);
assert.equal(reset.nextReviewDate, null);
const untouched = advanceMasteryOnCorrect(null, clearedAt);
assert.equal(untouched.isMastered, false);
assert.equal(untouched.reviewStage, 0);
const advanced = advanceMasteryOnCorrect(stage1, clearedAt);
assert.equal(advanced.reviewStage, 2);
assert.equal(advanced.nextReviewDate, "2026-09-11");
pass("忘却曲線は 7/14/30 日後、未克服の正答ではステージを進めない");

const weakKey = topicKey("math", "くり上がりのある足し算");
const masteredView = buildCarteMastery(problems, "all", {
  [weakKey]: { isMastered: true, masteredAt: "2026-08-28T09:00:00.000Z", reviewStage: 1, nextReviewDate: "2026-09-04" },
});
assert.equal(masteredView.weak.some((group) => group.topic === "くり上がりのある足し算"), false);
assert.equal(masteredView.mastered.some((group) => group.topic === "くり上がりのある足し算"), true);
assert.equal(masteredView.mastered.find((group) => group.topic === "くり上がりのある足し算")?.isMastered, true);
const restoredView = buildCarteMastery(problems, "all", {
  [weakKey]: { isMastered: false, masteredAt: null, reviewStage: 0, nextReviewDate: null },
});
assert.equal(restoredView.weak.some((group) => group.topic === "くり上がりのある足し算"), true);
assert.equal(restoredView.mastered.length, 0);
pass("克服トグルは苦手から定着・克服済みへ移し、解除で戻す");

const today = "2026-08-28";
const balanced = selectBalancedReviews(
  [
    ...[1, 2, 3, 4].map((n) => ({
      id: `recent-${n}`,
      status: "active",
      nextReviewOn: today,
      isCorrect: false,
      createdAt: "2026-08-25",
      subject: "math",
      topicTag: "くり上がり",
    })),
    { id: "settle-wrong-1", status: "active", nextReviewOn: today, isCorrect: false, createdAt: "2026-08-01", subject: "math", topicTag: "かけ算" },
    { id: "settle-wrong-2", status: "active", nextReviewOn: today, isCorrect: false, createdAt: "2026-08-01", subject: "math", topicTag: "かけ算" },
    { id: "settle-ok-1", status: "active", nextReviewOn: today, isCorrect: true, createdAt: "2026-08-01", subject: "math", topicTag: "かけ算" },
    { id: "settle-ok-2", status: "active", nextReviewOn: today, isCorrect: true, createdAt: "2026-08-01", subject: "math", topicTag: "かけ算" },
    { id: "settle-ok-3", status: "active", nextReviewOn: today, isCorrect: true, createdAt: "2026-08-01", subject: "math", topicTag: "かけ算" },
    { id: "curve-1", status: "active", nextReviewOn: today, isCorrect: false, createdAt: "2026-07-01", subject: "japanese", topicTag: "漢字" },
    { id: "curve-2", status: "active", nextReviewOn: today, isCorrect: false, createdAt: "2026-07-01", subject: "japanese", topicTag: "漢字" },
  ],
  {
    today,
    min: 3,
    max: 5,
    masteryByKey: {
      "japanese::漢字": { isMastered: true, masteredAt: "2026-07-01T00:00:00.000Z", reviewStage: 1, nextReviewDate: "2026-08-20" },
    },
  },
);
const balancedIds = balanced.daily.map((item) => item.id);
assert.equal(balanced.daily.length, 5);
assert.equal(balancedIds.filter((id) => id.startsWith("recent-")).length, 2);
assert.equal(balancedIds.filter((id) => id.startsWith("settle-wrong-")).length, 2);
assert.equal(balancedIds.some((id) => id.startsWith("curve-")), true);
assert.equal(new Set(balanced.daily.map((item) => item.topicTag)).size >= 3, true);
pass("5問以上のミスは直近・定着中・忘却曲線を分散して選ぶ");

assert.equal(chartModeForSubjectCount(0), "none");
assert.equal(chartModeForSubjectCount(1), "none");
assert.equal(chartModeForSubjectCount(2), "bar");
assert.equal(chartModeForSubjectCount(3), "radar");
assert.equal(chartModeForSubjectCount(4), "radar");
const subjects = groupSubjects(problems);
assert.deepEqual(
  subjects.map((row) => row.subject),
  ["math", "japanese", "world_languages"],
);
assert.equal(subjects.find((row) => row.subject === "math")?.total, 8);
assert.equal(groupSubjects(problems.filter((row) => row.subject === "math")).length, 1);
assert.equal(chartModeForSubjectCount(groupSubjects(problems.filter((row) => row.subject === "math")).length), "none");
assert.equal(chartModeForSubjectCount(groupSubjects(problems.filter((row) => row.subject !== "english")).length), "bar");
pass("教科数に応じて比較グラフの種類を切り替える");

const top = radarVertex(0, 3, 100, 0, 0);
assert.ok(Math.abs(top.x) < 1e-9);
assert.ok(Math.abs(top.y + 100) < 1e-9);
const triangle = radarRingPoints(3, 1, 100, 0, 0);
assert.equal(triangle.length, 3);
assert.equal(pointsAttr(triangle).split(" ").length, 3);
const square = radarRingPoints(4, 1, 80, 10, 10);
assert.equal(square.length, 4);
pass("3教科は三角形、4教科は四角形のレーダー頂点になる");

const carteSrc = readFileSync(join(root, "app/(app)/(tabs)/carte/index.tsx"), "utf8");
assert.match(carteSrc, /CarteMastery/);
const statsSrc = readFileSync(join(root, "src/features/carte/lib/stats.mjs"), "utf8");
assert.match(statsSrc, /tabsForProblems/);
assert.doesNotMatch(statsSrc, /CARTE_TABS/);
const masterySrc = readFileSync(join(root, "src/features/carte/CarteMastery.tsx"), "utf8");
assert.match(masterySrc, /groupSubjects/);
assert.match(masterySrc, /CarteSubjectChart/);
assert.match(masterySrc, /CarteSubjectCards/);
assert.match(masterySrc, /t\("carte.empty"\)/);
assert.match(masterySrc, /t\("carte.weakTitle"\)/);
assert.match(masterySrc, /t\("carte.strongTitle"\)/);
assert.match(masterySrc, /t\("carte.masteredTitle"\)/);
assert.match(masterySrc, /t\("carte.markMastered"\)/);
assert.match(masterySrc, /t\("carte.masteredBadge"\)/);
assert.match(masterySrc, /t\("carte.unmarkMastered"\)/);
assert.match(masterySrc, /toggleMastered/);
assert.match(masterySrc, /useTopicMasteryStore/);
assert.match(masterySrc, /t\("carte.showMistakes"\)/);
assert.match(masterySrc, /t\("carte.tapHint"\)/);
assert.match(masterySrc, /t\("carte.backToCompare"\)/);
assert.match(masterySrc, /tSubject\(group\.subject\)/);
assert.match(masterySrc, /group\.topic/);
assert.doesNotMatch(masterySrc, /tabsForProblems/);
assert.doesNotMatch(masterySrc, /CARTE_TABS/);
const chartSrc = readFileSync(join(root, "src/features/carte/CarteSubjectChart.tsx"), "utf8");
assert.match(chartSrc, /from "react-native-svg"/);
assert.match(chartSrc, /chartModeForSubjectCount/);
assert.match(chartSrc, /SubjectBarChart/);
assert.match(chartSrc, /SubjectRadarChart/);
assert.match(chartSrc, /Polygon/);
assert.match(chartSrc, /tSubjectBadge/);
assert.match(chartSrc, /t\("carte.cardA11y"/);
const hookSrc = readFileSync(join(root, "src/hooks/useCarte.ts"), "utf8");
assert.match(hookSrc, /PROBLEM_SELECT/);
assert.match(hookSrc, /created_at/);
assert.match(hookSrc, /EMPTY_CARTE/);
assert.match(hookSrc, /Fetched scans count/);
assert.match(hookSrc, /child_id\.is\.null/);
assert.match(hookSrc, /UseCarteResult/);
assert.match(hookSrc, /CarteView/);
assert.doesNotMatch(hookSrc, /MOCK_CARTE_PROBLEMS/);
assert.doesNotMatch(hookSrc, /MOCK_CARTE/);
assert.doesNotMatch(hookSrc, /\.not\("is_correct"/);
assert.doesNotMatch(hookSrc, /topic IS NOT NULL/);
const mockSrc = readFileSync(join(root, "src/features/grading/mock.ts"), "utf8");
assert.doesNotMatch(mockSrc, /MOCK_CARTE_PROBLEMS/);
assert.doesNotMatch(mockSrc, /漢字の書き取り/);
pass("カルテ画面は実スキャンのみ集計し、未スキャン時は空状態");

console.log("\nAll carte checks passed.");
