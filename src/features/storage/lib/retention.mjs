/**
 * 画像保持ポリシー（テキスト採点データは永続。Storage の実体のみ期限付き）
 *
 * 1. 採点テキスト: 無期限（このモジュールでは削除しない）
 * 2. 撮影原本: 無料=7日かつ最新10枚以外 / 有料=60日
 * 3. 切り抜き・白紙化: 復習が queued/active/leech の間は保持。完了後は原本と同じ TTL
 */

export const EXPIRED_IMAGE_MESSAGE = "※画像の保持期限を過ぎました（採点データのみ表示）";

export const RETENTION = {
  freeOriginalTtlDays: 7,
  freeKeepLatestOriginals: 10,
  paidOriginalTtlDays: 60,
  localCacheTtlDays: 7,
  keepCropsWhileReviewActive: true,
};

export const ACTIVE_REVIEW_STATUSES = ["queued", "active", "leech"];

export const STORAGE_MEDIA_BUCKETS = {
  originals: "scan-originals",
  annotated: "scan-annotated",
  crops: "problem-crops",
  blanks: "problem-blanks",
};

export function isPaidTier(tier) {
  return tier === "standard" || tier === "family";
}

export function originalTtlDays(tier) {
  return isPaidTier(tier) ? RETENTION.paidOriginalTtlDays : RETENTION.freeOriginalTtlDays;
}

export function addDaysIso(fromIso, days) {
  const ms = Date.parse(fromIso);
  if (!Number.isFinite(ms)) return fromIso;
  return new Date(ms + days * 86_400_000).toISOString();
}

export function originalRetainUntilIso(createdAt, tier) {
  return addDaysIso(createdAt, originalTtlDays(tier));
}

export function daysBetween(fromIso, toIso) {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return (to - from) / 86_400_000;
}

/** parentId ごとに新しい順で 1 始まりの順位を付ける */
export function rankNewestFirst(items) {
  const grouped = new Map();
  for (const item of items) {
    const key = String(item.parentId ?? "");
    const list = grouped.get(key);
    if (list) list.push(item);
    else grouped.set(key, [item]);
  }
  const ranks = new Map();
  for (const list of grouped.values()) {
    list.sort((a, b) => {
      const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (delta !== 0) return delta;
      return String(b.id).localeCompare(String(a.id));
    });
    list.forEach((item, index) => ranks.set(item.id, index + 1));
  }
  return ranks;
}

/**
 * 無料: 7日超 かつ 最新10枚より古いものだけ削除（7日以内なら枚数超過でも残す）
 * 有料: 60日超で削除（枚数キャップなし）
 */
export function shouldPurgeOriginal(input) {
  const now = input.now ?? new Date().toISOString();
  if (input.retainUntil) {
    const retainPassed = Date.parse(now) > Date.parse(input.retainUntil);
    if (isPaidTier(input.tier)) return retainPassed;
    if (!retainPassed) return false;
    return (input.newestRank ?? 1) > RETENTION.freeKeepLatestOriginals;
  }
  const ageDays = daysBetween(input.createdAt, now);
  if (isPaidTier(input.tier)) return ageDays > RETENTION.paidOriginalTtlDays;
  const beyondTtl = ageDays > RETENTION.freeOriginalTtlDays;
  const beyondCap = (input.newestRank ?? 1) > RETENTION.freeKeepLatestOriginals;
  return beyondTtl && beyondCap;
}

/**
 * 有料化時の原本扱い。未削除は撮影日+60日へ延長。パージ済みは画像を復元せずテキストのみ残す。
 */
export function planOriginalRetentionOnUpgrade(scans, input) {
  const toTier = input?.toTier;
  const paid = isPaidTier(toTier);
  return (scans ?? []).map((scan) => {
    if (!paid) {
      return { ...scan, action: "unchanged", textPreserved: true };
    }
    if (isMediaMissing(scan.storagePath, scan.purgedAt)) {
      return {
        ...scan,
        action: "text_only",
        retainUntil: scan.retainUntil ?? null,
        textPreserved: true,
        imagesRestored: false,
      };
    }
    return {
      ...scan,
      action: "extended",
      retainUntil: originalRetainUntilIso(scan.createdAt, toTier),
      textPreserved: true,
      imagesRestored: false,
    };
  });
}

export function isActiveReviewStatus(status) {
  return ACTIVE_REVIEW_STATUSES.includes(status);
}

/**
 * 復習中（queued / active / leech）の切り抜きはプリント再生成のため残す。
 * マスター済み・リタイア・キューなしは、原本がパージ対象なら一緒に消す。
 */
export function shouldPurgeCrop(input) {
  if (RETENTION.keepCropsWhileReviewActive && isActiveReviewStatus(input.reviewStatus)) {
    return false;
  }
  return Boolean(input.originalWouldPurge);
}

export function isMediaMissing(path, purgedAt) {
  return Boolean(purgedAt) || !String(path ?? "").trim();
}

export function selectOriginalPurgeIds(scans, now) {
  const withFile = scans.filter((scan) => String(scan.storagePath ?? "").trim());
  const ranks = rankNewestFirst(withFile);
  return withFile
    .filter((scan) =>
      shouldPurgeOriginal({
        tier: scan.tier,
        createdAt: scan.createdAt,
        newestRank: ranks.get(scan.id) ?? Number.MAX_SAFE_INTEGER,
        retainUntil: scan.retainUntil,
        now,
      }),
    )
    .map((scan) => scan.id);
}
