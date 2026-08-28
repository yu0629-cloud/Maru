/**
 * 課金・子ども上限・端末2台制限の契約テスト
 *   node scripts/test-account.mjs
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const {
  PLAN_ENTITLEMENTS,
  PRODUCT_CATALOG,
  applyPurchase,
  canAddChild,
  canPurchaseTickets,
  childLimitError,
  describeQuota,
  offeringsForPaywall,
  previewQuotaState,
  quotaExhaustedMessage,
  PAYWALL_FREE_CARRYOVER_MESSAGE,
  tierFromEntitlementIds,
} = await import(pathToFileURL(join(root, "src/features/billing/lib/catalog.mjs")).href);

const {
  registerDeviceSession,
  heartbeatDeviceSession,
  isCurrentDeviceRevoked,
  DEVICE_REVOKED_ERROR,
} = await import(pathToFileURL(join(root, "src/features/session/lib/claim.mjs")).href);

function pass(name) {
  console.log(`ok - ${name}`);
}

assert.equal(tierFromEntitlementIds([]), "free");
assert.equal(tierFromEntitlementIds(["standard"]), "standard");
assert.equal(tierFromEntitlementIds(["standard", "family"]), "family");
pass("Entitlement は family を優先する");

const monthly = offeringsForPaywall("monthly");
assert.equal(monthly.standard.productId, "maru_standard_monthly");
assert.match(monthly.standard.displayPrice, /980/);
const yearly = offeringsForPaywall("yearly");
assert.equal(yearly.family.productId, "maru_family_yearly");
assert.match(yearly.family.displayPrice, /14,800|14800/);
pass("月額/年額のペイウォール表示がプラン表と一致する");

let state = { tier: "free", extraTicketBalance: 0, freeScansRemaining: 10 };
state = applyPurchase(state, "maru_standard_monthly");
assert.equal(state.tier, "standard");
state = applyPurchase(state, "scan_ticket_50");
assert.equal(state.extraTicketBalance, 50);
state = applyPurchase(state, "maru_family_yearly");
assert.equal(state.tier, "family");
pass("サブスク購入と追加チケットが状態に反映される");

assert.equal(canPurchaseTickets("free"), false);
try {
  applyPurchase({ tier: "free", extraTicketBalance: 0 }, "scan_ticket_100");
  assert.fail("フリーでチケットが買えてしまった");
} catch (error) {
  assert.equal(error.code, "TICKETS_PAID_ONLY");
}
pass("追加チケットは有料会員限定");

assert.equal(PRODUCT_CATALOG.scan_ticket_100.ticketCount, 100);
assert.equal(PLAN_ENTITLEMENTS.standard.maxChildren, 1);
assert.equal(PLAN_ENTITLEMENTS.family.maxChildren, 3);
assert.equal(canAddChild("standard", 1), false);
assert.equal(canAddChild("family", 2), true);
assert.equal(childLimitError("free", 1)?.code, "CHILD_LIMIT_REACHED");
assert.equal(childLimitError("family", 2), null);
pass("プラン別の子ども上限（1人 / 3人）");

const freePreview = previewQuotaState("free");
assert.equal(freePreview.freeScansRemaining, 10);
assert.equal(describeQuota(freePreview).remaining, 10);
assert.equal(describeQuota(freePreview).canBuyTickets, false);
const paidPreview = previewQuotaState("standard");
assert.equal(describeQuota(paidPreview).remaining, 150);
assert.equal(describeQuota(paidPreview).canBuyTickets, true);
assert.equal(describeQuota(previewQuotaState("family")).remaining, 400);
pass("テスト切替は無料10枚・有料は月次クォータになる");

assert.equal(
  quotaExhaustedMessage("free"),
  PAYWALL_FREE_CARRYOVER_MESSAGE,
);
assert.match(PAYWALL_FREE_CARRYOVER_MESSAGE, /採点データと画像をそのまま引き継いで/);
assert.match(quotaExhaustedMessage("family"), /追加チケット/);
pass("無料枠切れの Paywall はデータ引き継ぎを案内する");

const now = "2026-08-24T01:00:00.000Z";
const later = "2026-08-24T02:00:00.000Z";
const newest = "2026-08-24T03:00:00.000Z";

let devices = [];
devices = registerDeviceSession(devices, {
  device_id: "phone-a",
  last_seen_at: now,
  device_name: "A",
}).sessions;
devices = registerDeviceSession(devices, {
  device_id: "phone-b",
  last_seen_at: later,
  device_name: "B",
}).sessions;
assert.equal(devices.length, 2);

const third = registerDeviceSession(devices, {
  device_id: "phone-c",
  last_seen_at: newest,
  device_name: "C",
});
assert.equal(third.status, "replaced_oldest");
assert.equal(third.evicted.device_id, "phone-a");
assert.equal(third.sessions.map((row) => row.device_id).sort().join(","), "phone-b,phone-c");
assert.equal(isCurrentDeviceRevoked(third.sessions, "phone-a"), true);
assert.equal(isCurrentDeviceRevoked(third.sessions, "phone-c"), false);
pass("3台目ログインは最古端末を失効させる");

const beat = heartbeatDeviceSession(third.sessions, "phone-a", newest);
assert.equal(beat.ok, false);
assert.equal(beat.code, DEVICE_REVOKED_ERROR);
pass("追い出した端末のハートビートは DEVICE_REVOKED");

const refresh = registerDeviceSession(third.sessions, {
  device_id: "phone-c",
  last_seen_at: "2026-08-24T04:00:00.000Z",
  device_name: "C-new",
});
assert.equal(refresh.status, "refreshed");
assert.equal(refresh.evicted, null);
pass("同一端末の再ログインはセッション更新のみ");

const { readFileSync } = await import("node:fs");
const settingsSrc = readFileSync(join(root, "app/(app)/(tabs)/settings/index.tsx"), "utf8");
assert.match(settingsSrc, /DebugResetScanQuotaButton/);
const debugBtnSrc = readFileSync(join(root, "src/components/DebugResetScanQuotaButton.tsx"), "utf8");
assert.match(debugBtnSrc, /canPreviewPlans/);
assert.match(debugBtnSrc, /スキャン回数をリセットしました（残り10枚）/);
assert.match(debugBtnSrc, /【Debug】スキャン回数をリセット（0枚に戻す）/);
const resetSrc = readFileSync(join(root, "src/features/billing/reset-free-scans.ts"), "utf8");
assert.match(resetSrc, /free_scans_remaining/);
assert.match(resetSrc, /FREE_SCAN_GRANT/);
assert.match(resetSrc, /resetFreeScansForDebug/);
const quotaStoreSrc = readFileSync(join(root, "src/stores/quotaStore.ts"), "utf8");
assert.match(quotaStoreSrc, /resetFreeScansForDebug/);
assert.match(quotaStoreSrc, /FREE_SCAN_GRANT/);
pass("設定の Debug リセットは開発時のみ表示し、無料枠を10枚に戻す");

console.log("\nAll account / billing / session checks passed.");
