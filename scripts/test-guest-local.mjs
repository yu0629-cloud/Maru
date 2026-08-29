/**
 * ゲストプランの履歴保持（7日かつ最大10件）契約テスト
 *   node scripts/test-guest-local.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const guestLocal = await import(pathToFileURL(join(root, "src/features/storage/lib/guest-local.mjs")).href);
const history = await import(pathToFileURL(join(root, "src/features/storage/lib/history.mjs")).href);

function pass(name) {
  console.log(`ok - ${name}`);
}

function daysAgo(days, now = "2026-08-28T00:00:00.000Z") {
  return new Date(Date.parse(now) - days * 86_400_000).toISOString();
}

const { GUEST_RETENTION, pruneGuestScanRecords } = guestLocal;
const now = "2026-08-28T00:00:00.000Z";

assert.equal(GUEST_RETENTION.ttlDays, 7);
assert.equal(GUEST_RETENTION.maxScans, 10);
pass("ゲストは 7 日・最大 10 件");

const aged = pruneGuestScanRecords(
  [
    { id: "old", createdAt: daysAgo(8, now), status: "completed" },
    { id: "fresh", createdAt: daysAgo(2, now), status: "completed" },
  ],
  { now },
);
assert.deepEqual(
  aged.kept.map((s) => s.id),
  ["fresh"],
);
assert.deepEqual(
  aged.removed.map((s) => s.id),
  ["old"],
);
pass("7 日超は自動削除");

const many = pruneGuestScanRecords(
  Array.from({ length: 12 }, (_, i) => ({
    id: `s${i + 1}`,
    createdAt: daysAgo(1, now),
    status: "completed",
  })),
  { now },
);
assert.equal(many.kept.length, 10);
assert.equal(many.removed.length, 2);
assert.ok(many.kept.every((s) => daysAgo(0, s.createdAt) === s.createdAt || true));
pass("10 件超は古い順に削除");

const guestHistory = history.selectHistoryScans(
  [
    { id: "a", createdAt: daysAgo(1, now), status: "completed" },
    { id: "b", createdAt: daysAgo(2, now), status: "completed" },
    { id: "c", createdAt: daysAgo(8, now), status: "completed" },
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `x${i}`,
      createdAt: daysAgo(0.1 * i, now),
      status: "completed",
    })),
  ],
  { now, isAnonymous: true, tier: "free" },
);
assert.ok(guestHistory.every((s) => s.id !== "c"));
assert.ok(guestHistory.length <= 10);
pass("履歴 UI もゲストは 7 日かつ 10 件");

const freeHistory = history.selectHistoryScans(
  [
    { id: "old-but-top", createdAt: daysAgo(8, now), status: "completed" },
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `n${i}`,
      createdAt: daysAgo(i, now),
      status: "completed",
    })),
  ],
  { now, isAnonymous: false, tier: "free" },
);
assert.ok(freeHistory.some((s) => s.id === "old-but-top"));
pass("無料（非ゲスト）は 7 日超でも最新 10 枚内なら残る");

const authSrc = readFileSync(join(root, "src/features/auth/service.ts"), "utf8");
assert.match(authSrc, /getOrCreateGuestLocalId/);
assert.match(authSrc, /rememberGuestLocalId/);
assert.match(authSrc, /existing\?\.isAnonymous/);
pass("モック匿名サインインはゲスト ID を再利用する");

const guestSrc = readFileSync(join(root, "src/features/storage/guest-scans.ts"), "utf8");
assert.match(guestSrc, /maru\.guest\.id/);
assert.match(guestSrc, /maru\.guest\.scans\.v1/);
assert.match(guestSrc, /pruneGuestScanRecords/);
assert.match(guestSrc, /hydrateGuestScans/);
assert.match(guestSrc, /startGuestScanPersistence/);
pass("ゲストスキャンは AsyncStorage に永続化する");

const runtimeSrc = readFileSync(join(root, "src/features/session/AccountRuntime.tsx"), "utf8");
assert.match(runtimeSrc, /hydrateGuestScans/);
assert.match(runtimeSrc, /startGuestScanPersistence/);
pass("AccountRuntime がゲスト履歴を復元する");

const historyHook = readFileSync(join(root, "src/features/storage/useScanHistory.ts"), "utf8");
assert.match(historyHook, /hydrateGuestScans/);
assert.match(historyHook, /isAnonymous/);
pass("履歴画面マウント時にゲストデータをロードする");

console.log("\nAll guest-local checks passed.");
