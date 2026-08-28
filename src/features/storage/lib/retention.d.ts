export const EXPIRED_IMAGE_MESSAGE: "※画像の保持期限を過ぎました（採点データのみ表示）";

export const RETENTION: {
  freeOriginalTtlDays: 7;
  freeKeepLatestOriginals: 10;
  paidOriginalTtlDays: 60;
  localCacheTtlDays: 7;
  keepCropsWhileReviewActive: true;
};

export const ACTIVE_REVIEW_STATUSES: ReadonlyArray<"queued" | "active" | "leech">;

export const STORAGE_MEDIA_BUCKETS: {
  originals: "scan-originals";
  annotated: "scan-annotated";
  crops: "problem-crops";
  blanks: "problem-blanks";
};

export type SubscriptionTier = "free" | "standard" | "family";
export type ReviewStatus = "queued" | "active" | "leech" | "mastered" | "retired" | null | undefined;

export function isPaidTier(tier: string | null | undefined): boolean;
export function originalTtlDays(tier: string | null | undefined): number;
export function addDaysIso(fromIso: string, days: number): string;
export function originalRetainUntilIso(createdAt: string, tier: string | null | undefined): string;
export function daysBetween(fromIso: string, toIso: string): number;

export function rankNewestFirst(
  items: Array<{ id: string; parentId: string; createdAt: string }>,
): Map<string, number>;

export function shouldPurgeOriginal(input: {
  tier: string | null | undefined;
  createdAt: string;
  newestRank?: number;
  retainUntil?: string | null;
  now?: string;
}): boolean;

export function planOriginalRetentionOnUpgrade<
  T extends {
    storagePath?: string | null;
    purgedAt?: string | null;
    retainUntil?: string | null;
    createdAt: string;
  },
>(
  scans: T[],
  input: { toTier: string | null | undefined },
): Array<
  T & {
    action: "extended" | "text_only" | "unchanged";
    textPreserved: true;
    imagesRestored?: false;
    retainUntil?: string | null;
  }
>;

export function isActiveReviewStatus(status: ReviewStatus): boolean;

export function shouldPurgeCrop(input: {
  reviewStatus: ReviewStatus;
  originalWouldPurge: boolean;
}): boolean;

export function isMediaMissing(path?: string | null, purgedAt?: string | null): boolean;

export function selectOriginalPurgeIds(
  scans: Array<{
    id: string;
    parentId: string;
    createdAt: string;
    tier: string | null | undefined;
    storagePath?: string | null;
    retainUntil?: string | null;
  }>,
  now?: string,
): string[];
