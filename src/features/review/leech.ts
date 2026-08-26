import {
  addDaysIso as addDaysIsoImpl,
  applyLeechToCarte as applyLeechToCarteImpl,
  resolveLeechItem as resolveLeechItemImpl,
} from "./lib/leech.mjs";
import type { ReviewQueueItem } from "./select";

export type LeechAction = "master" | "requeue";

export type CarteSnapshot = {
  foundation_rate: number;
  scan_count?: number;
  problem_count: number;
  triage_level?: string;
  summary?: string;
  weak_units: Array<{ unit: string; rate: number; total: number; correct: number }>;
  strong_units: Array<{ unit: string; rate: number; total?: number; correct?: number }>;
  careless_rate?: number;
  recent_rates?: number[];
};

export function addDaysIso(iso: string | undefined, days: number): string {
  return addDaysIsoImpl(iso, days);
}

export function resolveLeechItem(
  item: ReviewQueueItem,
  action: LeechAction,
  options?: { today?: string; masteredHitThreshold?: number },
): ReviewQueueItem {
  return resolveLeechItemImpl(item, action, options);
}

export function applyLeechToCarte<T extends CarteSnapshot>(
  carte: T,
  item: { topicTag?: string; unit?: string },
  action: LeechAction,
): T {
  return applyLeechToCarteImpl(carte, item, action);
}
