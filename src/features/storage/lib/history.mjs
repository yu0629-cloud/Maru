/** 採点履歴に出すスキャンの絞り込み（無料=7日または最新10枚 / ゲスト=7日かつ最新10枚 / 有料=保持期限） */

import {
  daysBetween,
  isMediaMissing,
  isPaidTier,
  originalTtlDays,
  RETENTION,
} from "./retention.mjs";
import { GUEST_RETENTION } from "./guest-local.mjs";

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
  if (scanChild == null || scanChild === "") return false;
  return scanChild === childId;
}

/**
 * 新しい順。
 * - ゲスト: 直近7日 かつ 最新10枚（AND）
 * - 無料: 直近7日 または 最新10枚（OR・原本ポリシーと揃える）
 * - 有料: TTL 日内
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
  const rows = scoped
    .map((scan) => ({
      ...scan,
      createdAt: createdAtOf(scan, now),
    }))
    .sort((a, b) => {
      const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (delta !== 0) return delta;
      return String(b.id).localeCompare(String(a.id));
    });

  if (input.isAnonymous) {
    return rows
      .filter((scan) => daysBetween(scan.createdAt, now) <= GUEST_RETENTION.ttlDays)
      .slice(0, GUEST_RETENTION.maxScans);
  }

  if (isPaidTier(tier)) {
    return rows.filter((scan) => daysBetween(scan.createdAt, now) <= ttl);
  }

  return rows.filter((scan, index) => {
    const withinDays = daysBetween(scan.createdAt, now) <= RETENTION.freeOriginalTtlDays;
    const withinLatest = index < RETENTION.freeKeepLatestOriginals;
    return withinDays || withinLatest;
  });
}
