/**
 * 画像保持ポリシーと期限切れフォールバックの契約テスト
 *   node scripts/test-retention.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appPolicy = await import(pathToFileURL(join(root, "src/features/storage/lib/retention.mjs")).href);
const edgePolicy = await import(pathToFileURL(join(root, "supabase/functions/_shared/retention.mjs")).href);

function pass(name) {
  console.log(`ok - ${name}`);
}

function daysAgo(days, now = "2026-08-27T00:00:00.000Z") {
  return new Date(Date.parse(now) - days * 86_400_000).toISOString();
}

assert.deepEqual(appPolicy.RETENTION, edgePolicy.RETENTION);
assert.equal(appPolicy.EXPIRED_IMAGE_MESSAGE, edgePolicy.EXPIRED_IMAGE_MESSAGE);
pass("アプリと Edge Function の保持ポリシーが一致する");

const { EXPIRED_IMAGE_MESSAGE, RETENTION, shouldPurgeOriginal, shouldPurgeCrop, selectOriginalPurgeIds, isMediaMissing, planOriginalRetentionOnUpgrade, addDaysIso } =
  appPolicy;
const now = "2026-08-27T00:00:00.000Z";

assert.equal(shouldPurgeOriginal({ tier: "free", createdAt: daysAgo(3, now), newestRank: 15, now }), false);
assert.equal(shouldPurgeOriginal({ tier: "free", createdAt: daysAgo(8, now), newestRank: 3, now }), false);
assert.equal(shouldPurgeOriginal({ tier: "free", createdAt: daysAgo(8, now), newestRank: 11, now }), true);
pass("無料は 7 日以内または最新 10 枚を残し、それ以外の原本を消す");

assert.equal(shouldPurgeOriginal({ tier: "standard", createdAt: daysAgo(30, now), newestRank: 99, now }), false);
assert.equal(shouldPurgeOriginal({ tier: "family", createdAt: daysAgo(61, now), newestRank: 1, now }), true);
pass("有料は 60 日超で原本を消す（枚数キャップなし）");

assert.equal(shouldPurgeCrop({ reviewStatus: "leech", originalWouldPurge: true }), false);
assert.equal(shouldPurgeCrop({ reviewStatus: "queued", originalWouldPurge: true }), false);
assert.equal(shouldPurgeCrop({ reviewStatus: "active", originalWouldPurge: true }), false);
assert.equal(shouldPurgeCrop({ reviewStatus: "mastered", originalWouldPurge: true }), true);
assert.equal(shouldPurgeCrop({ reviewStatus: "retired", originalWouldPurge: true }), true);
assert.equal(shouldPurgeCrop({ reviewStatus: null, originalWouldPurge: true }), true);
assert.equal(shouldPurgeCrop({ reviewStatus: "mastered", originalWouldPurge: false }), false);
pass("切り抜きは復習中は残し、完了後は原本 TTL に従う");

const freeIds = selectOriginalPurgeIds(
  Array.from({ length: 12 }, (_, index) => ({
    id: `s${index + 1}`,
    parentId: "p1",
    createdAt: daysAgo(20 - index, now),
    tier: "free",
    storagePath: `p1/c1/s${index + 1}/original.jpg`,
  })),
  now,
);
assert.ok(freeIds.includes("s1"));
assert.equal(freeIds.includes("s12"), false);
assert.equal(freeIds.length, 2);
pass("無料 12 枚・すべて 7 日超なら最新 10 枚を残して 2 枚消す");

assert.equal(isMediaMissing(null, "2026-08-01T00:00:00.000Z"), true);
assert.equal(isMediaMissing("", null), true);
assert.equal(isMediaMissing("p/c/s/original.jpg", null), false);
pass("パス欠落と purged_at を画像なしとして扱う");

assert.equal(EXPIRED_IMAGE_MESSAGE, "※画像の保持期限を過ぎました（採点データのみ表示）");
assert.equal(RETENTION.freeOriginalTtlDays, 7);
assert.equal(RETENTION.freeKeepLatestOriginals, 10);
assert.equal(RETENTION.paidOriginalTtlDays, 60);

const noticeSrc = readFileSync(join(root, "src/components/ExpiredMediaNotice.tsx"), "utf8");
assert.match(noticeSrc, /EXPIRED_IMAGE_MESSAGE/);
const scanSrc = readFileSync(join(root, "app/(app)/scan/[id].tsx"), "utf8");
assert.match(scanSrc, /ExpiredMediaNotice/);
assert.match(scanSrc, /useScanPhotoUri/);
assert.match(scanSrc, /SafeMediaImage/);
assert.doesNotMatch(scanSrc, /Image source=\{\{ uri: problem\.imageSrc \}\}/);
const reviewSrc = readFileSync(join(root, "app/(app)/(tabs)/review/index.tsx"), "utf8");
assert.match(reviewSrc, /mediaExpired/);
assert.match(reviewSrc, /ExpiredMediaNotice/);
pass("採点・復習画面は期限切れ画像をクラッシュせずフォールバック表示する");

const migration = readFileSync(join(root, "supabase/migrations/20240827000016_media_retention.sql"), "utf8");
assert.match(migration, /original_purged_at/);
assert.match(migration, /crop_purged_at/);
assert.match(migration, /thumbnail_storage_path/);
assert.doesNotMatch(migration, /DROP TABLE public\.scans/);
assert.doesNotMatch(migration, /DELETE FROM public\.problems/);
const fnSrc = readFileSync(join(root, "supabase/functions/purge-expired-media/index.ts"), "utf8");
assert.match(fnSrc, /shouldPurgeOriginal/);
assert.match(fnSrc, /shouldPurgeCrop/);
assert.match(fnSrc, /x-cron-secret/);
assert.match(fnSrc, /original_storage_path: null/);
const config = readFileSync(join(root, "supabase/config.toml"), "utf8");
assert.match(config, /purge-expired-media/);
pass("DB はテキスト行を残し、Edge Function が Storage 実体だけ消す");

const cacheSrc = readFileSync(join(root, "src/lib/files/scan-image.ts"), "utf8");
assert.match(cacheSrc, /purgeLocalScanCache/);
assert.match(cacheSrc, /ensureDurableScanUri/);
assert.match(cacheSrc, /persistScanImage\(result\.uri\)/);
assert.match(cacheSrc, /if \(!\(modifiedMs > 0\)\) continue/);
assert.match(cacheSrc, /localFileExists/);
const runtimeSrc = readFileSync(join(root, "src/features/session/AccountRuntime.tsx"), "utf8");
assert.match(runtimeSrc, /purgeLocalScanCache/);
assert.match(runtimeSrc, /hydrateRecentScans/);
const hydrateSrc = readFileSync(join(root, "src/features/storage/hydrate-scans.ts"), "utf8");
assert.match(hydrateSrc, /hydrateRecentScans/);
assert.match(hydrateSrc, /hydrateScanById/);
assert.match(hydrateSrc, /original_storage_path/);
assert.match(hydrateSrc, /created_at/);
assert.match(hydrateSrc, /Fetched scans count/);
assert.match(hydrateSrc, /parent_id/);
assert.match(hydrateSrc, /eq\("child_id"/);
assert.doesNotMatch(hydrateSrc, /child_id\.is\.null/);
assert.doesNotMatch(hydrateSrc, /\.gte\("created_at"/);
assert.doesNotMatch(hydrateSrc, /free_scans_remaining/);
assert.doesNotMatch(hydrateSrc, /quota\.remaining/);
const photoUriSrc = readFileSync(join(root, "src/features/storage/useScanPhotoUri.ts"), "utf8");
assert.match(photoUriSrc, /localFileExists/);
assert.match(photoUriSrc, /signedStorageUrl/);
const cameraSrc2 = readFileSync(join(root, "app/(app)/(tabs)/camera/index.tsx"), "utf8");
assert.match(cameraSrc2, /ensureQuota/);
const scanDetailSrc = readFileSync(join(root, "app/(app)/scan/[id].tsx"), "utf8");
assert.doesNotMatch(scanDetailSrc, /ensureQuota/);
assert.doesNotMatch(scanDetailSrc, /quota\.remaining/);
pass("同期時に端末の古いスキャンキャッシュを破棄する");
pass("無料上限到達後も7日以内の原本パスと署名URLで閲覧できる");

assert.equal(typeof appPolicy.planOriginalRetentionOnUpgrade, "function");
assert.equal(typeof edgePolicy.planOriginalRetentionOnUpgrade, "function");

const stillKept = {
  id: "alive",
  createdAt: daysAgo(3, now),
  storagePath: "p/c/s/original.jpg",
  purgedAt: null,
  retainUntil: daysAgo(-4, now),
};
const alreadyGone = {
  id: "gone",
  createdAt: daysAgo(10, now),
  storagePath: null,
  purgedAt: daysAgo(2, now),
  retainUntil: daysAgo(3, now),
};
const upgraded = planOriginalRetentionOnUpgrade([stillKept, alreadyGone], { toTier: "standard" });
assert.equal(upgraded[0].action, "extended");
assert.equal(upgraded[0].retainUntil, addDaysIso(stillKept.createdAt, RETENTION.paidOriginalTtlDays));
assert.equal(upgraded[0].textPreserved, true);
assert.equal(upgraded[1].action, "text_only");
assert.equal(upgraded[1].imagesRestored, false);
assert.equal(upgraded[1].textPreserved, true);
assert.equal(
  shouldPurgeOriginal({
    tier: "standard",
    createdAt: stillKept.createdAt,
    newestRank: 11,
    retainUntil: upgraded[0].retainUntil,
    now,
  }),
  false,
);
pass("有料化で未削除画像は撮影日+60日へ延長し、パージ済みはテキストのみ残す");

const upgradeSql = readFileSync(join(root, "supabase/migrations/20240827000017_extend_retention_on_upgrade.sql"), "utf8");
assert.match(upgradeSql, /extend_media_retention_on_upgrade/);
assert.match(upgradeSql, /original_retain_until = created_at \+ interval '60 days'/);
assert.match(upgradeSql, /original_purged_at IS NULL/);
assert.match(fnSrc, /original_retain_until/);
pass("加入 RPC が未削除原本の retain_until を 60 日へ更新する");

const { PAYWALL_FREE_CARRYOVER_MESSAGE, quotaExhaustedMessage } = await import(
  pathToFileURL(join(root, "src/features/billing/lib/catalog.mjs")).href
);
assert.equal(
  PAYWALL_FREE_CARRYOVER_MESSAGE,
  "無料お試し枠の10枚が終わりました！有料プランに登録すると、今回の採点データと画像をそのまま引き継いで、復習プリント作成やカルテ分析を続けられます。",
);
assert.equal(quotaExhaustedMessage("free"), PAYWALL_FREE_CARRYOVER_MESSAGE);
assert.match(quotaExhaustedMessage("standard"), /追加チケット/);
const cameraSrc = readFileSync(join(root, "app/(app)/(tabs)/camera/index.tsx"), "utf8");
assert.match(cameraSrc, /t\("billing\.freeCarryover"\)/);
const billingSrc = readFileSync(join(root, "app/(app)/settings/billing.tsx"), "utf8");
assert.match(billingSrc, /PaywallCarryoverNote/);
const noteSrc = readFileSync(join(root, "src/components/PaywallCarryoverNote.tsx"), "utf8");
assert.match(noteSrc, /t\("billing\.freeCarryover"\)/);
pass("無料枠切れと Paywall にデータ引き継ぎの案内を出す");

const history = await import(pathToFileURL(join(root, "src/features/storage/lib/history.mjs")).href);
function histScan(id, days, extra = {}) {
  return {
    id,
    childId: "c1",
    status: "completed",
    createdAt: daysAgo(days, now),
    overall_score: { earned: 14, max: 18 },
    ...extra,
  };
}

const freeWindow = history.selectHistoryScans(
  [histScan("d1", 1), histScan("d7", 7), histScan("other", 1, { childId: "c2" })],
  { childId: "c1", tier: "free", now },
);
assert.deepEqual(
  freeWindow.map((scan) => scan.id),
  ["d1", "d7"],
);
pass("無料は直近7日のプリントを新しい順に出す");

const nullChild = history.selectHistoryScans(
  [histScan("orphan", 1, { childId: null })],
  { childId: "c1", tier: "free", now },
);
assert.equal(nullChild.length, 0);
const mismatchedOnly = history.selectHistoryScans(
  [histScan("x1", 1, { childId: "other-child" })],
  { childId: "c1", tier: "free", now },
);
assert.equal(mismatchedOnly.length, 0);
pass("選択中の子ども以外のスキャンは履歴に出さない");

const freeCrowded = history.selectHistoryScans(
  [...Array.from({ length: 10 }, (_, index) => histScan(`n${index}`, 1)), histScan("aged", 8)],
  { childId: "c1", tier: "free", now },
);
assert.equal(freeCrowded.length, 10);
assert.equal(freeCrowded.some((scan) => scan.id === "aged"), false);
pass("無料で新しい10枚があるとき、8日前のプリントは履歴から外す");

const freeLatest = history.selectHistoryScans(
  Array.from({ length: 12 }, (_, index) => histScan(`old${index + 1}`, 20 - index)),
  { childId: "c1", tier: "free", now },
);
assert.equal(freeLatest.length, 10);
assert.equal(freeLatest[0].id, "old12");
assert.equal(freeLatest[freeLatest.length - 1].id, "old3");
pass("無料で7日超なら最新10枚まで履歴に残す");

const paid = history.selectHistoryScans(
  [histScan("p30", 30), histScan("p60", 60), histScan("p61", 61)],
  { childId: "c1", tier: "standard", now },
);
assert.deepEqual(
  paid.map((scan) => scan.id),
  ["p30", "p60"],
);
pass("有料は保持期限60日以内のプリントだけ出す");

assert.equal(history.isScanImageExpired({ originalStoragePath: "p/c/s.jpg", originalPurgedAt: null }), false);
assert.equal(history.isScanImageExpired({ originalStoragePath: null, originalPurgedAt: now }), true);
assert.equal(history.isScanImageExpired({ localUri: "file:///a.jpg", originalPurgedAt: now }), false);
const localNoon = new Date(2026, 7, 27, 15, 4, 0);
assert.equal(history.formatScanDateTime(localNoon.toISOString(), localNoon), "8月27日 15:04");
pass("期限切れ判定は画像実体の有無、日時は閲覧用に整形する");

console.log("\nAll retention tests passed.");
