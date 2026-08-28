/** 採点履歴に出すスキャンの絞り込み（無料=7日または最新10枚 / 有料=保持期限） */

import {
  daysBetween,
  isMediaMissing,
  isPaidTier,
  originalTtlDays,
  RETENTION,
} from "./retention.mjs";

export function isScanImageExpired(scan) {
  if (String(scan?.localUri ?? "").trim()) return false;
  return isMediaMissing(scan?.originalStoragePath, scan?.originalPurgedAt);
}

export function formatScanDateTime(iso, now = new Date(), locale = "ja") {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const sameYear = y === now.getFullYear();
  if (locale === "en") {
    return sameYear ? `${m}/${d} ${hh}:${mm}` : `${y}/${m}/${d} ${hh}:${mm}`;
  }
  return sameYear ? `${m}月${d}日 ${hh}:${mm}` : `${y}年${m}月${d}日 ${hh}:${mm}`;
}

function createdAtOf(scan, fallbackIso) {
  const value = scan?.createdAt || scan?.created_at;
  if (value && Number.isFinite(Date.parse(value))) return value;
  return fallbackIso;
}

export function belongsToActiveChild(scan, childId) {
  if (!childId) return true;
  const scanChild = scan?.childId ?? scan?.child_id ?? null;
  if (scanChild == null || scanChild === "") return true;
  return scanChild === childId;
}

/**
 * 新しい順。無料は直近7日または最新10枚。有料は TTL 日内。
 */
export function selectHistoryScans(scans, input = {}) {
  const now = input.now ?? new Date().toISOString();
  const childId = input.childId;
  const tier = input.tier ?? "free";
  const ttl = originalTtlDays(tier);
  const eligible = (scans ?? [])
    .filter((scan) => {
      const status = scan.status ?? "";
      return status === "completed" || status === "inpainting" || scan.confirmed === true;
    });
  const scoped = eligible.filter((scan) => belongsToActiveChild(scan, childId));
  const rows = (scoped.length > 0 ? scoped : eligible)
    .map((scan) => ({
      ...scan,
      createdAt: createdAtOf(scan, now),
    }))
    .sort((a, b) => {
      const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (delta !== 0) return delta;
      return String(b.id).localeCompare(String(a.id));
    });

  if (isPaidTier(tier)) {
    return rows.filter((scan) => daysBetween(scan.createdAt, now) <= ttl);
  }

  return rows.filter((scan, index) => {
    const withinDays = daysBetween(scan.createdAt, now) <= RETENTION.freeOriginalTtlDays;
    const withinLatest = index < RETENTION.freeKeepLatestOriginals;
    return withinDays || withinLatest;
  });
}
