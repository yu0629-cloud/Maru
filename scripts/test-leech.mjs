/**
 * 要指導リスト（Leech）の親オーバーライド契約テスト
 *   node scripts/test-leech.mjs
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const { isolateLeeches, selectDailyReviews } = await import(
  pathToFileURL(join(root, "src/features/review/lib/select.mjs")).href,
);
const { addDaysIso, applyLeechToCarte, resolveLeechItem } = await import(
  pathToFileURL(join(root, "src/features/review/lib/leech.mjs")).href,
);

function pass(name) {
  console.log(`ok - ${name}`);
}

const today = "2026-08-24";
const tomorrow = addDaysIso(today, 1);
assert.equal(tomorrow, "2026-08-25");
pass("next_review_on は翌日");

const leech = {
  id: "rq-leech",
  problemId: "p-leech",
  status: "leech",
  nextReviewOn: today,
  consecutiveMisses: 3,
  consecutiveHits: 0,
  intervalDays: 1,
  leechAt: "2026-08-23T10:00:00.000Z",
  topicTag: "つるかめ算",
  label: "大問L",
};

assert.equal(isolateLeeches([leech]).length, 1);
assert.equal(selectDailyReviews([leech], { today }).daily.length, 0);
pass("Leech は日次キューから除外される");

const requeued = resolveLeechItem(leech, "requeue", { today });
assert.equal(requeued.status, "queued");
assert.equal(requeued.consecutiveMisses, 0);
assert.equal(requeued.leechAt, null);
assert.equal(requeued.nextReviewOn, tomorrow);
assert.equal(isolateLeeches([requeued]).length, 0);
assert.equal(selectDailyReviews([requeued], { today }).daily.length, 0);
assert.equal(selectDailyReviews([requeued], { today: tomorrow }).daily.length, 1);
pass("requeue は連続ミスをリセットし、明日の復習キューへ戻す");

const mastered = resolveLeechItem(leech, "master", { today });
assert.equal(mastered.status, "mastered");
assert.equal(mastered.consecutiveMisses, 0);
assert.equal(mastered.leechAt, null);
assert.equal(mastered.lastResult, true);
assert.equal(isolateLeeches([mastered]).length, 0);
assert.equal(selectDailyReviews([mastered], { today: tomorrow }).daily.length, 0);
pass("master は要指導リストから除外し、マスター済みにする");

assert.throws(() => resolveLeechItem(leech, "delete"), /INVALID_LEECH_ACTION/);
pass("不正な action は拒否する");

const carte = {
  foundation_rate: 0.62,
  problem_count: 40,
  weak_units: [
    { unit: "つるかめ算", rate: 0.25, total: 8, correct: 2 },
    { unit: "繰り下がり", rate: 0.44, total: 9, correct: 4 },
  ],
  strong_units: [{ unit: "かけ算", rate: 0.9, total: 10, correct: 9 }],
};

const afterRequeue = applyLeechToCarte(carte, leech, "requeue");
assert.equal(afterRequeue.weak_units[0].correct, 2);
assert.equal(afterRequeue.foundation_rate, 0.62);
pass("requeue では苦手単元スコアを変えない");

const afterMaster = applyLeechToCarte(carte, leech, "master");
assert.equal(afterMaster.weak_units[0].correct, 3);
assert.equal(afterMaster.weak_units[0].rate, 3 / 8);
assert.ok(afterMaster.foundation_rate > carte.foundation_rate);
assert.equal(afterMaster.weak_units.some((unit) => unit.unit === "つるかめ算"), true);
pass("master で苦手単元の正答数と定着率を再集計する");

const almostClear = {
  ...carte,
  weak_units: [{ unit: "つるかめ算", rate: 0.5, total: 8, correct: 4 }],
};
const cleared = applyLeechToCarte(almostClear, leech, "master");
assert.equal(cleared.weak_units.some((unit) => unit.unit === "つるかめ算"), false);
assert.equal(cleared.strong_units.some((unit) => unit.unit === "つるかめ算"), true);
assert.equal(cleared.strong_units.find((unit) => unit.unit === "つるかめ算").correct, 5);
pass("正答率が60%に達したら苦手単元から外す");

console.log("\nAll leech override checks passed.");
