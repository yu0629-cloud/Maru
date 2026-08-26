export const LEECH_ACTIONS: ["master", "requeue"];
export type LeechAction = "master" | "requeue";
export function addDaysIso(iso: string | undefined, days: number): string;
export function resolveLeechItem<T extends Record<string, unknown>>(
  item: T,
  action: LeechAction,
  options?: { today?: string; masteredHitThreshold?: number },
): T;
export function applyLeechToCarte<
  T extends {
    foundation_rate?: number;
    problem_count?: number;
    weak_units?: Array<{ unit: string; rate?: number; total?: number; correct?: number }>;
    strong_units?: Array<{ unit: string; rate?: number; total?: number; correct?: number }>;
  },
>(
  carte: T,
  item: { topicTag?: string; unit?: string },
  action: LeechAction,
): T;
