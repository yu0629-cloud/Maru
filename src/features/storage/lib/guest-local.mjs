/**
 * ゲストプランのスキャン履歴保持ポリシー
 * - スキャン日時から 7 日間
 * - 最大 10 件（超過分は古い順に削除）
 */

import { daysBetween } from "./retention.mjs";

export const GUEST_RETENTION = {
  ttlDays: 7,
  maxScans: 10,
};

function createdAtOf(scan, fallbackIso) {
  const value = scan?.createdAt || scan?.created_at;
  if (value && Number.isFinite(Date.parse(value))) return value;
  return fallbackIso;
}

/**
 * ゲスト履歴を整理する。7日超を捨て、残りを新しい順に最大 maxScans 件。
 * @returns {{ kept: object[], removed: object[] }}
 */
export function pruneGuestScanRecords(scans, input = {}) {
  const now = input.now ?? new Date().toISOString();
  const ttlDays = Number.isFinite(input.ttlDays) ? input.ttlDays : GUEST_RETENTION.ttlDays;
  const maxScans = Number.isFinite(input.maxScans) ? input.maxScans : GUEST_RETENTION.maxScans;
  const list = Array.isArray(scans) ? scans : [];

  const withDates = list.map((scan) => ({
    ...scan,
    createdAt: createdAtOf(scan, now),
  }));

  const fresh = withDates.filter((scan) => daysBetween(scan.createdAt, now) <= ttlDays);
  fresh.sort((a, b) => {
    const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (delta !== 0) return delta;
    return String(b.id).localeCompare(String(a.id));
  });

  const kept = fresh.slice(0, Math.max(0, maxScans));
  const keptIds = new Set(kept.map((scan) => String(scan.id)));
  const removed = withDates.filter((scan) => !keptIds.has(String(scan.id)));
  return { kept, removed };
}
