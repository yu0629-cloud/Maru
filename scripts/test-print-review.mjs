/**
 * 印刷テンプレートと復習キューの契約テスト
 *   node scripts/test-print-review.mjs
 */
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const printLib = join(root, "src/features/print/lib/document.mjs");
const reviewLib = join(root, "src/features/review/lib/select.mjs");

const {
  buildPrintHtml,
  chooseAnswerStyle,
  toClipItems,
  packClipRows,
  layoutKind,
  geminiBBoxToNormalizedBox,
} = await import(pathToFileURL(printLib).href);
const { applyReviewResult, isolateLeeches, selectDailyReviews } = await import(
  pathToFileURL(reviewLib).href
);

function pass(name) {
  console.log(`ok - ${name}`);
}

assert.equal(chooseAnswerStyle({ topicTag: "つるかめ算", subject: "math" }), "graph");
assert.equal(chooseAnswerStyle({ topicTag: "漢字", subject: "japanese" }), "kanji");
assert.equal(chooseAnswerStyle({ topicTag: "読解" }), "lined");
pass("単元から解答欄スタイルを切り替える");

const compactBox = geminiBBoxToNormalizedBox([80, 60, 260, 940]);
assert.equal(Number(compactBox.width.toFixed(2)), 0.88);
assert.equal(layoutKind({ problemType: "calc_block" }, compactBox), "compact");
assert.equal(layoutKind({ problemType: "math_geometry_graph" }, compactBox), "wide");
assert.equal(layoutKind({ problemType: "reading_passage" }, { x: 0.05, y: 0.2, width: 0.9, height: 0.58 }), "wide");
pass("短い計算は2列、図形・長文は1列にする");

const printProblems = [
  { id: "ok", label: "かけ算", problemType: "calc_block", bbox: [40, 60, 80, 940], isCorrect: true, correctAnswer: "72", parentCoachingTip: "" },
  { id: "c1", label: "計算", problemType: "calc_block", bbox: [80, 60, 260, 940], isCorrect: false, studentAnswer: "43", correctAnswer: "34", parentCoachingTip: "" },
  { id: "c2", label: "漢字", problemType: "kanji", bbox: [100, 40, 220, 480], isCorrect: false, studentAnswer: "注", correctAnswer: "注", parentCoachingTip: "" },
  { id: "g", label: "大問3", problemType: "math_geometry_graph", bbox: [830, 60, 980, 940], isCorrect: false, studentAnswer: "", correctAnswer: "正六角形", parentCoachingTip: "" },
  { id: "r", label: "読解", problemType: "reading_passage", bbox: [200, 50, 780, 950], isCorrect: false, studentAnswer: "川", originalImageSrc: "https://example.com/scan.jpg", correctAnswer: "雨", parentCoachingTip: "" },
];
const clips = toClipItems(printProblems);
assert.equal(clips.length, 4);
assert.equal(clips.some((item) => item.id === "ok"), false);
const rows = packClipRows(clips);
assert.equal(rows[0].length, 2);
assert.equal(rows[0][0].layout, "compact");
assert.equal(rows.some((row) => row.length === 1 && row[0].layout === "wide"), true);
pass("不正解だけ切り抜き、サイズで可変配置する");

const html = buildPrintHtml({
  title: "8月26日のまとめプリント",
  childName: "はると",
  dateLabel: "2026年8月26日",
  problems: printProblems,
});
assert.match(html, /size: A4 portrait/);
assert.match(html, /なまえ: はると/);
assert.match(html, /2026年8月26日/);
assert.doesNotMatch(html, /日付<span class="line"/);
assert.match(html, /class="mask"/);
assert.match(html, /page-break-inside: avoid/);
assert.match(html, /cols-2/);
assert.match(html, /cols-1/);
assert.match(html, /css-crop/);
assert.doesNotMatch(html, /保護者用カンペ/);
assert.doesNotMatch(html, /声かけ/);
pass("PDF は名前・日付を印字し、解答欄を白マスクする");

const outDir = join(root, "scripts/output");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "print-preview.html"), html, "utf8");
pass("プレビュー HTML を書き出した");

assert.equal(chooseAnswerStyle({ problemType: "calc_block" }), "calc");
assert.equal(chooseAnswerStyle({ problemType: "kanji" }), "kanji");
pass("problem_type から解答欄スタイルを切り替える");

const previewScreen = readFileSync(join(root, "app/(app)/print/preview.tsx"), "utf8");
assert.match(previewScreen, /PrintPreviewSheets/);
assert.match(previewScreen, /ScreenBackButton/);
assert.doesNotMatch(previewScreen, /ネイティブでは PDF/);
const printScreen = readFileSync(join(root, "app/(app)/print/index.tsx"), "utf8");
assert.doesNotMatch(printScreen, /保護者カンペシート/);
const printLayout = readFileSync(join(root, "app/(app)/_layout.tsx"), "utf8");
assert.match(printLayout, /print\/preview[\s\S]*ScreenBackButton/s);
pass("プレビューは実紙面を出し、戻るボタンがある");

const today = "2026-08-24";
const queue = [
  { id: "a", status: "active", nextReviewOn: today, consecutiveMisses: 1, label: "A" },
  { id: "b", status: "queued", nextReviewOn: today, consecutiveMisses: 0, label: "B" },
  { id: "c", status: "active", nextReviewOn: today, consecutiveMisses: 2, label: "C" },
  { id: "d", status: "queued", nextReviewOn: today, consecutiveMisses: 0, label: "D" },
  { id: "e", status: "queued", nextReviewOn: today, consecutiveMisses: 0, label: "E" },
  { id: "f", status: "queued", nextReviewOn: today, consecutiveMisses: 0, label: "F" },
  { id: "g", status: "queued", nextReviewOn: "2099-01-01", consecutiveMisses: 0, label: "G" },
  { id: "L", status: "leech", nextReviewOn: today, consecutiveMisses: 3, leechAt: "2026-08-23", label: "L" },
];

const selected = selectDailyReviews(queue, { today, min: 3, max: 5 });
assert.equal(selected.daily.length, 5);
assert.equal(selected.daily.some((item) => item.id === "L"), false);
assert.equal(selected.daily.some((item) => item.id === "g"), false);
assert.equal(selected.truncated, true);
const leeches = isolateLeeches(queue);
assert.equal(leeches.length, 1);
assert.equal(leeches[0].id, "L");
pass("日次キューは最大5問、Leech と未来日は除外");

const afterMiss = applyReviewResult(
  { id: "c", status: "active", consecutiveMisses: 2, consecutiveHits: 0, intervalDays: 1, easeFactor: 2.5 },
  false,
);
assert.equal(afterMiss.status, "leech");
assert.equal(afterMiss.consecutiveMisses, 3);
const afterHit = applyReviewResult(
  { id: "a", status: "active", consecutiveMisses: 1, consecutiveHits: 0, intervalDays: 1, easeFactor: 2.5 },
  true,
);
assert.equal(afterHit.status, "active");
assert.equal(afterHit.consecutiveMisses, 0);
pass("解けた/もう一回で間隔更新し、3連続ミスで Leech 退場");

const { addDaysIso, applyLeechToCarte, resolveLeechItem } = await import(
  pathToFileURL(join(root, "src/features/review/lib/leech.mjs")).href,
);
const restored = resolveLeechItem(queue.find((item) => item.id === "L"), "requeue", { today });
assert.equal(restored.status, "queued");
assert.equal(restored.nextReviewOn, addDaysIso(today, 1));
assert.equal(isolateLeeches([restored]).length, 0);
const masteredLeech = resolveLeechItem(queue.find((item) => item.id === "L"), "master", { today });
assert.equal(masteredLeech.status, "mastered");
const afterClear = applyLeechToCarte(
  { foundation_rate: 0.62, problem_count: 40, weak_units: [{ unit: "L", rate: 0.25, total: 8, correct: 2 }], strong_units: [] },
  { topicTag: "L" },
  "master",
);
assert.equal(afterClear.weak_units[0].correct, 3);
pass("要指導リストの手動復帰・完全クリア");

console.log("\nAll print/review checks passed.");
